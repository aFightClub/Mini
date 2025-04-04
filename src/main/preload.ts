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
});
