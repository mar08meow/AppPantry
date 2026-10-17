const $ = (sel) => document.querySelector(sel);

const state = {
  catalog: { categories: [], apps: [] },
  appsById: new Map(),
  category: 'all',
  query: '',
  installableOnly: false,
  installing: new Set(),
  installed: new Set(),
  justInstalled: new Set(),
  wingetOk: false,
  logId: null,
  logs: new Map(),
  modalApp: null,
  toastTimer: null,
  view: 'catalog',
  convertTab: 'image',
  convertFiles: [],
  convertBusy: false,
  convertOutputs: [],
  fileConverterInstalled: false,
  downloadActive: false,
  downloadingId: '',
  downloaded: new Set(),
  i18n: {},
  language: 'zh-CN',
  settings: {
    language: 'auto',
    theme: 'dark',
    accent: '#6d8dff',
    downloadDir: '',
    installDir: ''
  },
  activeTags: new Set(),
  opensourceSub: 'all',
  favorites: new Set(),
  recent: [],
  wingetMirror: 'official',
  wingetSourceUrl: '',
  selectedInstalled: new Set(),
  residue: null,
  installedApps: [],
  installedLoading: false,
  installedError: '',
  installedQuery: '',
  sortBy: 'name',
  confirmTarget: null,
  confirmAction: '',
  matchCache: new Map(),
  rowIcons: new Map(),
  rowIconTried: new Set(),
  iconsLoading: false
};

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );

async function loadCatalog() {
  if (window.toolbox?.getCatalog) {
    return window.toolbox.getCatalog();
  }
  // 浏览器内预览时的降级路径（Electron 中始终走 IPC）
  try {
    const res = await fetch('../../data/apps.json');
    if (res.ok) {
      const catalog = await res.json();
      try {
        const detailsRes = await fetch('../../data/details.json');
        if (detailsRes.ok) {
          const details = await detailsRes.json();
          catalog.apps = catalog.apps.map((app) => ({ ...app, ...(details[app.id] || {}) }));
        }
      } catch (_) {
        /* 详情缺失不影响基础功能 */
      }
      return catalog;
    }
  } catch (_) {
    /* ignore */
  }
  return { categories: [], apps: [] };
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  updateThemeButton();
}

function resolveLanguage() {
  if (state.settings.language === 'auto') {
    return (navigator.language || 'zh-CN').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
  }
  return state.settings.language;
}

function t(key, params) {
  const dict = state.i18n[state.language] || state.i18n['zh-CN'] || {};
  let text = dict[key];
  if (text === undefined) text = key;
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] !== undefined ? String(params[name]) : match
    );
  }
  return text;
}

function updateThemeButton() {
  $('#themeIcon').textContent = state.settings.theme === 'dark' ? '☾' : '☀';
  $('#themeLabel').textContent =
    state.settings.theme === 'dark' ? t('theme.toLight') : t('theme.toDark');
}

function updateVersionLabel() {
  const el = $('.version');
  if (el) el.textContent = `v${state.catalog.version || '0.5.0'} · ${t('version.suffix')}`;
}

function applyLanguage() {
  state.language = resolveLanguage();
  state.activeTags.clear();
  document.documentElement.lang = state.language;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });

  $('#search').placeholder =
    state.view === 'installed' ? t('search.installed') : t('search.placeholder');

  renderNav();
  renderStats();
  if (state.view === 'catalog') render();
  if (state.view === 'installed') renderInstalled();
  if (state.view === 'convert') renderConvertView();
  if (state.view === 'settings') renderSettingsUI();
  updateThemeButton();
  updateVersionLabel();
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('apppantry-settings') || '{}');
    state.settings = { ...state.settings, ...saved };
  } catch (_) {
    /* 配置损坏时使用默认值 */
  }
}

function loadDownloaded() {
  try {
    const saved = JSON.parse(localStorage.getItem('apppantry-downloaded') || '[]');
    state.downloaded = new Set(Array.isArray(saved) ? saved : []);
  } catch (_) {
    state.downloaded = new Set();
  }
}

function saveDownloaded() {
  localStorage.setItem('apppantry-downloaded', JSON.stringify([...state.downloaded]));
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem('apppantry-favorites') || '[]');
    state.favorites = new Set(Array.isArray(saved) ? saved : []);
  } catch (_) {
    state.favorites = new Set();
  }
}

function saveFavorites() {
  localStorage.setItem('apppantry-favorites', JSON.stringify([...state.favorites]));
}

function loadRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem('apppantry-recent') || '[]');
    state.recent = Array.isArray(saved) ? saved : [];
  } catch (_) {
    state.recent = [];
  }
}

function saveRecent() {
  localStorage.setItem('apppantry-recent', JSON.stringify(state.recent));
}

function recordRecent(id) {
  state.recent = [id, ...state.recent.filter((item) => item !== id)].slice(0, 20);
  saveRecent();
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  saveFavorites();
  render();
  if (state.modalApp?.id === id) renderDetail();
}

function saveSettings() {
  localStorage.setItem('apppantry-settings', JSON.stringify(state.settings));
}

function applySettings() {
  applyTheme(state.settings.theme);
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  if (state.i18n && Object.keys(state.i18n).length) {
    applyLanguage();
  }
  renderSettingsUI();
}

function renderSettingsUI() {
  document.querySelectorAll('#languageOptions button').forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === state.settings.language);
  });
  document.querySelectorAll('#themeOptions button').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === state.settings.theme);
  });
  document.querySelectorAll('#colorOptions button').forEach((button) => {
    button.classList.toggle('active', button.dataset.color === state.settings.accent);
  });
  const dirLabel = $('#downloadDirLabel');
  if (dirLabel) {
    dirLabel.textContent = state.settings.downloadDir || t('settings.defaultDir');
  }
  const installLabel = $('#installDirLabel');
  if (installLabel) {
    installLabel.textContent = state.settings.installDir || t('settings.installDefault');
  }
  renderMirrorStatus();
}

function renderMirrorStatus() {
  document.querySelectorAll('#mirrorOptions button').forEach((button) => {
    button.classList.toggle('active', button.dataset.mirror === state.wingetMirror);
  });
  const status = $('#mirrorStatus');
  if (status) {
    status.textContent = state.wingetSourceUrl
      ? t('settings.mirrorCurrent', { url: state.wingetSourceUrl })
      : '';
  }
}

async function loadWingetSource() {
  if (!window.toolbox?.getWingetSource) return;
  try {
    const res = await window.toolbox.getWingetSource();
    if (res?.ok) {
      state.wingetMirror = res.mirror;
      state.wingetSourceUrl = res.url;
      renderMirrorStatus();
    }
  } catch (_) {
    /* 读取失败时保持默认 */
  }
}

async function setWingetSource(mirror) {
  if (!window.toolbox?.setWingetSource || mirror === state.wingetMirror) return;
  toast(t('settings.mirrorChanging'), 8000);
  try {
    const res = await window.toolbox.setWingetSource(mirror);
    if (res?.ok) {
      state.wingetMirror = mirror;
      state.wingetSourceUrl = res.url;
      renderMirrorStatus();
      toast(t('settings.mirrorDone'));
    } else {
      toast(t('settings.mirrorFailed'));
    }
  } catch (_) {
    toast(t('settings.mirrorFailed'));
  }
}

function toast(message, ms = 3200) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

function renderNav() {
  const { categories, apps } = state.catalog;
  const counts = new Map();
  apps.forEach((a) => counts.set(a.category, (counts.get(a.category) || 0) + 1));
  const items = [
    { id: 'all', name: t('nav.all'), icon: '◎', count: apps.length },
    { id: 'favorites', name: t('nav.favorites'), icon: '★', count: state.favorites.size },
    { id: 'recent', name: t('nav.recent'), icon: '↺', count: state.recent.length },
    {
      id: 'opensource',
      name: t('nav.opensource'),
      icon: '⌘',
      count: apps.filter((a) => a.opensource).length
    },
    ...categories.map((cat) => ({
      id: cat.id,
      name: t(`category.${cat.id}`),
      icon: cat.icon,
      count: counts.get(cat.id) || 0
    }))
  ];

  $('#categories').innerHTML = items
    .map(
      (cat) => `
        <button class="nav-item ${state.view === 'catalog' && state.category === cat.id ? 'active' : ''}" data-category="${escapeHtml(cat.id)}">
          <span class="nav-icon">${escapeHtml(cat.icon)}</span>
          <span>${escapeHtml(cat.name)}</span>
          <span class="nav-count">${cat.count}</span>
        </button>`
    )
    .join('');
}

