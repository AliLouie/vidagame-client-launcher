// main.js
const electron = require('electron');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const downloadsystem = require('./js/downloadsystem')
const promptnode = require('./js/promptnode')
const updatechecker = require('./js/updatechecker')
const modemanager = require('./js/mode-manager')
const rahasho = require('./js/rahasho')
const ProgressBar = require('electron-progressbar-customhtml');
const windowStateKeeper = require('electron-window-state');
const fs = require('fs').promises;




let mainWindow;
let progressBar;


function createWindow() {
  let mainWindowState = windowStateKeeper({
    defaultWidth: 1300,
    defaultHeight: 800
  });

  mainWindow = new BrowserWindow({
    'x': mainWindowState.x,
    'y': mainWindowState.y,
    'width': mainWindowState.width,
    'height': mainWindowState.height,
    minHeight: 300,
    minWidth: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  progressBar = new ProgressBar({
    title: 'VidaGame Loading...',
    text: 'Preparing data...',
    window: mainWindow,
    backgroundColor: '#111214',
    style:{
      bar: {
				'background': '#FFD2CF'
			},
      value: {
				'background': '#F44336'
			}
    },
    options: {
      color: '#29d', // Color of the progress bar
      delay: 1000, // Delay in milliseconds before showing the progress bar
    },
  });

  mainWindow.loadURL('https://vidagame.ir/'); // React app runs on this URL // https://vidagame.ir/ | http://localhost:3000/
  mainWindow.setBackgroundColor('#111214')

    // IPC listener to check and set the token
    ipcMain.on('check-token', async (event) => {
      const userDataPath = app.getPath('userData');
      const tokenFilePath = path.join(userDataPath, 'token.json');
  
      try {
        // Check if the token exists in local storage
        const tokenExists = await mainWindow.webContents.executeJavaScript('localStorage.getItem("@secure.s.token");', true);
  
        if (!tokenExists) {
          // If token doesn't exist, read it from token.json
          const tokenFileContent = await fs.readFile(tokenFilePath, 'utf-8');
          const tokenData = JSON.parse(tokenFileContent);
  
          if (tokenData.token) {
            // Set the token in local storage
            await mainWindow.webContents.executeJavaScript(`localStorage.setItem("@secure.s.token", "${tokenData.token}");`);
            console.log('Token added to local storage:', tokenData.token);
            event.reply('token-checked');
          }
        } else {
          console.log('Token already exists in local storage.');
        }
      } catch (error) {
        console.error('Error checking or setting token:', error);
      }
    });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

    // Once the window is ready to show, hide the progress bar
    mainWindow.once('ready-to-show', () => {
      progressBar.close();
      mainWindow.show();
    });
    mainWindowState.manage(mainWindow);
}

app.whenReady().then(createWindow);


app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

if (process.platform === 'win32') {
  app.setAppUserModelId(app.name);
}

ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.restore();
  } else {
    mainWindow.maximize();
  }
});
