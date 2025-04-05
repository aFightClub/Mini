const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  Menu,
} = require("electron");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const url = require("url");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

// Configure logging
log.transports.file.level = "debug";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Determine if we're in development or production
const isDev = process.env.ELECTRON_ENV === "development" || !app.isPackaged;

// Auto-updater events
function sendStatusToWindow(text) {
  log.info(text);
  if (mainWindow) {
    mainWindow.webContents.send("update-message", text);
  }
}

autoUpdater.on("checking-for-update", () => {
  sendStatusToWindow("Checking for update...");
});

autoUpdater.on("update-available", (info) => {
  sendStatusToWindow("Update available. Downloading...");
});

autoUpdater.on("update-not-available", (info) => {
  sendStatusToWindow("Application is up to date.");
});

autoUpdater.on("error", (err) => {
  sendStatusToWindow(`Error in auto-updater: ${err.toString()}`);
});

autoUpdater.on("download-progress", (progressObj) => {
  sendStatusToWindow(
    `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`
  );
});

autoUpdater.on("update-downloaded", (info) => {
  sendStatusToWindow("Update downloaded. Will install on quit.");

  // Notify the user that an update is ready
  dialog
    .showMessageBox({
      type: "info",
      title: "Update Ready",
      message:
        "A new version has been downloaded. Restart the application to apply the updates.",
      buttons: ["Restart", "Later"],
    })
    .then((returnValue) => {
      if (returnValue.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

let mainWindow;

// Create the browser window
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
      webSecurity: !isDev, // Only allow web security to be disabled in development
    },
  });

  // Create application menu
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Check for Updates",
          click: () => {
            autoUpdater.checkForUpdatesAndNotify();
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        ...(isDev ? [{ role: "toggleDevTools" }] : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      role: "window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            const { shell } = require("electron");
            await shell.openExternal("https://github.com/aFightClub/Mini");
          },
        },
        {
          label: "About Mini",
          click: () => {
            dialog.showMessageBox({
              title: "About Mini",
              message: "Mini - Simple Image Optimizer",
              detail: `Version: ${app.getVersion()}\n\nA lightweight tool for optimizing images for web use.\n\n© 2024 aFightClub`,
              type: "info",
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // In development mode, try to use Vite dev server first, then fallback to dev.html
  if (isDev) {
    const port = process.env.PORT || 5174;
    const viteDevUrl = `http://localhost:${port}`;

    // Try connecting to Vite dev server
    mainWindow.loadURL(viteDevUrl).catch((e) => {
      console.warn(
        `Could not connect to Vite dev server at ${viteDevUrl}: ${e.message}`
      );
      console.log("Falling back to static dev.html");

      // Fallback to dev.html
      const devPath = path.resolve(__dirname, "../renderer/dev.html");
      mainWindow.loadFile(devPath);
    });

    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files from the Vite output directory
    const indexPath = path.join(__dirname, "../../dist/index.html");
    mainWindow.loadFile(indexPath);
    console.log(`Loading from file: ${indexPath}`);
  }
};

// Allow loading local resources
app.whenReady().then(() => {
  if (!isDev) {
    // For production builds, set content security policy
    protocol.registerBufferProtocol("file", (request, callback) => {
      const filePath = decodeURI(request.url.replace("file:///", ""));
      try {
        const data = fs.readFileSync(filePath);
        const mimeType =
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".ico": "image/x-icon",
          }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
        callback({ mimeType, data });
      } catch (error) {
        console.error(error);
        callback({ error: -2 /* net::FAILED */ });
      }
    });
  } else {
    // For development, just register the file protocol without CSP
    protocol.registerFileProtocol("file", (request, callback) => {
      const pathname = decodeURI(request.url.replace("file:///", ""));
      callback(pathname);
    });
  }

  createWindow();

  // Check for updates after app is ready
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 3000);
  }

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

// IPC handler for checking updates manually
ipcMain.handle("check-for-updates", () => {
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
    return true;
  }
  return false;
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("select-images", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "gif", "webp", "tiff", "avif"],
      },
    ],
  });

  if (canceled) {
    return [];
  }

  return filePaths;
});

