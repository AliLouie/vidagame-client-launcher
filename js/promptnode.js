const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const childProcess = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const log = require('electron-log');
const Store = require('electron-store');
const store = new Store();

// Function to check if Node.js is installed
function isNodeInstalled() {
    try {
        childProcess.execSync('node --version');
        return true;
    } catch (error) {
        log.info("Node js is Not installed");
        return false;
    }
}

// Check if Node.js is installed when the app is ready
app.whenReady().then(() => {
    if (!isNodeInstalled()) {
        showDialog();
    }
});

async function showDialog() {
    const { response } = await dialog.showMessageBox(
        new BrowserWindow({
            show: false,
            alwaysOnTop: true
        }),
        {
            type: 'question',
            buttons: ['دانلود از سایت رسمی', 'دانلود با لینک مستقیم', 'پیش نیاز را نصب کردم'],
            defaultId: 0,
            cancelId: 3,
            title: 'Node JS Required',
            message: 'در حال حاضر شما برنامه پیش نیاز لانچر را نصب ندارید لطفا آن را نصب کنید',
        });

    if (response === 0) {
        // Open the URL in the browser
        shell.openExternal("https://nodejs.org/");
        if (!isNodeInstalled()) {
            showDialog();
        }
    } else if (response === 1) {
        shell.openExternal("https://dl2.pantigame.ir/cdn/vidagame/launcher/node-v20.12.1-x64.msi");
        if (!isNodeInstalled()) {
            showDialog();
        }
    } else if (response === 2) {
        app.relaunch()
        app.exit()
    } else if (response === 3) {
        app.exit()
    } else {
        // If the user closes the dialog and Node.js is still not installed, show the dialog again
        if (!isNodeInstalled()) {
            showDialog();
        }
    }
}

// This code for debug purposes
// app.on('ready', function () {
//     console.log("hey, I'm ready too!");   
//     showDialog();
// });

    // IPC listener to save the token
ipcMain.on('save-token', async (event, token) => {
    
    try {
        store.set('token', token);
        console.log('Token saved:', token);
    } catch (error) {
        console.error('Error writing token', error);
    }
    });

ipcMain.on('delete-token', async () => {
    try {
        store.delete('token');
        console.log('token in UserData deleted successfully');
    } catch (error) {
        console.error('Error deleting token:', error);
    }
    });

// IPC listener to send current app version
ipcMain.on('get-app-version', (event) => {
const version = app.getVersion(); // Get the current app version
event.reply('app-version', version); // Send the version back to the renderer process
});

ipcMain.on('open-web-external', async (event, route) => {
    try {
        shell.openExternal(route);
                
    } catch (error) {
      console.error('Error:', error);
    }
  });