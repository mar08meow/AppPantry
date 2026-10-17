// 统一的图标抓取工具：GitHub 项目走 API，其他应用抓官网图标
// 用法：node tools/fetch-icons.mjs [--all]
//   默认只补全缺少图标的应用；--all 重新抓取所有应用
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = 'D:/AI/workspace/AppToolbox';
const catalogPath = path.join(root, 'data', 'apps.json');
const outDir = path.join(root, 'data', 'icons');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const onlyMissing = !process.argv.includes('--all');

let token = process.env.GITHUB_TOKEN || '';
if (!token) {
  try {
    token = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    token = '';
  }
}

async function fetchBuffer(url, asJson = false) {
  const headers = { 'User-Agent': 'AppPantry-icon-fetcher' };
  if (token && url.includes('api.github.com')) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asJson ? res.json() : Buffer.from(await res.arrayBuffer());
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

function pickIcon(tree) {
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

async function githubIcon(homepage) {
  const match = /github\.com\/([^/]+)\/([^/?#]+)/i.exec(homepage || '');
  if (!match) return null;
  const repo = `${match[1]}/${match[2]}`;
  const info = await fetchBuffer(`https://api.github.com/repos/${repo}`, true);
  const branch = info.default_branch || 'main';
  const tree = await fetchBuffer(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    true
  );
  const candidate = pickIcon(tree.tree);
  if (!candidate) return null;
  const content = await fetchBuffer(
    `https://api.github.com/repos/${repo}/contents/${encodeURI(candidate.path)}?ref=${branch}`,
    true
  );
  const buffer = Buffer.from((content.content || '').replace(/\s/g, ''), 'base64');
  if (buffer.length < 300) return null;
  return { buffer, ext: path.extname(candidate.path).slice(1).toLowerCase() || 'png' };
}

async function webIcon(homepage) {
  const html = (await fetchBuffer(homepage)).toString('utf8');
  const links = [];
  const linkRe = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi;
  let match;
  while ((match = linkRe.exec(html))) {
    const href = /href=["']([^"']+)["']/i.exec(match[0]);
    if (href) links.push(new URL(href[1], homepage).href);
  }
  links.sort((a, b) => (b.includes('apple-touch') ? 1 : 0) - (a.includes('apple-touch') ? 1 : 0));
  for (const url of links.slice(0, 6)) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 300) continue;
      const type = res.headers.get('content-type') || '';
      const ext = type.includes('svg')
        ? 'svg'
        : type.includes('png')
          ? 'png'
          : type.includes('webp')
            ? 'webp'
            : type.includes('jpeg')
              ? 'jpg'
              : 'ico';
      return { buffer, ext };
    } catch (_) {
      /* 尝试下一个候选 */
    }
  }
  return null;
}

const targets = catalog.apps.filter((app) => (onlyMissing ? !app.icon : true));
let ok = 0;

for (const app of targets) {
  try {
    const result = (await githubIcon(app.homepage)) || (await webIcon(app.homepage));
    if (!result) {
      console.log(`MISS ${app.id.padEnd(18)} no icon found`);
      continue;
    }
    fs.writeFileSync(path.join(outDir, `${app.id}.${result.ext}`), result.buffer);
    app.icon = `icons/${app.id}.${result.ext}`;
    ok += 1;
    console.log(`OK   ${app.id.padEnd(18)} ${result.buffer.length}B`);
  } catch (err) {
    console.log(`MISS ${app.id.padEnd(18)} ${String(err.message || err).slice(0, 100)}`);
  }
}

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(`\nicons: ${ok}/${targets.length}`);