function renderStats() {
  const apps = state.catalog.apps;
  $('#statTotal').textContent = apps.length;
  $('#statWinget').textContent = apps.filter((a) => a.winget).length;
}

function appText(app) {
  if (state.language === 'en-US' && app.en) {
    return {
      name: app.en.name || app.name,
      description: app.en.description || app.description,
      tags: app.en.tags || app.tags,
      intro: app.en.intro || app.intro,
      highlights: app.en.highlights || app.highlights
    };
  }
  return {
    name: app.name,
    description: app.description,
    tags: app.tags,
    intro: app.intro,
    highlights: app.highlights
  };
}

function renderTagFilter() {
  const box = $('#tagFilter');
  if (!box) return;

  if (state.category === 'favorites' || state.category === 'recent') {
    box.innerHTML = '';
    return;
  }

  if (state.category === 'opensource') {
    const subCats = state.catalog.categories.filter((cat) =>
      state.catalog.apps.some((app) => app.opensource && app.category === cat.id)
    );
    box.innerHTML = [
      `<button class="tag-chip ${state.opensourceSub === 'all' ? 'active' : ''}" data-sub="all">${t('nav.all')}</button>`,
      ...subCats.map(
        (cat) =>
          `<button class="tag-chip ${state.opensourceSub === cat.id ? 'active' : ''}" data-sub="${cat.id}">${escapeHtml(t(`category.${cat.id}`))}</button>`
      )
    ].join('');
    return;
  }

  const counts = new Map();
  for (const app of state.catalog.apps) {
    const text = appText(app);
    for (const tag of text.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const tags = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([tag]) => tag);

  box.innerHTML = tags
    .map(
      (tag) =>
        `<button class="tag-chip ${state.activeTags.has(tag) ? 'active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    )
    .join('');
}

function currentApps() {
  const q = state.query.trim().toLowerCase();

  if (state.category === 'favorites') {
    return state.catalog.apps.filter((app) => state.favorites.has(app.id));
  }
  if (state.category === 'recent') {
    return state.recent.map((id) => state.appsById.get(id)).filter(Boolean);
  }

  return state.catalog.apps
    .filter((app) => {
      if (state.category === 'opensource') {
        if (!app.opensource) return false;
        if (state.opensourceSub !== 'all' && app.category !== state.opensourceSub) return false;
      } else if (state.category !== 'all' && app.category !== state.category) {
        return false;
      }
      if (state.installableOnly && !app.winget) return false;
      const text = appText(app);
      if (state.activeTags.size && !(text.tags || []).some((tag) => state.activeTags.has(tag))) {
        return false;
      }
      if (!q) return true;
      const haystack = [text.name, text.description, text.intro, app.publisher, ...(text.tags || [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    })
    // winget 可一键安装的应用排在前面，只能跳官网的排在后面（稳定排序，同组内保持原顺序）
    .sort((a, b) => (a.winget ? 0 : 1) - (b.winget ? 0 : 1));
}

function iconHtml(app, extraClass = '') {
  const text = appText(app);
  const letter = escapeHtml(app.initial || String(text.name || '?')[0]);
  const src = app.icon
    ? app.icon.startsWith('data:')
      ? app.icon
      : `../../data/${escapeHtml(app.icon)}`
    : '';
  const img = src ? `<img class="app-icon-img" src="${src}" alt="" loading="lazy" />` : '';
  return `<div class="app-icon ${extraClass}" style="--c:${escapeHtml(app.color || '#5b6cff')}">
      <span class="app-icon-letter">${letter}</span>${img}
    </div>`;
}

function colorFor(name) {
  const palette = ['#5b6cff', '#2fa36b', '#e07b39', '#a463f2', '#2b93c9', '#d6538f', '#b58a1f', '#1f9c92'];
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return palette[hash % palette.length];
}

function cardHtml(app) {
  const text = appText(app);
  const installing = state.installing.has(app.id);
  const installed = state.installed.has(app.id) || state.justInstalled.has(app.id);
  const fav = state.favorites.has(app.id);
  const tags = (text.tags || [])
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');
  const desc = text.intro || text.description || '';

  let installBtn;
  if (installing) {
    installBtn = `<button class="btn primary" disabled><span class="pulse"></span>${t('card.installing')}</button>`;
  } else if (installed) {
    installBtn = `<button class="btn primary done" data-action="install">${t('card.installed')}</button>`;
  } else if (app.winget) {
    installBtn = `<button class="btn primary" data-action="install">${t('card.install')}</button>`;
  } else {
    installBtn = `<button class="btn" data-action="home">${t('card.download')}</button>`;
  }

  const silentBtn =
    app.winget && !installing && !installed
      ? `<button class="btn icon" data-action="silent" title="${t('card.silent')}">⚡</button>`
      : '';

  return `
    <article class="card ${installing ? 'installing' : ''}" data-app-id="${escapeHtml(app.id)}" style="--c:${escapeHtml(app.color || '#5b6cff')}">
      <button class="fav-btn ${fav ? 'active' : ''}" data-fav="${escapeHtml(app.id)}" title="${fav ? t('card.unfavorite') : t('card.favorite')}">${fav ? '★' : '☆'}</button>
      <div class="card-top">
        ${iconHtml(app)}
        <div class="card-title">
          <h3 title="${escapeHtml(text.name)}">${escapeHtml(text.name)}</h3>
          ${installed ? `<span class="installed-badge">${t('card.installedBadge')}</span>` : ''}
        </div>
      </div>
      <p class="desc">${escapeHtml(desc)}</p>
      <div class="tags">
        ${tags}
        ${app.winget ? '<span class="tag winget">winget</span>' : ''}
      </div>
      <div class="card-actions">
        ${installBtn}
        ${silentBtn}
        ${
          app.winget
            ? `<button class="btn icon" data-action="home" title="${t('card.website')}">↗</button>`
            : ''
        }
        <button class="btn icon" data-action="mirror" title="${
          app.mirror ? t('card.mirror') : t('card.mirrorNone')
        }">⇩</button>
      </div>
    </article>`;
}

function render() {
  if (state.view !== 'catalog') return;
  const apps = currentApps();
  $('#grid').innerHTML = apps.map(cardHtml).join('');
  $('#grid').hidden = apps.length === 0;
  $('#empty').hidden = apps.length !== 0;
  $('#count').textContent = t('count.apps', { n: apps.length });

  if (state.category === 'favorites') {
    $('#sectionTitle').textContent = t('nav.favorites');
  } else if (state.category === 'recent') {
    $('#sectionTitle').textContent = t('nav.recent');
  } else if (state.category === 'opensource') {
    const sub = state.catalog.categories.find((c) => c.id === state.opensourceSub);
    $('#sectionTitle').textContent = sub
      ? `${t('nav.opensource')} · ${t(`category.${sub.id}`)}`
      : t('nav.opensource');
  } else {
    $('#sectionTitle').textContent =
      state.category === 'all' ? t('nav.all') : t(`category.${state.category}`);
  }

  renderNav();
  renderTagFilter();
}

function renderDetail() {
  const app = state.modalApp;
  if (!app) return;

  const text = appText(app);
  const installing = state.installing.has(app.id);
  const installed = state.installed.has(app.id) || state.justInstalled.has(app.id);
  const category = state.catalog.categories.find((c) => c.id === app.category);
  const tags = (text.tags || [])
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');
  const highlights = (text.highlights || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const host = (() => {
    try {
      return new URL(app.homepage).hostname;
    } catch (_) {
      return app.homepage || '';
    }
  })();

  let primaryBtn;
  if (installing) {
    primaryBtn = `<button class="btn primary" disabled><span class="pulse"></span>${t('card.installing')}</button>`;
  } else if (installed) {
    primaryBtn = `<button class="btn primary done" data-action="install">${t('card.installed')}</button>`;
  } else if (app.winget) {
    primaryBtn = `<button class="btn primary" data-action="install">${t('card.install')}</button>`;
  } else {
    primaryBtn = `<button class="btn primary" data-action="home">${t('card.download')}</button>`;
  }

  const silentAction = app.winget
    ? `<button class="btn" data-action="silent">${t('detail.silent')}</button>`
    : '';
  const downloadAction =
    app.download && app.download.url
      ? `<button class="btn${
          state.downloaded.has(app.id) && state.downloadingId !== app.id ? ' done' : ''
        }" data-action="download" ${state.downloadingId === app.id ? 'disabled' : ''}>${
          state.downloadingId === app.id
            ? t('log.downloading')
            : state.downloaded.has(app.id)
              ? t('card.downloaded')
              : t('card.directDownload')
        }</button>`
      : '';
  const categoryName = category ? t(`category.${category.id}`) : '';

  $('#modal').innerHTML = `
    <header class="modal-head">
      ${iconHtml(app, 'modal-icon')}
      <div class="modal-title">
        <h2>${escapeHtml(text.name)}</h2>
        <p class="modal-pub">${
          app.publisher ? escapeHtml(app.publisher) + ' · ' : ''
        }${escapeHtml(categoryName)}</p>
        <div class="tags">${tags}</div>
      </div>
      <button class="modal-close" data-action="close" title="${t('detail.close')}">×</button>
    </header>
    <div class="modal-body">
      <p class="modal-intro">${escapeHtml(text.intro || text.description || '')}</p>
      ${highlights ? `<ul class="hl-list">${highlights}</ul>` : ''}
      <div class="modal-meta">
        <div><span>${t('detail.installMethod')}</span><strong>${
          app.winget ? 'winget · ' + escapeHtml(app.winget) : t('detail.officialPage')
        }</strong></div>
        <div><span>${t('detail.website')}</span><strong>${escapeHtml(host)}</strong></div>
        <div><span>${t('detail.category')}</span><strong>${escapeHtml(categoryName || '—')}</strong></div>
        <div><span>${t('detail.mirror')}</span><strong>${
          app.mirror ? t('detail.configured') : t('detail.notConfigured')
        }</strong></div>
      </div>
    </div>
    <div class="modal-actions">
      ${primaryBtn}
      ${silentAction}
      ${downloadAction}
      <button class="btn" data-action="home">${t('detail.openWebsite')}</button>
      <button class="btn" data-action="mirror">${t('detail.download')}</button>
    </div>`;

  $('#modalMask').hidden = false;
}

function openDetail(app) {
  state.modalApp = app;
  renderDetail();
}

function closeDetail() {
  state.modalApp = null;
  $('#modalMask').hidden = true;
}

function handleAction(action, app) {
  if (action === 'install') installApp(app);
  if (action === 'silent') askSilentInstall(app);
  if (action === 'download') downloadApp(app);
  if (action === 'home') openLink(app.homepage);
  if (action === 'mirror') {
    if (app.mirror) {
      openLink(app.mirror);
    } else {
      toast(t('toast.mirrorNone', { name: app.name }), 4200);
    }
  }
}

async function installApp(app, options = {}) {
  const silent = Boolean(options.silent);
  if (!app.winget || state.installing.has(app.id)) return;
  if (!window.toolbox?.install) {
    toast(t('toast.noWinget'));
    return;
  }

  state.installing.add(app.id);
  state.logs.set(app.id, []);
  state.logId = app.id;
  openLog(app, silent);
  render();
  if (state.modalApp?.id === app.id) renderDetail();

  try {
    const result = await window.toolbox.install(app, {
      silent,
      installDir: state.settings.installDir
    });
    let failed = result.code !== 0;

    // winget 的返回码并不总是可靠：已安装、需要重启、安装器返回非零都可能出现，
    // 因此失败时用 winget list 复查一次，确认到底装上了没有
    if (failed && window.toolbox.isInstalled) {
      try {
        if (await window.toolbox.isInstalled(app)) failed = false;
      } catch (_) {
        /* 复查失败时保留原来的失败状态 */
      }
    }

    setLogStatus(failed ? t('log.failed') : t('log.done'), failed ? 'bad' : 'ok');
    if (!failed) {
      state.installed.add(app.id);
      state.justInstalled.add(app.id);
      recordRecent(app.id);
      toast(
        silent
          ? t('toast.installedSilent', { name: app.name })
          : t('toast.installed', { name: app.name })
      );
      loadInstalled(true);
      // 装完后自动收成一条状态栏，不遮挡其他内容
      setTimeout(() => {
        if (state.logId === app.id) setLogCollapsed(true);
      }, 900);
    } else {
      toast(
        silent
          ? t('toast.failedSilent', { name: app.name })
          : t('toast.failed', { name: app.name })
      );
    }
  } catch (err) {
    appendLog(app.id, String(err));
    setLogStatus(t('log.failed'), 'bad');
    toast(t('toast.failed', { name: app.name }));
  } finally {
    state.installing.delete(app.id);
    render();
    if (state.modalApp?.id === app.id) renderDetail();
  }
}

async function downloadApp(app) {
  const dl = app.download;
  if (!dl || !dl.url) {
    toast(t('download.noUrl'));
    return;
  }
  if (!window.toolbox?.download) {
    toast(t('toast.noWinget'));
    return;
  }

  state.downloadActive = true;
  state.downloadingId = app.id;
  if (state.modalApp?.id === app.id) renderDetail();
  $('#logPanel').hidden = false;
  setLogCollapsed(false);
  $('#logTitle').textContent = `${t('card.directDownload')} · ${app.name}`;
  setLogStatus(t('log.downloading'), '');
  $('#logBody').textContent = '';

  try {
    const res = await window.toolbox.download({
      url: dl.url,
      filename: dl.filename,
      saveDir: state.settings.downloadDir
    });
    if (res.ok) {
      state.downloaded.add(app.id);
      saveDownloaded();
      setLogStatus(t('log.downloadDone'), 'ok');
      $('#logBody').textContent = res.path;
      toast(t('toast.downloadDone', { path: res.path }), 5200);
    } else {
      setLogStatus(t('log.downloadFailed'), 'bad');
      $('#logBody').textContent = res.error || '';
      toast(t('log.downloadFailed'));
    }
  } catch (err) {
    setLogStatus(t('log.downloadFailed'), 'bad');
    $('#logBody').textContent = String(err);
    toast(t('log.downloadFailed'));
  } finally {
    state.downloadActive = false;
    state.downloadingId = '';
    if (state.modalApp?.id === app.id) renderDetail();
  }
}

function openLog(app, silent = false) {
  $('#logPanel').hidden = false;
  setLogCollapsed(false);
  $('#logTitle').textContent = `${silent ? t('detail.silent') : t('card.install')} · ${app.name}`;
  setLogStatus(silent ? t('log.installingSilent') : t('log.installing'), '');
  renderLog(app.id);
}

function setLogCollapsed(collapsed) {
  const panel = $('#logPanel');
  if (!panel) return;
  panel.classList.toggle('collapsed', collapsed);
  const toggle = $('#logToggle');
  if (toggle) {
    toggle.textContent = collapsed ? '▢' : '—';
    toggle.title = collapsed ? t('log.expand') : t('log.collapse');
  }
}

function setLogStatus(text, cls) {
  const el = $('#logStatus');
  el.textContent = text;
  el.className = `log-status ${cls || ''}`;
}

function appendLog(id, line) {
  const lines = state.logs.get(id) || [];
  lines.push(line);
  if (lines.length > 600) lines.splice(0, lines.length - 600);
  state.logs.set(id, lines);
  if (state.logId === id) renderLog(id);
}

function renderLog(id) {
  const body = $('#logBody');
  const lines = state.logs.get(id) || [];
  body.textContent = lines.join('\n');
  body.scrollTop = body.scrollHeight;
}

function openLink(url) {
  if (!url) return;
  if (window.toolbox?.openExternal) {
    window.toolbox.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

// ---------- 已安装应用 ----------
function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_.()（）\[\]【】]/g, '');
}

function rowKey(item) {
  return `${item.source}|${item.key}`;
}

function matchCatalogItem(item) {
  const cacheKey = `${item.source}|${item.key}`;
  if (state.matchCache.has(cacheKey)) return state.matchCache.get(cacheKey);

  const name = normalizeName(item.name);
  let matched = null;
  if (name) {
    for (const app of state.catalog.apps) {
      const target = normalizeName(app.name);
      if (!target) continue;
      if (name === target) {
        matched = app;
        break;
      }
      if (target.length > 3 && name.startsWith(target) && name.length - target.length <= 4) {
        matched = app;
        break;
      }
    }
  }
  state.matchCache.set(cacheKey, matched);
  return matched;
}

function formatSize(sizeKb) {
  const kb = Number(sizeKb);
  if (!kb || Number.isNaN(kb) || kb <= 0) return '—';
  const bytes = kb * 1024;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value) {
  const text = String(value || '');
  if (!/^\d{8}$/.test(text)) return '—';
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function updateInstalledPlaceholder(title, text) {
  $('#installedEmptyTitle').textContent = title;
  $('#installedEmptyText').textContent = text;
}

function filteredInstalled() {
  const q = state.installedQuery.trim().toLowerCase();
  const list = state.installedApps.filter((item) => {
    if (!q) return true;
    return [item.name, item.publisher, item.version].join(' ').toLowerCase().includes(q);
  });

  return [...list].sort((a, b) => {
    if (state.sortBy === 'size') return (Number(b.sizeKb) || 0) - (Number(a.sizeKb) || 0);
    if (state.sortBy === 'date') {
      return String(b.installDate || '').localeCompare(String(a.installDate || ''));
    }
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });
}

function installedIconHtml(item) {
  const dataUrl = state.rowIcons.get(rowKey(item));
  const matched = matchCatalogItem(item);
  const fallback = matched || {
    name: item.name,
    initial: String(item.name || '?').trim()[0],
    color: colorFor(item.name),
    icon: ''
  };
  const letter = escapeHtml(fallback.initial || String(fallback.name || '?')[0]);

  let image = '';
  if (dataUrl) {
    image = `<img class="app-icon-img" src="${dataUrl}" alt="" />`;
  } else if (matched && matched.icon) {
    image = `<img class="app-icon-img" src="../../data/${escapeHtml(matched.icon)}" alt="" />`;
  }

  return `<div class="app-icon row-icon" style="--c:${escapeHtml(fallback.color || '#5b6cff')}">
      <span class="app-icon-letter">${letter}</span>${image}
    </div>`;
}

function installedRowHtml(item) {
  const matched = matchCatalogItem(item);
  const meta = [item.publisher, item.version].filter(Boolean).join(' · ');
  const checked = state.selectedInstalled.has(rowKey(item));

  return `
    <div class="installed-row" data-source="${escapeHtml(item.source)}" data-key="${escapeHtml(item.key)}">
      <label class="row-check">
        <input type="checkbox" data-row-check="1" ${checked ? 'checked' : ''} />
      </label>
      ${installedIconHtml(item)}
      <div class="row-main">
        <div class="row-title">
          <span class="row-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          ${matched ? `<span class="row-badge">${t('installed.inCatalog')}</span>` : ''}
        </div>
        <div class="row-sub">${escapeHtml(meta || t('installed.unknownPublisher'))}</div>
      </div>
      <div class="row-size">${formatSize(item.sizeKb)}</div>
      <div class="row-date">${formatDate(item.installDate)}</div>
      <div class="row-actions">
        ${item.location ? `<button class="btn" data-row-action="reveal">${t('installed.reveal')}</button>` : ''}
        <button class="btn" data-row-action="force" title="${t('installed.force')}">⛔</button>
        <button class="btn danger" data-row-action="uninstall" ${
          item.uninstall ? '' : `disabled title="${t('uninstall.noCommand')}"`
        }>${t('installed.uninstall')}</button>
      </div>
    </div>`;
}

function renderInstalled() {
  if (state.view !== 'installed') {
    updateInstalledCount();
    return;
  }

  const list = filteredInstalled();
  const container = $('#installedList');

  if (state.installedLoading && !state.installedApps.length) {
    updateInstalledPlaceholder(t('installed.loading'), t('installed.loadingHint'));
  } else if (state.installedError) {
    updateInstalledPlaceholder(t('installed.error'), state.installedError);
  } else if (!list.length) {
    updateInstalledPlaceholder(
      state.installedQuery ? t('installed.searchEmpty') : t('installed.empty'),
      state.installedQuery ? t('installed.searchEmptyHint') : t('installed.emptyHint')
    );
  }

  container.innerHTML = list.map(installedRowHtml).join('');
  container.hidden = list.length === 0;
  $('#installedEmpty').hidden = list.length !== 0;
  $('#installedMeta').textContent = t('installed.count', { n: list.length });

  $('#statInstalled').textContent = state.installedApps.length || '—';
  const totalKb = state.installedApps.reduce((sum, item) => sum + (Number(item.sizeKb) || 0), 0);
  $('#statSize').textContent = state.installedApps.length ? formatSize(totalKb) : '—';
  $('#statMatched').textContent = state.installedApps.length
    ? state.installedApps.filter((item) => matchCatalogItem(item)).length
    : '—';

  updateInstalledCount();
  updateBatchButton();
  ensureRowIcons(list);
}

async function ensureRowIcons(list) {
  if (state.iconsLoading || !window.toolbox?.getInstalledIcons) return;

  const pending = list.filter((item) => {
    const key = rowKey(item);
    return !state.rowIcons.has(key) && !state.rowIconTried.has(key);
  });
  if (!pending.length) return;

  state.iconsLoading = true;
  try {
    let rest = pending;
    while (rest.length) {
      const batch = rest.slice(0, 24);
      const payload = batch.map((item) => ({
        id: rowKey(item),
        icon: item.icon,
        uninstall: item.uninstall,
        quietUninstall: item.quietUninstall,
        location: item.location,
        source: item.source,
        key: item.key,
        name: item.name
      }));

      const res = await window.toolbox.getInstalledIcons(payload);
      let changed = false;
      for (const [id, data] of Object.entries(res || {})) {
        if (data && !state.rowIcons.has(id)) {
          state.rowIcons.set(id, data);
          changed = true;
        }
      }
      for (const item of batch) state.rowIconTried.add(rowKey(item));
      rest = rest.slice(batch.length);

      if (changed && state.view === 'installed') renderInstalled();
    }
  } catch (_) {
    /* 图标提取失败时保留字母图标 */
  } finally {
    state.iconsLoading = false;
  }
}

function updateInstalledCount() {
  const el = $('#installedCount');
  if (state.installedLoading && !state.installedApps.length) {
    el.textContent = '…';
  } else {
    el.textContent = state.installedApps.length || '—';
  }
}

function syncInstalledToCatalog() {
  state.matchCache.clear();
  state.installed.clear();
  for (const item of state.installedApps) {
    const app = matchCatalogItem(item);
    if (app) state.installed.add(app.id);
  }

  // FileConverter 的注册表名称可能是 "File Converter" 或 "FileConverter"
  state.fileConverterInstalled = state.installedApps.some((item) =>
    /file\s*converter/i.test(item.name || '')
  );
  renderFileConverterStatus();

  if (state.view === 'catalog') render();
}

async function loadInstalled(force = false) {
  if (state.installedLoading) return;
  if (state.installedApps.length && !force) {
    renderInstalled();
    return;
  }

  state.installedLoading = true;
  state.installedError = '';
  updateInstalledCount();
  renderInstalled();

  try {
    const res = await window.toolbox?.getInstalled?.();
    if (!res || !res.ok) {
      state.installedError = res?.error || '无法读取已安装列表';
      state.installedApps = [];
    } else {
      state.installedApps = res.apps || [];
      syncInstalledToCatalog();
    }
  } catch (err) {
    state.installedError = String(err);
    state.installedApps = [];
  } finally {
    state.installedLoading = false;
    renderInstalled();
  }
}

function revealInstalled(item) {
  if (!window.toolbox?.reveal) return;
  window.toolbox.reveal(item.location).then((res) => {
    if (!res?.ok) toast(res?.error || t('toast.dirError'));
  });
}

function showConfirm({ title, text, detail, okText, danger, action }) {
  state.confirmAction = action;
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  const cmd = $('#confirmCmd');
  cmd.textContent = detail || '';
  cmd.hidden = !detail;
  const ok = $('#confirmOk');
  ok.textContent = okText;
  ok.className = danger ? 'btn danger' : 'btn primary';
  $('#confirmMask').hidden = false;
}

function askUninstall(item) {
  state.confirmTarget = item;
  showConfirm({
    title: `${t('installed.uninstall')} ${item.name}`,
    text: t('uninstall.confirmText', {
      publisher: item.publisher ? t('uninstall.publisher', { publisher: item.publisher }) : ''
    }),
    detail: item.uninstall || t('uninstall.noCommand'),
    okText: t('uninstall.confirmOk'),
    danger: true,
    action: 'uninstall'
  });
}

function askSilentInstall(app) {
  if (!app.winget) {
    toast(t('toast.silentWingetOnly'));
    return;
  }
  state.confirmTarget = app;
  showConfirm({
    title: t('detail.silentConfirmTitle', { name: app.name }),
    text: t('detail.silentConfirmText'),
    detail: `winget install --id ${app.winget} -e --silent --disable-interactivity`,
    okText: t('detail.silentConfirmOk'),
    danger: false,
    action: 'silent'
  });
}

function closeConfirm() {
  state.confirmTarget = null;
  state.confirmAction = '';
  $('#confirmMask').hidden = true;
}

function runSilentInstall() {
  const app = state.confirmTarget;
  closeConfirm();
  if (app) installApp(app, { silent: true });
}

async function runUninstall() {
  const item = state.confirmTarget;
  if (!item || !window.toolbox?.uninstall) return;

  const okBtn = $('#confirmOk');
  okBtn.disabled = true;
  try {
    const res = await window.toolbox.uninstall({ source: item.source, key: item.key });
    if (res?.ok) {
      const matched = matchCatalogItem(item);
      if (matched) {
        state.justInstalled.delete(matched.id);
        state.installed.delete(matched.id);
        if (state.view === 'catalog') render();
      }
      toast(t('toast.uninstallStarted', { name: item.name }), 4200);
      closeConfirm();
    } else {
      toast(t('toast.uninstallFailed', { error: res?.error || '' }), 4200);
    }
  } catch (err) {
    toast(t('toast.uninstallFailed', { error: err }), 4200);
  } finally {
    okBtn.disabled = false;
  }
}

function updateBatchButton() {
  const button = $('#uninstallSelected');
  if (!button) return;
  const count = state.selectedInstalled.size;
  button.disabled = count === 0;
  button.textContent = count
    ? t('installed.batchUninstallCount', { n: count })
    : t('installed.batchUninstall');
}

function askBatchUninstall() {
  const items = state.installedApps.filter(
    (item) => state.selectedInstalled.has(rowKey(item)) && item.uninstall
  );
  if (!items.length) {
    toast(t('installed.batchNone'));
    return;
  }
  state.confirmTarget = items;
  showConfirm({
    title: t('installed.batchUninstallCount', { n: items.length }),
    text: t('installed.batchUninstallText'),
    detail: items.map((item) => item.name).join('\n'),
    okText: t('uninstall.confirmOk'),
    danger: true,
    action: 'batchUninstall'
  });
}

async function runBatchUninstall() {
  const items = state.confirmTarget;
  closeConfirm();
  if (!Array.isArray(items) || !window.toolbox?.uninstall) return;
  let started = 0;
  for (const item of items) {
    try {
      const res = await window.toolbox.uninstall({ source: item.source, key: item.key });
      if (res?.ok) started += 1;
    } catch (_) {
      /* 单个失败不影响后续 */
    }
  }
  state.selectedInstalled.clear();
  renderInstalled();
  toast(t('installed.batchStarted', { n: started }), 5000);
}

function askForceRemove(item) {
  state.confirmTarget = item;
  const detail = [
    `${t('installed.forceRegistry')}: ${item.key}`,
    item.location ? `${t('installed.forceDir')}: ${item.location}` : t('installed.forceNoLocation')
  ].join('\n');
  showConfirm({
    title: t('installed.forceConfirmTitle', { name: item.name }),
    text: t('installed.forceConfirmText'),
    detail,
    okText: t('installed.force'),
    danger: true,
    action: 'force'
  });
}

async function runForceRemove() {
  const item = state.confirmTarget;
  closeConfirm();
  if (!item || !window.toolbox?.forceRemove) return;
  try {
    const res = await window.toolbox.forceRemove({
      source: item.source,
      key: item.key,
      location: item.location
    });
    if (res?.ok) {
      toast(t('toast.forceRemoved', { name: item.name }), 5000);
      state.selectedInstalled.delete(rowKey(item));
      loadInstalled(true);
      scanResidue(item);
    } else {
      toast(t('toast.forceFailed', { error: res?.error || '' }), 5000);
    }
  } catch (err) {
    toast(t('toast.forceFailed', { error: err }), 5000);
  }
}

async function scanResidue(item) {
  if (!window.toolbox?.scanResidue) return;
  try {
    const res = await window.toolbox.scanResidue({ name: item.name, location: item.location });
    const list = res?.residues || [];
    if (!list.length) return;
    state.residue = { item, list };
    showConfirm({
      title: t('residue.title', { name: item.name, n: list.length }),
      text: t('residue.text'),
      detail: list.map((entry) => entry.path).join('\n'),
      okText: t('residue.clean'),
      danger: true,
      action: 'residue'
    });
  } catch (_) {
    /* 扫描失败时静默忽略 */
  }
}

async function runCleanResidue() {
  const residue = state.residue;
  closeConfirm();
  if (!residue || !window.toolbox?.cleanResidue) return;
  state.residue = null;
  try {
    const res = await window.toolbox.cleanResidue(residue.list.map((entry) => entry.path));
    toast(t('toast.residueCleaned', { n: res?.removed?.length || 0 }), 5000);
  } catch (_) {
    toast(t('toast.residueCleaned', { n: 0 }), 4000);
  }
}

function setView(view) {
  state.view = view;
  const isCatalog = view === 'catalog';
  const isInstalled = view === 'installed';
  const isConvert = view === 'convert';
  const isSettings = view === 'settings';
  const isSubmit = view === 'submit';

  $('#catalogView').hidden = !isCatalog;
  $('#installedView').hidden = !isInstalled;
  $('#convertView').hidden = !isConvert;
  $('#settingsView').hidden = !isSettings;
  $('#submitView').hidden = !isSubmit;
  $('#installableOnly').hidden = !isCatalog;
  $('.topbar').hidden = isConvert || isSettings || isSubmit;
  $('#navInstalled').classList.toggle('active', isInstalled);
  $('#navConvert').classList.toggle('active', isConvert);
  $('#navSubmit').classList.toggle('active', isSubmit);
  $('#navSettings').classList.toggle('active', isSettings);
  $('#search').placeholder = isInstalled
    ? '搜索已安装程序、发布者'
    : '搜索应用、用途，例如：浏览器 / 压缩 / 网盘';

  renderNav();
  if (isInstalled) {
    renderInstalled();
    if (!state.installedApps.length && !state.installedLoading) loadInstalled();
  } else if (isConvert) {
    renderConvertView();
  } else if (isSettings) {
    renderSettingsUI();
  } else if (isSubmit) {
    renderSubmitView();
  } else {
    render();
  }
  $('.main').scrollTo({ top: 0 });
}

// ---------- 图标自动获取 ----------
async function autoFetchMissingIcons(showToast = false) {
  if (!window.toolbox?.autoFetchIcons) return 0;
  const missing = state.catalog.apps.filter((app) => !app.icon).slice(0, 15);
  if (!missing.length) {
    if (showToast) toast(t('toast.iconsNone'));
    return 0;
  }
  if (showToast) toast(t('toast.iconsFetching'), 5000);
  try {
    const res = await window.toolbox.autoFetchIcons(
      missing.map((app) => ({ id: app.id, homepage: app.homepage, name: app.name }))
    );
    const list = res?.results || [];
    for (const item of list) {
      const app = state.appsById.get(item.id);
      if (app) app.icon = item.dataUrl;
    }
    if (list.length) {
      render();
      if (state.view === 'installed') renderInstalled();
      if (showToast) toast(t('toast.iconsDone', { n: list.length }));
    } else if (showToast) {
      toast(t('toast.iconsNone'));
    }
    return list.length;
  } catch (_) {
    if (showToast) toast(t('toast.iconsNone'));
    return 0;
  }
}

// ---------- 投稿 ----------
const SUBMIT_INPUTS = [
  'submitName',
  'submitCategory',
  'submitHomepage',
  'submitWinget',
  'submitDownload',
  'submitTags',
  'submitDescription',
  'submitIntro',
  'submitIcon'
];

function readSubmitForm() {
  return {
    name: $('#submitName').value.trim(),
    category: $('#submitCategory').value,
    homepage: $('#submitHomepage').value.trim(),
    winget: $('#submitWinget').value.trim(),
    download: $('#submitDownload').value.trim(),
    tags: $('#submitTags').value.trim(),
    description: $('#submitDescription').value.trim(),
    intro: $('#submitIntro').value.trim(),
    icon: $('#submitIcon').value.trim()
  };
}

function saveSubmitDraft() {
  localStorage.setItem('apppantry-submit-draft', JSON.stringify(readSubmitForm()));
}

function loadSubmitDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem('apppantry-submit-draft') || '{}');
    $('#submitName').value = draft.name || '';
    if (draft.category && state.catalog.categories.some((cat) => cat.id === draft.category)) {
      $('#submitCategory').value = draft.category;
    }
    $('#submitHomepage').value = draft.homepage || '';
    $('#submitWinget').value = draft.winget || '';
    $('#submitDownload').value = draft.download || '';
    $('#submitTags').value = draft.tags || '';
    $('#submitDescription').value = draft.description || '';
    $('#submitIntro').value = draft.intro || '';
    $('#submitIcon').value = draft.icon || '';
  } catch (_) {
    /* 草稿损坏时忽略 */
  }
}

function renderSubmitView() {
  const select = $('#submitCategory');
  if (!select) return;
  select.innerHTML = state.catalog.categories
    .map(
      (cat) =>
        `<option value="${escapeHtml(cat.id)}">${escapeHtml(t(`category.${cat.id}`))}</option>`
    )
    .join('');
  loadSubmitDraft();
}

function buildSubmitPayload(form) {
  const slug =
    form.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `app-${Date.now()}`;
  const payload = {
    id: slug,
    name: form.name,
    category: form.category,
    description: form.description,
    homepage: form.homepage,
    winget: form.winget,
    tags: form.tags
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    publisher: '',
    intro: form.intro,
    highlights: []
  };
  if (form.download) payload.download = { url: form.download, filename: '' };
  if (form.icon) payload.icon = form.icon;
  return payload;
}

function validateSubmitForm() {
  const form = readSubmitForm();
  if (!form.name || !form.category || !form.homepage || !form.description) {
    toast(t('submit.required'));
    return null;
  }
  if (!/^https?:\/\//i.test(form.homepage)) {
    toast(t('submit.badUrl'));
    return null;
  }
  return form;
}

function showSubmitPreview(json) {
  const preview = $('#submitPreview');
  if (!preview) return;
  preview.hidden = false;
  preview.textContent = json;
}

function publishSubmit() {
  const form = validateSubmitForm();
  if (!form) return;
  const payload = buildSubmitPayload(form);
  const json = JSON.stringify(payload, null, 2);
  showSubmitPreview(json);

  const body = [
    '### 应用投稿 / App submission',
    '',
    '```json',
    json,
    '```',
    '',
    '---',
    '提交后由作者审核，通过后会合并到 `data/apps.json`。',
    'This submission is reviewed before being added to the catalog.'
  ].join('\n');
  const url = `https://github.com/mar08meow/AppPantry/issues/new?title=${encodeURIComponent(
    `[应用投稿] ${payload.name}`
  )}&body=${encodeURIComponent(body)}`;
  openLink(url);
  toast(t('submit.issueOpened'), 5200);
}

