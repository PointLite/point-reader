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

- Expo SDK 55
- React 19 / React Native 0.83
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
npm run typecheck
npm run lint
```

## 目录结构

```text
src/app              路由页面
src/components       通用组件和阅读器组件
src/lib              数据、导入、阅读内容、WebDAV、设置等逻辑
src/types            共享类型
assets/images        应用图标和启动图资源
ios / android        原生工程
```
