# 构建 Android 版本快速指南

## 一键构建命令

```bash
# 1. 安装 EAS CLI
npm install -g eas-cli

# 2. 进入 app 目录
cd claude-remote/app

# 3. 登录 Expo（首次需要）
eas login

# 4. 开始构建
eas build --platform android --profile preview
```

## 构建完成后

- 终端会显示下载链接
- 或访问 https://expo.dev 查看构建历史
- 下载 APK 文件并分发

## 详细文档

- [完整 Android 构建指南](build-android.md)
- [部署文档](deployment.md)