async function copySubmitJson() {
  const form = validateSubmitForm();
  if (!form) return;
  const json = JSON.stringify(buildSubmitPayload(form), null, 2);
  showSubmitPreview(json);
  try {
    await navigator.clipboard.writeText(json);
  } catch (_) {
    /* 剪贴板不可用时仍然显示预览 */
  }
  toast(t('submit.copied'));
}

function resetSubmitForm() {
  SUBMIT_INPUTS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.tagName !== 'SELECT') el.value = '';
  });
  localStorage.removeItem('apppantry-submit-draft');
  $('#submitPreview').hidden = true;
}

// ---------- 格式转换 ----------
function updateConvertTabs() {
  document.querySelectorAll('#convertTabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.convertTab);
  });
}

function renderFileConverterStatus() {
  const installBtn = $('#installFileConverter');
  const status = $('#fileConverterStatus');
  if (!installBtn || !status) return;
  installBtn.hidden = state.fileConverterInstalled;
  status.hidden = !state.fileConverterInstalled;
}

function renderConvertView() {
  updateConvertTabs();
  renderConvertFiles();
  renderConvertOptions();
  renderFileConverterStatus();
  $('#dropText').textContent =
    state.convertTab === 'merge'
      ? t('convert.drop.merge')
      : state.convertTab === 'split'
        ? t('convert.drop.split')
        : state.convertTab === 'img2pdf'
          ? t('convert.drop.img2pdf')
          : t('convert.drop.image');
}

