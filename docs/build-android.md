# Android 构建指南

本文档说明如何构建 Android 版本的 claude-remote。

## 推荐方式：GitHub Actions（免费、无需排队）

**最简单的方式**是使用 GitHub Actions 自动构建，公开仓库完全免费且无需排队。

详见 [GitHub Actions 构建指南](github-actions-build.md)

### 快速开始

1. 确保工作流文件已提交：`.github/workflows/android-build.yml`
2. 在 GitHub 仓库页面：**Actions** → **Build Android APK** → **Run workflow**
3. 等待 10-15 分钟
4. 下载构建产物中的 APK

---

## 方式二：EAS Build（需排队）

1. **注册 Expo 账号**：访问 https://expo.dev 注册免费账号
2. **安装 EAS CLI**：
   ```bash
   npm install -g eas-cli
   ```

## 快速构建步骤

### 1. 登录 Expo 账号

```bash
cd claude-remote/app
eas login
```

输入你的 Expo 用户名和密码。

### 2. 配置项目

```bash
eas build:configure
```

此命令会检测项目配置，`eas.json` 已经预先配置好。

### 3. 构建 APK（推荐用于分发）

```bash
# 构建预览版 APK（适合测试和侧载）
eas build --platform android --profile preview

# 首次构建会询问是否自动生成签名密钥，选择 Yes
```

构建过程约 15-20 分钟，完成后会提供下载链接。

### 4. 下载 APK

构建完成后：
- 在终端显示的链接直接下载
- 或访问 https://expo.dev 查看所有构建历史
- APK 可直接安装到 Android 设备

## 构建配置说明

`eas.json` 提供三种构建配置：

### preview（预览版）
```bash
eas build --platform android --profile preview
```
- 输出：APK 文件
- 用途：测试、侧载分发
- 签名：自动生成或使用现有密钥

### production（生产版）
```bash
eas build --platform android --profile production
```
- 输出：AAB 文件（Android App Bundle）
- 用途：上架 Google Play
- 需要：Google Play 开发者账号

### development（开发版）
```bash
eas build --platform android --profile development
```
- 输出：带开发工具的 Debug APK
- 用途：本地开发调试

## 分发 APK

构建完成后的 APK 可以：

1. **直接分发**：
   - 通过邮件或即时通讯工具分享
   - 托管到自己的服务器
   - 存放到内部文件服务器

2. **安装到设备**：
   ```bash
   # 用户下载后在 Android 设备上：
   # 1. 启用「设置 → 安全 → 未知来源」
   # 2. 点击 APK 文件安装
   ```

3. **通过 ADB 安装**（开发者）：
   ```bash
   adb install path/to/claude-remote.apk
   ```

## 更新签名密钥

如果需要使用自己的签名密钥：

```bash
# 生成新密钥
keytool -genkeypair -v -storetype PKCS12 \
  -keystore claude-remote.keystore \
  -alias claude-remote-key \
  -keyalg RSA -keysize 2048 -validity 10000

# 上传到 EAS
eas credentials
```

选择 Android → Build Credentials → Upload new keystore

## 本地构建（不使用 EAS）

如果需要完全本地构建：

```bash
cd claude-remote/app

# 1. 安装依赖
npm install

# 2. 预构建原生项目
npx expo prebuild --platform android

# 3. 构建 APK
cd android
./gradlew assembleRelease

# APK 输出：android/app/build/outputs/apk/release/app-release.apk
```

**注意**：本地构建需要配置 Android SDK 和 JDK 环境。

## 自动化构建（可选）

如果需要在 CI 中自动构建，可以配置 GitHub Actions，在仓库设置中添加 `EXPO_TOKEN`（从 https://expo.dev/accounts/[username]/settings/access-tokens 获取）。

## 常见问题

### 构建失败：内存不足
```bash
# 在 eas.json 中添加：
"build": {
  "preview": {
    "android": {
      "buildType": "apk",
      "gradleCommand": ":app:assembleRelease -Dorg.gradle.jvmargs=-Xmx4g"
    }
  }
}
```

### 找不到模块错误
确保 `app/package.json` 中所有依赖都已安装：
```bash
cd app
rm -rf node_modules package-lock.json
npm install
```

### 签名冲突
如果已有其他应用使用相同的 package name：
- 修改 `app/app.json` 中的 `android.package`
- 使用唯一的 package name（如 `com.yourname.clauderemote`）

## 成本说明

- **免费层**：每月 30 次构建
- **付费计划**：$29/月 无限构建
- 公开项目和开源项目可申请额外免费配额

## 更多资源

- EAS Build 文档：https://docs.expo.dev/build/introduction/
- Android 配置参考：https://docs.expo.dev/build-reference/android-builds/
- 构建故障排查：https://docs.expo.dev/build-reference/troubleshooting/
