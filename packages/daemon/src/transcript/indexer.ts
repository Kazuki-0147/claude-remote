// 会话索引器：扫描 <projectsDir>/<编码目录>/<sessionId>.jsonl 产出 SessionSummary。
// 对数据源只读。projectsDir 由调用方注入（默认值在调用侧给 ~/.claude/projects）。
//
// 每个文件两次有界读：
//  - 头部流式读：拿 cwd（行内字段，不从目录名反解）与 title（首条真实 user 文本），拿齐即断流；
//  - 尾部块读：拿 lastPreview（最后一条主链可显示消息——文件最后一条非 sidechain、
//    非 isMeta 的 user/assistant 行必在主链上，无需整链回溯）。

import { createReadStream } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { stripWrapperTags } from "./reader.js";
import type { SessionSummary } from "./types.js";

const TITLE_MAX_CHARS = 60;
const AI_TITLE_MAX_LINES = 256;
const AI_TITLE_TAIL_BYTES = 1024 * 1024;
const PREVIEW_MAX_CHARS = 80;
const PREVIEW_INITIAL_TAIL_BYTES = 64 * 1024;
const PREVIEW_MAX_TAIL_BYTES = 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 折叠空白成单行后按 Unicode code point 截断，超长补省略号。 */
function toSingleLineTruncated(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(collapsed);
  if (chars.length <= maxChars) return collapsed;
  return `${chars.slice(0, maxChars).join("")}…`;
}

function textBlocksJoined(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : "",
    )
    .join("");
}

/** 首条"真实 user 文本"：非 sidechain、非 isMeta、剥包裹标签后非空；纯 tool_result 行不算。 */
function realUserText(o: Record<string, unknown>): string {
  if (o.type !== "user" || o.isSidechain === true || o.isMeta === true) return "";
  const message = isRecord(o.message) ? o.message : undefined;
  if (message === undefined) return "";
  const content = message.content;
  const raw = typeof content === "string" ? content : textBlocksJoined(content);
  return stripWrapperTags(raw).trim();
}

/** 最后一条主链消息的展示文本：text 优先，无 text 时降级到工具/思考摘要。 */
function previewText(o: Record<string, unknown>): string {
  const message = isRecord(o.message) ? o.message : undefined;
  if (message === undefined) return "";
  const content = message.content;
  if (typeof content === "string") return stripWrapperTags(content).trim();
  if (!Array.isArray(content)) return "";
  const text = stripWrapperTags(textBlocksJoined(content)).trim();
  if (text !== "") return text;
  for (const part of content) {
    if (!isRecord(part)) continue;
    if (part.type === "tool_use" && typeof part.name === "string") return `[工具] ${part.name}`;
    if (part.type === "tool_result") return "[工具结果]";
    if (part.type === "thinking" && typeof part.thinking === "string") return part.thinking.trim();
  }
  return "";
}

interface HeadInfo {
  cwd: string;
  title: string;
  /** 发起该会话的客户端（取首个带 cwd 的行上的 entrypoint）；旧版本无此字段时为 ""。 */
  entrypoint: string;
}

// 官方登录的 Claude 桌面端会话：手机端走第三方供应商，不应列出也不应接管这些会话。
// 第三方模式的桌面端是 "claude-desktop-3p"，与 CLI 一样保留。
const HIDDEN_ENTRYPOINTS = new Set(["claude-desktop"]);

/**
 * 头部流式扫：cwd 取首个带 cwd 字段的行；优先读取 Claude Code 写入的 ai-title，
 * 找不到时回退到首条真实 user 文本。标题通常在前几百行内生成，避免没有 ai-title
 * 的超大历史文件为了找一个不存在的字段而被完整扫描。
 */
