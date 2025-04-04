import React, { useState, useEffect } from 'react';
import './App.css';

interface ImageItem {
  id: string;
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: {
      selectImages: () => Promise<string[]>;
      processImage: (data: { filePath: string, options: { convertToWebp: boolean, quality: number } }) => Promise<{ success: boolean, filePath: string, error?: string }>;
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

  useEffect(() => {
    let timer: number;
    
    if (processing && startTime) {
      timer = window.setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 100);
    }
    
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [processing, startTime]);

  const handleSelectImages = async () => {
    try {
      const filePaths = await window.electronAPI.selectImages();
      
      if (filePaths.length > 0) {
        const newImages: ImageItem[] = filePaths.map(path => ({
          id: path,
          path,
          name: path.split('/').pop() || path,
          status: 'pending',
          progress: 0
        }));
        
        setImages(prev => [...prev, ...newImages]);
      }
    } catch (error) {
      console.error('Error selecting images:', error);
    }
  };

  const processImages = async () => {
    if (images.length === 0 || processing) return;

    setProcessing(true);
    setStartTime(Date.now());
    setTotalProgress(0);
    
    // Mark all pending images as processing
    setImages(prev => 
      prev.map(img => 
        img.status === 'pending' ? { ...img, status: 'processing' } : img
      )
    );

    const pendingImages = images.filter(img => img.status === 'processing');
    let completed = 0;

    for (const image of pendingImages) {
      // Update current image to processing
      setImages(prev => 
        prev.map(img => 
          img.id === image.id ? { ...img, status: 'processing', progress: 0 } : img
        )
      );

      try {
        // Process the image
        const result = await window.electronAPI.processImage({
          filePath: image.path,
          options: {
            convertToWebp,
            quality
          }
        });

        // Update image status based on the result
        setImages(prev => 
          prev.map(img => 
            img.id === image.id ? { 
              ...img, 
              status: result.success ? 'completed' : 'failed',
              progress: 100,
              error: result.error 
            } : img
          )
        );

        completed++;
        setTotalProgress((completed / pendingImages.length) * 100);
      } catch (error) {
        // Handle any unexpected errors
        setImages(prev => 
          prev.map(img => 
            img.id === image.id ? { 
              ...img, 
              status: 'failed', 
              progress: 0,
              error: 'Unexpected error occurred'
            } : img
          )
        );
      }
    }

    setProcessing(false);
  };

  const clearCompletedImages = () => {
    setImages(prev => prev.filter(img => img.status !== 'completed'));
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app">
      <div className="controls">
        <button 
          className="btn select-btn" 
          onClick={handleSelectImages} 
          disabled={processing}
        >
          Select Images
        </button>
        
        <div className="options">
          <label>
            <input
              type="checkbox"
              checked={convertToWebp}
              onChange={e => setConvertToWebp(e.target.checked)}
              disabled={processing}
            />
            Convert to WebP
          </label>
          
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
        
        <button 
          className="btn process-btn" 
          onClick={processImages} 
          disabled={processing || images.filter(img => img.status === 'pending').length === 0}
        >
          {processing ? 'Processing...' : 'Minify Images'}
        </button>
        
        <button 
          className="btn clear-btn" 
          onClick={clearCompletedImages} 
          disabled={processing || images.filter(img => img.status === 'completed').length === 0}
        >
          Clear Completed
        </button>
      </div>

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

      <div className="image-list">
        {images.length === 0 ? (
          <div className="empty-state">
            <p>No images selected. Click "Select Images" to begin.</p>
          </div>
        ) : (
          <ul>
            {images.map(image => (
              <li key={image.id} className={`image-item ${image.status}`}>
                <div className="image-info">
                  <span className="image-name">{image.name}</span>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default App; 