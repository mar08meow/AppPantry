# AppPantry

**A local-first Windows app downloader, installer and manager.**
**本地优先的 Windows 应用下载、安装与管理工具。**

AppPantry helps people who are new to Windows find, install and manage common software without hunting through search results. It ships with a curated catalog, one-click installation through winget, a built-in uninstaller, local file conversion, and a direct downloader — all in one desktop app.

AppPantry 面向刚接触 Windows 的用户：不用在搜索结果里翻找，就能找到、安装和管理常用软件。内置精选清单、winget 一键安装、软件卸载管理、本地格式转换和内置下载器。

---

## Features / 功能

### App catalog / 应用清单
- 154 curated Windows apps across essentials, media, utilities, social & cloud, game platforms, and dev tools, including 28 open-source projects
- Real brand icons extracted from the local system, with offline fallbacks
- Placeholder detection when fetching icons, with a favicon.im fallback
- 26 Chinese apps added: Bilibili, Douyin, Xiaohongshu, Zhihu, Weibo, Taobao, Alipay, Sunlogin, ToDesk, Huorong, Kugou, Kuwo, CapCut and more
- Detailed Chinese and English descriptions, highlights and tags
- Search, category filters and an "installable only" filter
- One-click installable apps are listed first in every category
- Favorites, recently installed shortcuts and an open-source section with sub-category filters
- Automatic icon fetching from official sites or the GitHub API
- In-app app submission, reviewed through a GitHub Issue before being added

- 收录 154 款常用应用，覆盖装机必备、影音娱乐、系统工具、社交与网盘、游戏平台、开发工具，其中 28 个为开源项目
- 从本机提取真实品牌图标，离线可用
- 图标抓取带占位图检测，并提供 favicon.im 备用源
- 新增 26 款国内应用：哔哩哔哩、抖音、小红书、知乎、微博、淘宝、支付宝、向日葵、ToDesk、火绒、酷狗、酷我、剪映等
- 中英文详细介绍、亮点和标签
- 支持搜索、分类筛选和「仅看可一键安装」
- 每个分类中可一键安装的应用优先显示
- 我的收藏、最近安装，以及带子分类筛选的开源专区
- 自动从官网或 GitHub 抓取应用图标
- 应用内投稿，经 GitHub Issue 审核后才加入清单

### Install & manage / 安装与管理
- One-click install via winget, with silent install as an option
- Clear install log with progress, auto-collapsed when finished
- Installed apps are read from the Windows registry, with size, publisher and install date
- Uninstall through each app's own uninstaller, or open its install folder
- Batch uninstall, force removal and leftover scanning, similar to HiBit / Geek Uninstaller
- Optional USTC mirror for winget downloads, no proxy required

- 通过 winget 一键安装，可选静默安装
- 安装日志实时显示，完成后自动收起
- 从注册表读取已安装程序，显示大小、发布者和安装日期
- 调用程序自带卸载器，或打开安装目录
- 批量卸载、强制移除和残留清理，接近 HiBit / Geek Uninstaller
- winget 下载源可切换为中科大镜像，无需代理

### Convert / 格式转换
- Convert images between PNG, JPG and WebP
- Combine images into a PDF
- Merge PDFs, or split a PDF per page / by page range
- All conversion runs locally; files never leave the machine

- 图片在 PNG / JPG / WebP 之间互转
- 多张图片合成一个 PDF
- PDF 合并，或按页 / 页码范围拆分
- 全部本地完成，文件不会离开电脑

### Download / 内置下载器
- Optional direct download links (`download` field) per app
- Built-in downloader with progress, saved to a configurable folder

- 每个应用可配置直接下载链接（`download` 字段）
- 内置下载器显示进度，保存到可配置的目录

### Personalize / 个性化
- Chinese and English UI with one-click switching (or follow system)
- Dark and light themes
- Six accent colors that recolor buttons and highlights
- All settings stored locally

- 中英文界面一键切换，也可跟随系统
- 深色 / 浅色主题
- 六种主题色，按钮和高亮实时跟随
- 所有设置只保存在本机

---

## Download / 下载

