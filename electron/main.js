const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let nextServer;

const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Real-time STT Evaluation',
  });

  const url = `http://localhost:${PORT}`;
  
  mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const nextPath = path.join(__dirname, '..', 'node_modules', '.bin', 'next');
    const projectPath = path.join(__dirname, '..');
    
    if (isDev) {
      nextServer = spawn(nextPath, ['dev', '-p', PORT.toString()], {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, PORT: PORT.toString() },
      });
    } else {
      nextServer = spawn(nextPath, ['start', '-p', PORT.toString()], {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, PORT: PORT.toString() },
      });
    }

    nextServer.stdout.on('data', (data) => {
      console.log(`Next.js: ${data}`);
      if (data.toString().includes('Ready') || data.toString().includes('started')) {
        resolve();
      }
    });

    nextServer.stderr.on('data', (data) => {
      console.error(`Next.js Error: ${data}`);
    });

    nextServer.on('error', (error) => {
      console.error('Failed to start Next.js server:', error);
      reject(error);
    });

    setTimeout(() => {
      resolve();
    }, 5000);
  });
}

app.whenReady().then(async () => {
  try {
    if (!isDev) {
      await startNextServer();
    }
    createWindow();
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (nextServer) {
    nextServer.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill();
  }
});