function setConvertTab(tab) {
  state.convertTab = tab;
  state.convertFiles = [];
  state.convertOutputs = [];
  hideConvertResult();
  renderConvertView();
}

function renderConvertFiles() {
  const list = $('#convertFiles');
  list.innerHTML = state.convertFiles
    .map(
      (file, index) => `
      <li class="convert-file">
        <span class="name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
        <span class="size">${formatSize(file.size / 1024)}</span>
        <button data-index="${index}" title="移除">×</button>
      </li>`
    )
    .join('');
  list.hidden = state.convertFiles.length === 0;
}

function renderConvertOptions() {
  const box = $('#convertOptions');
  if (!box) return;
  const tab = state.convertTab;

  if (tab === 'image') {
    box.innerHTML = `
      <div class="option-group">
        <label>${t('convert.format')}</label>
        <select id="imageFormat">
          <option value="jpeg">JPG</option>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
        </select>
      </div>
      <div class="option-group">
        <label>${t('convert.quality')} <span id="qualityValue">90%</span></label>
        <input type="range" id="imageQuality" min="40" max="100" value="90">
      </div>
      <p class="option-hint">${t('convert.hint.image')}</p>`;
    $('#imageQuality').addEventListener('input', (event) => {
      $('#qualityValue').textContent = `${event.target.value}%`;
    });
  } else if (tab === 'img2pdf') {
    box.innerHTML = `<p class="option-hint">${t('convert.hint.img2pdf')}</p>`;
  } else if (tab === 'merge') {
    box.innerHTML = `<p class="option-hint">${t('convert.hint.merge')}</p>`;
  } else {
    box.innerHTML = `
      <div class="checkbox-group">
        <label><input type="radio" name="splitMode" value="each" checked> ${t('convert.split.each')}</label>
        <label><input type="radio" name="splitMode" value="range"> ${t('convert.split.range')}</label>
      </div>
      <div class="option-group" id="splitRangeGroup" hidden>
        <label>${t('convert.split.ranges')}</label>
        <input type="text" id="splitRanges" placeholder="${t('convert.split.placeholder')}">
      </div>`;
    document.querySelectorAll('input[name="splitMode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const rangeMode = document.querySelector('input[name="splitMode"][value="range"]').checked;
        $('#splitRangeGroup').hidden = !rangeMode;
      });
    });
  }
}

