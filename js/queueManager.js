// queueManager.js
const fs = require('fs').promises;
const path = require('path');
const { app, BrowserWindow } = require('electron');

// Utility function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

class DownloadQueueManager {
  constructor() {
    this.queuePath = path.join(app.getPath('userData'), 'download-queue.json');
    this.queue = [];            // items: { appid, name, image, downloadurl, manifesturl, ... }
    this.current = null;        // currently downloading item
    this.currentDownloader = null; // reference to the active DownloaderHelper instance
    this.isProcessing = false;
    this.paused = false;
    this.loadQueue();
  }

  async loadQueue() {
    try {
      const data = await fs.readFile(this.queuePath, 'utf-8');
      this.queue = JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') this.queue = [];
      else console.error('Failed to load queue:', err);
    }
  }

  async saveQueue() {
    await fs.writeFile(this.queuePath, JSON.stringify(this.queue, null, 2));
    this.broadcastQueue(); // update all windows
  }

  // Add a new game to the end of the queue and start processing if idle
  async addToQueue(gameData) {
    // avoid duplicate appid
    if (this.queue.some(item => item.appid === gameData.appid)) return;
    this.queue.push(gameData);
    await this.saveQueue();
    if (!this.isProcessing && !this.paused) this.processQueue();
  }

  // Remove a game from queue (by appid) – also stops it if it's the current download
  async removeFromQueue(appid) {
    const index = this.queue.findIndex(item => item.appid === appid);
    if (index === -1) return;
    if (this.current && this.current.appid === appid) {
      if (this.currentDownloader) this.currentDownloader.stop();
      this.current = null;
      this.currentDownloader = null;
    }
    this.queue.splice(index, 1);
    await this.saveQueue();
  }

  // Called when user clicks "Pause" in the download manager UI
  pauseCurrent() {
    if (this.currentDownloader && this.current) {
      this.currentDownloader.pause();
      this.paused = true;
    }
  }

  // Called when user clicks "Resume"
  resumeCurrent() {
    if (this.currentDownloader && this.current) {
      this.currentDownloader.resume();
      this.paused = false;
      if (!this.isProcessing) this.processQueue();
    }
  }

  // Called when user clicks "Stop" (cancel + delete)
  async stopCurrent() {
    if (this.currentDownloader && this.current) {
      this.currentDownloader.stop();
      this.currentDownloader = null;
    }
    if (this.current) {
      await this.removeFromQueue(this.current.appid);
      this.current = null;
      this.paused = false;
    }
    // Always reset isProcessing — the downloadItem promise was killed externally
    // so the processQueue loop will never reach its own cleanup.
    this.isProcessing = false;
    this.broadcastQueue();
    // Continue with next item in queue if any
    if (this.queue.length > 0) this.processQueue();
  }

  // The heart of the queue – downloads one item at a time
  async processQueue() {
    if (this.isProcessing || this.paused || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && !this.paused) {
      this.current = this.queue[0];

      // Skip items that are already in error state (waiting for user retry)
      if (this.current._error) {
        break;
      }

      this.broadcastQueue();           // update UI with new current item
      const success = await this.downloadItem(this.current);

      if (!success) {
        // Item now has _error set — stop processing, leave it in queue for retry
        this.isProcessing = false;
        this.current = null;
        this.broadcastQueue();
        return;
      }

      // Success — remove completed item and move to next
      this.queue.shift();
      await this.saveQueue();
      this.current = null;
    }

    this.isProcessing = false;
    this.current = null;
    this.broadcastQueue();
  }

  // Re-queue an errored item for retry OR manually start a queued item
  async retryDownload(appid) {
    const item = this.queue.find(i => i.appid === appid);
    if (!item) return;

    delete item._error;           // clear error flag if any
    this.currentDownloader = null;
    // Always reset isProcessing — covers the case where stopCurrent() was called
    // (killing the loop externally) or the app was force-closed mid-download.
    this.isProcessing = false;
    await this.saveQueue();
    this.processQueue();
  }

  // Wrapper around your existing download logic
async downloadItem(gameData) {
  // Dynamically require to avoid circular dependency
  const { startGameDownload } = require('./downloadsystem');

  return new Promise((resolve) => {
    startGameDownload({
      gameData,
      onProgress: (prog) => this.broadcast('update-progress', prog),
      onComplete: () => {
        // Clear error state on success
        const item = this.queue.find(i => i.appid === gameData.appid);
        if (item) delete item._error;
        this.broadcast('download-complete', { appid: gameData.appid });
        resolve(true);
      },
      onError: (err) => {
        console.error(`Download error for ${gameData.appid}:`, err);

        // Mark the item in-place as errored — do NOT remove it from the queue
        const item = this.queue.find(i => i.appid === gameData.appid);
        if (item) item._error = err.message || 'خطای ناشناخته';

        // Persist the error state and broadcast so the UI can show a Retry button
        this.saveQueue().catch(console.error);
        this.broadcast('download-error', { appid: gameData.appid, error: err.message || 'خطای ناشناخته' });
        resolve(false);  // mark as failed but keep item in queue
      },
      onInstallStart: () => this.broadcast('installing-game', { appid: gameData.appid }),
      getDownloader: (dl) => { this.currentDownloader = dl; }
    });
  });
}

  // Broadcast an event to ALL windows (main React window + download manager window)
  broadcast(channel, data) {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send(channel, data);
    });
  }

  // Send the full queue list to the download manager window (for display)
  broadcastQueue() {
    this.broadcast('download-manager-games', {
      queue: this.queue,
      current: this.current
    });
  }
}

module.exports = DownloadQueueManager;