async function scanHead(filePath: string): Promise<HeadInfo> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let cwd = "";
  let fallbackTitle = "";
  let aiTitle = "";
  let entrypoint = "";
  let lineCount = 0;
  try {
    for await (const line of lines) {
      lineCount += 1;
      const trimmed = line.trim();
      if (trimmed === "") continue;
      let o: unknown;
      try {
        o = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!isRecord(o)) continue;
      if (cwd === "" && typeof o.cwd === "string" && o.cwd !== "") {
        cwd = o.cwd;
        if (typeof o.entrypoint === "string") entrypoint = o.entrypoint;
      }
      if (aiTitle === "" && o.type === "ai-title" && typeof o.aiTitle === "string") {
        const text = o.aiTitle.trim();
        if (text !== "") aiTitle = toSingleLineTruncated(text, TITLE_MAX_CHARS);
      }
      if (fallbackTitle === "") {
        const text = realUserText(o);
        if (text !== "") fallbackTitle = toSingleLineTruncated(text, TITLE_MAX_CHARS);
      }
      if (cwd !== "" && aiTitle !== "") break;
      if (cwd !== "" && fallbackTitle !== "" && lineCount >= AI_TITLE_MAX_LINES) break;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  // ai-title 是异步元数据，通常追加在当前文件尾部。首次扫描可能早于
  // Claude Code 写入它；下一次列表刷新从尾部再找一次，避免被前 256 行
  // 的性能上限永久挡住。
  if (aiTitle === "") {
    const lateTitle = await scanTailAiTitle(filePath);
    if (lateTitle !== "") aiTitle = lateTitle;
  }
  return { cwd, title: aiTitle || fallbackTitle, entrypoint };
}

/** 在文件尾部寻找异步追加的 ai-title。只读最近 1 MiB，避免历史大文件全量扫描。 */
async function scanTailAiTitle(filePath: string): Promise<string> {
  let fileSize: number;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    return "";
  }
  if (fileSize === 0) return "";
  const handle = await open(filePath, "r");
  try {
    const readBytes = Math.min(fileSize, AI_TITLE_TAIL_BYTES);
    const start = fileSize - readBytes;
    const buffer = Buffer.alloc(readBytes);
    const { bytesRead } = await handle.read(buffer, 0, readBytes, start);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    const firstIndex = start === 0 ? 0 : 1;
    for (let i = lines.length - 1; i >= firstIndex; i -= 1) {
      const trimmed = (lines[i] ?? "").trim();
      if (trimmed === "") continue;
      let value: unknown;
      try {
        value = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!isRecord(value) || value.type !== "ai-title" || typeof value.aiTitle !== "string") continue;
      const title = value.aiTitle.trim();
      if (title !== "") return toSingleLineTruncated(title, TITLE_MAX_CHARS);
    }
    return "";
  } finally {
    await handle.close();
  }
}

/** 尾部块读最后一条非 sidechain、非 isMeta 的 user/assistant 行，提取预览文本。 */
async function scanLastPreview(filePath: string, fileSize: number): Promise<string> {
  if (fileSize === 0) return "";
  const handle = await open(filePath, "r");
  try {
    let tailBytes = PREVIEW_INITIAL_TAIL_BYTES;
    for (;;) {
      const readBytes = Math.min(tailBytes, fileSize);
      const start = fileSize - readBytes;
      const buffer = Buffer.alloc(readBytes);
      await handle.read(buffer, 0, readBytes, start);
      const lines = buffer.toString("utf8").split("\n");
      // 非从文件头起读时，首段可能是被截断的半行，丢弃
      const firstIndex = start === 0 ? 0 : 1;
      for (let i = lines.length - 1; i >= firstIndex; i -= 1) {
        const trimmed = (lines[i] ?? "").trim();
        if (trimmed === "") continue;
        let o: unknown;
        try {
          o = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (!isRecord(o)) continue;
        if (o.isSidechain === true || o.isMeta === true) continue;
        if (o.type !== "user" && o.type !== "assistant") continue;
        const text = previewText(o);
        if (text !== "") return toSingleLineTruncated(text, PREVIEW_MAX_CHARS);
      }
      if (readBytes >= fileSize || tailBytes >= PREVIEW_MAX_TAIL_BYTES) return "";
      tailBytes *= 4;
    }
  } finally {
    await handle.close();
  }
}

/**
 * 列出 projectsDir 下所有会话摘要（跳过官方桌面端会话），按 lastActiveAt 降序。
 * 目录不存在返回空数组；status 本卡固定 "idle"（真实状态由 03 卡覆盖）。
 */
export async function listSessions(projectsDir: string): Promise<SessionSummary[]> {
  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir, { withFileTypes: true });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }

  const summaries: SessionSummary[] = [];
  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;
    const dirPath = join(projectsDir, projectDir.name);
    let files;
    try {
      files = await readdir(dirPath, { withFileTypes: true });
    } catch {
      continue; // 目录消失/无权限：跳过该项目目录
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      const filePath = join(dirPath, file.name);
      try {
        const stats = await stat(filePath);
        const head = await scanHead(filePath);
        if (HIDDEN_ENTRYPOINTS.has(head.entrypoint)) continue;
        const lastPreview = await scanLastPreview(filePath, stats.size);
        summaries.push({
          sessionId: file.name.slice(0, -".jsonl".length),
          cwd: head.cwd,
          projectDirName: projectDir.name,
          title: head.title === "" ? "(空会话)" : head.title,
          lastPreview,
          lastActiveAt: Math.round(stats.mtimeMs),
          sizeBytes: stats.size,
          status: "idle",
        });
      } catch {
        continue; // 文件消失等瞬态错误：跳过该文件
      }
    }
  }
  summaries.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return summaries;
}
