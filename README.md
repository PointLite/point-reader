# Point Reader

<p align="center">
  <img src="./assets/images/icon.png" alt="Point Reader icon" width="128" height="128" />
</p>

Point Reader 是一款主要面向电子墨水屏设备的本地电子书阅读器，基于 Expo / React Native 构建。

## 功能

- 书架：网格书架、搜索、排序、多选、删除、书籍详情、文件夹分组。
- 导入：本地文件导入，WebDAV 目录浏览、递归导入、导入进度展示。
- 格式：支持 EPUB、TXT、PDF。
- 阅读：EPUB 连续滚动懒加载、点击翻页、章节列表跳转、图片预览、进度调整。
- 排版：背景色、字号、内边距、行高调整。
- 设备体验：夜间/白天/跟随系统主题，墨水屏优化，屏幕常亮，状态栏电量/时间/进度显示。
- 按键：点击翻页模式下支持音量键翻页。
- 恢复：保存阅读进度；如果应用退出时停留在阅读页，下次启动会自动打开上次阅读的书。

## 技术栈

- Expo SDK 57
- React 19.2.3 / React Native 0.86.3
- Expo Router
- SQLite 本地数据存储
- WebView 自实现 EPUB 阅读容器
- react-native-pdf / react-native-blob-util 用于 PDF 阅读
- AsyncStorage 用于设置和轻量状态持久化

## 开发

安装依赖：

```bash
npm install
```

本地运行开发版本：

```bash
npx expo run:ios
npx expo run:android
```

代码检查：

```bash
npm run check
npm run format:check
npm run doctor
```

## 目录结构

```text
src/app              Expo Router 入口
src/features/library 书库、导入、书架、详情
src/features/reader  阅读会话、设备状态、EPUB/TXT/PDF 容器
src/features/settings 设置快照与设置页面
src/features/webdav  WebDAV 浏览、协议、递归导入
src/shared           SQLite、主题、翻译、通用 UI
tests               存储兼容与阅读/导入回归测试
assets               图标、启动图和字体
```

开发与测试要求 Node.js 22.13 以上。升级 SDK 后请重新构建开发客户端；iOS/Android 原生工程由 Expo prebuild 生成。原生运行需要开发构建（PDF、音量键等原生模块无法通过 Expo Go 完整验证）。