Two builds are provided / 提供两个版本：

| Build / 版本 | File / 文件 | Notes / 说明 |
| --- | --- | --- |
| Portable / 便携版 | `AppPantry-0.4.0-portable.exe` | Double-click to run, no installation / 双击即用，不写注册表 |
| Installer / 安装版 | `AppPantry-0.4.0-setup.exe` | Standard installer with uninstaller / 标准安装向导，带卸载程序 |

The installer includes an optional step to install [FileConverter](https://github.com/Tichau/FileConverter) for audio, video and document conversion. It is checked by default and can be skipped.

安装版包含一个可选步骤，可以一并安装 [FileConverter](https://github.com/Tichau/FileConverter)（用于音视频和文档转换），默认勾选，可取消。

### Requirements / 运行要求
- Windows 10/11 x64
- winget (App Installer) for one-click installation

- Windows 10/11 x64
- 一键安装需要系统带有 winget（应用安装程序）

---

## Development / 开发

```bash
# install dependencies
npm install

# run in development
npm start

# build both portable and installer
npm run dist
```

Build output goes to `dist/`.

打包产物位于 `dist/`。

### Data files / 数据文件

| File | Purpose / 用途 |
| --- | --- |
| `data/apps.json` | App catalog: name, category, homepage, winget id, mirror, tags |
| `data/details.json` | Chinese descriptions, highlights and publisher |
| `data/en.json` | English names, descriptions, highlights and tags |
| `data/i18n.json` | UI strings for Chinese and English |
| `data/downloads.json` | Optional direct download links (`url`, `filename`) |
| `data/icons/` | App icons fetched from official sources |

To add an app, add an entry to `apps.json` and the matching descriptions to `details.json` and `en.json`. To add a direct download, add an entry to `downloads.json`:

```json
{
  "chrome": {
    "url": "https://dl.google.com/chrome/install/latest/chrome_installer.exe",
    "filename": "ChromeSetup.exe"
  }
}
```

### Project structure / 项目结构

```
src/
  main.js          Electron main process: catalog, winget, registry, conversion, downloader
  preload.js       contextBridge API
  ps/              PowerShell helper scripts
  renderer/        UI (vanilla HTML/CSS/JS)
data/              catalog, descriptions, i18n, icons
build/             app icon and NSIS custom script
tools/             icon generation and preview helpers
scripts/           build-time patches (NSIS include order)
```

---

## Tech / 技术栈

- Electron 44
- pdf-lib for PDF operations
- winget for package installation
- PowerShell for registry and icon extraction
- electron-builder for packaging (portable + NSIS)

---

## Acknowledgements / 致谢

- Uninstall management is inspired by [HiBit Uninstaller](https://www.hibitsoft.ir/) and [Geek Uninstaller](https://geekuninstaller.com/).
- [Bulk Crap Uninstaller](https://github.com/Klocman/Bulk-Crap-Uninstaller) (Apache-2.0) is included in the catalog as an open-source alternative for deep cleanup.
- App icons are fetched from official websites or GitHub repositories; all trademarks belong to their respective owners.

- 卸载管理的设计参考了 [HiBit Uninstaller](https://www.hibitsoft.ir/) 和 [Geek Uninstaller](https://geekuninstaller.com/)。
- [Bulk Crap Uninstaller](https://github.com/Klocman/Bulk-Crap-Uninstaller)（Apache-2.0）已收录进清单，作为开源深度清理工具。
- 应用图标来自各应用官网或 GitHub 仓库，商标归各自所有者。

---

## Notes / 说明

- AppPantry never uploads your files or settings.
- Uninstalling an app launches its own uninstaller; AppPantry does not delete files on its own.
- Direct download links are maintained in `data/downloads.json` and may become stale over time.

- AppPantry 不会上传你的文件或设置。
- 卸载会调用程序自带的卸载程序，AppPantry 不会自行删除文件。
- 直接下载链接维护在 `data/downloads.json`，可能随时间失效。

---

## License / 许可证

MIT License. See [LICENSE](LICENSE).

MIT 许可证，详见 [LICENSE](LICENSE)。
