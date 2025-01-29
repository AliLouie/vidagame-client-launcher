// downloadsystem.js

const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const { DownloaderHelper } = require('node-downloader-helper');
const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra')
const axios = require('axios');
const _7z = require('7zip-min-electron');



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
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function sendErrorToDiscord(InfoLog, error) {
  const errorMessage = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Report*`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*InfoLog:*\n\`\`\`${JSON.stringify(InfoLog, null, 2)}\`\`\``
          },
          {
            type: 'mrkdwn',
            text: `*Error Message:*\n${error.message}`
          },
          {
            type: 'mrkdwn',
            text: `*Stack Trace:*\n\`\`\`${error.stack}\`\`\``
          }
        ]
      }
    ]
  };

  try {
    await axios.post(DISCORD_WEBHOOK_URL, errorMessage);
    console.log('Error log sent to Slack successfully.');
  } catch (webhookError) {
    console.error('Failed to send error log to Slack:', webhookError);
  }
}

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
      const { url, properties, appid, name, image, token, vida_id } = args;

      //console.log('Received Token:', token, vida_id);

      const downloadId = downloadIdCounter++;

      currentDownloads[downloadId] = { appid, name, image };

      const downloadPath = path.join(selectedPath, name);

      await fs.mkdir(downloadPath, { recursive: true });

      savePathToJson(downloadPath, appid, false);

      const addAppIdUrl = 'https://api.vidagame.ir/addappid';
      const requestBody = {
      vida_id: vida_id,
      appid: appid,
      updating: "0",
      update_files: null,
      is_Crack: "0",
    };

    try {
      await axios.post(addAppIdUrl, requestBody);
      console.log(`AppId ${appid} added successfully via API.`);
    } catch (error) {
      console.error(`Error adding AppId ${appid} via API:`, error);
      
      const InfoLog = { addAppIdUrl, requestBody, downloadPath };
      await sendErrorToDiscord(InfoLog, error);
    }

      
      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        currentWindow.reload();
      }

    new Notification({
      title: 'دانلود منیجر ویدا گیم',
      body: 'برای شروع به بخش دانلود بروید'
    }).show()


    }
  });
});

//--------- Update game system

ipcMain.on('update-file', async (event, args) => {

      const { appid, token, downloadPath, startupFile, vida_id } = args;
      const filePath = path.join(downloadPath, startupFile);

      console.log('Open file:', filePath);
      //console.log('Received Token:', token);
      console.log('Received vidaid:', vida_id);
      console.log('Received appid:', appid);

      savePathToJson(downloadPath, appid, false, false);

      
  // Read the update-files.json file
  const updateFilesPath = path.join(userDataPath, `update-files_${appid}.json`);
  let updateFiles = []; // Initialize updateFiles as an empty array

  try {
    // Check if the file exists
    await fs.access(updateFilesPath, fs.constants.F_OK);

    // File exists, read the content
    const updateFilesContent = await fs.readFile(updateFilesPath, 'utf-8');
    updateFiles = JSON.parse(updateFilesContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('update-files.json not found, proceeding with null update_files.');
      // If the file does not exist, we will set update_files to null
    } else {
      console.error('Error checking or reading update-files.json:', error);
      const InfoLog = { vida_id, appid };
      sendErrorToDiscord(InfoLog, error);
      return;
      // Handle other errors as needed but still proceed
    }
  }

      // Set update_files to NULL if there are no update files
      const update_files = updateFiles.length > 0 ? [updateFiles[0].name] : null;

      const addAppIdUrl = 'https://api.vidagame.ir/addappid';
      const requestBody = {
      vida_id: vida_id,
      appid: appid,
      updating: "1",
      update_files: update_files,
      is_Crack: "0",
    };


    try {
      await axios.post(addAppIdUrl, requestBody);
      console.log(`AppId ${appid} added successfully via API.`);
    } catch (error) {
      console.error(`Error adding AppId ${appid} via API:`, error);

      const InfoLog = { addAppIdUrl, requestBody, downloadPath };
      await sendErrorToDiscord(InfoLog, error);
    }

      
      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        currentWindow.reload();
      }

});

//---------

// -------- Install Crack System:
ipcMain.on('install-crack-file', async (event, args) => {

  const { appid, vida_id, downloadPath, startupFile } = args;
  const filePath = path.join(downloadPath, startupFile);

  console.log('Open file:', filePath);
  console.log('Received vida id:', vida_id);
  console.log('Received appid:', appid);

  savePathToJson(downloadPath, appid, false, true);

  const addAppIdUrl = 'https://api.vidagame.ir/addappid';
  const requestBody = {
  vida_id: vida_id,
  appid: appid,
  updating: "0",
  update_files: null,
  is_Crack: "1",
};

try {
  await axios.post(addAppIdUrl, requestBody);
  console.log(`AppId ${appid} added successfully via API.`);
} catch (error) {
  console.error(`Error adding AppId ${appid} via API:`, error);

  const InfoLog = { addAppIdUrl, requestBody, downloadPath };
  await sendErrorToDiscord(InfoLog, error);
}

  
  const currentWindow = BrowserWindow.getFocusedWindow();
  if (currentWindow) {
    currentWindow.reload();
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

  const removeDownloadUrl = `https://api.vidagame.ir/removedownloads/${vida_id}?appid=${appid}`;

try {
  await axios.post(removeDownloadUrl);
  console.log(`AppId ${appid} removed from downloads`);
} catch (error) {
  console.error(`Error removing downloads AppId ${appid} via API:`, error);

  const InfoLog = { vida_id, appid, downloadPath };
  await sendErrorToDiscord(InfoLog, error);
}

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
               sendErrorToDiscord(InfoLog, err);
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
  await sendErrorToDiscord(InfoLog, error);
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
      await sendErrorToDiscord(InfoLog, error);
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
    await sendErrorToDiscord(InfoLog, error);
  }
});


