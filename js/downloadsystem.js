// downloadsystem.js

const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const { DownloaderHelper } = require('node-downloader-helper');
const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra')
const axios = require('axios');
const _7z = require('7zip-min-electron');
const DownloadQueueManager = require('./queueManager');

let queueManager;
app.whenReady().then(() => {
  queueManager = new DownloadQueueManager();
  global.queueManager = queueManager; // so other modules can access it
  // Start processing any pending queue on startup
  queueManager.processQueue();
});


let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,

    },
  });

  mainWindow.loadURL('https://vidagame.ir/library'); // React app runs on this URL

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

//app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

require('dotenv').config();

const LOG_URL = process.env.LOG_URL;

async function sendErrorToLog(InfoLog, error) {
  const time = new Date().toISOString();

  try {
    await axios.post(LOG_URL  || 'https://api.vidagame.ir/send-log', {
      level: 'error',
      source: 'launcher-error',
      message: error.message || 'Unknown error',
      extra: {
        ...InfoLog,
        timestamp: time,
        stack: error.stack,
        errorName: error.name
      }
    });
    console.log('Error logged send successfully');
  } catch (logError) {
    console.error('Failed to send error log:', logError);
  }
}

async function sendCommonsToLog(InfoLog, Commons) {
  const time = new Date().toISOString();

  try {
    await axios.post(LOG_URL  || 'https://api.vidagame.ir/send-log', {
      level: 'Commons',
      source: 'launcher-Commons',
      message: Commons || 'Unknown Commons',
      extra: {
        ...InfoLog,
        timestamp: time
      }
    });
    console.log('Commons logged send successfully');
  } catch (logError) {
    console.error('Failed to send error Commons:', logError);
  }
}