async function pickConvertFiles() {
  if (!window.toolbox?.convert) {
    showConvertResult('转换功能需要在桌面应用中运行', true);
    return;
  }
  const type = state.convertTab === 'merge' || state.convertTab === 'split' ? 'pdf' : 'image';
  const files = await window.toolbox.convert.pickFiles(type);
  if (!files || !files.length) return;

  state.convertFiles = state.convertTab === 'split' ? files.slice(0, 1) : files;
  renderConvertFiles();
  hideConvertResult();
}

function clearConvertFiles() {
  state.convertFiles = [];
  state.convertOutputs = [];
  renderConvertFiles();
  hideConvertResult();
}

function hideConvertResult() {
  const box = $('#convertResult');
  box.hidden = true;
  box.innerHTML = '';
}

function showConvertResult(message, isError, outputs = []) {
  const box = $('#convertResult');
  box.hidden = false;
  box.className = `convert-result${isError ? ' error' : ''}`;
  box.innerHTML = `
    <div>${escapeHtml(message)}</div>
    ${
      outputs.length
        ? `<div class="convert-result-actions"><button class="btn" id="revealOutput">${t('convert.reveal')}</button></div>`
        : ''
    }`;
  if (outputs.length) {
    $('#revealOutput').addEventListener('click', () => {
      window.toolbox.convert.reveal(outputs[0]);
    });
  }
}

