# 项目约定

## 发布流程（必须遵守）

任何改动在推送到 GitHub 或上传 Release **之前**，必须先完成自检和测试，全部通过才能上传。

### 1. 语法检查

```bash
node --check src/main.js
node --check src/preload.js
node --check src/renderer/app.js
```

### 2. 开发版自检

启动开发版并通过 CDP 检查关键功能：

```bash
electron . --remote-debugging-port=9226
```

至少检查：

- 应用数量和分类数量（当前应为 99 款、6 个分类）
- 中英文切换（导航、卡片、详情、设置页）
- 标签筛选（点击标签后数量变化、再次点击取消）
- 设置页（主题、主题色、下载目录、安装目录）
- 格式转换（图片转 JPG、图片转 PDF、PDF 合并/拆分）
- 内置下载（直链下载并检查文件落盘）
- 安装/卸载 IPC（winget 检测、安装日志）

### 3. 打包后自检

```bash
npm run dist
```

打包完成后启动 `dist/win-unpacked/AppPantry.exe`，重复上面的关键检查，确认 asar 内的数据、图标、PowerShell 脚本都能正常读取。

### 4. 测试通过后才允许

```bash
git add -A
git commit -m "..."
git push
gh release create vX.Y.Z dist/AppPantry-X.Y.Z-portable.exe dist/AppPantry-X.Y.Z-setup.exe
```

如果任何一步测试失败，先修复并重新测试，不要上传。

## 数据维护

- `data/apps.json`：应用清单（id、名称、分类、官网、winget、mirror、标签、颜色）
- `data/details.json`：中文详细介绍、亮点、发布者
- `data/en.json`：英文名称、描述、亮点、标签
- `data/i18n.json`：界面中英文文案
- `data/downloads.json`：直接下载链接（url + filename）
- `data/icons/`：应用图标，用 `tools/fetch-icons-v2.js` 抓取

新增应用时三份数据（apps.json、details.json、en.json）要同时补齐。

## 已知限制

- GitHub 的 raw.githubusercontent.com 在当前网络不可达，GitHub 开源项目的图标可能抓成 GitHub 占位图标；遇到这种情况改为字母色块回退，不要使用占位图。
- winget 的 `--location` 只对部分安装器有效，其余仍使用默认安装位置。