async function startGameDownload({ gameData, onProgress, onComplete, onError, onInstallStart, getDownloader }) {
  const { appid, downloadurl, manifesturl, vida_id, downloadType = 'compress', updateFiles } = gameData;
  console.log(`[startGameDownload] Starting ${appid} — type: ${downloadType}`);

  const startLog = { appid, downloadType, downloadurl, manifesturl, vida_id, updateFiles };
  sendCommonsToLog(startLog, `Download started: ${downloadType} for app ${appid}`);

  const userDataPath = app.getPath('userData');
  const gamesPathFilePath = path.join(userDataPath, 'games-path.json');

  try {
    // 1. Fetch manifest with retry
    let manifest;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const manifestRes = await axios.get(manifesturl, { timeout: 30000 });
        manifest = manifestRes.data;
        sendCommonsToLog({ appid, vida_id, manifesturl, attempt: attempt + 1 }, `Manifest fetched successfully for ${appid}`);
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise(resolve => setTimeout(resolve, 2000));
        sendCommonsToLog({ appid, vida_id, manifesturl, attempt: attempt + 1, error: err.message }, `Manifest fetch retry ${attempt + 1} for ${appid}`);
      }
    }

    // 2. Save manifest locally (compress only — first install)
    if (downloadType === 'compress') {
      const dgamesFolder = path.join(userDataPath, 'dgames');
      await fs.mkdir(dgamesFolder, { recursive: true });
      const manifestSavePath = path.join(dgamesFolder, `manifest_${appid}.json`);
      const manifestToSave = { ...manifest, updates: [] };
      await fs.writeFile(manifestSavePath, JSON.stringify(manifestToSave, null, 2));
      sendCommonsToLog({ appid, vida_id, manifestSavePath }, `Manifest saved locally for ${appid}`);
    }

    // 3. Pick the files list based on downloadType
    let filesToDownload;
    if (downloadType === 'crack') {
      filesToDownload = manifest.crack;
      if (!filesToDownload || filesToDownload.length === 0)
        throw new Error('No crack files found in manifest');
        sendCommonsToLog({ appid, vida_id, crackFilesCount: filesToDownload.length }, `Crack files identified for ${appid}`);
    } else if (downloadType === 'update') {
      // updateFiles may be a specific subset; otherwise download all updates
      if (updateFiles && updateFiles.length > 0) {
        filesToDownload = manifest.updates.filter(f => updateFiles.includes(f.name));
      } else {
        filesToDownload = manifest.updates;
      }
      if (!filesToDownload || filesToDownload.length === 0)
        throw new Error('No update files found in manifest');
        sendCommonsToLog({ appid, vida_id, updateFilesCount: filesToDownload.length, specificUpdates: updateFiles }, `Update files identified for ${appid}`);
    } else {
      filesToDownload = manifest.compress;
      if (!filesToDownload || filesToDownload.length === 0)
        throw new Error('No compress files found in manifest');
        sendCommonsToLog({ appid, vida_id, compressFilesCount: filesToDownload.length }, `Compress files identified for ${appid}`);
    }

    // 4. Get destination folder
    const gamesPathContent = await fs.readFile(gamesPathFilePath, 'utf-8');
    const gamesPathConfig = JSON.parse(gamesPathContent);
    const destinationFolder = gamesPathConfig[appid]?.downloadPath;
    if (!destinationFolder) throw new Error('Download destination not found');
    sendCommonsToLog({ appid, vida_id, destinationFolder }, `Destination folder located for ${appid}`);

    // 5. Create required sub-folders (compress only)
    if (downloadType === 'compress' && manifest.folders) {
      for (const folder of manifest.folders) {
        await fs.mkdir(path.join(destinationFolder, folder), { recursive: true });
      }
      sendCommonsToLog({ appid, vida_id, folders: manifest.folders }, `Sub-folders created for ${appid}`);
    }

    // 6. Download
    const fileProgress = {};
    const totalSize = filesToDownload.reduce((acc, f) => acc + (f.size || 0), 0);
    let completedFiles = 0;
    let hasErrors = false;

    sendCommonsToLog({ appid, vida_id, totalSize, filesCount: filesToDownload.length }, `Starting download of ${filesToDownload.length} files for ${appid}`);

    for (const file of filesToDownload) {
      const fileUrl = `${downloadurl}/${file.name}`;
      const downloader = new DownloaderHelper(fileUrl, destinationFolder, {
        fileName: file.name,
        forceResume: true,
        resumeIfFileExists: true,
        removeOnFail: false,
        override: false,
        retry: { maxRetries: 5, delay: 5000 },
        timeout: 120000,
      });

      if (getDownloader) getDownloader(downloader);

      downloader.on('progress', (stats) => {
        fileProgress[file.name] = { downloaded: stats.downloaded, total: stats.total };
        const overallDownloaded = Object.values(fileProgress).reduce((a, b) => a + b.downloaded, 0);
        const progress = Math.floor((overallDownloaded / totalSize) * 100);
        const speed = stats.speed;
        const remaining = totalSize - overallDownloaded;
        const etaSec = speed > 0 ? Math.ceil(remaining / speed) : 0;
        const hours = Math.floor(etaSec / 3600);
        const minutes = Math.floor((etaSec % 3600) / 60);
        const seconds = etaSec % 60;
        onProgress({
          appid,
          progress,
          speed: formatBytes(speed),
          downloaded: formatBytes(overallDownloaded),
          totalSize: formatBytes(totalSize),
          estimatedTimeLeft: `${hours}h ${minutes}m ${seconds}s`,
          fileName: file.name,
          downloadType,
        });
      });

      downloader.on('error', (err) => {
        hasErrors = true;
        sendCommonsToLog({ appid, vida_id, fileName: file.name, error: err.message, downloadType }, `Download error for file ${file.name} of ${appid}`);
        onError(err);
      });

      downloader.on('end', async () => {
        if (hasErrors) return;
        console.log(`Downloaded ${file.name} for ${appid} [${downloadType}]`);
        sendCommonsToLog({ appid, vida_id, fileName: file.name, downloadType }, `File ${file.name} downloaded successfully for ${appid}`);
        completedFiles++;

        if (completedFiles === filesToDownload.length) {
          sendCommonsToLog({ appid, vida_id, downloadType }, `All files downloaded for ${appid}, starting extraction`);
          onInstallStart({ appid, downloadType });
          try {
            // Extract all downloaded files
            for (const f of filesToDownload) {
              const zipPath = path.join(destinationFolder, f.name);
              if (await fs.access(zipPath).then(() => true).catch(() => false)) {
                await new Promise((resolve, reject) => {
                  _7z.unpack(zipPath, destinationFolder, (err) => {
                    if (err) { reject(err); return; }
                    fs.unlink(zipPath).catch(console.error);
                    resolve();
                  });
                });
                sendCommonsToLog({ appid, vida_id, fileName: f.name }, `Extracted ${f.name} for ${appid}`);
              }
            }

            // Update local state after extraction
            if (downloadType === 'update') {
              // Stamp the installed update versions into the local manifest
              const localManifestPath = path.join(userDataPath, 'dgames', `manifest_${appid}.json`);
              try {
                const raw = await fs.readFile(localManifestPath, 'utf-8');
                const localManifest = JSON.parse(raw);
                if (!localManifest.updates) localManifest.updates = [];
                for (const f of filesToDownload) {
                  const serverFile = manifest.updates.find(u => u.name === f.name);
                  if (serverFile) {
                    const idx = localManifest.updates.findIndex(u => u.name === f.name);
                    if (idx >= 0) localManifest.updates[idx] = serverFile;
                    else localManifest.updates.push(serverFile);
                  }
                }
                await fs.writeFile(localManifestPath, JSON.stringify(localManifest, null, 2));
                sendCommonsToLog({ appid, vida_id }, `Local manifest updated after update installation for ${appid}`);
              } catch (e) {
                console.error('Could not update local manifest after update install:', e);
                sendCommonsToLog({ appid, vida_id, error: e.message }, `Failed to update local manifest after update for ${appid}`);
              }
            }

            savePathToJson(destinationFolder, appid, true, true);
            broadcastToAll('game-installed', { appid, downloadType });
            sendCommonsToLog({ appid, vida_id, downloadType, destinationFolder }, `Game installation completed for ${appid} (${downloadType})`);
            onComplete();
          } catch (err) {
            onError(err);
            sendCommonsToLog({ appid, downloadType, vida_id, error: err.message }, `Extraction failed for ${appid} (${downloadType})`);
          }
        }
      });

      await downloader.start();
    }
  } catch (err) {
    console.error(`Download failed for ${appid} [${downloadType}]:`, err);
    sendCommonsToLog({ appid, vida_id, downloadType, error: err.message, stack: err.stack }, `Fatal error in download process for ${appid} (${downloadType})`);
    onError(err);
  }
}

