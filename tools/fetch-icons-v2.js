// 第二代图标抓取：优先解析官网 HTML 里的 <link rel="…icon">（apple-touch-icon 最佳），
// 再用 favicon.im 转发站点 favicon，最后尝试约定路径。全部失败则回退字母色块。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogPath = path.join(root, 'data', 'apps.json');
const outDir = path.join(root, 'data', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function detectExt(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'ico';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const head = buf.slice(0, 400).toString('utf8').trim();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return null;
}

async function download(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8' }
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 120 || buf.length > 800000) return null;
    const ext = detectExt(buf);
    if (!ext) return null;
    return { buf, ext };
  } catch (_) {
    return null;
  }
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8' }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (_) {
    return null;
  }
}

function extractIconLinks(html, baseUrl) {
  if (!html) return [];
  const links = [];
  const tagRe = /<link\b[^>]*>/gi;
  let match;
  while ((match = tagRe.exec(html))) {
    const tag = match[0];
    if (!/rel\s*=\s*["'][^"']*icon/i.test(tag)) continue;
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    if (!href || href.startsWith('data:')) continue;
    const rel = (tag.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    let absolute;
    try {
      absolute = new URL(href, baseUrl).href;
    } catch (_) {
      continue;
    }
    links.push({ url: absolute, rel });
  }
  links.sort((a, b) => {
    const score = (rel) => (rel.includes('apple-touch') ? 0 : rel.includes('mask-icon') ? 3 : 1);
    return score(a.rel) - score(b.rel);
  });
  return links;
}

async function fetchForApp(app) {
  const existing = fs
    .readdirSync(outDir)
    .filter((name) => name.startsWith(`${app.id}.`))
    .map((name) => path.join(outDir, name));
  existing.forEach((file) => fs.rmSync(file, { force: true }));

  let host;
  try {
    host = new URL(app.homepage).hostname;
  } catch (_) {
    delete app.icon;
    return { app, ok: false, reason: 'bad url' };
  }

  const candidates = [];

  const html = await fetchHtml(app.homepage);
  candidates.push(...extractIconLinks(html, app.homepage).map((x) => x.url));
  candidates.push(`https://favicon.im/${host}?larger=true`);
  candidates.push(`https://${host}/apple-touch-icon.png`);
  candidates.push(`https://${host}/favicon.ico`);

  const seen = new Set();
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    const got = await download(url);
    if (!got) continue;
    fs.writeFileSync(path.join(outDir, `${app.id}.${got.ext}`), got.buf);
    app.icon = `icons/${app.id}.${got.ext}`;
    return { app, ok: true, bytes: got.buf.length, source: url };
  }

  delete app.icon;
  return { app, ok: false, reason: 'no usable icon' };
}

(async () => {
  const apps = catalog.apps;
  const results = [];
  const batchSize = 6;
  for (let i = 0; i < apps.length; i += batchSize) {
    const batch = apps.slice(i, i + batchSize);
    const done = await Promise.all(batch.map(fetchForApp));
    results.push(...done);
    done.forEach((r) =>
      console.log(
        `${r.ok ? 'OK  ' : 'MISS'} ${r.app.id.padEnd(18)} ${r.ok ? r.bytes + 'B ' + r.source : r.reason}`
      )
    );
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  const ok = results.filter((r) => r.ok).length;
  console.log(`\nicons: ${ok}/${results.length}`);
  console.log('missing:', results.filter((r) => !r.ok).map((r) => r.app.id).join(', ') || 'none');
})();
