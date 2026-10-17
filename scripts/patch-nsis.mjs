// electron-builder 的 NSIS 模板会先定义安装向导页面（assistedInstaller.nsh），
// 之后才 include 用户的 installer.nsh，导致 customPageAfterChangeDir 永远拿不到定义。
// 这个脚本把用户脚本的 include 提前到页面定义之前（带 guard 防止重复 include），
// 让安装向导里可以出现自定义的「选项页」。
import fs from 'node:fs';
import path from 'node:path';

const nsisDir = path.join('node_modules', 'app-builder-lib', 'templates', 'nsis');
const assistedPath = path.join(nsisDir, 'assistedInstaller.nsh');
const installerPath = path.join('build', 'installer.nsh');

const guardHeader = [
  '; patched by scripts/patch-nsis.mjs: include user installer script before page definitions',
  '!ifndef CUSTOM_NSIS_INCLUDED',
  '!define CUSTOM_NSIS_INCLUDED',
  '!include "${BUILD_RESOURCES_DIR}\\installer.nsh"',
  '!endif',
  ''
].join('\n');

let assisted = fs.readFileSync(assistedPath, 'utf8');
if (!assisted.includes('CUSTOM_NSIS_INCLUDED')) {
  fs.writeFileSync(assistedPath, guardHeader + assisted);
  console.log('patched assistedInstaller.nsh');
} else {
  console.log('assistedInstaller.nsh already patched');
}

// NSIS 的 Unicode 编译器需要 UTF-8 BOM 才能正确读取脚本里的中文
if (fs.existsSync(installerPath)) {
  const buf = fs.readFileSync(installerPath);
  if (!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)) {
    fs.writeFileSync(installerPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf]));
    console.log('added UTF-8 BOM to installer.nsh');
  }
}