function imageCanvas(bitmap) {
  const maxSide = 4000;
  let width = bitmap.width;
  let height = bitmap.height;
  if (width > maxSide || height > maxSide) {
    const scale = Math.min(maxSide / width, maxSide / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

async function convertImages() {
  const format = $('#imageFormat').value;
  const quality = Number($('#imageQuality').value) / 100;
  const mime = `image/${format}`;
  const ext = format === 'jpeg' ? 'jpg' : format;
  const outputs = [];

  for (const file of state.convertFiles) {
    const buffer = await window.toolbox.convert.read(file.path);
    if (!buffer) throw new Error(`无法读取 ${file.name}`);
    const bitmap = await createImageBitmap(new Blob([buffer]));
    const canvas = imageCanvas(bitmap);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!blob) throw new Error(`无法转换 ${file.name}`);

    const outPath = file.path.replace(/\.[^.\\/]+$/, '') + '.' + ext;
    const res = await window.toolbox.convert.write(outPath, await blob.arrayBuffer());
    if (!res.ok) throw new Error(res.error);
    outputs.push(outPath);
  }
  return outputs;
}

async function convertImagesToPdf() {
  const images = [];
  for (const file of state.convertFiles) {
    const buffer = await window.toolbox.convert.read(file.path);
    if (!buffer) throw new Error(`无法读取 ${file.name}`);
    const bitmap = await createImageBitmap(new Blob([buffer]));
    const canvas = imageCanvas(bitmap);
    bitmap.close?.();

    const isPng = /\.png$/i.test(file.path);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, isPng ? 'image/png' : 'image/jpeg', 0.92)
    );
    images.push({ buffer: await blob.arrayBuffer(), type: isPng ? 'png' : 'jpg' });
  }

  const dir = state.convertFiles[0].path.replace(/[\\/][^\\/]+$/, '');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outputPath = `${dir}\\图片合并-${stamp}.pdf`;
  const res = await window.toolbox.convert.imagesToPdf({ images, outputPath });
  if (!res.ok) throw new Error(res.error);
  return [outputPath];
}

