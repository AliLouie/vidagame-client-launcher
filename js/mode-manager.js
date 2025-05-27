const { app, BrowserWindow, ipcMain } = require('electron');
const { DownloaderHelper } = require('node-downloader-helper');
const path = require('path');
const fs = require('fs').promises;
const _7z = require('7zip-min-electron');



ipcMain.on('mode-download-file', async (event, args) => {
    
        const { properties, appid, downloadPath, id, mode_name, game_type, downloadurl, directory, size, version, token } = args;
  
        console.log('Received info:', directory);

        const GameDownloadedPath = downloadPath

        saveModePathToJson(GameDownloadedPath, appid, id, mode_name, game_type, directory, size, version, false, true, false);

        try {

      
          // Start the download
          const dl = new DownloaderHelper(downloadurl, downloadPath, {
            forceResume: true,
            resumeIfFileExists: true,
            removeOnFail: false,
            override: true,
            retry: { maxRetries: 5, delay: 5000 },
          });

          // Subscribe to error event
          dl.on('error', (error) => {
            console.error(`Download error for file ${mode_name}:`, error);
            reject(error);
          });

          dl.on('progress', (stats) => {
            const progress = (stats.progress);
            const speed = formatBytes(stats.speed) + '/s';
            const downloaded = formatBytes(stats.downloaded);
            const totalSize = formatBytes(stats.total);

            //console.log("download progress info:", progress, speed, downloaded, totalSize)
        
            // Use downloadStatus to update progress UI
            event.sender.send('update-mode-progress', {
              id,
              progress,
              speed,
              downloaded,
              totalSize,
            });
          });

          ipcMain.on('stop-download', (event, stopData) => {
            if (stopData.id === id) {
              dl.stop();
              // Emit an IPC event to inform the renderer process that the download has been stopped
              event.sender.send('download-stopped', { id });
            }
          });

          dl.on('end', async () => {
            console.log('Download completed');
            //await saveModePathToJson(GameDownloadedPath, appid, id, mode_name, game_type, directory, size, version, true, true, false);
            //event.sender.send('download-mods-completed', { appid, savePath: downloadPath });

            try {
              // Extract the file name from the downloadurl
              const fileName = downloadurl.split('/').pop();
            
              // Construct the path to the downloaded file
              const downloadedFilePath = path.join(downloadPath, fileName);

              event.sender.send('show-notification', {
                title: 'نصب مود',
                message: 'مود شما در حال نصب است لطفا تا مشاهده پیام موفقیت آمیز برنامه را نبندید و صبور باشید',
                type: 'info',
                id: id,
              });
            
              const extractPromise = new Promise((resolve, reject) => {
                _7z.unpack(downloadedFilePath, downloadPath, err => {
                  if (err) {
                    console.error(`Error extracting ${fileName}:`, err);
                    event.reply('download-error', { appid, error: `Error extracting ${fileName}` });
                    reject(err);
                  } else {
                    console.log(`File ${fileName} extracted successfully.`);
                    event.sender.send('remove-notification', {id: id});
                    resolve();

                    fs.unlink(downloadedFilePath, err => {
                      if (err) {
                        console.error(`Error deleting ${fileName}:`, err);
                      } else {
                        console.log(`Deleted ${fileName} after extraction.`);
                      }
                    });

                  }
                });
              });
            
              await extractPromise;
            
              await saveModePathToJson(GameDownloadedPath, appid, id, mode_name, game_type, directory, size, version, true, true, false);

              event.sender.send('download-mods-completed', { appid, savePath: downloadPath });
            
              console.log('File extracted successfully');
            } catch (error) {
              console.error('Error extracting file:', error);
            }
            

          });
      
          dl.start();
        } catch (error) {
          console.error('Error downloading mode:', error);
        }
     
  
  });


  ipcMain.on('handle-enable-mod', async (event, args) => {
    const { downloadPath, id, mode_name, user_login, token } = args;
    const appid = args.appid; // Assuming appid is a property of args
  
    try {
      // Read the existing mods-path.json file
      const jsonFilePath = path.join(app.getPath('userData'), 'mods-path.json');
      const existingData = await fs.readFile(jsonFilePath, 'utf-8');
      const existingJsonData = JSON.parse(existingData);
  
      // Find the mod in the mods array
      const modIndex = existingJsonData[appid].mods.findIndex(mod => mod.id === id && mod.mode_name === mode_name);
  
      if (modIndex !== -1) {
        // Toggle the status property of the mod
        existingJsonData[appid].mods[modIndex].status = !existingJsonData[appid].mods[modIndex].status;
  
        // Convert the updated JSON data to a string
        const jsonString = JSON.stringify(existingJsonData, null, 2);
  
        // Write the updated JSON string to the file
        await fs.writeFile(jsonFilePath, jsonString, 'utf-8');
  
        console.log(`Mode status updated for appid ${appid}, id ${id}`);
  
        // Send the updated mod data to the renderer process
        event.sender.send('mod-status-updated', existingJsonData[appid].mods[modIndex]);

        // Update the DayZ.Bat file if appid is 221100
      if (appid === '221100') {

      const batFilePath = path.join(downloadPath, 'DayZ.bat');

      const enabledMods = existingJsonData[appid].mods
        .filter(mod => mod.status)
        .map(mod => mod.directory);


      const modsString = enabledMods.length > 0 ? enabledMods.join(';') : '';

      const commandLine = `start DayZ_x64.exe -name=${user_login} "-mod=${modsString}"`;

      await fs.writeFile(batFilePath, commandLine, 'utf-8');

      console.log('DayZ.bat updated successfully.');
      }
      //-----------------------

      //------------
      //Valheim BepInexPack:
      if (appid === '892970' && id.toString() === '13') {
        const iniFilePath = path.join(downloadPath, 'doorstop_config.ini');
              
        // Read the contents of the doorstop_config.ini file
        let iniFileData = await fs.readFile(iniFilePath, 'utf-8');

        // Check if the enabled parameter is set to true
        const enabledRegex = /enabled=(\w+)/;
        const match = iniFileData.match(enabledRegex);
        const isEnabled = match && match[1].toLowerCase() === 'true';

        // Toggle the enabled parameter based on its current value
        if (isEnabled) {
          iniFileData = iniFileData.replace(enabledRegex, 'enabled=false');
          console.log('enabled parameter set to false.');
        } else {
          iniFileData = iniFileData.replace(enabledRegex, 'enabled=true');
          console.log('enabled parameter set to true.');
        }

        // Write the updated data back to the doorstop_config.ini file
        await fs.writeFile(iniFilePath, iniFileData, 'utf-8');

        console.log('doorstop_config.ini updated successfully.');

      }

      // Valheim Bepinex Mods:
      if (appid === '892970' && id.toString() !== '13') {
        const pluginsFolder = path.join(downloadPath, 'BepInEx/plugins');
        const offPluginsFolder = path.join(downloadPath, 'BepInEx/offplugins');
        const modeFolderPath = path.join(offPluginsFolder, mode_name);
        const destinationPath = path.join(pluginsFolder, mode_name);
      
        try {
          // Check if the mode folder exists in the offplugins folder
          const modeExists = await fs.access(modeFolderPath, fs.constants.F_OK)
            .then(() => true)
            .catch(() => false);
      
          if (modeExists) {
            // Move the folder from offplugins to plugins
            await fs.rename(modeFolderPath, destinationPath);
            console.log(`Moved ${mode_name} from offplugins to plugins`);
          } else {
            // Check if the mode folder exists in the plugins folder
            const pluginModeExists = await fs.access(destinationPath, fs.constants.F_OK)
              .then(() => true)
              .catch(() => false);
      
            if (pluginModeExists) {
              // Move the folder from plugins to offplugins
              await fs.rename(destinationPath, modeFolderPath);
              console.log(`Moved ${mode_name} from plugins to offplugins`);
            }
          }
        } catch (err) {
          console.error(`Error moving ${mode_name} folder:`, err);
        }
      }
      //-------------

      } else {
        console.error(`Mode not found for appid ${appid}, id ${id}`);
      }
    } catch (error) {
      console.error('Error updating mode status:', error);
    }
  });


  ipcMain.on('check-mod-updates', async (event, modeData) => {
    try {
      // Read the mods-path.json file
      const jsonFilePath = path.join(app.getPath('userData'), 'mods-path.json');
      const existingData = await fs.readFile(jsonFilePath, 'utf-8');
      const existingJsonData = JSON.parse(existingData);
  
      // Iterate over the received mode data and check for version mismatches
      for (const mod of modeData) {
        const appid = mod.appid;
        const modId = mod.id;
        const localMod = existingJsonData[appid]?.mods.find(m => m.id === modId);
  
        if (localMod && localMod.version !== mod.version) {
          // Version mismatch, update the 'updated' property
          localMod.updated = false;
        }
      }
  
      // Write the updated JSON data to the file
      const jsonString = JSON.stringify(existingJsonData, null, 2);
      await fs.writeFile(jsonFilePath, jsonString, 'utf-8');
  
      console.log('Mod updates checked and mods-path.json updated');
    } catch (error) {
      console.error('Error checking mod updates:', error);
    }
  });

  ipcMain.on('delete-mod', async (event, args) => {
    const { id, mode_name, downloadPath, directory, token } = args;
    const appid = args.appid; // Assuming appid is a property of args
  
    try {
      // Read the existing mods-path.json file
      const jsonFilePath = path.join(app.getPath('userData'), 'mods-path.json');
      const existingData = await fs.readFile(jsonFilePath, 'utf-8');
      const existingJsonData = JSON.parse(existingData);
  
      // Find the mod in the mods array
      const modIndex = existingJsonData[appid].mods.findIndex(mod => mod.id === id && mod.mode_name === mode_name);
  
      if (modIndex !== -1) {
        // Remove the mod from the mods array
        existingJsonData[appid].mods.splice(modIndex, 1);
  
        // Convert the updated JSON data to a string
        const jsonString = JSON.stringify(existingJsonData, null, 2);
  
        // Write the updated JSON string to the file
        await fs.writeFile(jsonFilePath, jsonString, 'utf-8');

        const fileName = directory
        const downloadedFilePath = path.join(downloadPath, fileName);
        try {
          await fs.rm(downloadedFilePath, { recursive: true });
          console.log(`Game Mode directory for id ${id} deleted successfully.`);
          // Optionally, you may want to update the downloadedGames state and notify the renderer.
        } catch (error) {
          console.error(`Error deleting game Mode directory for id ${id}:`, error);
        }
  
        console.log(`Mode deleted for appid ${appid}, id ${id}`);
  
        // Send the updated mod data to the renderer process
        event.sender.send('mod-deleted', { appid, id, mode_name });

        const currentWindow = BrowserWindow.getFocusedWindow();
        if (currentWindow) {
          currentWindow.reload();
        }
  
      } else {
        console.error(`Mode not found for appid ${appid}, id ${id}`);
      }
    } catch (error) {
      console.error('Error deleting mode:', error);
    }
  });

  ipcMain.on('request-downloaded-mods', async (event) => {
    const jsonFilePath = path.join(app.getPath('userData'), 'mods-path.json');
  
    try {
      const data = await fs.readFile(jsonFilePath, 'utf-8');
      const downloadedMods = JSON.parse(data);
  
      // Log the downloaded games for debugging
      //console.log('Downloaded mods:', downloadedMods);
  
      event.reply('downloaded-mods', downloadedMods);
    } catch (error) {
      console.error('Error reading games-path.json:', error);
      event.reply('downloaded-games', {}); // Send an empty object in case of an error
    }
  });

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}



  async function saveModePathToJson(GameDownloadedPath, appid, id, mode_name, game_type, directory, size, version, installed = true, updated = true, status = false) {
    const jsonFilePath = path.join(app.getPath('userData'), 'mods-path.json');
    console.log("info:", GameDownloadedPath, mode_name, appid);
  
    try {
      // Read existing data from the file
      let existingJsonData = {};
      try {
        const existingData = await fs.readFile(jsonFilePath, 'utf-8');
        existingJsonData = JSON.parse(existingData);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
  
      // Update or add the new data
      if (!existingJsonData[appid]) {
        existingJsonData[appid] = {
          downloadPath: GameDownloadedPath,
          mods: []
        };
      }
  
      // Check if the mod already exists in the mods array
      const modIndex = existingJsonData[appid].mods.findIndex(mod => mod.id === id && mod.mode_name === mode_name);
  
      if (modIndex !== -1) {
        // Update the existing mod
        existingJsonData[appid].mods[modIndex] = { id, mode_name, game_type, directory, installed, updated, status, size, version };
      } else {
        // Add a new mod
        existingJsonData[appid].mods.push({ id, mode_name, game_type, directory, installed, updated, status, size, version });
      }
  
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
            downloadPath: GameDownloadedPath,
            mods: [{ id, mode_name, game_type, directory, installed, updated, status, size, version }]
          }
        };
  
        // Convert JSON data to string
        const jsonString = JSON.stringify(jsonData, null, 2);
  
        // Write the JSON string to the file
        await fs.writeFile(jsonFilePath, jsonString, 'utf-8');
  
        console.log(`Download path for appid ${appid} saved to a new file: ${jsonFilePath}`);
      } else {
        console.error('Error writing to the JSON file:', error);
      }
    }
  }
  