const { app, BrowserWindow, ipcMain, shell, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const iconv = require('iconv-lite');
const { PDFDocument } = require('pdf-lib');

const isWin = process.platform === 'win32';
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#0e1014',
    title: 'AppPantry',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer gone]', JSON.stringify(details));
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[load failed]', code, description);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------- 数据 ----------
function loadCatalog() {
  const base = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'apps.json'), 'utf8')
  );
  const detailsFile = path.join(__dirname, '..', 'data', 'details.json');
  if (fs.existsSync(detailsFile)) {
    const details = JSON.parse(fs.readFileSync(detailsFile, 'utf8'));
    base.apps = base.apps.map((app) => ({ ...app, ...(details[app.id] || {}) }));
  }
  const i18nFile = path.join(__dirname, '..', 'data', 'i18n.json');
  if (fs.existsSync(i18nFile)) {
    base.i18n = JSON.parse(fs.readFileSync(i18nFile, 'utf8'));
  }
  const enFile = path.join(__dirname, '..', 'data', 'en.json');
  if (fs.existsSync(enFile)) {
    const en = JSON.parse(fs.readFileSync(enFile, 'utf8'));
    base.apps = base.apps.map((app) => ({ ...app, en: en[app.id] || null }));
  }
  const downloadsFile = path.join(__dirname, '..', 'data', 'downloads.json');
  if (fs.existsSync(downloadsFile)) {
    const downloads = JSON.parse(fs.readFileSync(downloadsFile, 'utf8'));
    base.apps = base.apps.map((app) => ({ ...app, download: downloads[app.id] || null }));
  }
  base.version = app.getVersion();
  return base;
}

// ---------- winget ----------
function runWinget(args, onLine) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('winget', args, { windowsHide: true });
    } catch (err) {
      resolve({ code: -1, error: String(err) });
      return;
    }

    let finished = false;
    const lines = [];
    const finish = (payload) => {
      if (finished) return;
      finished = true;
      resolve({ output: lines.join('\n'), ...payload });
    };

    const emit = (buf) => {
      // 部分中文系统上 winget 输出 GBK，逐块解码可避免半个汉字被截断
      const text = buf.toString('utf8');
      const decoded = text.includes('\uFFFD') ? iconv.decode(buf, 'gbk') : text;
      decoded.split(/\r?\n/).forEach((line) => {
        if (line.trim()) {
          lines.push(line);
          onLine(line);
        }
      });
    };

    child.stdout.on('data', emit);
    child.stderr.on('data', emit);
    child.on('error', (err) => finish({ code: -1, error: String(err) }));
    child.on('close', (code) => finish({ code }));
  });
}

const WINGET_SOURCES = {
  official: 'https://cdn.winget.microsoft.com/cache',
  ustc: 'https://mirrors.ustc.edu.cn/winget-source'
};

// winget source add 需要管理员权限，通过 UAC 提权执行
function runWingetElevated(args) {
  return new Promise((resolve) => {
    const argList = args.map((arg) => `'${String(arg).replace(/'/g, "''")}'`).join(',');
    const script = `$p = Start-Process -FilePath "winget" -ArgumentList @(${argList}) -Verb RunAs -Wait -PassThru; exit $p.ExitCode`;
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true
      });
    } catch (err) {
      resolve({ code: -1, error: String(err) });
      return;
    }
    child.on('error', (err) => resolve({ code: -1, error: String(err) }));
    child.on('close', (code) => resolve({ code }));
  });
}

ipcMain.handle('catalog:get', () => loadCatalog());

// ---------- 已安装应用（注册表 Uninstall 项） ----------
const PS_SCRIPT = path.join(__dirname, 'ps', 'list-installed.ps1');

function runPowerShell(command, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { maxBuffer: 20 * 1024 * 1024, timeout, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) resolve({ ok: false, error: String(err.message || err), stderr: stderr || '' });
        else resolve({ ok: true, stdout: stdout || '' });
      }
    );
  });
}