// Export the function so it can be used by queueManager
module.exports = { startGameDownload };


let downloadPath = ''; // Declare downloadPath globally
let dl;
let currentDownloads = {};
let downloadIdCounter = 0;


// .....
// .....
ipcMain.on('download-file', (event, args) => {
  const focusedWindow = BrowserWindow.getFocusedWindow();

  const getPathWindow = new BrowserWindow({
    width: 600,
    height: 400,
    minWidth: 600,
    minHeight: 400,
    title: 'Choose Download Path',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  getPathWindow.once('ready-to-show', () => {
    getPathWindow.show();
  });

  getPathWindow.loadFile('./js/chooseDownloadPath.html');

  ipcMain.once('download-path-selected', async (event, selectedPath) => {
    getPathWindow.close();

    if (selectedPath) {
      const { url, manifesturl, properties, appid, name, image, token, vida_id } = args;

      //console.log('Received Token:', token, vida_id);

      const downloadId = downloadIdCounter++;

      currentDownloads[downloadId] = { appid, name, image };

      const downloadPath = path.join(selectedPath, name);

      await fs.mkdir(downloadPath, { recursive: true });

      savePathToJson(downloadPath, appid, false);

      // No longer calling addappid API - removed as requested

      // Prepare game data for queue
      const gameQueueItem = {
        appid,
        name,
        image,
        token,
        vida_id,
        downloadurl: url,
        manifesturl: manifesturl, // adjust as needed
        updating: 0,
        is_Crack: 0,
      };

      await queueManager.addToQueue(gameQueueItem);

      const mainWin = BrowserWindow.getFocusedWindow();
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('download-queued', { appid, name });
        }

       openDownloadManagerWindow();
       
      
      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        currentWindow.reload();
      }

    new Notification({
      title: 'دانلود منیجر ویدا گیم',
      body: 'برای مشاهده به بخش دانلود بروید'
    }).show()


    }
  });
});

// At the top
const { openDownloadManagerWindow, broadcastToAll } = require('./downloadManagerWindow');

// After app is ready, register the IPC handler
ipcMain.on('open-download-manager', () => {
  openDownloadManagerWindow();
});

//--------- Update game system

ipcMain.on('update-file', async (event, args) => {

  const { appid, token, vida_id, manifesturl, downloadurl, updateFiles, image, name } = args;

  console.log('Received vidaid:', vida_id);
  console.log('Received appid:', appid);

  // Queue the update download through the download manager
  const gameQueueItem = {
    appid,
    name: args.name || `Update - ${appid} - ${name}`,
    image: image || '',
    token,
    vida_id,
    downloadurl,
    manifesturl,
    downloadType: 'update',           // ← tells startGameDownload to use manifest.updates[]
    updateFiles: updateFiles || [],   // optional: specific update file names to download
  };

  await queueManager.addToQueue(gameQueueItem);
  openDownloadManagerWindow();

  const currentWindow = BrowserWindow.getFocusedWindow();
  if (currentWindow) {
    currentWindow.webContents.send('download-queued', { appid });
  }
});

//---------

