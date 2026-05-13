# Point Reader

Point Reader 是一款面向电子墨水屏设备的 Expo 电子书阅读器。

## 功能范围

- 书架：本地导入、WebDAV 导入、搜索、排序、多选、详情和删除。
- 阅读：EPUB、TXT、PDF；滚动模式优先，点击翻页保留基础能力。
- 设置：状态栏、屏幕常亮、滚动/点击模式及阅读排版选项。
- 本地存储：SQLite 保存书籍元数据和阅读进度。

## 开发命令

```bash
npm install
npm run typecheck
npm run lint
npm run ios
npm run android
```

PDF 阅读依赖原生模块，目标是 iOS/Android Dev Client 或原生构建，不面向 Expo Web。