async function convertMergePdfs() {
  if (state.convertFiles.length < 2) throw new Error('至少选择两个 PDF 文件');
  const dir = state.convertFiles[0].path.replace(/[\\/][^\\/]+$/, '');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outputPath = `${dir}\\PDF合并-${stamp}.pdf`;
  const res = await window.toolbox.convert.mergePdf({
    files: state.convertFiles.map((file) => file.path),
    outputPath
  });
  if (!res.ok) throw new Error(res.error);
  return [outputPath];
}

async function convertSplitPdf() {
  if (state.convertFiles.length !== 1) throw new Error('请选择一个 PDF 文件');
  const mode = document.querySelector('input[name="splitMode"]:checked')?.value || 'each';
  let ranges = [];

  if (mode === 'range') {
    const input = $('#splitRanges').value.trim();
    if (!input) throw new Error('请输入页码范围，例如 1-3,5');
    ranges = input.split(',').map((part) => {
      const [start, end] = part.trim().split('-').map((value) => Number(value.trim()));
      if (!Number.isFinite(start)) throw new Error(`页码范围格式不正确：${part}`);
      return [start, Number.isFinite(end) ? end : start];
    });
  }

  const dir = state.convertFiles[0].path.replace(/[\\/][^\\/]+$/, '');
  const res = await window.toolbox.convert.splitPdf({
    file: state.convertFiles[0].path,
    outputDir: dir,
    mode,
    ranges
  });
  if (!res.ok) throw new Error(res.error);
  return res.files;
}

async function startConvert() {
  if (state.convertBusy) return;
  if (!state.convertFiles.length) {
    showConvertResult(t('convert.needFiles'), true);
    return;
  }
  if (!window.toolbox?.convert) {
    showConvertResult(t('convert.needDesktop'), true);
    return;
  }

  state.convertBusy = true;
  const button = $('#startConvert');
  button.disabled = true;
  button.textContent = t('convert.working');
  hideConvertResult();

  try {
    let outputs = [];
    if (state.convertTab === 'image') outputs = await convertImages();
    else if (state.convertTab === 'img2pdf') outputs = await convertImagesToPdf();
    else if (state.convertTab === 'merge') outputs = await convertMergePdfs();
    else outputs = await convertSplitPdf();

    state.convertOutputs = outputs;
    showConvertResult(t('convert.done', { n: outputs.length }), false, outputs);
  } catch (err) {
    showConvertResult(t('convert.failed', { error: err.message || err }), true);
  } finally {
    state.convertBusy = false;
    button.disabled = false;
    button.textContent = t('convert.start');
  }
}

