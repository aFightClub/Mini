"use strict";
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
if (require("electron-squirrel-startup")) {
  app.quit();
}
let mainWindow;
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (isDev && process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${process.env.MAIN_WINDOW_VITE_NAME || "main_window"}/index.html`
      )
    );
  }
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
};
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
ipcMain.handle("select-images", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "gif", "webp", "tiff", "avif"]
      }
    ]
  });
  if (canceled) {
    return [];
  }
  return filePaths;
});
ipcMain.handle("process-image", async (event, { filePath, options }) => {
  try {
    const { convertToWebp, quality } = options;
    const extension = convertToWebp ? "webp" : path.extname(filePath).slice(1);
    const outputPath = filePath;
    let sharpInstance = sharp(filePath);
    if (extension === "webp") {
      sharpInstance = sharpInstance.webp({ quality: quality || 80 });
    } else if (extension === "jpeg" || extension === "jpg") {
      sharpInstance = sharpInstance.jpeg({ quality: quality || 80 });
    } else if (extension === "png") {
      sharpInstance = sharpInstance.png({ quality: quality || 80 });
    }
    const buffer = await sharpInstance.toBuffer();
    await fs.promises.writeFile(outputPath, buffer);
    return { success: true, filePath };
  } catch (error) {
    return { success: false, filePath, error: error.message };
  }
});
