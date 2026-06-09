const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs').promises;

/* ─── module-level ref to the DL window ──────────────────────── */
let dlWindow = null;

/* ════════════════════════════════════════════════════════════════
   1.  OPEN / FOCUS THE DOWNLOAD MANAGER WINDOW
   ════════════════════════════════════════════════════════════════ */
function openDownloadManagerWindow() {
  // If already open, just focus it
  if (dlWindow && !dlWindow.isDestroyed()) {
    dlWindow.focus();
    return;
  }

  dlWindow = new BrowserWindow({
    width:           700,
    height:          560,
    minWidth:        560,
    minHeight:       420,
    resizable:       true,
    title:           'VidaGame — مدیریت دانلود',
    frame:           false,          // we use the custom title bar in HTML
    transparent:     false,
    backgroundColor: '#07080a',
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
  });

  dlWindow.loadFile(path.join(__dirname, 'downloadManager.html'));

  dlWindow.once('ready-to-show', () => dlWindow.show());

  dlWindow.on('closed', () => { dlWindow = null; });
}


module.exports = { openDownloadManagerWindow };

/* ════════════════════════════════════════════════════════════════
   2.  TITLE-BAR IPC (the custom controls in the HTML call these)
   ════════════════════════════════════════════════════════════════ */
ipcMain.on('window-close',    () => dlWindow?.close());
ipcMain.on('window-minimize', () => dlWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (!dlWindow) return;
  dlWindow.isMaximized() ? dlWindow.unmaximize() : dlWindow.maximize();
});

/* ════════════════════════════════════════════════════════════════
   3.  SEND QUEUED GAME LIST TO THE HTML PAGE
      The HTML sends 'request-download-manager-games' on load.
      We respond with the current download queue from the API.
   ════════════════════════════════════════════════════════════════ */
ipcMain.on('request-download-manager-games', async (event) => {
  if (!dlWindow || event.sender !== dlWindow.webContents) return;

  // Use the global queue manager if available
  if (global.queueManager) {
    global.queueManager.broadcastQueue();
    return;
  }

  // Fallback: read from file
  const queuePath = path.join(app.getPath('userData'), 'download-queue.json');
  try {
    const data = await fs.readFile(queuePath, 'utf-8');
    const queue = JSON.parse(data); // array of game objects
    event.reply('download-manager-games', { queue, current: queue.length > 0 ? queue[0] : null });
  } catch (err) {
    if (err.code === 'ENOENT') {
      event.reply('download-manager-games', { queue: [], current: null });
    } else {
      console.error('Failed to read queue file:', err);
      event.reply('download-manager-games', { queue: [], current: null });
    }
  }
});

ipcMain.on('pause-download', (event, { appid }) => {
  if (global.queueManager && global.queueManager.current?.appid === appid) {
    global.queueManager.pauseCurrent();
  }
});

ipcMain.on('resume-download', (event, { appid }) => {
  if (global.queueManager && global.queueManager.current?.appid === appid) {
    global.queueManager.resumeCurrent();
  }
});

ipcMain.on('stop-download', (event, { appid }) => {
  if (global.queueManager && global.queueManager.current?.appid === appid) {
    global.queueManager.stopCurrent();
  }
});

ipcMain.on('retry-download', (event, { appid }) => {
  if (global.queueManager) {
    global.queueManager.retryDownload(appid);
  }
});

ipcMain.on('delete-game', async (event, { appid }) => {
  if (global.queueManager) {
    await global.queueManager.removeFromQueue(appid);
  }
});

/* ════════════════════════════════════════════════════════════════
   4.  HELPER — broadcast an IPC event to BOTH the main window
       and the download manager window.
   ════════════════════════════════════════════════════════════════ */
function broadcastToAll(channel, payload) {
  // main / library window
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

module.exports.broadcastToAll = broadcastToAll;

