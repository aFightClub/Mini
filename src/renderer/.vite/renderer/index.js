"use strict";
const { app, BrowserWindow, ipcMain, dialog, protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
require("url");
if (require("electron-squirrel-startup")) {
  app.quit();
}
const isDev = process.env.ELECTRON_ENV === "development";
let mainWindow;
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    minWidth: 500,
    minHeight: 700,
    resizable: false,
    icon: path.join(__dirname, "../../src/images/icon.png"),
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f6f6f6",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
      // Only for development
    }
  });
  if (isDev) {
    const port = process.env.PORT || 5174;
    const viteDevUrl = `http://localhost:${port}`;
    mainWindow.loadURL(viteDevUrl).catch((e) => {
      console.warn(
        `Could not connect to Vite dev server at ${viteDevUrl}: ${e.message}`
      );
      console.log("Falling back to static dev.html");
      const devPath = path.resolve(__dirname, "../renderer/dev.html");
      mainWindow.loadFile(devPath);
    });
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, "../../src/renderer/index.html");
    mainWindow.loadFile(indexPath);
    console.log(`Loading from file: ${indexPath}`);
  }
};
app.whenReady().then(() => {
  protocol.registerFileProtocol("file", (request, callback) => {
    const pathname = decodeURI(request.url.replace("file:///", ""));
    callback(pathname);
  });
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
ipcMain.handle("handle-dropped-files", async (event, filePaths) => {
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".tiff",
    ".avif"
  ];
  const imageFiles = filePaths.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return imageExtensions.includes(ext);
  });
  return imageFiles;
});
ipcMain.handle("process-image", async (event, { filePath, options }) => {
  console.log(`Processing image: ${filePath} with options:`, options);
  try {
    const { convertToWebp, quality } = options;
    const fileExtension = path.extname(filePath).slice(1).toLowerCase();
    let outputPath = filePath;
    let outputExtension = fileExtension;
    if (convertToWebp) {
      const fileName = path.basename(filePath, path.extname(filePath));
      const dirName = path.dirname(filePath);
      outputPath = path.join(dirName, `${fileName}.webp`);
      outputExtension = "webp";
      console.log(`Converting to WebP - output file: ${outputPath}`);
    }
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      console.log(`File ${filePath} is readable`);
    } catch (err) {
      console.error(`File access error: ${err.message}`);
      return {
        success: false,
        filePath,
        error: `Cannot access file: ${err.message}`
      };
    }
    try {
      await fs.promises.access(path.dirname(outputPath), fs.constants.W_OK);
      console.log(`Directory ${path.dirname(outputPath)} is writable`);
    } catch (err) {
      console.error(`Directory write access error: ${err.message}`);
      return {
        success: false,
        filePath,
        error: `Cannot write to directory: ${err.message}`
      };
    }
    console.log(
      `Starting Sharp processing with output extension: ${outputExtension}`
    );
    let sharpInstance = sharp(filePath);
    const imageInfo = await sharpInstance.metadata();
    console.log(`Image info: ${JSON.stringify(imageInfo)}`);
    sharpInstance = sharp(filePath);
    if (outputExtension === "webp") {
      console.log(`Converting to WebP with quality: ${quality || 80}`);
      sharpInstance = sharpInstance.webp({ quality: quality || 80 });
    } else if (outputExtension === "jpeg" || outputExtension === "jpg") {
      console.log(`Optimizing JPEG with quality: ${quality || 80}`);
      sharpInstance = sharpInstance.jpeg({ quality: quality || 80 });
    } else if (outputExtension === "png") {
      console.log(`Optimizing PNG with quality: ${quality || 80}`);
      sharpInstance = sharpInstance.png({
        quality: quality || 80,
        compressionLevel: 9
      });
    } else {
      console.log(`Using original format: ${imageInfo.format}`);
    }
    console.log(`Generating buffer...`);
    const buffer = await sharpInstance.toBuffer();
    console.log(`Buffer size: ${buffer.length} bytes`);
    console.log(`Writing to file: ${outputPath}`);
    await fs.promises.writeFile(outputPath, buffer);
    console.log(`Successfully wrote file: ${outputPath}`);
    return {
      success: true,
      filePath,
      outputPath: outputPath !== filePath ? outputPath : void 0
    };
  } catch (error) {
    console.error(`Error processing image: ${error.message}`, error);
    return { success: false, filePath, error: error.message };
  }
});