// -------- Install Crack System:
ipcMain.on('install-crack-file', async (event, args) => {

  const { appid, vida_id, downloadPath, manifesturl, downloadurl, image, name } = args;

  console.log('Received vida id:', vida_id);
  console.log('Received appid:', appid);

  // Queue the crack download through the download manager
  const gameQueueItem = {
    appid,
    name: args.name || `Crack - ${appid} - ${name}`,
    image: image || '',
    vida_id,
    downloadurl,
    manifesturl,
    downloadType: 'crack',   // ← tells startGameDownload to use manifest.crack[]
  };

  await queueManager.addToQueue(gameQueueItem);
  openDownloadManagerWindow();

  const currentWindow = BrowserWindow.getFocusedWindow();
  if (currentWindow) {
    currentWindow.webContents.send('download-queued', { appid });
  }
});
//---------

//--------- Repair System:

ipcMain.on('repair-game', async (event, args) => {

  const { appid, vida_id, downloadPath, startupFile } = args;
  const filePath = path.join(downloadPath, startupFile);
  // Read the games-path.json file
  const gamesPathFileContent = await fs.readFile(gamesPathFilePath, 'utf-8');
  const gamesPathConfig = JSON.parse(gamesPathFileContent);
  // Get the destinationFolder from the config based on the appid
  const destinationFolder = gamesPathConfig[appid]?.downloadPath;

  console.log('destinationFolder:', destinationFolder);

  console.log('Open file:', filePath);
  console.log('Received vida id:', vida_id);
  console.log('Received appid:', appid);

  // This codes is temporary for switch all users to new manifest structures:
  const dgamesFolderPath = path.join(userDataPath, 'dgames');
  const manifestSavePath = path.join(dgamesFolderPath, `manifest_${appid}.json`);
  try {
    // Read the local manifest file
    const localManifestContent = await fs.readFile(manifestSavePath, 'utf-8');
    const localManifest = JSON.parse(localManifestContent);
  
    // Delete the folders and files arrays
    delete localManifest.folders; // Remove the folders property
    delete localManifest.files;   // Remove the files property
  
    // Ensure updates array exists in the local manifest
    localManifest.updates = localManifest.updates || []; // Retain existing updates
  
    // Write the updated manifest back to the file
    await fs.writeFile(manifestSavePath, JSON.stringify(localManifest, null, 2), 'utf-8');
    console.log(`Manifest file saved for AppId ${appid} at: ${manifestSavePath}`);
  
  } catch (error) {
    console.error('Error processing the local manifest:', error);
  }
//------------------


  savePathToJson(downloadPath, appid, true, true);

  // No longer calling removedownloads API - removed as requested

  try {
  // Read the contents of the destination folder
  const files = await fs.readdir(destinationFolder);
  
  // Filter out only the 7zip files
  const zipFiles = files.filter(file => path.extname(file) === '.7z');

  // If there are no 7zip files, return
  if (zipFiles.length === 0) {
      console.log('No 7zip files found in destination folder.');
      event.reply('repair-complete',  {id: appid});
      return;
  }

  // Iterate through each 7zip file and extract it
  for (const zipFile of zipFiles) {
      const zipFilePath = path.join(destinationFolder, zipFile);
      const extractPath = destinationFolder;

      event.sender.send('show-notification', {
        title: 'تعمیر',
        message: 'در حال تعمیر فایل های بازی، لطفا صبور باشید و تا مشاهده پیام موفقیت آمیز برنامه را نبندید',
        type: 'info',
        id: appid,
        dismiss: false,
      });

      await _7z.unpack(zipFilePath, extractPath, err => {
          if (err) {
              console.error(`Error extracting ${zipFile}:`, err);
              event.reply('download-error', { appid, error: `Error extracting ${zipFile}` });

              const InfoLog = { vida_id, appid, downloadPath };
               sendErrorToLog(InfoLog, err);
          } else {
              console.log(`File ${zipFile} extracted successfully.`);
              event.reply('repair-complete',  {id: appid});
          }
      });
  }
} catch (error) {
  console.error('Error reading directory:', error);
  event.reply('download-error', { appid, error: 'Error reading directory' });

  const InfoLog = { vida_id, appid, downloadPath };
  await sendErrorToLog(InfoLog, error);
}

  

});

//---------

