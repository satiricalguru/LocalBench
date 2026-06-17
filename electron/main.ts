import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDB } from './utils/db';
import { registerSystemIPCHandlers } from './ipc/system';
import { registerProvidersIPCHandlers } from './ipc/providers';
import { registerBenchmarkIPCHandlers } from './ipc/benchmark';
import { registerHistoryIPCHandlers } from './ipc/history';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const isDev = !app.isPackaged;
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 768,
    title: "LocalBench",
    icon: isDev
      ? path.join(__dirname, `../build/icon.${process.platform === 'darwin' ? 'icns' : process.platform === 'win32' ? 'ico' : 'png'}`)
      : (process.platform === 'linux' ? path.join(__dirname, '../dist/icon.png') : undefined),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    titleBarStyle: 'default',
    show: false
  });

  // Load the app
  if (isDev) {
    const devUrl = 'http://localhost:5173';
    mainWindow.loadURL(devUrl).catch(() => {
      console.log('Vite server not ready yet, retrying...');
    });

    // Retry loading if connection fails at startup due to Vite boot lag
    mainWindow.webContents.on('did-fail-load', () => {
      console.log('Renderer failed to load, retrying in 500ms...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(devUrl).catch(() => {});
        }
      }, 500);
    });

    // Open the DevTools
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Initialize Database
  initDB();

  // Register IPC Handlers
  registerSystemIPCHandlers();
  registerProvidersIPCHandlers();
  registerBenchmarkIPCHandlers();
  registerHistoryIPCHandlers();

  // Set Dock Icon on macOS (for development and runtimes)
  if (process.platform === 'darwin') {
    try {
      const isDev = !app.isPackaged;
      const iconPath = isDev
        ? path.join(__dirname, '../build/icon.png')
        : path.join(__dirname, '../dist/icon.png');
      if (fs.existsSync(iconPath)) {
        const image = nativeImage.createFromPath(iconPath);
        app.dock.setIcon(image);
      }
    } catch (e) {
      console.error('Failed to set dock icon:', e);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
