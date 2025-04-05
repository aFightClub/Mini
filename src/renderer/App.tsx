import React, { useState, useEffect, useRef, DragEvent } from 'react';
import './App.css';

interface ImageItem {
  id: string;
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  outputPath?: string;
}

// This matches the type in preload.ts
interface ProcessImageResult {
  success: boolean;
  filePath: string;
  error?: string;
  outputPath?: string;
}

// For TypeScript to recognize file.path property in DataTransferItem
interface FileWithPath extends File {
  path: string;
}

// Replace the existing window.electronAPI declaration
declare global {
  interface Window {
    electronAPI: {
      selectImages: () => Promise<string[]>;
      processImage: (data: { 
        filePath: string, 
        options: { convertToWebp: boolean, quality: number } 
      }) => Promise<ProcessImageResult>;
      handleDroppedFiles: (filePaths: string[]) => Promise<string[]>;
      saveDroppedFile: (data: { name: string, type: string, buffer: ArrayBuffer }) => Promise<string>;
      checkForUpdates: () => Promise<boolean>;
      getAppVersion: () => Promise<string>;
      onUpdateMessage: (callback: (message: string) => void) => () => void;
      getUpdateMessages: () => string[];
    }
  }
}

const App: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [convertToWebp, setConvertToWebp] = useState(false);
  const [quality, setQuality] = useState(80);
  const [totalProgress, setTotalProgress] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const settingsRef = useRef<HTMLDivElement>(null);
  const debugLogRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Get app version on load
  useEffect(() => {
    const getVersion = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Error getting app version:', error);
      }
    };
    getVersion();
    
    // Set up update message listener
    const removeUpdateListener = window.electronAPI.onUpdateMessage((message: string) => {
      setUpdateMessage(message);
      addToLog(`Update status: ${message}`);
    });
    
    // Get any existing update messages
    const updateMessages = window.electronAPI.getUpdateMessages();
    if (updateMessages.length > 0) {
      setUpdateMessage(updateMessages[updateMessages.length - 1]);
      updateMessages.forEach((msg: string) => {
        addToLog(`Update status: ${msg}`);
      });
    }
    
    return () => {
      removeUpdateListener();
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    
    if (processing && startTime) {
      timer = window.setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 100);
    }
    
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [processing, startTime]);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
      
      if (debugLogRef.current && !debugLogRef.current.contains(event.target as Node)) {
        setShowDebugLog(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [settingsRef, debugLogRef]);

  const handleSelectImages = async () => {
    try {
      const filePaths = await window.electronAPI.selectImages();
      
      if (filePaths.length > 0) {
        addToLog(`Selected ${filePaths.length} images`);
        addNewImages(filePaths);
      }
    } catch (error) {
      console.error('Error selecting images:', error);
      addToLog(`Error selecting images: ${error}`);
    }
  };

  const addNewImages = (filePaths: string[]) => {
    const newImages: ImageItem[] = filePaths.map(path => ({
      id: path,
      path,
      name: path.split('/').pop() || path,
      status: 'pending',
      progress: 0
    }));
    
    setImages(prev => [...prev, ...newImages]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add('dragover');
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('dragover');
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('dragover');
    }
    
    if (processing) return;
    
    const { files } = e.dataTransfer;
    if (files && files.length > 0) {
      try {
        // For a packaged app, we need to use a different approach
        // The file paths need to be extracted in a way that works in both dev and production
        
        // First, collect all potential file references from the drop event
        const potentialPaths: string[] = [];
        
        // Try to access file.path directly for Electron dev mode
        for (let i = 0; i < files.length; i++) {
          const file = files[i] as unknown as { path?: string, name: string };
          // In dev, Electron may provide the path directly
          if (file.path) {
            potentialPaths.push(file.path);
            addToLog(`Found file path: ${file.path}`);
          } else {
            // In packaged app, we might only have the name
            addToLog(`Found file without path, name: ${file.name}`);
          }
        }
        
        // If we didn't get paths directly, we need to use a different approach for packaged app
        if (potentialPaths.length === 0) {
          addToLog('No direct file paths found. Using file buffer transfer approach.');
          
          const savedPaths: string[] = [];
          
          // Process each file by reading its contents and sending to main process
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const buffer = await file.arrayBuffer();
            
            addToLog(`Sending file ${file.name} (${file.type}) to main process, size: ${buffer.byteLength} bytes`);
            
            // Save the file in the main process and get back a path
            const savedPath = await window.electronAPI.saveDroppedFile({
              name: file.name,
              type: file.type,
              buffer
            });
            
            if (savedPath) {
              addToLog(`File ${file.name} saved as ${savedPath}`);
              savedPaths.push(savedPath);
            } else {
              addToLog(`Failed to save file ${file.name}`);
            }
          }
          
          // Add any saved paths to the potential paths
          potentialPaths.push(...savedPaths);
        }
        
        if (potentialPaths.length > 0) {
          addToLog(`Sending ${potentialPaths.length} file paths to main process for validation`);
          const imageFiles = await window.electronAPI.handleDroppedFiles(potentialPaths);
          
          if (imageFiles.length > 0) {
            addToLog(`Main process found ${imageFiles.length} valid image files`);
            addNewImages(imageFiles);
          } else {
            addToLog('No valid image files found by main process');
          }
        } else {
          addToLog('Could not find any file paths to process');
        }
      } catch (error) {
        console.error('Error handling dropped files:', error);
        addToLog(`Error handling dropped files: ${error}`);
      }
    }
  };

  const addToLog = (message: string) => {
    setProcessingLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    console.log(message);
  };

  const processImages = async () => {
    if (images.length === 0 || processing) return;

    setProcessing(true);
    setStartTime(Date.now());
    setTotalProgress(0);
    addToLog('Starting image processing...');
    
    // Mark all pending images as processing
    setImages(prev => 
      prev.map(img => 
        img.status === 'pending' ? { ...img, status: 'processing' as const } : img
      )
    );

    const pendingImages = images.filter(img => img.status === 'pending' || img.status === 'processing');
    let completed = 0;

    for (const image of pendingImages) {
      // Update current image to processing
      setImages(prev => 
        prev.map(img => 
          img.id === image.id ? { ...img, status: 'processing' as const, progress: 10 } : img
        )
      );

      addToLog(`Processing image: ${image.name}`);

      try {
        // Process the image
        setImages(prev => 
          prev.map(img => 
            img.id === image.id ? { ...img, progress: 30 } : img
          )
        );
        
        const result = await window.electronAPI.processImage({
          filePath: image.path,
          options: {
            convertToWebp,
            quality
          }
        });

        addToLog(`Image ${image.name} processing result: ${result.success ? 'Success' : 'Failed'}`);
        
        if (result.outputPath) {
          const outputFileName = result.outputPath.split('/').pop() || 'unknown';
          addToLog(`Created new file: ${outputFileName}`);
        }

        // Update image status based on the result
        setImages(prev => {
          const updatedImages = prev.map(img => 
            img.id === image.id ? { 
              ...img, 
              status: result.success ? 'completed' as const : 'failed' as const,
              progress: 100,
              error: result.error,
              outputPath: result.outputPath
            } : img
          );
          
          addToLog(`Updated image ${image.name} status to ${result.success ? 'completed' : 'failed'}`);
          return updatedImages;
        });

        completed++;
        const newProgress = (completed / pendingImages.length) * 100;
        setTotalProgress(newProgress);
        addToLog(`Overall progress: ${newProgress.toFixed(1)}%`);
      } catch (error) {
        // Handle any unexpected errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        addToLog(`Error processing ${image.name}: ${errorMessage}`);
        
        setImages(prev => 
          prev.map(img => 
            img.id === image.id ? { 
              ...img, 
              status: 'failed' as const, 
              progress: 0,
              error: 'Unexpected error occurred'
            } : img
          )
        );
      }
    }

    addToLog('All images processed');
    setProcessing(false);
  };

  const checkForUpdates = async () => {
    try {
      const checking = await window.electronAPI.checkForUpdates();
      if (checking) {
        addToLog('Checking for updates...');
        setUpdateMessage('Checking for updates...');
      } else {
        addToLog('Update check unavailable in development mode');
        setUpdateMessage('Updates disabled in development mode');
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      addToLog(`Error checking for updates: ${error}`);
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const toggleSettings = () => {
    setShowSettings(prev => !prev);
  };

  const toggleDebugLog = () => {
    setShowDebugLog(prev => !prev);
  };

  return (
    <div className="app">
      <div className="app-header">
        <div className="title-area">
          <h1>Mini {appVersion && <span className="version">v{appVersion}</span>}</h1>
          
        </div>
        <div className="toolbar">
          <button 
            className="icon-button update-button"
            onClick={checkForUpdates}
            title="Check for Updates"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
              <path d="M12 2C12.717 2 13.372 2.406 13.718 3.078L15.695 7.066L20.142 7.866C20.857 7.996 21.42 8.507 21.617 9.196C21.814 9.886 21.619 10.627 21.115 11.125L18 14.192V18C18 18.753 17.553 19.429 16.867 19.73C16.182 20.032 15.377 19.911 14.813 19.419L12 17L9.187 19.419C8.623 19.911 7.818 20.032 7.133 19.73C6.447 19.429 6 18.753 6 18V14.192L2.885 11.125C2.381 10.627 2.186 9.886 2.383 9.196C2.58 8.507 3.143 7.996 3.858 7.866L8.305 7.066L10.282 3.078C10.628 2.406 11.283 2 12 2Z" fill="currentColor"/>
            </svg>
          </button>
          <button 
            className="icon-button log-button"
            onClick={toggleDebugLog}
            title="Show/Hide Debug Log"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
              <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-5-7h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      {updateMessage && (
        <div className="update-status">
          <div className="update-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14">
              <path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 16.5C11.4477 16.5 11 16.9477 11 17.5C11 18.0523 11.4477 18.5 12 18.5C12.5523 18.5 13 18.0523 13 17.5C13 16.9477 12.5523 16.5 12 16.5ZM12 5.5C11.4477 5.5 11 5.94772 11 6.5V13.5C11 14.0523 11.4477 14.5 12 14.5C12.5523 14.5 13 14.0523 13 13.5V6.5C13 5.94772 12.5523 5.5 12 5.5Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="update-text">{updateMessage}</div>
          <button className="icon-button close-button" onClick={() => setUpdateMessage(null)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12">
              <path d="M12 10.586L6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12l5.293-5.293a1 1 0 0 0-1.414-1.414L12 10.586z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      )}

      {processingLog.length > 0 && showDebugLog && (
        <div className="debug-log" ref={debugLogRef}>
          <div className="debug-log-header">
            <h3>Processing Log</h3>
            <button className="icon-button close-button" onClick={() => setShowDebugLog(false)}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14">
                <path d="M12 10.586L6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12l5.293-5.293a1 1 0 0 0-1.414-1.414L12 10.586z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <pre>
            {processingLog.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </pre>
        </div>
      )}

      {images.length > 0 && (
        <div className="status-bar">
          <div className="progress-container">
            <div 
              className="progress-bar" 
              style={{ width: `${totalProgress}%` }}
            ></div>
          </div>
          <div className="status-text">
            {processing ? (
              <span>Processing: {totalProgress.toFixed(1)}% | Time: {formatTime(elapsedTime)}</span>
            ) : (
              <span>Ready | {images.filter(img => img.status === 'completed').length} of {images.length} completed</span>
            )}
          </div>
        </div>
      )}

      <div 
        className="drop-zone" 
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={images.length === 0 ? handleSelectImages : undefined}
      >
        {images.length === 0 ? (
          <div className="empty-state">
            <div className="dropzone-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm5-9h-4V7h-2v4H7v2h4v4h2v-4h4v-2z" fill="currentColor"/>
              </svg>
            </div>
            <p>Drag and drop images here <br /> or click to select</p>
          </div>
        ) : (
          <div className="image-list">
            {images.map(image => (
              <div key={image.id} className={`image-item ${image.status}`}>
                <div className="image-info">
                  <span className="image-name">
                    {image.name}
                    {image.outputPath && (
                      <span className="output-file">→ {image.outputPath.split('/').pop()}</span>
                    )}
                  </span>
                  <span className="image-status">
                    {image.status === 'pending' && 'Pending'}
                    {image.status === 'processing' && 'Processing...'}
                    {image.status === 'completed' && 'Completed'}
                    {image.status === 'failed' && `Failed: ${image.error || 'Unknown error'}`}
                  </span>
                </div>
                
                <div className="image-progress">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${image.progress}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="controls">
        <div className="settings-container" ref={settingsRef}>
          <button 
            className="icon-button settings-button"
            onClick={toggleSettings}
            disabled={processing}
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          
          {showSettings && (
            <div className="settings-dropdown">
              <div className="setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={convertToWebp}
                    onChange={e => setConvertToWebp(e.target.checked)}
                    disabled={processing}
                  />
                  Convert to WebP
                </label>
              </div>
              
              <div className="setting-item">
                <label>
                  Quality: {quality}%
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={quality}
                    onChange={e => setQuality(parseInt(e.target.value))}
                    disabled={processing}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
        
        <button 
          className="process-btn" 
          onClick={processImages} 
          disabled={processing || images.filter(img => img.status === 'pending').length === 0}
        >
          {processing ? 'Processing...' : 'Minify Images'}
        </button>
      </div>
    </div>
  );
};

export default App; 