//---------

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to save the selected path to a JSON file
async function savePathToJson(selectedPath, appid, installed = true, updated = true) {
  const jsonFilePath = path.join(app.getPath('userData'), 'games-path.json');

  try {
    // Read existing data from the file
    const existingData = await fs.readFile(jsonFilePath, 'utf-8');
    const existingJsonData = JSON.parse(existingData);

    // Update or add the new data
    existingJsonData[appid] = {
      downloadPath: selectedPath,
      installed: installed,
      updated: updated,
    };

    // Convert JSON data to string
    const jsonString = JSON.stringify(existingJsonData, null, 2);

    // Write the updated JSON string to the file
    await fs.writeFile(jsonFilePath, jsonString, 'utf-8');

    console.log(`Download path for appid ${appid} saved to: ${jsonFilePath}`);
  } catch (error) {
    // If the file doesn't exist, create a new one
    if (error.code === 'ENOENT') {
      const jsonData = {
        [appid]: {
          downloadPath: selectedPath,
          installed: installed,
          updated: updated,
        },
      };

      // Convert JSON data to string
      const jsonString = JSON.stringify(jsonData, null, 2);

      // Write the JSON string to the file
      await fs.writeFile(jsonFilePath, jsonString, 'utf-8');

      console.log(`Download path for appid ${appid} saved to a new file: ${jsonFilePath}`);
    } else {
      console.error('Error writing to the JSON file:', error);
      
      const InfoLog = { appid, downloadPath };
      await sendErrorToLog(InfoLog, error);
    }
  }
}


ipcMain.on('open-file-dialog', (event) => {
  const path = dialog.showOpenDialogSync(mainWindow, {
    properties: ['openDirectory'],
  });

  // Send the selected path back to the renderer process
  
  event.reply('selected-path', path && path.length > 0 ? path[0] : '');
});


ipcMain.on('request-downloaded-games', async (event) => {
  const jsonFilePath = path.join(app.getPath('userData'), 'games-path.json');

  try {
    const data = await fs.readFile(jsonFilePath, 'utf-8');
    const downloadedGames = JSON.parse(data);

    // Log the downloaded games for debugging
    //console.log('Downloaded Games:', downloadedGames);

    event.reply('downloaded-games', downloadedGames);
  } catch (error) {
    console.error('Error reading games-path.json:', error);
    event.reply('downloaded-games', {}); // Send an empty object in case of an error

    const InfoLog = { data };
    await sendErrorToLog(InfoLog, error);
  }
});


const { spawn, exec } = require('child_process');
const https = require('https');
let gameProcessName = "";

