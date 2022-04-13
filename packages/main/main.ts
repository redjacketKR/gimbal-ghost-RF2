import {
    app, BrowserWindow, ipcMain, shell, screen, BrowserWindowConstructorOptions,
} from 'electron';
import { release } from 'os';
import { join } from 'path';
import { registerIPCEvents } from './ipc/ipc';
import { Settings } from './settings';

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) {
    app.disableHardwareAcceleration();
}

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') {
    app.setAppUserModelId(app.getName());
}

// Force app to have a single instance
if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

let window: BrowserWindow | null = null;

async function createWindow() {
    const windowOptions: BrowserWindowConstructorOptions = {
        webPreferences: {
            preload: join(__dirname, '../preload/preload.cjs'),
        },
        width: 800,
        height: 600,
        autoHideMenuBar: true,
        resizable: false,
        maximizable: false,
    };

    if (Settings.get('firstLoad')) {
        Settings.set('firstLoad', false);
    }
    else {
        windowOptions.x = Settings.get('windowPosition').x;
        windowOptions.y = Settings.get('windowPosition').y;
    }

    window = new BrowserWindow(windowOptions);
    // No menu is needed
    window.removeMenu();

    // Save the last position of the window
    window.on('moved', () => {
        const windowBounds = window?.getBounds();
        if (windowBounds) {
            Settings.set('windowPosition', { x: windowBounds.x, y: windowBounds.y });
        }
    });

    // If we are in production then grab index locally
    if (app.isPackaged) {
        window.loadFile(join(__dirname, '../renderer/index.html'));
    }
    // Otherwise use the dev server
    else {
        // Vite Environment variables set in watch script
        // Avoid process.env.<var> syntax which vite statically replaces
        // See: https://vitejs.dev/guide/env-and-mode.html#production-replacement
        // eslint-disable-next-line dot-notation
        const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`;
        window.loadURL(url);
        window.webContents.openDevTools({ mode: 'detach', activate: false });
    }

    // Make all links open with the browser, not with the application
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });
}

// Ensure render process is sandboxed
app.enableSandbox();

app.whenReady().then(() => {
    registerIPCEvents();
    createWindow();
});

app.on('window-all-closed', () => {
    window = null;
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('second-instance', () => {
    if (window) {
        // Focus on the main window if the user tried to open another
        if (window.isMinimized()) {
            window.restore();
        }
        window.focus();
    }
});

app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length) {
        allWindows[0].focus();
    }
    else {
        createWindow();
    }
});
