const { contextBridge, ipcRenderer } = require("electron");

// Listen for update messages from the main process
ipcRenderer.on("update-message", (event, text) => {
  // Store update messages to be retrieved by the renderer
  if (!window.updateMessages) {
    window.updateMessages = [];
  }
  window.updateMessages.push(text);

  // Dispatch a custom event that the renderer can listen for
  window.dispatchEvent(new CustomEvent("update-message", { detail: text }));
});

contextBridge.exposeInMainWorld("electronAPI", {
  selectImages: () => ipcRenderer.invoke("select-images"),
  processImage: (data) => ipcRenderer.invoke("process-image", data),
  handleDroppedFiles: (filePaths) =>
    ipcRenderer.invoke("handle-dropped-files", filePaths),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  onUpdateMessage: (callback) => {
    // Create a listener for the custom event
    const listener = (event) => {
      callback(event.detail);
    };
    window.addEventListener("update-message", listener);
    return () => {
      window.removeEventListener("update-message", listener);
    };
  },
  getUpdateMessages: () => {
    return window.updateMessages || [];
  },
});