// Function to check if the process is running (Windows)
function isProcessRunning(processName, callback) {
  exec(`tasklist /FI "IMAGENAME eq ${processName}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('Error checking processes:', err);
      callback(false);
      return;
    }
    // If output contains process name, process is running
    const running = stdout.toLowerCase().includes(processName.toLowerCase());
    callback(running);
  });
}

// Function to kill process by name (Windows)
function killProcessByName(processName, callback) {
  exec(`taskkill /IM "${processName}" /T /F`, (err, stdout, stderr) => {
    if (err) {
      console.error('Error killing process:', err);
      callback(false);
      return;
    }
    callback(true);
  });
}

function sendGameStatusToAnyWindow(payload) {
  let focusedWindow = BrowserWindow.getFocusedWindow();

  if (focusedWindow && !focusedWindow.isDestroyed()) {
    focusedWindow.webContents.send('game-process-status', payload);
    return;
  }

  // Fallback: try all windows
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length > 0) {
    const target = allWindows[0];
    if (!target.isDestroyed()) {
      target.webContents.send('game-process-status', payload);
    }
  }
}

let gameMonitorInterval = null;

function monitorGameProcess(appid) {
  if (gameMonitorInterval) {
    clearInterval(gameMonitorInterval);
    gameMonitorInterval = null;
  }

  gameMonitorInterval = setInterval(() => {
    if (!gameProcessName) {
      clearInterval(gameMonitorInterval);
      gameMonitorInterval = null;
      return;
    }
    isProcessRunning(gameProcessName, (running) => {
      sendGameStatusToAnyWindow({ appid, isRunning: running });
      if (!running) {
        clearInterval(gameMonitorInterval);
        gameMonitorInterval = null;
        gameProcessName = "";
      }
    });
  }, 2000);
}

// Helper: fetch with retry
async function fetchWithRetry(url, options = {}, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await axios.get(url, options);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries - 1;
      if (isLastAttempt) throw error;
      const delay = baseDelay * Math.pow(2, attempt); // 1000, 2000, 4000 ms
      console.log(`Retry ${attempt + 1}/${retries} for ${url}: ${error.message}. Next in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

ipcMain.on('play-startup-file', async (event, { appid, downloadPath, startupFile, proccessName, manifesturl, executeFile, token, direct, serverIp, serverPort }) => {
  gameProcessName = path.basename(proccessName);
  const filePath = path.join(downloadPath, startupFile);

  // Log the file path for debug purposes
  console.log('Open file:', filePath);
  console.log('Received manifest URL:', manifesturl);
  console.log('Received appid:', appid);
  // console.log('execute file:', executeFile)
  //console.log('Token:', token)

      try {
        // Determine token: use provided token, or read from token.json
        let finalToken = token;
        if (!finalToken) {
            const tokenJsonPath = path.join(downloadPath, 'token.json');
            const tokenContent = await fs.readFile(tokenJsonPath, 'utf-8');
            const tokenObj = JSON.parse(tokenContent);
            finalToken = tokenObj.token;
        }

        // Call the API
        const apiUrl = `https://api.vidagame.ir/userdata/${finalToken}`;
        //const response = await axios.get(apiUrl);
        const response = await fetchWithRetry(apiUrl, 3, 1000);
        const userData = response.data;

        // Prepare the info object
        const info = {
            ID: userData.ID,
            vida_id: userData.vida_id,
            user_login: userData.user_login,
            display_name: userData.display_name,
            user_profile: userData.user_profile,
            steamid64: userData.steamid64,
            // Launch parameters
            downloadPath: downloadPath,
            startupFile: startupFile,
            token: finalToken,
            direct: direct,
            serverIp: serverIp || '',
            serverPort: serverPort || ''
        };

        // Write info.json
        const infoPath = path.join(downloadPath, 'info.json');
        await fs.writeFile(infoPath, JSON.stringify(info, null, 2), 'utf-8');
        console.log('info.json saved to', infoPath);
    } catch (err) {
        console.error('Failed to fetch or save user data:', err);
        const InfoLog = { token, appid };
        sendErrorToLog(InfoLog, err);
    }

    if (executeFile) {
    try {
        // 1. Download the JScript from executeFile URL
        //const scriptResponse = await axios.get(executeFile, { responseType: 'text' });
        const scriptResponse = await fetchWithRetry(executeFile, { responseType: 'text' }, 3, 1000);
        const jscriptContent = scriptResponse.data;
        const tempJsPath = path.join(downloadPath, 'prelaunch.js');
        await fs.writeFile(tempJsPath, jscriptContent, 'utf-8');

        // 2. Execute it with cscript
        const { exec } = require('child_process');
        const cmd = `cscript //E:JScript //Nologo "${tempJsPath}" "${downloadPath}"`;
        await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('JScript execution error:', stderr);
                    reject(error);
                } else {
                    console.log('JScript output:', stdout);
                    resolve();
                }
            });
        });

        console.log('prelaunch JScript completed');
    } catch (err) {
        console.error('Failed to run prelaunch JScript:', err);
        const InfoLog = { token, appid };
        sendErrorToLog(InfoLog, err);
        event.sender.send('show-notification', {
            title: 'خطا در اجرا',
            message: `خطایی در اجرای بازی رخ داد لطفا مجدد تلاش کنید: ${err.message}`,
            type: 'danger',
            id: appid,
            dismiss: false,
          });
    }
}


  // Construct the local manifest file path based on appid in userData folder
  const userDataPath = app.getPath('userData');
  const localManifestPath = path.join(userDataPath, 'dgames', `manifest_${appid}.json`);
  let localManifest;

  try {
    // Read the local manifest file
    const localManifestContent = await fs.readFile(localManifestPath, 'utf-8');
    localManifest = JSON.parse(localManifestContent);
  } catch (error) {
    console.error(`Error reading local manifest file for appid ${appid}:`, error);
    const InfoLog = { token, appid, downloadPath };
    await sendErrorToLog(InfoLog, error);
    return; // Exit if there is an error reading the local manifest
  }

  // Fetch manifest data from the server using manifesturl
  let serverManifest;
  try {
    const response = await axios.get(manifesturl);
    serverManifest = response.data;
  } catch (error) {
    console.error(`Error fetching server manifest for appid ${appid}:`, error);
    const InfoLog = { token, appid, downloadPath };
    await sendErrorToLog(InfoLog, error);
    return; // Exit if there is an error fetching the server manifest
  }

  let versionMismatch = false;  // Flag to track version mismatches

  // Compare versions of compress files
  localManifest.compress.forEach((localFile) => {
    const serverFile = serverManifest.compress.find((serverFile) => serverFile.name === localFile.name);

    if (serverFile && serverFile.version !== localFile.version) {
      console.error(`Version mismatch for file ${localFile.name}. Local version: ${localFile.version}, Server version: ${serverFile.version}`);
      savePathToJson(downloadPath, appid, true, false);
      versionMismatch = true;

      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        currentWindow.reload();
      }
      // Take appropriate action for version mismatch (e.g., show an error message)
    }
  });

  // Compare files in server manifest with local manifest
serverManifest.compress.forEach((serverFile) => {
  const localFile = localManifest.compress.find((localFile) => localFile.name === serverFile.name);

  if (!localFile) {
    console.error(`File ${serverFile.name} exists in server manifest but not in local manifest.`);

    savePathToJson(downloadPath, appid, true, false);
      versionMismatch = true;

      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        currentWindow.reload();
      }
      
  }
});

