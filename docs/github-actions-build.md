# 使用 GitHub Actions 构建 Android APK

GitHub Actions 提供免费的构建资源（公开仓库无限制），无需排队，构建时间约 10-15 分钟。

## 自动构建触发条件

工作流已配置，会在以下情况自动构建：

1. **推送到 main 分支且修改了 `app/` 目录**
2. **手动触发**：在 GitHub 仓库页面 → Actions → Build Android APK → Run workflow

## 手动触发构建

1. 访问你的 GitHub 仓库
2. 点击顶部的 **Actions** 标签
3. 左侧选择 **Build Android APK**
4. 点击右侧的 **Run workflow** 按钮
5. 选择分支（默认 main）
6. 点击绿色的 **Run workflow**

## 下载构建产物

构建完成后（约 10-15 分钟）：

1. 进入对应的 workflow run 页面
2. 滚动到底部的 **Artifacts** 区域
3. 下载 `claude-remote-android-xxxxxxxx.zip`
4. 解压得到 `app-release.apk`

## 创建 Release 自动发布

如果想在打 tag 时自动发布：

```bash
# 在本地创建 tag
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions 会自动：
- 构建 APK
- 创建 GitHub Release
- 上传 APK 到 Release

## 本地测试工作流

如果想在推送前本地验证构建流程：

```bash
cd app
npm install
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
```

APK 位置：`app/android/app/build/outputs/apk/release/app-release.apk`

## 构建时间对比

| 方式 | 首次构建 | 后续构建 | 排队时间 | 成本 |
|------|----------|----------|----------|------|
| **GitHub Actions** | 12-15 分钟 | 8-12 分钟 | 无 | 免费（公开仓库） |
| **EAS Build 免费** | 15-20 分钟 | 5-10 分钟 | 5-30 分钟 | 免费 30 次/月 |
| **本地构建** | 10-15 分钟 | 3-5 分钟 | 无 | 需配置环境 |

## 故障排查

### 构建失败：内存不足

在 `app/android/gradle.properties` 中添加：
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m
```

### 构建失败：依赖下载超时

重新运行 workflow（GitHub 有时网络波动）。

### 签名问题

GitHub Actions 使用调试签名构建，APK 可以直接安装但不能上架 Google Play。生产签名需要配置密钥库。

## 优化构建速度

工作流已配置 npm 缓存，后续构建会更快。如需进一步优化：

```yaml
# 添加 Gradle 缓存
- name: Cache Gradle
  uses: actions/cache@v4
  with:
    path: |
      ~/.gradle/caches
      ~/.gradle/wrapper
    key: gradle-${{ runner.os }}-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
```

## 相关文档

- [完整 Android 构建指南](build-android.md)
- [部署文档](deployment.md)
- [GitHub Actions 文档](https://docs.github.com/actions)