function bindEvents() {
  $('#grid').addEventListener('click', (event) => {
    const fav = event.target.closest('[data-fav]');
    if (fav) {
      event.stopPropagation();
      toggleFavorite(fav.dataset.fav);
      return;
    }
    const button = event.target.closest('button[data-action]');
    const card = event.target.closest('[data-app-id]');
    if (!card) return;
    const app = state.appsById.get(card.dataset.appId);
    if (!app) return;
    if (button) {
      handleAction(button.dataset.action, app);
      return;
    }
    openDetail(app);
  });

  $('#modal').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'close') {
      closeDetail();
      return;
    }
    if (state.modalApp) handleAction(button.dataset.action, state.modalApp);
  });

  $('#modalMask').addEventListener('click', (event) => {
    if (event.target === $('#modalMask')) closeDetail();
  });

  $('#categories').addEventListener('click', (event) => {
    const item = event.target.closest('.nav-item');
    if (!item) return;
    state.category = item.dataset.category;
    if (state.category === 'opensource') state.opensourceSub = 'all';
    if (state.view !== 'catalog') {
      setView('catalog');
    } else {
      render();
    }
    $('.main').scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#navInstalled').addEventListener('click', () => setView('installed'));
  $('#navConvert').addEventListener('click', () => setView('convert'));
  $('#navSubmit').addEventListener('click', () => setView('submit'));
  $('#navSettings').addEventListener('click', () => setView('settings'));

  $('#submitPublish').addEventListener('click', publishSubmit);
  $('#submitCopy').addEventListener('click', copySubmitJson);
  $('#submitReset').addEventListener('click', resetSubmitForm);
  $('#fetchIcons').addEventListener('click', () => autoFetchMissingIcons(true));
  SUBMIT_INPUTS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveSubmitDraft);
  });

  $('#languageOptions').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-lang]');
    if (!button) return;
    state.settings.language = button.dataset.lang;
    saveSettings();
    applySettings();
  });

  $('#themeOptions').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-theme]');
    if (!button) return;
    state.settings.theme = button.dataset.theme;
    saveSettings();
    applySettings();
  });

  $('#colorOptions').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-color]');
    if (!button) return;
    state.settings.accent = button.dataset.color;
    saveSettings();
    applySettings();
  });

  $('#pickDownloadDir').addEventListener('click', async () => {
    if (!window.toolbox?.pickDirectory) return;
    const dir = await window.toolbox.pickDirectory();
    if (dir) {
      state.settings.downloadDir = dir;
      saveSettings();
      renderSettingsUI();
    }
  });

  $('#mirrorOptions').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mirror]');
    if (!button) return;
    setWingetSource(button.dataset.mirror);
  });

  $('#pickInstallDir').addEventListener('click', async () => {
    if (!window.toolbox?.pickDirectory) return;
    const dir = await window.toolbox.pickDirectory();
    if (dir) {
      state.settings.installDir = dir;
      saveSettings();
      renderSettingsUI();
    }
  });

  $('#tagFilter').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag],[data-sub]');
    if (!chip) return;
    if (chip.dataset.sub !== undefined) {
      state.opensourceSub = chip.dataset.sub;
      render();
      return;
    }
    const tag = chip.dataset.tag;
    if (state.activeTags.has(tag)) state.activeTags.delete(tag);
    else state.activeTags.add(tag);
    render();
  });

  $('#convertTabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    setConvertTab(button.dataset.tab);
  });

  $('#pickConvertFiles').addEventListener('click', pickConvertFiles);
  $('#startConvert').addEventListener('click', startConvert);
  $('#clearConvert').addEventListener('click', clearConvertFiles);

  $('#convertFiles').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-index]');
    if (!button) return;
    state.convertFiles.splice(Number(button.dataset.index), 1);
    renderConvertFiles();
  });

  $('#installFileConverter').addEventListener('click', () => {
    const app = state.appsById.get('fileconverter');
    if (app) installApp(app);
  });

  $('#openFileConverter').addEventListener('click', () => {
    const app = state.appsById.get('fileconverter');
    if (app) openLink(app.homepage);
  });

  $('#installedList').addEventListener('click', (event) => {
    const check = event.target.closest('[data-row-check]');
    if (check) {
      const row = check.closest('[data-source]');
      if (row) {
        const key = `${row.dataset.source}|${row.dataset.key}`;
        if (check.checked) state.selectedInstalled.add(key);
        else state.selectedInstalled.delete(key);
        updateBatchButton();
      }
      return;
    }
    const button = event.target.closest('button[data-row-action]');
    if (!button) return;
    const row = button.closest('[data-source]');
    if (!row) return;
    const item = state.installedApps.find(
      (entry) => entry.source === row.dataset.source && entry.key === row.dataset.key
    );
    if (!item) return;
    if (button.dataset.rowAction === 'reveal') revealInstalled(item);
    else if (button.dataset.rowAction === 'uninstall') askUninstall(item);
    else if (button.dataset.rowAction === 'force') askForceRemove(item);
  });

  $('#sortGroup').addEventListener('click', (event) => {
    const button = event.target.closest('.sort-btn');
    if (!button) return;
    state.sortBy = button.dataset.sort;
    document
      .querySelectorAll('.sort-btn')
      .forEach((btn) => btn.classList.toggle('active', btn === button));
    renderInstalled();
  });

  $('#refreshInstalled').addEventListener('click', () => loadInstalled(true));

  $('#openUninstallTools').addEventListener('click', () => {
    const app = state.appsById.get('bcuninstaller') || state.appsById.get('geek-uninstaller');
    if (!app) return;
    setView('catalog');
    openDetail(app);
  });

  $('#selectAllInstalled').addEventListener('change', (event) => {
    const list = filteredInstalled();
    if (event.target.checked) list.forEach((item) => state.selectedInstalled.add(rowKey(item)));
    else state.selectedInstalled.clear();
    renderInstalled();
  });

  $('#uninstallSelected').addEventListener('click', askBatchUninstall);

  $('#confirmCancel').addEventListener('click', closeConfirm);
  $('#confirmMask').addEventListener('click', (event) => {
    if (event.target === $('#confirmMask')) closeConfirm();
  });
  $('#confirmOk').addEventListener('click', () => {
    if (state.confirmAction === 'uninstall') runUninstall();
    else if (state.confirmAction === 'silent') runSilentInstall();
    else if (state.confirmAction === 'force') runForceRemove();
    else if (state.confirmAction === 'residue') runCleanResidue();
    else if (state.confirmAction === 'batchUninstall') runBatchUninstall();
  });

  let searchTimer;
  $('#search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const value = event.target.value;
    searchTimer = setTimeout(() => {
      if (state.view === 'installed') {
        state.installedQuery = value;
        renderInstalled();
      } else {
        state.query = value;
        render();
      }
    }, 110);
  });

  $('#installableOnly').addEventListener('click', () => {
    state.installableOnly = !state.installableOnly;
    $('#installableOnly').classList.toggle('on', state.installableOnly);
    render();
  });

  $('#themeToggle').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    saveSettings();
    applySettings();
  });

  $('#logClose').addEventListener('click', () => {
    $('#logPanel').hidden = true;
    state.logId = null;
  });

  $('#logToggle').addEventListener('click', () => {
    setLogCollapsed(!$('#logPanel').classList.contains('collapsed'));
  });

  $('#logHead').addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    if ($('#logPanel').classList.contains('collapsed')) setLogCollapsed(false);
  });

  // 图标加载失败时移除图片，露出底层的字母色块
  document.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (img instanceof HTMLImageElement && img.classList.contains('app-icon-img')) {
        img.remove();
      }
    },
    true
  );

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('#search').focus();
    }
    if (event.key === 'Escape') {
      if (state.confirmTarget) {
        closeConfirm();
        return;
      }
      if (state.modalApp) {
        closeDetail();
        return;
      }
      if (document.activeElement === $('#search')) {
        $('#search').value = '';
        if (state.view === 'installed') {
          state.installedQuery = '';
          renderInstalled();
        } else {
          state.query = '';
          render();
        }
        $('#search').blur();
      }
      if (!$('#logPanel').hidden) {
        $('#logPanel').hidden = true;
        state.logId = null;
      }
    }
  });

  if (window.toolbox?.onDownloadProgress) {
    window.toolbox.onDownloadProgress(({ received, total }) => {
      if (!state.downloadActive) return;
      const pct = total > 0 ? Math.round((received / total) * 100) : 0;
      setLogStatus(total > 0 ? `${pct}%` : t('log.downloading'), '');
      $('#logBody').textContent =
        total > 0
          ? `${formatSize(received / 1024)} / ${formatSize(total / 1024)}`
          : formatSize(received / 1024);
    });
  }

  if (window.toolbox?.onInstallLog) {
    window.toolbox.onInstallLog(({ id, line }) => appendLog(id, line));
  }
}

async function checkWinget() {
  const dot = $('#wingetDot');
  const text = $('#wingetText');
  text.textContent = t('status.detecting');
  if (!window.toolbox?.wingetAvailable) {
    dot.classList.add('bad');
    text.textContent = t('status.preview');
    return;
  }
  const result = await window.toolbox.wingetAvailable();
  state.wingetOk = Boolean(result.available);
  dot.classList.add(state.wingetOk ? 'ok' : 'bad');
  text.textContent = state.wingetOk ? t('status.ready') : t('status.missing');
  if (!state.wingetOk) {
    text.title = result.reason || '';
  }
}

async function boot() {
  loadSettings();
  loadDownloaded();
  loadFavorites();
  loadRecent();
  applyTheme(state.settings.theme);
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  bindEvents();

  state.catalog = await loadCatalog();
  state.i18n = state.catalog.i18n || {};
  state.appsById = new Map(state.catalog.apps.map((app) => [app.id, app]));

  applyLanguage();
  // 后台补全缺失图标，不阻塞启动
  autoFetchMissingIcons(false);
  renderStats();
  render();
  checkWinget();
  loadWingetSource();
  loadInstalled();
}

boot();
