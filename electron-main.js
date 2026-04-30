const path = require('path');
const { app, BrowserWindow, Menu, shell } = require('electron');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let isExiting = false;

function forceExit() {
  if (isExiting) return;
  isExiting = true;

  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });

  setImmediate(() => app.exit(0));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: '#FDFBF7',
    title: 'Xiangyue ERP',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const targetUrl = new URL(url);
    const allowedPath = '/index.html';

    if (targetUrl.protocol === 'file:' && targetUrl.pathname.endsWith(allowedPath)) {
      return;
    }

    if (targetUrl.protocol === 'file:') {
      return;
    }

    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', () => {
    if (process.platform !== 'darwin') {
      setTimeout(forceExit, 100);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (process.platform !== 'darwin') {
      forceExit();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    forceExit();
  }
});

app.on('before-quit', () => {
  isExiting = true;
});

app.on('will-quit', () => {
  isExiting = true;
});