const { spawn } = require('child_process');
const https = require('https');


ipcMain.on('play-startup-file', async (event, { appid, downloadPath, startupFile, manifesturl, executeFile, token }) => {
  const filePath = path.join(downloadPath, startupFile);

  // Log the file path for debug purposes
  console.log('Open file:', filePath);
  console.log('Received manifest URL:', manifesturl);
  console.log('Received appid:', appid);
  // console.log('execute file:', executeFile)
  // console.log('Token:', token)


    // Fetch the Node.js script content from the URL
    try {
      const scriptContent = await fetchScriptContent(executeFile);
      // Save the script content to a temporary file
      const scriptPath = saveScriptToFile(scriptContent, token, downloadPath);
      // Execute the script
      executeScript(scriptPath, downloadPath, startupFile);
    } catch (error) {
      console.error('Error fetching or executing script:', error);
      const InfoLog = { token, appid, downloadPath, startupFile };
      await sendErrorToDiscord(InfoLog, error);
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
    await sendErrorToDiscord(InfoLog, error);
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
    await sendErrorToDiscord(InfoLog, error);
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
  openFile(downloadPath, startupFile);
}
});

function fetchScriptContent(scriptUrl) {
  return new Promise((resolve, reject) => {
    https.get(scriptUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

function saveScriptToFile(scriptContent, token, downloadPath) {
  try {
    // Get the userData path for the application
    const userDataPath = app.getPath('userData');

    // Create a directory for scripts if it doesn't exist
    const scriptsDir = path.join(userDataPath, 'scripts');
      fs.mkdir(scriptsDir, { recursive: true });

    // Generate a unique file name for the script
    const scriptFileName = `execute.js`;
    const scriptFilePath = path.join(scriptsDir, scriptFileName);

    // Write the script content to the file
    fs.writeFile(scriptFilePath, scriptContent);

    // Save the token to a separate JSON file
    const tokenFilePath = path.join(downloadPath, 'token.json');
    fs.writeFile(tokenFilePath, JSON.stringify({ token }));  

    return scriptFilePath;
  } catch (error) {
    console.error('Error saving script to file:', error);
    const InfoLog = { token, downloadPath };
    sendErrorToDiscord(InfoLog, error);
    throw error;
  }
}

function executeScript(scriptPath, downloadPath, startupFile) {
  const scriptProcess = spawn('node', [scriptPath, downloadPath, startupFile], {
    cwd: downloadPath
  });

  scriptProcess.stdout.on('data', (data) => {
    console.log(`Script stdout: ${data}`);
  });

  scriptProcess.stderr.on('data', (data) => {
    console.error(`Script stderr: ${data}`);
  });

  scriptProcess.on('close', (code) => {
    console.log(`Script process exited with code ${code}`);
  });
}

function openFile(downloadPath, startupFile) {
  const filePath = path.join(downloadPath, startupFile);
  
  // Use shell module to open the file with the default application
  shell.openPath(filePath).then(() => {
    console.log('File opened successfully');
  }).catch((error) => {
    console.error('Error opening file:', error);

    const InfoLog = { startupFile, downloadPath };
    sendErrorToDiscord(InfoLog, error);
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


ipcMain.on('delete-game', async (event, { appid, vida_id }) => {
  const jsonFilePath = path.join(app.getPath('userData'), 'games-path.json');
  const modsJsonFilePath = path.join(app.getPath('userData'), 'mods-path.json');

  console.log('Received Vida id:', vida_id);
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

      const removeDownloadUrl = `https://api.vidagame.ir/removedownloads/${vida_id}?appid=${appid}`;

      try {
        await axios.post(removeDownloadUrl);
        console.log(`Download data for AppId ${appid} removed from the database`);
      } catch (error) {
        console.error(`Error removing download data for AppId ${appid} from the database:`, error);

        const InfoLog = { vida_id, appid };
        await sendErrorToDiscord(InfoLog, error);
      }

      // Reload the current window
      const currentWindow = BrowserWindow.getFocusedWindow();
      if (currentWindow) {
        currentWindow.reload();
      }

      // Send a confirmation message
      event.reply('game-deleted', { appid });
    } else {
      // Send an error message if the game path is not found
      event.reply('game-delete-error', { message: 'Game path not found.' });
    }
  } catch (error) {
    console.error('Error deleting game:', error);
    event.reply('game-delete-error', { message: 'Error deleting game.' });

    const InfoLog = { vida_id, appid };
    await sendErrorToDiscord(InfoLog, error);
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

// Declare a variable to hold the downloader instances
const downloaders = {};

ipcMain.on('download-game', async (event, gameData) => {
  const { appid, downloadurl, token, vida_id, manifesturl, updating, update_files, is_Crack} = gameData;

  console.log('Received download URL:', downloadurl);
  console.log('Received download Manifest URL:', manifesturl);
  console.log('Received AppId:', appid);
  console.log('Received Token:', token);
  console.log('Received vida id:', vida_id);
  console.log('Received Updating:', updating);


  const downloadStatus = {
    progress: 0,
    downloaded: 0,
    totalSize: 0,
  };



  try {

    if (updating === 1) {

            // Read the local manifest file
            const localManifestPath = path.join(userDataPath, 'dgames', `manifest_${appid}.json`);
            const localManifestContent = await fs.readFile(localManifestPath, 'utf-8');
            const localManifest = JSON.parse(localManifestContent);
      
            // Fetch manifest data from the server using manifesturl
            const response = await axios.get(manifesturl);
            const serverManifest = response.data;
      
            let versionMismatch = false; // Flag to track version mismatches
            let filesToUpdate = 0;
      
          if (update_files && update_files.length > 0) {
              console.log('There are update files:', update_files);

                  await downloadUpdateFile(event, update_files, downloadurl, appid, manifesturl, downloadStatus, token, vida_id).then(() => {
                  versionMismatch = true;
                  // Continue with other logic if needed after downloading a single file
                });
                
              return;
            } else {

            // Compare versions of files
            for (const localFile of localManifest.compress) {
              const serverFile = serverManifest.compress.find((file) => file.name === localFile.name);
      
              if (serverFile && serverFile.version !== localFile.version) {
                console.error(`Version mismatch for file ${localFile.name}. Local version: ${localFile.version}, Server version: ${serverFile.version}`);
                filesToUpdate++;
                const totalFiles = filesToUpdate;
                
                // Use then to handle the asynchronous download operation
                await downloadSingleFile(event, serverFile, downloadurl, appid, manifesturl, downloadStatus, totalFiles, token, vida_id).then(() => {
                  versionMismatch = true;
                  // Continue with other logic if needed after downloading a single file
                });
              }
            }

            serverManifest.compress.forEach( async (serverFile) => {
              const localFile = localManifest.compress.find((file) => file.name === serverFile.name);
      
              if (!localFile) {
                  console.error(`File ${serverFile.name} exists in server manifest but not in local manifest.`);
                  filesToUpdate++;
                  const totalFiles = filesToUpdate;

                  versionMismatch = true;
                  // Download the missing file
                  await downloadSingleFile(event, serverFile, downloadurl, appid, manifesturl, downloadStatus, totalFiles, token, vida_id);
              }
          });
          
            console.log(`Total files to update for AppId ${appid}: ${filesToUpdate}`);
      
            if (versionMismatch) {
              // If there were version mismatches, respond with a success message or any other relevant data
              event.reply('download-complete', { appid, success: true });
              return;
            }
        }
    }

    if (is_Crack === 1) {
      console.log("Crack file is true for downloading addon files");
  
      try {
          // Fetch manifest data from the server using manifesturl
          const response = await axios.get(manifesturl);
          const serverManifest = response.data;
  
          let crackCompleted = false;
          let filesToUpdate = 0;
  
          // Assuming serverManifest.crack is an array of crack files
          for (const crackFile of serverManifest.crack) {
              filesToUpdate++;
  
              // Download each crack file
              console.log(crackFile)
              console.log(downloadurl)

              await downloadCrackFile(event, crackFile, downloadurl, appid, manifesturl, downloadStatus, filesToUpdate, token, vida_id).then(() => {
                crackCompleted = true;
              });
  
          }
  
          // If there was no version mismatch, notify that download is complete
          if (crackCompleted) {
              event.reply('download-complete', { appid, success: true });
              return;
          }
      } catch (error) {
          console.error('Error downloading crack files:', error);
          event.reply('download-complete', { appid, success: false, error: error.message });
          event.sender.send('show-notification', {
            title: 'خطا در اتصال',
            message: `خطایی در دانلود کرک رخ داد لطفا مجدد تلاش کنید: ${error}`,
            type: 'danger',
            id: appid,
          });

          const InfoLog = { token, appid };
          await sendErrorToDiscord(InfoLog, error);
          return;
      }
  }
  

  // Read the manifest file content
    const manifestFileContent = await axios.get(manifesturl);
    const manifest = manifestFileContent.data;


  // Save the manifest JSON file
  const dgamesFolderPath = path.join(userDataPath, 'dgames');
  const manifestSavePath = path.join(dgamesFolderPath, `manifest_${appid}.json`);

  // Create the dgames folder if it doesn't exist
  await fs.mkdir(dgamesFolderPath, { recursive: true });
  
  manifest.updates = [];
  await fs.writeFile(manifestSavePath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Manifest file saved for AppId ${appid} at: ${manifestSavePath}`);


    // Read the games-path.json file
    const gamesPathFileContent = await fs.readFile(gamesPathFilePath, 'utf-8');
    const gamesPathConfig = JSON.parse(gamesPathFileContent);

    // Get the destinationFolder from the config based on the appid
    const destinationFolder = gamesPathConfig[appid]?.downloadPath;

    if (!destinationFolder) {
      console.error(`Download destination not found for appid: ${appid}`);
      event.reply('download-error', { appid, error: 'Download destination not found' });
      return;
    }

    if (manifest.folders && manifest.folders.length > 0) {
      for (const folderPath of manifest.folders) {
        const fullFolderPath = path.join(destinationFolder, folderPath);

        try {
          await fs.access(fullFolderPath);
        } catch (error) {
          // Create the folder if it doesn't exist
          await fs.mkdir(fullFolderPath, { recursive: true });
        }
      }
    }


    const fileProgress = {};
    let totalSize = 0;
    let totalDownloaded = 0;
    let completedFiles = 0;


    for (const file of manifest.compress) {
      const fileDownloadUrl = `${downloadurl}/${file.name}`;

    const downloaderInstance = new DownloaderHelper(fileDownloadUrl, destinationFolder, {
      fileName: file.name,
      forceResume: true,
      resumeIfFileExists: true,
      removeOnFail: false,
      override: true,
      retry: { maxRetries: 5, delay: 5000 },
      timeout: 60000,


      onComplete: () => {
        console.log(`Download for AppId ${appid} of file ${file.name} completed`);
        delete downloaders[`${appid}-${file.name}`];
      },
    });
    

// Subscribe to error event
downloaderInstance.on('error', async (error) => {
  console.error(`Download for AppId ${appid} of file ${file.name} error:`, error);
  event.sender.send('show-notification', {
    title: 'خطا در اتصال',
    message: 'از اتصال اینترنت خود مطمئن شوید',
    type: 'danger',
    id: appid,
  });

  if (error.code === 'ETIMEDOUT' && downloaderInstance.retryCount < downloaderInstance.options.retry.maxRetries) {
    console.log(`Retrying download (${downloaderInstance.retryCount + 1}/${downloaderInstance.options.retry.maxRetries})...`);

    // Wait for a brief moment before retrying (optional)
    await new Promise(resolve => setTimeout(resolve, downloaderInstance.options.retry.delay));

    // Retry the download
    downloaderInstance.start();
  } else {
    event.reply('download-error', { appid, error: 'Internal Server Error', fileName: file.name });
  }

  const InfoLog = { token, appid };
  await sendErrorToDiscord(InfoLog, error);
});


    // Store the downloader instance in the downloaders object
    downloaders[`${appid}-${file.name}`] = downloaderInstance;

  fileProgress[file.name] = {
    downloaded: 0,
    total: 0,
  };

  downloaderInstance.on('progress', (stats) => {
    fileProgress[file.name] = {
      downloaded: stats.downloaded,
      total: stats.total,
    };

    if (totalSize === 0) {
      totalSize = manifest.compress.reduce((acc, file) => acc + file.size, 0);
    }

    const overallDownloaded = Object.values(fileProgress).reduce((acc, fileStats) => acc + fileStats.downloaded, 0);
    const overallProgress = Math.floor((overallDownloaded / totalSize) * 100);

  // Calculate remaining bytes and estimated time left
  const remainingBytes = totalSize - overallDownloaded;
  const speed = stats.speed; // speed in bytes per second
  const estimatedTimeLeft = speed > 0 ? Math.ceil(remainingBytes / speed) : 0; // in seconds

  // Convert estimated time left to hours, minutes, and seconds
  const hours = Math.floor(estimatedTimeLeft / 3600);
  const minutes = Math.floor((estimatedTimeLeft % 3600) / 60);
  const seconds = estimatedTimeLeft % 60;


    event.sender.send('update-progress', {
      appid,
      progress: overallProgress,
      speed: formatBytes(stats.speed),
      downloaded: formatBytes(overallDownloaded),
      totalSize: formatBytes(totalSize),
      estimatedTimeLeft: `${hours}h ${minutes}m ${seconds}s`,
      fileName: file.name,
    });
  });

  downloaderInstance.on('timeout', () => {
    console.error(`Download for AppId ${appid} of file ${file.name} timed out`);
    event.reply('download-error', { appid, error: 'Download timed out', fileName: file.name });

    const InfoLog = { token, appid };
    sendErrorToDiscord(InfoLog, error);
  });

  downloaderInstance.on('retry', (retryCount, maxRetries) => {
    console.log(`Retrying download (${retryCount}/${maxRetries}) for AppId ${appid} of file ${file.name}...`);
    event.sender.send('show-notification', {
      title: 'خطا در اتصال',
      message: `در حال تلاش مجدد برای گام: ${retryCount}`,
      type: 'warning',
      id: appid,
    });
  });
  
  

  // Subscribe to end event
  downloaderInstance.on('end', async () => {
    console.log(`Download for AppId ${appid} completed: ${file.name}`);
    event.reply('download-complete', { appid });
    completedFiles++;

    try {

      event.sender.send('show-notification', {
        title: 'نصب بازی',
        message: 'بازی شما در حال نصب است لطفا تا مشاهده پیام موفقیت آمیز برنامه را نبندید و صبور باشید',
        type: 'info',
        id: appid,
      });

      for (const file of manifest.compress) {
          const zipFilePath = path.join(destinationFolder, file.name);
          const extractPath = destinationFolder;
          await _7z.unpack(zipFilePath, extractPath, err => {
            if (err) {
              console.error(`Error extracting ${file.name}:`, err);
              event.reply('download-error', { appid, error: `Error extracting ${file.name}` });

              const InfoLog = { token, appid };
              sendErrorToDiscord(InfoLog, err);
              
              return;
          }
            console.log(`File ${file.name} extracted successfully.`);
            event.sender.send('remove-notification', {id: appid});

            fs.unlink(zipFilePath, err => {
              if (err) {
                  console.error(`Error deleting ${zipFilePath}:`, err);

                  const InfoLog = { token, appid };
                  sendErrorToDiscord(InfoLog, err);
              } else {
                  console.log(`Deleted ${zipFilePath} after extraction.`);
              }
          });
        });

      }
  } catch (error) {
      console.error('Error extracting files:', error);
      event.reply('download-error', { appid, error: 'Error extracting files' });

      const InfoLog = { token, appid };
      sendErrorToDiscord(InfoLog, error);
      
      return;
  }

    if (completedFiles === manifest.compress.length) {
      totalDownloaded = manifest.compress.reduce((acc, file) => acc + file.size, 0);

      const overallProgress = Math.floor((totalDownloaded / totalSize) * 100);

      // Emit an IPC event to the renderer process with the overall progress details
      event.sender.send('update-progress', {
        appid,
        progress: overallProgress,
        speed: 'N/A',
        downloaded: formatBytes(totalDownloaded),
        totalSize: formatBytes(totalSize),
        fileName: 'All Files',
      });

      // Reset the completed files count for future downloads
      completedFiles = 0;

            // Remove the downloader instance when download is complete
      delete downloaders[`${appid}-${file.name}`];
      savePathToJson(destinationFolder, appid, true, true);

            // Make a request to remove the download data from the database
      const removeDownloadUrl = `https://api.vidagame.ir/removedownloads/${vida_id}?appid=${appid}`;

      // const currentWindow = BrowserWindow.getFocusedWindow();
      // if (currentWindow) {
      //   currentWindow.reload();
      // }

      try {
        await axios.post(removeDownloadUrl);
        console.log(`Download data for AppId ${appid} removed from the database`);
      } catch (error) {
        console.error(`Error removing download data for AppId ${appid} from the database:`, error);

        const InfoLog = { vida_id, appid };
        await sendErrorToDiscord(InfoLog, error);
      
      }


    }
  });


  
  ipcMain.on('stop-download', (event, stopData) => {
    if (stopData.appid === appid) {
      downloaderInstance.stop();
      // Emit an IPC event to inform the renderer process that the download has been stopped
      event.sender.send('download-stopped', { appid });
    }
  });

  ipcMain.on('pause-download', (event, pauseData) => {
    if (pauseData.appid === appid) {
      downloaderInstance.pause();
    }
  });

  ipcMain.on('resume-download', (event, resumeData) => {
    if (resumeData.appid === appid) {
      downloaderInstance.resume();
    }
  });

    // Start the download
    await downloaderInstance.start();
  }


  event.reply('download-complete', { appid });
} catch (error) {
  console.error(`Error processing manifest for AppId ${appid}:`, error);
  event.reply('download-error', { appid, error: 'Error processing manifest' });

  const InfoLog = { token, appid };
  await sendErrorToDiscord(InfoLog, error);

}
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
    await sendErrorToDiscord(InfoLog, error);
  
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



//----- Game Update System

async function downloadSingleFile(event, file, downloadurl, appid, manifesturl, downloadStatus, totalFiles, token, vida_id) {
  console.log('Received Maniwdaw:', appid);

  return new Promise(async (resolve, reject) => {
    const timestamp = Date.now();
    const fileDownloadUrl = `${downloadurl}/${file.name}?timestamp=${timestamp}`;

    // Read the games-path.json file
    const gamesPathFileContent = await fs.readFile(gamesPathFilePath, 'utf-8');
    const gamesPathConfig = JSON.parse(gamesPathFileContent);
    // Get the destinationFolder from the config based on the appid
    const destinationFolder = gamesPathConfig[appid]?.downloadPath;

    //const destinationFolder = path.join(userDataPath, 'dgames');
    const filePath = path.join(destinationFolder, file.name);

    try {
      // Remove existing file if it exists
      await fs.unlink(filePath);
    } catch (unlinkError) {
      // Ignore errors if the file doesn't exist
      if (unlinkError.code !== 'ENOENT') {
        reject(unlinkError);
        return;
      }
    }

      // Read the manifest file content
      const manifestFileContent = await axios.get(manifesturl);
      const manifest = manifestFileContent.data;

    const fileProgress = {};
    let totalSize = 0;
    let totalDownloaded = 0;
    let completedFiles = 0;

    const downloaderInstance = new DownloaderHelper(fileDownloadUrl, destinationFolder, {
      fileName: file.name,
      forceResume: true,
      resumeIfFileExists: true,
      removeOnFail: false,
      override: true,
    });

    // Subscribe to error event
    downloaderInstance.on('error', (error) => {
      console.error(`Download error for file ${file.name}:`, error);
      const InfoLog = { token, appid };
      sendErrorToDiscord(InfoLog, error);
    
      reject(error);
    });

        // Store the downloader instance in the downloaders object
    downloaders[`${appid}-${file.name}`] = downloaderInstance;

  fileProgress[file.name] = {
    downloaded: 0,
    total: 0,
  };

  downloaderInstance.on('progress', (stats) => {
    fileProgress[file.name] = {
      downloaded: stats.downloaded,
      total: stats.total,
    };

    if (totalSize === 0) {
      totalSize = manifest.compress.reduce((acc, file) => acc + file.size, 0);
    }

    downloadStatus.progress = stats.progress;
    downloadStatus.downloaded = stats.downloaded;
    downloadStatus.totalSize = stats.total;

    // Use downloadStatus to update progress UI
    event.sender.send('update-progress', {
      appid: appid,
      progress: Math.floor(downloadStatus.progress),
      speed: formatBytes(stats.speed),
      downloaded: formatBytes(downloadStatus.downloaded),
      totalSize: formatBytes(downloadStatus.totalSize),
      fileName: file.name,
    });
  });

    // Subscribe to end event
    downloaderInstance.on('end', async () => {
      console.log(`Downloaded mismatched file ${file.name} for AppId ${appid}`);

      console.log(`Download for AppId ${appid} completed: ${file.name}`);
    event.reply('download-complete', { appid });
    completedFiles++;

    if (totalFiles == completedFiles) {
      totalDownloaded = manifest.compress.reduce((acc, file) => acc + file.size, 0);

      const overallProgress = Math.floor((totalDownloaded / totalSize) * 100);

      // Emit an IPC event to the renderer process with the overall progress details
      event.sender.send('update-progress', {
        appid,
        progress: overallProgress,
        speed: 'N/A',
        downloaded: formatBytes(totalDownloaded),
        totalSize: formatBytes(totalSize),
        fileName: 'All Files',
      });

      // Reset the completed files count for future downloads
      completedFiles = 0;

      // Save the manifest JSON file
  const dgamesFolderPath = path.join(userDataPath, 'dgames');
  const manifestSavePath = path.join(dgamesFolderPath, `manifest_${appid}.json`);

  // Create the dgames folder if it doesn't exist
  await fs.mkdir(dgamesFolderPath, { recursive: true });

  await fs.writeFile(manifestSavePath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Manifest file saved for AppId ${appid} at: ${manifestSavePath}`);

            // Remove the downloader instance when download is complete
      delete downloaders[`${appid}-${file.name}`];
      savePathToJson(destinationFolder, appid, true, true);
      

            // Make a request to remove the download data from the database
      const removeDownloadUrl = `https://api.vidagame.ir/removedownloads/${vida_id}?appid=${appid}`;

      try {
        await axios.post(removeDownloadUrl);
        console.log(`Download data for AppId ${appid} removed from the database`);
      } catch (error) {
        console.error(`Error removing download data for AppId ${appid} from the database:`, error);

        const InfoLog = { vida_id, appid };
        await sendErrorToDiscord(InfoLog, error);
      
      }


    }

      // Continue with any other logic needed after downloading a single file
      // ...
      event.sender.send('show-notification', {
        title: 'نصب آپدیت',
        message: 'در حال نصب آپدیت، لطفا صبور باشید',
        type: 'info',
        id: appid,
      });

      try {
        for (const file of manifest.compress) {
            const zipFilePath = path.join(destinationFolder, file.name);
            const extractPath = destinationFolder;
            await _7z.unpack(zipFilePath, extractPath, err => {
              if (err) {
                console.error(`Error extracting ${file.name}:`, err);
                event.reply('download-error', { appid, error: `Error extracting ${file.name}` });

                const InfoLog = { token, appid };
                sendErrorToDiscord(InfoLog, err);
                
                return;
            }
              console.log(`File ${file.name} extracted successfully.`);
              event.sender.send('remove-notification', {id: appid});
  
              fs.unlink(zipFilePath, err => {
                if (err) {
                    console.error(`Error deleting ${zipFilePath}:`, err);

                    const InfoLog = { token, appid };
                    sendErrorToDiscord(InfoLog, err);
                } else {
                    console.log(`Deleted ${zipFilePath} after extraction.`);
                }
            });
          });
  
        }
    } catch (error) {
        console.error('Error extracting files:', error);
        event.reply('download-error', { appid, error: 'Error extracting files' });
        const InfoLog = { token, appid };
        await sendErrorToDiscord(InfoLog, error);      
        return;
    }

      resolve();
    });

    ipcMain.on('stop-download', (event, stopData) => {
      if (stopData.appid === appid) {
        downloaderInstance.stop();
        // Emit an IPC event to inform the renderer process that the download has been stopped
        event.sender.send('download-stopped', { appid });
      }
    });
  
    ipcMain.on('pause-download', (event, pauseData) => {
      if (pauseData.appid === appid) {
        downloaderInstance.pause();
      }
    });
  
    ipcMain.on('resume-download', (event, resumeData) => {
      if (resumeData.appid === appid) {
        downloaderInstance.resume();
      }
    });

    // Start the download
    downloaderInstance.start();
  });
}

/// Download update_files:
async function downloadUpdateFile(event, update_files, downloadurl, appid, manifesturl, downloadStatus, token, vida_id) {
  console.log('Received AppId:', appid);

  return new Promise(async (resolve, reject) => {
    // Read the manifest file content
    const manifestFileContent = await axios.get(manifesturl);
    const manifest = manifestFileContent.data;

    // Filter the manifest to get only the files that need to be downloaded
    const filesToDownload = manifest.updates.filter(file => update_files.includes(file.name));

    if (filesToDownload.length === 0) {
      console.log('No files to download.');
      resolve(); // Nothing to download, resolve the promise
      return;
    }

    let completedFiles = 0;

    for (const file of filesToDownload) {
      const timestamp = Date.now();
      const fileDownloadUrl = `${downloadurl}/${file.name}?timestamp=${timestamp}`;

      // Read the games-path.json file
      const gamesPathFileContent = await fs.readFile(gamesPathFilePath, 'utf-8');
      const gamesPathConfig = JSON.parse(gamesPathFileContent);
      const destinationFolder = gamesPathConfig[appid]?.downloadPath;
      const filePath = path.join(destinationFolder, file.name);

      try {
        // Remove existing file if it exists
        await fs.unlink(filePath);
      } catch (unlinkError) {
        // Ignore errors if the file doesn't exist
        if (unlinkError.code !== 'ENOENT') {
          reject(unlinkError);
          return;
        }
      }

      const downloaderInstance = new DownloaderHelper(fileDownloadUrl, destinationFolder, {
        fileName: file.name,
        forceResume: true,
        resumeIfFileExists: true,
        removeOnFail: false,
        override: true,
        retry: { maxRetries: 5, delay: 5000 },
        timeout: 60000,
      });

      // Subscribe to error event
      downloaderInstance.on('error', (error) => {
        console.error(`Download error for file ${file.name}:`, error);
        const InfoLog = { vida_id, appid };
        sendErrorToDiscord(InfoLog, error);
        reject(error);
      });

      // Subscribe to progress event
      downloaderInstance.on('progress', (stats) => {
        downloadStatus.progress = stats.progress;
        downloadStatus.downloaded = stats.downloaded;
        downloadStatus.totalSize = stats.total;

        // Use downloadStatus to update progress UI
        event.sender.send('update-progress', {
          appid: appid,
          progress: Math.floor(downloadStatus.progress),
          speed: formatBytes(stats.speed),
          downloaded: formatBytes(downloadStatus.downloaded),
          totalSize: formatBytes(downloadStatus.totalSize),
          fileName: file.name,
        });
      });

      // Subscribe to end event update files
      downloaderInstance.on('end', async () => {
        console.log(`Downloaded file ${file.name} for AppId ${appid}`);
        completedFiles++;

        // Check if all files have been downloaded
        if (completedFiles === filesToDownload.length) {
          // Update the local manifest with the new files
          const dgamesFolderPath = path.join(userDataPath, 'dgames');
          const localManifestPath = path.join(dgamesFolderPath, `manifest_${appid}.json`);

          // Read the existing local manifest
          let localManifestContent;
          try {
            localManifestContent = await fs.readFile(localManifestPath, 'utf-8');
          } catch (error) {
            console.error('Error reading local manifest:', error);
            localManifestContent = JSON.stringify({ compress: [], updates: [] }); // Initialize if not found
          }

          const localManifest = JSON.parse(localManifestContent);

          // Add the downloaded files to the local manifest
          localManifest.updates.push(...filesToDownload);

          // Save the updated local manifest
          await fs.writeFile(localManifestPath, JSON.stringify(localManifest, null, 2), 'utf-8');
          console.log(`Local manifest updated for AppId ${appid} at: ${localManifestPath}`);

          const updateFilesPath = path.join(userDataPath, `update-files_${appid}.json`);
	
              try {
            // Delete the update-files.json file
            await fs.unlink(updateFilesPath);
            console.log(`Successfully deleted update-files.json at: ${updateFilesPath}`);
            } catch (error) {
              if (error.code === 'ENOENT') {
                console.error(`File not found: ${updateFilesPath}`);
              } else {
                console.error('Error deleting update-files.json:', error);
              }
            }

          // Notify the completion of downloads
          event.reply('download-complete', { appid });

            // Remove the downloader instance when download is complete
            delete downloaders[`${appid}-${file.name}`];


            event.sender.send('show-notification', {
              title: 'نصب آپدیت',
              message: 'در حال نصب آپدیت، لطفا صبور باشید',
              type: 'info',
              id: appid,
            });
      
            try {
              for (const file of filesToDownload) {
                  const zipFilePath = path.join(destinationFolder, file.name);
                  const extractPath = destinationFolder;
                  await _7z.unpack(zipFilePath, extractPath, async (err) => {
                    if (err) {
                      console.error(`Error extracting ${file.name}:`, err);
                      event.reply('download-error', { appid, error: `Error extracting ${file.name}` });
  
                      
                      return;
                  }
                    console.log(`File ${file.name} extracted successfully.`);
                    event.sender.send('remove-notification', {id: appid});
                    savePathToJson(destinationFolder, appid, true, true);

                     // Make a request to remove the download data from the database
                      const removeDownloadUrl = `https://api.vidagame.ir/removedownloads/${vida_id}?appid=${appid}`;
                
                      try {
                        await axios.post(removeDownloadUrl);
                        console.log(`Download data for AppId ${appid} removed from the database`);
                      } catch (error) {
                        console.error(`Error removing download data for AppId ${appid} from the database:`, error);
                      
                      }
        
                    fs.unlink(zipFilePath, err => {
                      if (err) {
                          console.error(`Error deleting ${zipFilePath}:`, err);

                      } else {
                          console.log(`Deleted ${zipFilePath} after extraction.`);
                      }
                  });
                });
        
              }
          } catch (error) {
              console.error('Error extracting files:', error);
              event.reply('download-error', { appid, error: 'Error extracting files' }); 

              const InfoLog = { vida_id, appid };
              sendErrorToDiscord(InfoLog, error);
              
              return;
          }

        }
      });

      ipcMain.on('stop-download', (event, stopData) => {
        if (stopData.appid === appid) {
          downloaderInstance.stop();
          // Emit an IPC event to inform the renderer process that the download has been stopped
          event.sender.send('download-stopped', { appid });
        }
      });
    
      ipcMain.on('pause-download', (event, pauseData) => {
        if (pauseData.appid === appid) {
          downloaderInstance.pause();
        }
      });
    
      ipcMain.on('resume-download', (event, resumeData) => {
        if (resumeData.appid === appid) {
          downloaderInstance.resume();
        }
      });
  

      // Start the download
      downloaderInstance.start();
    }

    resolve(); // Resolve the promise after starting all downloads
  });
}
//---------------

//// Download Crack File System:

async function downloadCrackFile(event, file, downloadurl, appid, manifesturl, downloadStatus, totalFiles, token, vida_id) {
  console.log('Received ManiCrack:', appid);

  return new Promise(async (resolve, reject) => {
    const timestamp = Date.now();
    const fileDownloadUrl = `${downloadurl}/${file.name}?timestamp=${timestamp}`;

    // Read the games-path.json file
    const gamesPathFileContent = await fs.readFile(gamesPathFilePath, 'utf-8');
    const gamesPathConfig = JSON.parse(gamesPathFileContent);
    // Get the destinationFolder from the config based on the appid
    const destinationFolder = gamesPathConfig[appid]?.downloadPath;

    //const destinationFolder = path.join(userDataPath, 'dgames');
    const filePath = path.join(destinationFolder, file.name);

    try {
      // Remove existing file if it exists
      await fs.unlink(filePath);
    } catch (unlinkError) {
      // Ignore errors if the file doesn't exist
      if (unlinkError.code !== 'ENOENT') {
        reject(unlinkError);
        return;
      }
    }

      // Read the manifest file content
      const manifestFileContent = await axios.get(manifesturl);
      const manifest = manifestFileContent.data;

    const fileProgress = {};
    let totalSize = 0;
    let totalDownloaded = 0;
    let completedFiles = 0;

    const downloaderInstance = new DownloaderHelper(fileDownloadUrl, destinationFolder, {
      fileName: file.name,
      forceResume: true,
      resumeIfFileExists: true,
      removeOnFail: false,
      override: true,
    });

    // Subscribe to error event
    downloaderInstance.on('error', (error) => {
      console.error(`Download error for file ${file.name}:`, error);

      const InfoLog = { vida_id, appid };
      sendErrorToDiscord(InfoLog, error);
    
      reject(error);
    });

        // Store the downloader instance in the downloaders object
    downloaders[`${appid}-${file.name}`] = downloaderInstance;

  fileProgress[file.name] = {
    downloaded: 0,
    total: 0,
  };

  downloaderInstance.on('progress', (stats) => {
    fileProgress[file.name] = {
      downloaded: stats.downloaded,
      total: stats.total,
    };

    if (totalSize === 0) {
      totalSize = manifest.crack.reduce((acc, file) => acc + file.size, 0);
    }

    downloadStatus.progress = stats.progress;
    downloadStatus.downloaded = stats.downloaded;
    downloadStatus.totalSize = stats.total;

    // Use downloadStatus to update progress UI
    event.sender.send('update-progress', {
      appid: appid,
      progress: Math.floor(downloadStatus.progress),
      speed: formatBytes(stats.speed),
      downloaded: formatBytes(downloadStatus.downloaded),
      totalSize: formatBytes(downloadStatus.totalSize),
      fileName: file.name,
    });
  });

    // Subscribe to end event
    downloaderInstance.on('end', async () => {
      console.log(`Downloaded mismatched file ${file.name} for AppId ${appid}`);

      console.log(`Download for AppId ${appid} completed: ${file.name}`);
    event.reply('download-complete', { appid });
    completedFiles++;

    if (totalFiles == completedFiles) {
      totalDownloaded = manifest.crack.reduce((acc, file) => acc + file.size, 0);

      const overallProgress = Math.floor((totalDownloaded / totalSize) * 100);

      // Emit an IPC event to the renderer process with the overall progress details
      event.sender.send('update-progress', {
        appid,
        progress: overallProgress,
        speed: 'N/A',
        downloaded: formatBytes(totalDownloaded),
        totalSize: formatBytes(totalSize),
        fileName: 'All Files',
      });

      // Reset the completed files count for future downloads
      completedFiles = 0;

      // Save the manifest JSON file
  const dgamesFolderPath = path.join(userDataPath, 'dgames');
  const manifestSavePath = path.join(dgamesFolderPath, `manifest_${appid}.json`);

  // Create the dgames folder if it doesn't exist
  await fs.mkdir(dgamesFolderPath, { recursive: true });

  await fs.writeFile(manifestSavePath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Manifest file saved for AppId ${appid} at: ${manifestSavePath}`);

            // Remove the downloader instance when download is complete
      delete downloaders[`${appid}-${file.name}`];
      savePathToJson(destinationFolder, appid, true, true);
      

            // Make a request to remove the download data from the database
      const removeDownloadUrl = `https://api.vidagame.ir/removedownloads/${vida_id}?appid=${appid}`;

      try {
        await axios.post(removeDownloadUrl);
        console.log(`Download data for AppId ${appid} removed from the database`);
      } catch (error) {
        console.error(`Error removing download data for AppId ${appid} from the database:`, error);

        const InfoLog = { vida_id, appid };
        await sendErrorToDiscord(InfoLog, error);
      
      }


    }

      // Continue with any other logic needed after downloading a single file
      // ...
      event.sender.send('show-notification', {
        title: 'نصب کرک',
        message: 'در حال نصب کرک، لطفا صبور باشید',
        type: 'info',
        id: appid,
      });

      try {
        for (const file of manifest.crack) {
            const zipFilePath = path.join(destinationFolder, file.name);
            const extractPath = destinationFolder;
            await _7z.unpack(zipFilePath, extractPath, err => {
              if (err) {
                console.error(`Error extracting ${file.name}:`, err);
                event.reply('download-error', { appid, error: `Error extracting ${file.name}` });

                const InfoLog = { vida_id, appid };
                sendErrorToDiscord(InfoLog, err);
                
                return;
            }
              console.log(`File ${file.name} extracted successfully.`);
              event.sender.send('remove-notification', {id: appid});
  
              fs.unlink(zipFilePath, err => {
                if (err) {
                    console.error(`Error deleting ${zipFilePath}:`, err);

                    const InfoLog = { vida_id, appid };
                    sendErrorToDiscord(InfoLog, err);
                } else {
                    console.log(`Deleted ${zipFilePath} after extraction.`);
                }
            });
          });
  
        }
    } catch (error) {
        console.error('Error extracting files:', error);
        event.reply('download-error', { appid, error: 'Error extracting files' });
        const InfoLog = { vida_id, appid };
        await sendErrorToDiscord(InfoLog, error);      
        return;
    }

      resolve();
    });

    ipcMain.on('stop-download', (event, stopData) => {
      if (stopData.appid === appid) {
        downloaderInstance.stop();
        // Emit an IPC event to inform the renderer process that the download has been stopped
        event.sender.send('download-stopped', { appid });
      }
    });
  
    ipcMain.on('pause-download', (event, pauseData) => {
      if (pauseData.appid === appid) {
        downloaderInstance.pause();
      }
    });
  
    ipcMain.on('resume-download', (event, resumeData) => {
      if (resumeData.appid === appid) {
        downloaderInstance.resume();
      }
    });

    // Start the download
    downloaderInstance.start();
  });
}



// Handle 'end' and 'error' events separately
ipcMain.on('download-complete', (event, appid) => {
  console.log(`Download for AppId ${appid} completed`);
});

ipcMain.on('download-error', (event, appid, error) => {
  console.error(`Download for AppId ${appid} error:`, error);
  const InfoLog = { appid };
  sendErrorToDiscord(InfoLog, error);

});





