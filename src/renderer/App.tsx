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

declare global {
  interface Window {
    electronAPI: {
      selectImages: () => Promise<string[]>;
      processImage: (data: { 
        filePath: string, 
        options: { convertToWebp: boolean, quality: number } 
      }) => Promise<ProcessImageResult>;
      handleDroppedFiles: (filePaths: string[]) => Promise<string[]>;
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
  const settingsRef = useRef<HTMLDivElement>(null);
  const debugLogRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

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
        const filePaths: string[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i] as FileWithPath;
          if (file.path) {
            filePaths.push(file.path);
          }
        }
        
        if (filePaths.length > 0) {
          const imageFiles = await window.electronAPI.handleDroppedFiles(filePaths);
          if (imageFiles.length > 0) {
            addToLog(`Dropped ${imageFiles.length} image files`);
            addNewImages(imageFiles);
          } else {
            addToLog('No valid image files found in the dropped items');
          }
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

  const clearCompletedImages = () => {
    setImages(prev => prev.filter(img => img.status !== 'completed'));
    addToLog('Cleared completed images');
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
        <div className="title-area pl-12">
          <h1>Mini</h1>
        </div>
        <div className="toolbar">
          <button 
            className="icon-button log-button"
            onClick={toggleDebugLog}
            title="Show/Hide Debug Log"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="1.3em" height="1.3em" viewBox="0 0 512 512"><path fill="currentColor" fill-rule="evenodd" d="M321.923 42.667H87.256v234.667h42.667v-192h174.293l81.707 81.706v110.294h42.666v-128zM85.573 448V320.028h28.81v105.394h55V448zm153.17-130.23q30.165 0 46.24 19.146q15.444 18.334 15.443 47.143q0 31.519-18.243 50.124q-15.714 16.075-43.44 16.075q-30.165 0-46.24-19.146q-15.443-18.334-15.443-47.866q0-30.887 18.243-49.491q15.804-15.985 43.44-15.985m-.09 22.578q-15.624 0-24.114 13.005q-7.676 11.74-7.676 30.164q0 21.315 9.121 33.055q8.58 11.108 22.759 11.108q15.534 0 24.204-13.095q7.676-11.56 7.676-30.526q0-20.862-9.121-32.603q-8.58-11.108-22.85-11.108m190.83 36.035v65.295q-11.018 3.704-15.534 4.877q-13.998 3.703-30.074 3.703q-31.61 0-48.136-15.895q-18.334-17.52-18.334-48.859q0-36.035 22.759-54.368q16.527-13.365 44.614-13.366q24.024 0 44.705 8.76l-9.844 22.488q-9.754-4.876-17.07-6.819q-7.315-1.941-16.075-1.941q-20.952 0-30.887 13.637q-8.399 11.559-8.399 30.435q0 22.669 12.644 34.138q10.115 9.212 25.107 9.212q8.76 0 16.617-2.98v-25.74H379.54v-22.577z"/></svg>
          </button>
        </div>
      </div>

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
              <span>{images.filter(img => img.status === 'completed').length} of {images.length} completed</span>
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