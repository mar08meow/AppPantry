// 通过 api.github.com 抓取 GitHub 项目的真实图标（raw.githubusercontent.com 不可达）
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = 'D:/AI/workspace/AppToolbox';
const catalogPath = path.join(root, 'data', 'apps.json');
const outDir = path.join(root, 'data', 'icons');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

async function ghApi(apiPath) {
  const { stdout } = await exec('gh', ['api', apiPath], {
    maxBuffer: 30 * 1024 * 1024,
    windowsHide: true
  });
  return stdout;
}

function score(file) {
  let value = 0;
  if (/icon/i.test(file.path)) value += 3;
  if (/logo/i.test(file.path)) value += 1;
  if (/^[^/]+\.(png|svg|ico)$/i.test(file.path)) value += 2;
  if (/assets|build|resources|images/i.test(file.path)) value += 1;
  if (/256|512|128|1024/i.test(file.path)) value += 1;
  return value;
}

function pickCandidate(tree) {
  return tree
    .filter((file) => file.type === 'blob')
    .filter((file) => /\.(png|svg|ico)$/i.test(file.path))
    .filter((file) => /icon|logo/i.test(file.path))
    .filter((file) => !/screenshot|docs?\/|test|sample|banner|social|readme|website|favicon/i.test(file.path))
    .filter((file) => file.size > 300 && file.size < 800000)
    .sort((a, b) => score(b) - score(a))[0];
}

async function fetchRepoIcon(app, repo) {
  const info = JSON.parse(await ghApi(`repos/${repo}`));
  const branch = info.default_branch || 'main';
  const treeData = JSON.parse(await ghApi(`repos/${repo}/git/trees/${branch}?recursive=1`));
  const candidate = pickCandidate(treeData.tree || []);
  if (!candidate) return { app, ok: false, reason: 'no icon file' };

  const content = JSON.parse(
    await ghApi(`repos/${repo}/contents/${encodeURI(candidate.path)}?ref=${branch}`)
  );
  if (!content.content) return { app, ok: false, reason: 'no content' };

  const buf = Buffer.from(content.content.replace(/\s/g, ''), 'base64');
  if (buf.length < 300) return { app, ok: false, reason: 'too small' };

  const ext = path.extname(candidate.path).toLowerCase().replace('.', '');
  fs.readdirSync(outDir)
    .filter((name) => name.startsWith(`${app.id}.`))
    .forEach((name) => fs.rmSync(path.join(outDir, name), { force: true }));
  fs.writeFileSync(path.join(outDir, `${app.id}.${ext}`), buf);
  app.icon = `icons/${app.id}.${ext}`;
  return { app, ok: true, bytes: buf.length, source: `${repo}/${candidate.path}` };
}

(async () => {
  const targets = catalog.apps.filter((app) => /github\.com/i.test(app.homepage || ''));
  const results = [];
  for (const app of targets) {
    const match = app.homepage.match(/github\.com\/([^/]+)\/([^/?#]+)/);
    if (!match) continue;
    const repo = `${match[1]}/${match[2]}`;
    try {
      const result = await fetchRepoIcon(app, repo);
      results.push(result);
      console.log(
        `${result.ok ? 'OK  ' : 'MISS'} ${app.id.padEnd(18)} ${result.ok ? result.bytes + 'B ' + result.source : result.reason}`
      );
    } catch (err) {
      results.push({ app, ok: false, reason: String(err.message || err).slice(0, 120) });
      console.log(`MISS ${app.id.padEnd(18)} ${String(err.message || err).slice(0, 120)}`);
    }
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  const ok = results.filter((item) => item.ok).length;
  console.log(`\ngithub icons: ${ok}/${results.length}`);
})();