// Handle file drop events
ipcMain.handle("handle-dropped-files", async (event, filePaths) => {
  console.log("Received dropped files:", filePaths);

  // Check for valid paths
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    console.error("Invalid file paths received:", filePaths);
    return [];
  }

  // Normalize paths to handle different OS path formats
  const normalizedPaths = filePaths
    .map((filePath) => {
      // Skip blob URLs as they can't be processed in the main process
      if (filePath.startsWith("blob:")) {
        console.log(`Skipping blob URL: ${filePath}`);
        return null;
      }

      // Convert URL to path if needed (for packaged apps)
      if (filePath.startsWith("file://")) {
        try {
          return url.fileURLToPath(filePath);
        } catch (err) {
          console.error(`Error converting file URL: ${err.message}`);
          return filePath;
        }
      }
      return filePath;
    })
    .filter(Boolean); // Remove null values

  if (normalizedPaths.length === 0) {
    console.error("No valid file paths after normalization");
    return [];
  }

  // Filter only image files
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".tiff",
    ".avif",
  ];

  const imageFiles = normalizedPaths.filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const isImage = imageExtensions.includes(ext);
    console.log(`File: ${filePath}, Extension: ${ext}, Is Image: ${isImage}`);
    return isImage;
  });

  console.log(`Found ${imageFiles.length} valid image files:`, imageFiles);
  return imageFiles;
});

ipcMain.handle("process-image", async (event, { filePath, options }) => {
  console.log(`Processing image: ${filePath} with options:`, options);

  try {
    const { convertToWebp, quality } = options;
    const fileExtension = path.extname(filePath).slice(1).toLowerCase();

    // Determine output path - create a new file for WebP conversion
    let outputPath = filePath;
    let outputExtension = fileExtension;

    if (convertToWebp) {
      // For WebP conversion, create a new file with .webp extension
      const fileName = path.basename(filePath, path.extname(filePath));
      const dirName = path.dirname(filePath);
      outputPath = path.join(dirName, `${fileName}.webp`);
      outputExtension = "webp";
      console.log(`Converting to WebP - output file: ${outputPath}`);
    }

    // Check if file exists and is readable
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      console.log(`File ${filePath} is readable`);
    } catch (err) {
      console.error(`File access error: ${err.message}`);
      return {
        success: false,
        filePath,
        error: `Cannot access file: ${err.message}`,
      };
    }

    // Check if output directory is writable
    try {
      await fs.promises.access(path.dirname(outputPath), fs.constants.W_OK);
      console.log(`Directory ${path.dirname(outputPath)} is writable`);
    } catch (err) {
      console.error(`Directory write access error: ${err.message}`);
      return {
        success: false,
        filePath,
        error: `Cannot write to directory: ${err.message}`,
      };
    }

    console.log(
      `Starting Sharp processing with output extension: ${outputExtension}`
    );

    let sharpInstance = sharp(filePath);
    const imageInfo = await sharpInstance.metadata();
    console.log(`Image info: ${JSON.stringify(imageInfo)}`);

    // Clone the sharp instance before applying format-specific operations
    sharpInstance = sharp(filePath);

    // Set the output format based on the options
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
        compressionLevel: 9,
      });
    } else {
      // For other formats, just use the input format
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
      outputPath: outputPath !== filePath ? outputPath : undefined,
    };
  } catch (error) {
    console.error(`Error processing image: ${error.message}`, error);
    return { success: false, filePath, error: error.message };
  }
});

// Handle file data transmitted from the renderer
ipcMain.handle("save-dropped-file", async (event, { name, type, buffer }) => {
  try {
    // Create a temp directory if it doesn't exist
    const tempDir = path.join(app.getPath("temp"), "mini-app-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Save the file to a temporary location
    const tempFilePath = path.join(tempDir, name);
    await fs.promises.writeFile(tempFilePath, Buffer.from(buffer));

    console.log(`Saved dropped file to temporary location: ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    console.error(`Error saving dropped file: ${error.message}`);
    return null;
  }
});