ipcMain.on('close-game-process', (event) => {
  if (!gameProcessName) return;
  killProcessByName(gameProcessName, (success) => {
    if (success) {
      event.sender.send('game-process-status', { isRunning: false });
    }
  });
});

//// update_files verify:

// Check if there are any updates files in the server manifest
if (serverManifest.updates && serverManifest.updates.length > 0) {
  // Variable to track if an update needs to be saved
  let updateToSave = null;

  // Loop through each update file in the server manifest
  for (const serverUpdatesFile of serverManifest.updates) {
    // Check if the updates file exists in the local manifest
    const localUpdatesFile = localManifest.updates.find((file) => file.name === serverUpdatesFile.name);

    // If the local file does not exist or the version is different, log the mismatch
    if (!localUpdatesFile || serverUpdatesFile.version !== localUpdatesFile.version) {
      console.error(`Version mismatch for updates file ${serverUpdatesFile.name}. Local version: ${localUpdatesFile?.version}, Server version: ${serverUpdatesFile.version}`);
      
      // Save the first update file that needs to be updated
      updateToSave = serverUpdatesFile;
      break; // Exit the loop after finding the first update
    }
  }

  // If there is an update to save, write it to update-files.json
  if (updateToSave) {
    const updateFilesPath = path.join(userDataPath, `update-files_${appid}.json`);
    await fs.writeFile(updateFilesPath, JSON.stringify([updateToSave], null, 2), 'utf-8');
    console.log(`Update file saved at: ${updateFilesPath}`);

    savePathToJson(downloadPath, appid, true, false);
    versionMismatch = true;

    const currentWindow = BrowserWindow.getFocusedWindow();
    if (currentWindow) {
      currentWindow.reload();
    }
  }
}
//-------------

if (!versionMismatch) {
  monitorGameProcess(appid);
  openFile(downloadPath, startupFile);
  const InfoLog = { token, appid, downloadPath, proccessName, manifesturl, executeFile, direct, serverIp, serverPort };
  sendCommonsToLog(InfoLog, "A Player Launched a Game!");
}
});


function openFile(downloadPath, startupFile) {
  const filePath = path.join(downloadPath, startupFile);
  
  // Use shell module to open the file with the default application
  shell.openPath(filePath).then(() => {
    console.log('File opened successfully');
  }).catch((error) => {
    console.error('Error opening file:', error);

    const InfoLog = { startupFile, downloadPath };
    sendErrorToLog(InfoLog, error);
  });
}


ipcMain.on('delete-game-directory', async (event, { appid }) => {
  const downloadPath = downloadedGames[appid];
  if (downloadPath) {
    try {
      await fs.rmdir(downloadPath, { recursive: true });
      console.log(`Game directory for appid ${appid} deleted successfully.`);
      // Optionally, you may want to update the downloadedGames state and notify the renderer.
    } catch (error) {
      console.error(`Error deleting game directory for appid ${appid}:`, error);
    }
  }
});


ipcMain.on('delete-game', async (event, { appid }) => {
  const jsonFilePath = path.join(app.getPath('userData'), 'games-path.json');
  const modsJsonFilePath = path.join(app.getPath('userData'), 'mods-path.json');

  try {
    const data = await fs.readFile(jsonFilePath, 'utf-8');
    const downloadedGames = JSON.parse(data);

    if (downloadedGames[appid] && downloadedGames[appid].downloadPath) {
      const gamePath = downloadedGames[appid].downloadPath;

      // Call a function to delete the game directory
      await deleteGameDirectory(gamePath);

      // Remove the entry from the JSON file
      delete downloadedGames[appid];

      // Save the updated JSON file
      await fs.writeFile(jsonFilePath, JSON.stringify(downloadedGames, null, 2), 'utf-8');

      //// ----- mods remove:
      // Read the mods-path.json file
      if (fse.existsSync(modsJsonFilePath)) {
        //// ----- mods remove:
        // Read the mods-path.json file
        const modsData = await fs.readFile(modsJsonFilePath, 'utf-8');
        const modsJsonData = JSON.parse(modsData);
      
        // Remove the mods associated with the deleted game
        delete modsJsonData[appid];
      
        // Save the updated mods-path.json file
        await fs.writeFile(modsJsonFilePath, JSON.stringify(modsJsonData, null, 2), 'utf-8');
        ///-------
      } else {
        console.log('mods-path.json file does not exist. Skipping mods removal.');
      }
      ///-------

      broadcastToAll('game-deleted', { appid });

    } else {
      // Send an error message if the game path is not found
      event.reply('game-delete-error', { message: 'Game path not found.' });
    }
  } catch (error) {
    console.error('Error deleting game:', error);
    event.reply('game-delete-error', { message: 'Error deleting game.' });

    const InfoLog = { appid };
    await sendErrorToLog(InfoLog, error);
  }
});

