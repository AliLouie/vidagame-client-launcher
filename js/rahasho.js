const { ipcMain } = require('electron');
const sudo = require('sudo-prompt');
const network = require('network');
const { exec } = require('child_process');


function setDNS(interfaceName, primaryDNS, secondaryDNS) {
  const command = `netsh interface ip set dns "${interfaceName}" static ${primaryDNS} & netsh interface ip add dns "${interfaceName}" ${secondaryDNS} index=2`;

  const options = {
    name: 'DNS Setter',
  };

  return new Promise((resolve, reject) => {
    sudo.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        reject(error);
      } else if (stderr) {
        console.error(`stderr: ${stderr}`);
        reject(new Error(stderr));
      } else {
        console.log(`DNS settings updated successfully for ${interfaceName}`);
        resolve(stdout);
      }
    });
  });
}

function getActiveInterface() {
  return new Promise((resolve, reject) => {
    network.get_active_interface((err, activeInterface) => {
      if (err) {
        reject(err);
      } else {
        resolve(activeInterface);
      }
    });
  });
}

ipcMain.handle('set-dns', async (event, primaryDNS, secondaryDNS) => {
  try {
    const activeInterface = await getActiveInterface();
    const interfaceName = activeInterface.name;
    await setDNS(interfaceName, primaryDNS, secondaryDNS);
    return { success: true, message: 'DNS settings updated successfully' };
  } catch (error) {
    console.error('An error occurred:', error);
    return { success: false, message: error.message };
  }
});


function clearDNS(interfaceName) {
    const command = `netsh interface ip set dns "${interfaceName}" dhcp`;
  
    const options = {
      name: 'DNS Clearer',
    };
  
    return new Promise((resolve, reject) => {
      sudo.exec(command, options, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          reject(error);
        } else if (stderr) {
          console.error(`stderr: ${stderr}`);
          reject(new Error(stderr));
        } else {
          console.log(`DNS settings cleared successfully for ${interfaceName}`);
          resolve(stdout);
        }
      });
    });
  }

  ipcMain.handle('clear-dns', async (event) => {
    try {
      const activeInterface = await getActiveInterface();
      const interfaceName = activeInterface.name;
      await clearDNS(interfaceName);
      return { success: true, message: 'DNS settings cleared successfully' };
    } catch (error) {
      console.error('An error occurred:', error);
      return { success: false, message: error.message };
    }
  });


  function pingDNS(dnsServer) {
    return new Promise((resolve) => {
      const command = process.platform === 'win32' 
        ? `ping -n 4 ${dnsServer}` 
        : `ping -c 4 ${dnsServer}`;
  
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error pinging ${dnsServer}:`, error);
          resolve('Error');
          return;
        }
  
        if (stderr) {
          console.error(`Stderr while pinging ${dnsServer}:`, stderr);
          resolve('Error');
          return;
        }
  
        // Parse the output to get the average ping time
        const match = stdout.match(/Average = (\d+)ms/);
        if (match && match[1]) {
          resolve(`${match[1]}`);
        } else {
          console.error(`Couldn't parse ping output for ${dnsServer}:`, stdout);
          resolve('Parse error');
        }
      });
    });
  }
  
  ipcMain.handle('ping-dns', async (event, primaryDNS, secondaryDNS) => {
    try {
      const [primaryResult, secondaryResult] = await Promise.all([
        pingDNS(primaryDNS),
        pingDNS(secondaryDNS)
      ]);
  
      return {
        primary: primaryResult,
        secondary: secondaryResult
      };
    } catch (error) {
      console.error('An error occurred during ping:', error);
      return { 
        primary: 'Error occurred',
        secondary: 'Error occurred'
      };
    }
  });