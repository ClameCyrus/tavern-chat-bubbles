# 线上聊天气泡 · 通用版

适用于 SillyTavern「酒馆助手」的聊天气泡脚本。仓库中的源码会由 GitHub Actions 自动打包到 `dist`，加载器通过 jsDelivr 镜像获取最新版代码。

当前初始版本：`v14.4.2`

## 安装

下载并导入酒馆助手脚本库：

- [酒馆助手脚本-线上聊天气泡_通用版-自动更新.json](https://github.com/ClameCyrus/tavern-chat-bubbles/raw/refs/heads/main/release/%E9%85%92%E9%A6%86%E5%8A%A9%E6%89%8B%E8%84%9A%E6%9C%AC-%E7%BA%BF%E4%B8%8A%E8%81%8A%E5%A4%A9%E6%B0%94%E6%B3%A1_%E9%80%9A%E7%94%A8%E7%89%88-%E8%87%AA%E5%8A%A8%E6%9B%B4%E6%96%B0.json)

加载器里的内容只有这一行：

```js
import 'https://testingcf.jsdelivr.net/gh/ClameCyrus/tavern-chat-bubbles/dist/线上聊天气泡_通用版/index.js';
```

以后只需修改并推送 [`src/线上聊天气泡_通用版/index.js`](src/线上聊天气泡_通用版/index.js)。GitHub Actions 会重新生成 `dist` 并更新版本标签，使用者不需要反复导入新的完整 JSON。

## 文件结构

- `src/线上聊天气泡_通用版/index.js`：可维护的完整脚本源码
- `dist/线上聊天气泡_通用版/index.js`：Actions 自动生成的 CDN 文件
- `release/酒馆助手脚本-线上聊天气泡_通用版-自动更新.json`：导入酒馆助手的轻量加载器

## 更新步骤

1. 修改 `src/线上聊天气泡_通用版/index.js`。
2. 提交并推送到 `main`。
3. 等待仓库 Actions 中的 `bundle` 工作流完成。
4. CDN 缓存更新后，酒馆重新加载脚本即可取得新版。

> 国内访问使用 `https://testingcf.jsdelivr.net`，不使用 `https://cdn.jsdelivr.net`。