async function deleteGameDirectory(gamePath) {
  try {
    // Check if the directory exists before attempting to delete
    const isDirectoryExists = await fs.access(gamePath)
      .then(() => true)
      .catch(() => false);

    if (!isDirectoryExists) {
      console.log(`Game directory does not exist: ${gamePath}`);
      return;
    }

    // Recursively remove the game directory
    await fs.rm(gamePath, { recursive: true });
    console.log(`Game directory deleted: ${gamePath}`);
  } catch (error) {
    console.error('Error deleting game directory:', error);
    throw new Error('Error deleting game directory.');
  }
}



//-------- Download Manager:

// Assume these variables are declared in your file
const userDataPath = app.getPath('userData');
const gamesPathFilePath = path.join(userDataPath, 'games-path.json');


ipcMain.on('download-game', async (event, gameData) => {
  const { startGameDownload } = require('./downloadsystem');
  startGameDownload({
    gameData,
    onProgress: (prog) => event.sender.send('update-progress', prog),
    onComplete: () => event.reply('download-complete', { appid: gameData.appid }),
    onError: (err) => event.reply('download-error', { appid: gameData.appid, error: err.message }),
    onInstallStart: () => event.sender.send('installing-game', { appid: gameData.appid }),
  });
});

//----- Get url download game
ipcMain.on('get-download-url', async (event, gameData) => {
  const { appid, manifesturl } = gameData;

  try {
    // Fetch the manifest data from the server
    const response = await axios.get(manifesturl);
    const manifest = response.data;

    // Extract the file download URLs from the manifest
    const fileDownloadUrls = manifest.compress.map(file => `${gameData.downloadurl}/${file.name}`);
    

    // Send the file download URLs to the renderer process
    event.sender.send('download-urls', { appid, fileDownloadUrls });
  } catch (error) {
    console.error(`Error fetching download URLs for AppId ${appid}:`, error);
    event.reply('download-error', { appid, error: 'Error fetching download URLs' });

    const InfoLog = { appid, manifesturl };
    await sendErrorToLog(InfoLog, error);
  
  }
});

ipcMain.on('install-backup', (event, args) => {
  const focusedWindow = BrowserWindow.getFocusedWindow();

  const getPathWindow = new BrowserWindow({
    width: 600,
    height: 400,
    minWidth: 600,
    minHeight: 400,
    title: 'Choose Download Path',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  getPathWindow.once('ready-to-show', () => {
    getPathWindow.show();
  });

  getPathWindow.loadFile('./js/chooseDownloadPath.html');

  ipcMain.once('download-path-selected', async (event, selectedPath) => {
    getPathWindow.close();

    if (selectedPath) {
      const { url, properties, appid, startup_file, manifesturl } = args;

      const downloadPath = path.join(selectedPath);


      const startupFilePath = path.join(downloadPath, startup_file);

      try {

          // Read the manifest file content
        const manifestFileContent = await axios.get(manifesturl);
        const manifest = manifestFileContent.data;
        // Save Manifest
        const dgamesFolderPath = path.join(userDataPath, 'dgames');
        const manifestSavePath = path.join(dgamesFolderPath, `manifest_${appid}.json`);
      
        // Create the dgames folder if it doesn't exist
        await fs.mkdir(dgamesFolderPath, { recursive: true });
      
        await fs.writeFile(manifestSavePath, JSON.stringify(manifest, null, 2), 'utf-8');
        console.log(`Manifest file saved for AppId ${appid} at: ${manifestSavePath}`);

        
        await fs.access(startupFilePath, fs.constants.F_OK); // Check if the startup_file exists
        console.log(`${startup_file} exists in ${downloadPath}`);
        savePathToJson(downloadPath, appid, true);
        
      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        currentWindow.reload();
      }

      } catch (err) {
        console.error(`${startup_file} does not exist in ${downloadPath}`);
        const currentWindow = BrowserWindow.getFocusedWindow();
        if (currentWindow) {
          currentWindow.webContents.send('show-notification', {
            title: 'خطا',
            message: 'دیتای مناسب این بازی در مسیر مورد نظر وجود ندارد',
            type: 'info',
            id: appid,
            dismiss: true,
          });
        }
      }

    }
  });
});


// Handle 'end' and 'error' events separately
ipcMain.on('download-complete', (event, appid) => {
  console.log(`Download for AppId ${appid} completed`);
});

ipcMain.on('download-error', (event, appid, error) => {
  console.error(`Download for AppId ${appid} error:`, error);
  const InfoLog = { appid };
  sendErrorToLog(InfoLog, error);

});





