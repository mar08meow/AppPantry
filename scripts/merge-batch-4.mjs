import fs from 'node:fs';

const root = 'D:/AI/workspace/AppToolbox';
const batch = JSON.parse(fs.readFileSync(`${root}/data/batch-4.json`, 'utf8'));

const appsPath = `${root}/data/apps.json`;
const detailsPath = `${root}/data/details.json`;
const enPath = `${root}/data/en.json`;
const downloadsPath = `${root}/data/downloads.json`;

const catalog = JSON.parse(fs.readFileSync(appsPath, 'utf8'));
const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const downloads = JSON.parse(fs.readFileSync(downloadsPath, 'utf8'));

let added = 0;
for (const app of batch) {
  if (catalog.apps.some((existing) => existing.id === app.id)) continue;

  catalog.apps.push({
    id: app.id,
    name: app.name,
    category: app.category,
    description: app.description,
    homepage: app.homepage,
    winget: app.winget || '',
    mirror: app.mirror || '',
    tags: app.tags || [],
    color: app.color || '#5B6CFF',
    initial: app.initial || String(app.name)[0]
  });

  details[app.id] = {
    publisher: app.publisher || '',
    intro: app.intro || '',
    highlights: app.highlights || []
  };

  if (app.en) en[app.id] = app.en;
  if (app.download && app.download.url) downloads[app.id] = app.download;

  added += 1;
}

for (const app of catalog.apps) {
  const source = batch.find((item) => item.id === app.id);
  app.opensource =
    Boolean(source?.opensource) || /github\.com/i.test(app.homepage || '');
}

fs.writeFileSync(appsPath, JSON.stringify(catalog, null, 2) + '\n');
fs.writeFileSync(detailsPath, JSON.stringify(details, null, 2) + '\n');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');
fs.writeFileSync(downloadsPath, JSON.stringify(downloads, null, 2) + '\n');

const openCount = catalog.apps.filter((app) => app.opensource).length;
console.log(`added ${added} apps, total ${catalog.apps.length}, open source ${openCount}`);