async function readInstalledApps() {
  if (!isWin) return { ok: false, error: '仅支持 Windows', apps: [] };
  let script;
  try {
    script = fs.readFileSync(PS_SCRIPT, 'utf8');
  } catch (err) {
    return { ok: false, error: '缺少读取脚本: ' + err.message, apps: [] };
  }

  const res = await runPowerShell(script, 60000);
  if (!res.ok) return { ok: false, error: res.error, apps: [] };

  const text = res.stdout.trim();
  if (!text) return { ok: true, apps: [] };

  try {
    const start = text.indexOf('[');
    const parsed = JSON.parse(start >= 0 ? text.slice(start) : text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return { ok: true, apps: list.filter((item) => item && item.name) };
  } catch (err) {
    return { ok: false, error: '解析已安装列表失败: ' + err.message, apps: [] };
  }
}

ipcMain.handle('installed:list', async () => readInstalledApps());

ipcMain.handle('installed:uninstall', async (_event, target) => {
  if (!target || !target.source || !target.key) {
    return { ok: false, error: '参数无效' };
  }

  const bases = {
    hklm64: 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\',
    hklm32: 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\',
    hkcu: 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'
  };
  const base = bases[target.source];
  if (!base) return { ok: false, error: '未知的注册表来源' };

  // key 来自注册表枚举结果，仍然转义单引号，避免命令拼接被注入
  const key = String(target.key).replace(/'/g, "''");
  const regPath = base + key;

  const res = await runPowerShell(
    `$v = (Get-ItemProperty -Path '${regPath}' -ErrorAction Stop).UninstallString; if (-not $v) { exit 2 }; [Console]::Out.Write($v)`,
    20000
  );
  if (!res.ok) return { ok: false, error: '读取卸载命令失败' };

  const command = res.stdout.trim();
  if (!command) return { ok: false, error: '该程序没有提供卸载命令' };

  try {
    // 卸载程序通常需要自己的界面和 UAC，交给独立进程运行，不阻塞应用
    const child = spawn('cmd.exe', ['/c', command], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    return { ok: true, command };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('installed:reveal', async (_event, targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    return { ok: false, error: '没有记录安装目录' };
  }
  const cleaned = targetPath.trim().replace(/^"|"$/g, '');
  if (!fs.existsSync(cleaned)) return { ok: false, error: '目录不存在或已被删除' };
  const err = await shell.openPath(cleaned);
  return err ? { ok: false, error: err } : { ok: true };
});

// ---------- 强制移除与残留清理 ----------
const UNINSTALL_BASES = {
  hklm64: 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\',
  hklm32: 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\',
  hkcu: 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'
};

function isSafeRemovalPath(target) {
  if (!target) return false;
  let resolved;
  try {
    resolved = path.resolve(String(target));
  } catch (_) {
    return false;
  }
  if (resolved.length < 5) return false;
  if (resolved === path.parse(resolved).root) return false;
  const forbidden = [
    process.env.WINDIR,
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.USERPROFILE,
    process.env.APPDATA,
    process.env.LOCALAPPDATA
  ]
    .filter(Boolean)
    .map((item) => path.resolve(item).toLowerCase());
  return !forbidden.includes(resolved.toLowerCase());
}

ipcMain.handle('installed:forceRemove', async (_event, target) => {
  if (!target || !target.source || !target.key) {
    return { ok: false, error: '参数无效' };
  }
  const base = UNINSTALL_BASES[target.source];
  if (!base) return { ok: false, error: '未知的注册表来源' };

  const key = String(target.key).replace(/'/g, "''");
  const regPath = base + key;
  const location = target.location
    ? String(target.location).trim().replace(/^"|"$/g, '')
    : '';

  const registryRes = await runPowerShell(
    `Remove-Item -Path '${regPath}' -Recurse -Force -ErrorAction SilentlyContinue; if (Test-Path '${regPath}') { exit 1 } else { exit 0 }`,
    20000
  );

  let removedDir = false;
  if (location && isSafeRemovalPath(location) && fs.existsSync(location)) {
    try {
      fs.rmSync(location, { recursive: true, force: true, maxRetries: 2 });
      removedDir = !fs.existsSync(location);
    } catch (_) {
      removedDir = false;
    }
  }

  return {
    ok: registryRes.ok,
    registry: registryRes.ok,
    dir: removedDir,
    location,
    error: registryRes.ok ? '' : '注册表项删除失败，可能需要管理员权限'
  };
});

ipcMain.handle('installed:scanResidue', async (_event, target) => {
  const name = String(target?.name || '').trim();
  const location = String(target?.location || '').trim().replace(/^"|"$/g, '');
  const residues = [];

  if (location && fs.existsSync(location)) {
    residues.push({ type: 'dir', path: location });
  }

  if (name.length >= 2) {
    const shortcutDirs = [
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'),
      path.join(process.env.USERPROFILE || '', 'Desktop')
    ].filter(Boolean);
    const lower = name.toLowerCase();

    for (const dir of shortcutDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          const entryLower = entry.name.toLowerCase();
          if (entry.isDirectory()) {
            if (entryLower.includes(lower)) residues.push({ type: 'dir', path: full });
            continue;
          }
          if (entryLower.endsWith('.lnk') && entryLower.includes(lower)) {
            residues.push({ type: 'shortcut', path: full });
          }
        }
      } catch (_) {
        /* 忽略无法读取的目录 */
      }
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of residues) {
    const key = item.path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return { ok: true, residues: unique };
});

ipcMain.handle('installed:cleanResidue', async (_event, paths) => {
  const list = Array.isArray(paths) ? paths.slice(0, 50) : [];
  const removed = [];
  for (const item of list) {
    if (!isSafeRemovalPath(item)) continue;
    try {
      fs.rmSync(item, { recursive: true, force: true, maxRetries: 2 });
      if (!fs.existsSync(item)) removed.push(item);
    } catch (_) {
      /* 被占用时跳过 */
    }
  }
  return { ok: true, removed };
});

// ---------- 已安装程序图标（从本机 exe/ico 提取） ----------
const installedIconCache = new Map();

function normalizeIconPath(value) {
  if (!value) return '';
  let file = String(value).trim();
  // DisplayIcon 常见形式："C:\App\app.exe,0" / "C:\App\app.ico,-1"
  const comma = file.lastIndexOf(',');
  if (comma > 2) {
    const tail = file.slice(comma + 1).trim();
    if (/^-?\d+$/.test(tail)) file = file.slice(0, comma);
  }
  file = file.replace(/^"|"$/g, '').trim();
  // 展开 %ProgramFiles% 之类的环境变量
  file = file.replace(/%([^%]+)%/g, (raw, name) => process.env[name] || raw);
  return file;
}

function exeFromCommand(command) {
  if (!command) return '';
  const text = String(command);
  const quoted = text.match(/"([^"]+\.exe)"/i);
  if (quoted) return quoted[1];
  const plain = text.match(/^([^\s]+\.exe)/i);
  return plain ? plain[1] : '';
}

const RAW_ICON_EXTS = new Set(['.ico', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp']);

function mimeForExt(ext) {
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return `image/${ext.slice(1)}`;
}

function extractIconWithPowerShell(file) {
  return new Promise((resolve) => {
    const safe = String(file).replace(/'/g, "''");
    const script =
      "Add-Type -AssemblyName System.Drawing; " +
      `try { $i=[System.Drawing.Icon]::ExtractAssociatedIcon('${safe}'); ` +
      'if ($i) { $b=$i.ToBitmap(); $ms=New-Object System.IO.MemoryStream; ' +
      '$b.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png); ' +
      '[Console]::Out.Write([Convert]::ToBase64String($ms.ToArray())) } } catch {}';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 15000, maxBuffer: 5 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        const text = (stdout || '').trim();
        if (err || !text) resolve('');
        else resolve(`data:image/png;base64,${text}`);
      }
    );
  });
}

async function readFileIcon(file) {
  if (!file || !fs.existsSync(file)) return '';
  const ext = path.extname(file).toLowerCase();

  // .ico/.png 等图片直接读文件内容：Electron 的 getFileIcon 对 .ico 经常返回空，
  // 而 Steam 游戏在注册表里记录的 DisplayIcon 正是 .ico 缓存文件。
  if (RAW_ICON_EXTS.has(ext)) {
    try {
      const stat = fs.statSync(file);
      if (stat.size > 0 && stat.size <= 2 * 1024 * 1024) {
        const buf = fs.readFileSync(file);
        return `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`;
      }
    } catch (_) {
      /* 读取失败时继续尝试系统图标 */
    }
  }

  const isExecutable = ext === '.exe' || ext === '.lnk';

  try {
    const image = await app.getFileIcon(file, { size: 'large' });
    if (image && !image.isEmpty()) {
      const data = image.toDataURL();
      // getFileIcon 对部分 exe 会返回系统通用图标（base64 很小），改用 PowerShell 提取真实图标
      if (!isExecutable || data.length >= 2500) return data;
      const better = await extractIconWithPowerShell(file);
      return better || data;
    }
  } catch (_) {
    /* 继续尝试 PowerShell */
  }

  if (isExecutable) return extractIconWithPowerShell(file);
  return '';
}

const SKIP_EXE = /(unins|uninstall|setup|install|update|updater|crash|report|redist|vc_redist|dxsetup|dotnet)/i;

function listExeCandidates(dir, maxDepth = 2, limit = 300) {
  const results = [];
  let visited = 0;

  const walk = (current, depth) => {
    if (visited >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (visited >= limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(full, depth + 1);
      } else if (/\.exe$/i.test(entry.name) && !SKIP_EXE.test(entry.name)) {
        visited += 1;
        try {
          results.push({ file: full, size: fs.statSync(full).size });
        } catch (_) {
          /* ignore */
        }
      }
    }
  };

  walk(dir, 0);
  return results.sort((a, b) => b.size - a.size);
}

function findAppDirectory(name, key) {
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : ''
  ].filter(Boolean);

  const targets = [name, key]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/[\s\-_.]/g, ''))
    .filter((value) => value.length >= 3 && !/^\{.*\}$/.test(value));

  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirName = entry.name.toLowerCase().replace(/[\s\-_.]/g, '');
      if (targets.some((target) => dirName === target)) {
        return path.join(root, entry.name);
      }
    }
  }
  return '';
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch (_) {
    return null;
  }
}

function iconCandidates(item) {
  const files = [];
  const display = normalizeIconPath(item.icon);
  const displayIsImage =
    Boolean(display) && RAW_ICON_EXTS.has(path.extname(display).toLowerCase());

  // 图片类图标（Steam 的 .ico 缓存等）直接读取，不扫描目录，避免拖慢大游戏目录；
  // shellex 目录里的是 shell 扩展图标，经常是空白，跳过并改从安装目录找主程序
  const shellExtIcon = Boolean(display) && /[\\/]shellex[\\/]/i.test(display);
  if (displayIsImage && !shellExtIcon) {
    files.push(display);
  } else {
    const location = normalizeIconPath(item.location);
    let scanned = [];
    if (location && fs.existsSync(location)) {
      scanned = listExeCandidates(location, 2);
    } else {
      const dir = findAppDirectory(item.name, item.key);
      if (dir) scanned = listExeCandidates(dir, 2);
    }

    const displayStat = display ? safeStat(display) : null;
    // 游戏主程序通常远大于登录器/启动器：目录里明显更大的 exe 优先
    if (scanned.length && (!display || !displayStat || scanned[0].size > displayStat.size * 5)) {
      files.push(scanned[0].file);
    }
    if (display && !shellExtIcon) files.push(display);
    files.push(...scanned.map((entry) => entry.file));
  }
  const uninstallExe = exeFromCommand(item.uninstall);
  if (uninstallExe && !/msiexec/i.test(uninstallExe)) files.push(uninstallExe);
  const quietExe = exeFromCommand(item.quietUninstall);
  if (quietExe && !/msiexec/i.test(quietExe)) files.push(quietExe);

  return [...new Set(files.filter((file) => file && fs.existsSync(file)))];
}

ipcMain.handle('installed:icons', async (_event, items) => {
  if (!Array.isArray(items)) return {};

  const result = {};
  const queue = [];

  for (const item of items) {
    if (!item || !item.id) continue;
    const cacheKey = `${item.source || ''}|${item.key || item.id}`;
    if (installedIconCache.has(cacheKey)) {
      result[item.id] = installedIconCache.get(cacheKey);
      continue;
    }

    const files = iconCandidates(item);
    if (!files.length) {
      result[item.id] = '';
      continue;
    }
    queue.push({ id: item.id, files, cacheKey });
  }

  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      let data = '';
      for (const file of job.files) {
        data = await readFileIcon(file);
        if (data) break;
      }
      // 只缓存成功结果，避免一次失败后永久显示字母
      if (data) installedIconCache.set(job.cacheKey, data);
      result[job.id] = data;
    }
  };

  await Promise.all(Array.from({ length: 6 }, () => worker()));
  return result;
});

