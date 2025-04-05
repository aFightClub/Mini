import { contextBridge, ipcRenderer } from "electron";

// Interface for the response from processImage
interface ProcessImageResult {
  success: boolean;
  filePath: string;
  error?: string;
  outputPath?: string;
}

// Define the API exposed to the renderer
contextBridge.exposeInMainWorld("electronAPI", {
  // Select image files dialog
  selectImages: () => ipcRenderer.invoke("select-images"),

  // Process an image with options
  processImage: (data: {
    filePath: string;
    options: { convertToWebp: boolean; quality: number };
  }) =>
    ipcRenderer.invoke("process-image", data) as Promise<ProcessImageResult>,

  // Handle files dropped into the app
  handleDroppedFiles: (filePaths: string[]) =>
    ipcRenderer.invoke("handle-dropped-files", filePaths) as Promise<string[]>,

  // Handle dropped file with buffer transfer (for packaged app)
  saveDroppedFile: (data: {
    name: string;
    type: string;
    buffer: ArrayBuffer;
  }) => ipcRenderer.invoke("save-dropped-file", data) as Promise<string>,

  // Check for updates
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),

  // Get app version
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  // Update message handling
  onUpdateMessage: (callback: (message: string) => void) => {
    const subscription = (_event: any, message: string) => callback(message);
    ipcRenderer.on("update-message", subscription);
    return () => {
      ipcRenderer.removeListener("update-message", subscription);
    };
  },

  // Get existing update messages
  getUpdateMessages: () => ipcRenderer.invoke("get-update-messages"),
});
