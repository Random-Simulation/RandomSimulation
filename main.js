// main.js
// Electron main process for the "Simulate Anything" app.
// Responsibilities:
//   • Ensure Ollama server is running (spawn if needed)
//   • Create the BrowserWindow and wire up dev/reload hotkeys
//   • Cleanly stop Ollama on exit (Windows and *nix)
//   • Keep renderer console visible in the terminal for debugging

'use strict';

const { app, BrowserWindow, globalShortcut, Menu } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow;
let ollamaProc;

/*───────────────────────────────────────────────────────────────────────────*\
 | 1) Utilities                                                              |
\*───────────────────────────────────────────────────────────────────────────*/

// Simple async delay (not currently used but kept for future use)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Check if Ollama is already serving locally
function ollamaIsRunning() {
  return new Promise((resolve) => {
    const req = http.get(
      'http://localhost:11434/.well-known/ready',
      { timeout: 800 },
      (res) => {
        res.destroy();
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/*───────────────────────────────────────────────────────────────────────────*\
 | 2) Ollama lifecycle                                                       |
\*───────────────────────────────────────────────────────────────────────────*/

// Start `ollama serve` in the background if it isn't already running
async function startOllamaServe() {
  if (await ollamaIsRunning()) {
    console.log('✔ Ollama already running – spawn skipped');
    return;
  }

  const opts = { detached: true, stdio: 'ignore', windowsHide: true };
  ollamaProc = spawn('ollama', ['serve'], opts);
  ollamaProc.unref();
  console.log(`▶ Ollama spawned (PID ${ollamaProc.pid})`);
}

// Attempt to terminate all Ollama processes (spawned child and any stragglers)
function stopAllOllama() {
  // Stop the specific spawned process if we have a handle
  if (ollamaProc) {
    try {
      if (process.platform === 'win32') {
        // Kill PID and its tree on Windows
        spawnSync('taskkill', ['/pid', String(ollamaProc.pid), '/T', '/F']);
      } else {
        // Kill the detached process group on *nix
        process.kill(-ollamaProc.pid, 'SIGTERM');
      }
    } catch {
      // Swallow errors to avoid blocking app shutdown
    }
  }

  // As a fallback, attempt to kill any lingering Ollama serve processes
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/im', 'ollama.exe', '/T', '/F']);
    } else {
      spawnSync('pkill', ['-f', '^ollama serve']);
    }
  } catch {
    // Ignore; nothing else to do here
  }
}

/*───────────────────────────────────────────────────────────────────────────*\
 | 3) Electron window setup                                                  |
\*───────────────────────────────────────────────────────────────────────────*/

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      devTools: true, // DevTools allowed; toggled via hotkeys
    },
  });

  // Mirror renderer console to the terminal for easier debugging
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const idx = Math.min(level, 3);
    const lvl = ['debug', 'info', 'warn', 'error'][idx] || 'log';
    console.log(`[renderer ${lvl}] ${message} (${sourceId}:${line})`);
  });

  // Local hotkeys (while the window is focused)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isCtrl = input.control || input.meta;

    // Toggle DevTools: F12 or Ctrl/Cmd+Shift+I
    if (input.key === 'F12' || (isCtrl && input.shift && input.key.toUpperCase() === 'I')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }

    // Reload: F5 or Ctrl/Cmd+R
    if (input.key === 'F5' || (isCtrl && input.key.toUpperCase() === 'R')) {
      mainWindow.reload();
      event.preventDefault();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

/*───────────────────────────────────────────────────────────────────────────*\
 | 4) App lifecycle                                                          |
\*───────────────────────────────────────────────────────────────────────────*/

app.whenReady().then(async () => {
  // Minimal UI chrome
  Menu.setApplicationMenu(null);

  // Global hotkeys (work even when window isn't focused)
  globalShortcut.register('F12', () => mainWindow?.webContents.toggleDevTools());
  globalShortcut.register('CommandOrControl+Shift+I', () => mainWindow?.webContents.toggleDevTools());
  globalShortcut.register('F5', () => mainWindow?.reload());
  globalShortcut.register('CommandOrControl+R', () => mainWindow?.reload());

  await startOllamaServe();

  // Do not warm models here; the renderer owns warming with final parameters.
  createWindow();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  stopAllOllama();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