// ---------- 格式转换 ----------
ipcMain.handle('convert:pickFiles', async (event, type) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const filters =
    type === 'pdf'
      ? [{ name: 'PDF 文件', extensions: ['pdf'] }]
      : [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }];

  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters
  });
  if (result.canceled) return [];

  return result.filePaths.map((file) => {
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch (_) {
      /* ignore */
    }
    return { path: file, name: path.basename(file), size };
  });
});

ipcMain.handle('convert:read', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath);
  } catch (_) {
    return null;
  }
});

ipcMain.handle('convert:write', async (_event, filePath, data) => {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: '无效的输出路径' };
  try {
    fs.writeFileSync(filePath, Buffer.from(data));
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('convert:imagesToPdf', async (_event, payload) => {
  try {
    const pdf = await PDFDocument.create();
    for (const image of payload.images || []) {
      const bytes = Buffer.from(image.buffer);
      const embedded = image.type === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    }
    fs.writeFileSync(payload.outputPath, Buffer.from(await pdf.save()));
    return { ok: true, path: payload.outputPath, pages: pdf.getPageCount() };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('convert:mergePdf', async (_event, payload) => {
  try {
    const merged = await PDFDocument.create();
    for (const file of payload.files || []) {
      const doc = await PDFDocument.load(fs.readFileSync(file));
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    fs.writeFileSync(payload.outputPath, Buffer.from(await merged.save()));
    return { ok: true, path: payload.outputPath, pages: merged.getPageCount() };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('convert:splitPdf', async (_event, payload) => {
  try {
    const source = await PDFDocument.load(fs.readFileSync(payload.file));
    const total = source.getPageCount();
    const base = path.basename(payload.file, path.extname(payload.file));
    const outputs = [];

    const exportRange = async (from, to) => {
      const start = Math.max(1, from) - 1;
      const end = Math.min(total, to);
      if (start >= end) return;
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(
        source,
        Array.from({ length: end - start }, (_, index) => start + index)
      );
      pages.forEach((page) => doc.addPage(page));
      const outPath = path.join(
        payload.outputDir,
        from === to ? `${base}-第${from}页.pdf` : `${base}-${from}-${to}页.pdf`
      );
      fs.writeFileSync(outPath, Buffer.from(await doc.save()));
      outputs.push(outPath);
    };

    if (payload.mode === 'each') {
      for (let page = 1; page <= total; page += 1) await exportRange(page, page);
    } else {
      for (const range of payload.ranges || []) await exportRange(range[0], range[1]);
    }

    return { ok: true, files: outputs, total };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('convert:reveal', async (_event, targetPath) => {
  if (!targetPath || !fs.existsSync(targetPath)) return { ok: false, error: '路径不存在' };
  shell.showItemInFolder(targetPath);
  return { ok: true };
});

ipcMain.handle('settings:pickDirectory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return '';
  return result.filePaths[0];
});

// ---------- 内置下载器 ----------
ipcMain.handle('download:start', async (event, payload) => {
  const url = payload && payload.url;
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'invalid url' };
  }

  const dir = payload.saveDir || app.getPath('downloads');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {
    return { ok: false, error: 'cannot create download folder' };
  }

  const fallbackName = (() => {
    try {
      return decodeURIComponent(path.basename(new URL(url).pathname)) || 'download';
    } catch (_) {
      return 'download';
    }
  })();
  const target = path.join(dir, payload.filename || fallbackName);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const request = net.request({ url, redirect: 'follow' });

    request.on('response', (response) => {
      const status = response.statusCode;
      if (status < 200 || status >= 300) {
        finish({ ok: false, error: `HTTP ${status}` });
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      let received = 0;
      const file = fs.createWriteStream(target);

      response.on('data', (chunk) => {
        received += chunk.length;
        file.write(chunk);
        if (!event.sender.isDestroyed()) {
          event.sender.send('download:progress', { url, received, total, target });
        }
      });

      response.on('end', () => {
        file.end(() => finish({ ok: true, path: target }));
      });

      response.on('error', (err) => {
        file.destroy();
        finish({ ok: false, error: String(err) });
      });
    });

    request.on('error', (err) => finish({ ok: false, error: String(err) }));
    request.end();
  });
});

ipcMain.handle('winget:available', async () => {
  if (!isWin) return { available: false, reason: '仅支持 Windows' };
  const res = await runWinget(['--version'], () => {});
  console.log('[winget] available:', res.code === 0, res.error || '');
  return { available: res.code === 0, reason: res.error || '' };
});

ipcMain.handle('winget:install', async (event, appEntry, options = {}) => {
  if (!appEntry || !appEntry.winget) {
    return { code: -1, error: '该应用没有 winget 包' };
  }
  const silent = Boolean(options && options.silent);
  const sender = event.sender;
  const send = (line) => {
    if (!sender.isDestroyed()) sender.send('install:log', { id: appEntry.id, line });
  };

  const args = [
    'install',
    '--id',
    appEntry.winget,
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements'
  ];
  if (silent) args.push('--silent', '--disable-interactivity');
  if (options.installDir) {
    args.push('--location', path.join(String(options.installDir), String(appEntry.id)));
  }

  send(`> winget ${args.join(' ')}`);
  const res = await runWinget(args, send);
  if (res.error) send(res.error);
  return res;
});

ipcMain.handle('winget:installed', async (_event, appEntry) => {
  if (!isWin || !appEntry || !appEntry.winget) return false;
  const res = await runWinget(['list', '--id', appEntry.winget, '-e'], () => {});
  return res.code === 0;
});

ipcMain.handle('winget:source', async () => {
  const res = await runWinget(['source', 'list'], () => {});
  const output = res.output || '';
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => /^winget\s/i.test(item));
  const url = line ? (line.match(/https?:\/\/\S+/) || [])[0] || '' : '';
  const mirror = url.includes('ustc.edu.cn') ? 'ustc' : 'official';
  return { ok: res.code === 0, mirror, url };
});

ipcMain.handle('winget:setSource', async (_event, mirror) => {
  const url = WINGET_SOURCES[mirror] || WINGET_SOURCES.official;
  const res = await runWingetElevated([
    'source',
    'add',
    'winget',
    url,
    '--trust-level',
    'trusted',
    '--accept-source-agreements'
  ]);
  return { ok: res.code === 0, code: res.code, url, error: res.error || '' };
});

ipcMain.handle('open:external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: '不支持的链接' };
  }
  await shell.openExternal(url);
  return { ok: true };
});

// ---------- 图标自动获取 ----------
const ICON_MAX = 15;
const ICON_MIME = {
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
};

function requestBuffer(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const request = net.request({ url, redirect: 'follow' });
    request.setHeader('User-Agent', 'AppPantry/0.7 (+https://github.com/mar08meow/AppPantry)');
    request.setHeader('Accept', '*/*');
    const timer = setTimeout(() => {
      request.abort();
      finish(reject, new Error('timeout'));
    }, timeout);
    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(timer);
        finish(resolve, {
          status: response.statusCode,
          headers: response.headers,
          buffer: Buffer.concat(chunks)
        });
      });
      response.on('error', (err) => {
        clearTimeout(timer);
        finish(reject, err);
      });
    });
    request.on('error', (err) => {
      clearTimeout(timer);
      finish(reject, err);
    });
    request.end();
  });
}

