# 在新电脑上继续开发 AppPantry

这份资料把源码、数据和便携 Node 都带上了，换电脑后按下面几步就能继续开发。

## 一、准备

需要的东西：

- 本项目文件夹（U 盘里的 `AppPantry`）
- Node.js 22 LTS 或更高版本（U 盘 `dev/node` 里已自带便携版，可直接用）
- 网络（第一次 `npm install` 需要下载依赖）

## 二、快速开始

1. 把 U 盘里的 `AppPantry` 整个文件夹复制到新电脑，例如 `D:\AppPantry`。
2. 打开 PowerShell 或 Git Bash，进入项目目录：

   ```powershell
   cd D:\AppPantry
   ```

3. 如果新电脑没有安装 Node.js，先用 U 盘自带的便携版：

   ```powershell
   $env:Path = "E:\AppPantry\dev\node;$env:Path"
   node -v
   npm -v
   ```

   > 盘符按实际情况修改（U 盘可能是 E:、F: 等）。

4. 安装依赖：

   ```powershell
   npm install
   ```

5. 启动开发版：

   ```powershell
   npm start
   ```

6. 打包便携版和安装版：

   ```powershell
   npm run dist
   ```

   产物在 `dist\`：

   - `AppPantry-0.4.0-portable.exe`（便携版）
   - `AppPantry-0.4.0-setup.exe`（安装版）

## 三、项目结构

```
src/
  main.js          Electron 主进程：清单、winget、注册表、转换、下载器
  preload.js       contextBridge API
  ps/              PowerShell 辅助脚本
  renderer/        界面（原生 HTML/CSS/JS）
data/
  apps.json        应用清单（名称、分类、官网、winget id、mirror）
  details.json     中文详细介绍、亮点、发布者
  en.json          英文名称、描述、亮点、标签
  i18n.json        界面中英文文案
  downloads.json   直接下载链接（url + filename）
  icons/           应用图标
build/             应用图标和 NSIS 自定义安装脚本
tools/             图标生成和预览工具
scripts/           构建时补丁（NSIS include 顺序）
```

## 四、常见问题

**`npm install` 很慢或失败**

项目里的 `.npmrc` 已配置国内镜像。如果在新网络环境仍然慢，可以换回官方源：

```powershell
npm config delete registry
npm install
```

**打包时提示 Electron 下载失败**

设置镜像后重试：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm run dist
```

**安装版的自定义选项页没有出现**

`npm run dist` 会先执行 `scripts/patch-nsis.mjs`，把用户脚本的 include 顺序提前。不要跳过这一步，否则安装向导里不会出现「选择推荐工具」页面。

**node_modules 要一起复制吗？**

不需要。它体积大、和平台相关，在新电脑执行 `npm install` 重新生成即可。

## 五、数据维护

新增应用：

1. 在 `data/apps.json` 增加条目（id、name、category、homepage、winget、tags 等）。
2. 在 `data/details.json` 补中文介绍和亮点。
3. 在 `data/en.json` 补英文名称、描述和亮点。
4. 如有官方直链，在 `data/downloads.json` 增加 `url` 和 `filename`。

图标可以用 `tools/fetch-icons-v2.js` 重新抓取。
