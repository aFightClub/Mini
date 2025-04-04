const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectImages: () => ipcRenderer.invoke("select-images"),
  processImage: (data) => ipcRenderer.invoke("process-image", data),
  handleDroppedFiles: (filePaths) =>
    ipcRenderer.invoke("handle-dropped-files", filePaths),
});