async function requestJson(url) {
  const res = await requestBuffer(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(res.buffer.toString('utf8'));
}

function githubRepo(homepage) {
  const match = /github\.com\/([^/]+)\/([^/?#]+)/i.exec(homepage || '');
  return match ? `${match[1]}/${match[2]}` : '';
}

function iconScore(file) {
  let value = 0;
  if (/icon/i.test(file.path)) value += 3;
  if (/logo/i.test(file.path)) value += 1;
  if (/^[^/]+\.(png|svg|ico)$/i.test(file.path)) value += 2;
  if (/assets|build|resources|images/i.test(file.path)) value += 1;
  if (/256|512|128|1024/i.test(file.path)) value += 1;
  return value;
}

function pickGithubIcon(tree) {
  return (tree || [])
    .filter((file) => file.type === 'blob')
    .filter((file) => /\.(png|svg|ico)$/i.test(file.path))
    .filter((file) => /icon|logo/i.test(file.path))
    .filter(
      (file) =>
        !/screenshot|docs?\/|test|sample|banner|social|readme|website|favicon/i.test(file.path)
    )
    .filter((file) => file.size > 300 && file.size < 800000)
    .sort((a, b) => iconScore(b) - iconScore(a))[0];
}

async function fetchGithubIcon(homepage) {
  const repo = githubRepo(homepage);
  if (!repo) return null;
  const info = await requestJson(`https://api.github.com/repos/${repo}`);
  const branch = info.default_branch || 'main';
  const tree = await requestJson(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`
  );
  const candidate = pickGithubIcon(tree.tree);
  if (!candidate) return null;
  const content = await requestJson(
    `https://api.github.com/repos/${repo}/contents/${encodeURI(candidate.path)}?ref=${branch}`
  );
  if (!content.content) return null;
  const buffer = Buffer.from(content.content.replace(/\s/g, ''), 'base64');
  if (buffer.length < 300) return null;
  return { buffer, ext: path.extname(candidate.path).toLowerCase().replace('.', '') || 'png' };
}

async function fetchWebIcon(homepage) {
  const res = await requestBuffer(homepage);
  if (res.status >= 400) return null;
  const html = res.buffer.toString('utf8');
  const links = [];
  const linkRe = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi;
  let match;
  while ((match = linkRe.exec(html))) {
    const href = /href=["']([^"']+)["']/i.exec(match[0]);
    if (!href) continue;
    try {
      links.push(new URL(href[1], homepage).href);
    } catch (_) {
      /* 忽略非法地址 */
    }
  }
  // apple-touch-icon 通常分辨率最高，优先尝试
  links.sort((a, b) => (b.includes('apple-touch') ? 1 : 0) - (a.includes('apple-touch') ? 1 : 0));
  for (const url of links.slice(0, 6)) {
    try {
      const icon = await requestBuffer(url);
      if (icon.status !== 200 || icon.buffer.length < 300) continue;
      const type = String(icon.headers['content-type'] || '');
      const ext = type.includes('svg')
        ? 'svg'
        : type.includes('png')
          ? 'png'
          : type.includes('webp')
            ? 'webp'
            : type.includes('jpeg')
              ? 'jpg'
              : 'ico';
      return { buffer: icon.buffer, ext };
    } catch (_) {
      /* 尝试下一个候选 */
    }
  }
  return null;
}

function iconDir() {
  const dir = path.join(app.getPath('userData'), 'icons');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cachedIconDataUrl(id) {
  const dir = iconDir();
  for (const ext of Object.keys(ICON_MIME)) {
    const file = path.join(dir, `${id}.${ext}`);
    if (fs.existsSync(file)) {
      return `data:${ICON_MIME[ext]};base64,${fs.readFileSync(file).toString('base64')}`;
    }
  }
  return '';
}

function saveIcon(id, result) {
  fs.writeFileSync(path.join(iconDir(), `${id}.${result.ext}`), result.buffer);
  return `data:${ICON_MIME[result.ext] || 'image/png'};base64,${result.buffer.toString('base64')}`;
}

async function resolveIcon(appEntry) {
  const cached = cachedIconDataUrl(appEntry.id);
  if (cached) return cached;
  let result = null;
  if (githubRepo(appEntry.homepage)) {
    result = await fetchGithubIcon(appEntry.homepage);
  }
  if (!result && appEntry.homepage) {
    result = await fetchWebIcon(appEntry.homepage);
  }
  return result ? saveIcon(appEntry.id, result) : '';
}

ipcMain.handle('icons:autoFetch', async (_event, list) => {
  const entries = Array.isArray(list) ? list.slice(0, ICON_MAX) : [];
  const results = [];
  for (const entry of entries) {
    if (!entry || !entry.id) continue;
    try {
      const dataUrl = await resolveIcon(entry);
      if (dataUrl) results.push({ id: entry.id, dataUrl });
    } catch (err) {
      console.warn('[icons]', entry.id, String(err.message || err));
    }
  }
  return { results };
});

// ---------- 生命周期 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
