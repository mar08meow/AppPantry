const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolbox', {
  getCatalog: () => ipcRenderer.invoke('catalog:get'),
  wingetAvailable: () => ipcRenderer.invoke('winget:available'),
  install: (appEntry, options) => ipcRenderer.invoke('winget:install', appEntry, options || {}),
  isInstalled: (appEntry) => ipcRenderer.invoke('winget:installed', appEntry),
  getWingetSource: () => ipcRenderer.invoke('winget:source'),
  setWingetSource: (mirror) => ipcRenderer.invoke('winget:setSource', mirror),
  getInstalled: () => ipcRenderer.invoke('installed:list'),
  uninstall: (target) => ipcRenderer.invoke('installed:uninstall', target),
  reveal: (targetPath) => ipcRenderer.invoke('installed:reveal', targetPath),
  forceRemove: (target) => ipcRenderer.invoke('installed:forceRemove', target),
  scanResidue: (target) => ipcRenderer.invoke('installed:scanResidue', target),
  cleanResidue: (paths) => ipcRenderer.invoke('installed:cleanResidue', paths),
  getInstalledIcons: (items) => ipcRenderer.invoke('installed:icons', items),
  convert: {
    pickFiles: (type) => ipcRenderer.invoke('convert:pickFiles', type),
    read: (filePath) => ipcRenderer.invoke('convert:read', filePath),
    write: (filePath, data) => ipcRenderer.invoke('convert:write', filePath, data),
    imagesToPdf: (payload) => ipcRenderer.invoke('convert:imagesToPdf', payload),
    mergePdf: (payload) => ipcRenderer.invoke('convert:mergePdf', payload),
    splitPdf: (payload) => ipcRenderer.invoke('convert:splitPdf', payload),
    reveal: (filePath) => ipcRenderer.invoke('convert:reveal', filePath)
  },
  pickDirectory: () => ipcRenderer.invoke('settings:pickDirectory'),
  download: (payload) => ipcRenderer.invoke('download:start', payload),
  onDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  autoFetchIcons: (apps) => ipcRenderer.invoke('icons:autoFetch', apps),
  onInstallLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('install:log', listener);
    return () => ipcRenderer.removeListener('install:log', listener);
  }
});
