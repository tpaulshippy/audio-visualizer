import { useState } from 'react';

const serverBaseUrl = 'http://localhost:8000'; // Replace with your server URL

function AudioInput({ onAudioSelected, apiKey, onApiKeyChange }) {
  const [inputType, setInputType] = useState('file'); // 'file' or 'url'
  const [podcastUrl, setPodcastUrl] = useState('');
  const [isProcessingUrl, setIsProcessingUrl] = useState(false);
  const [urlError, setUrlError] = useState('');

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Create audio URL for playback
      const audioUrl = URL.createObjectURL(file);
      
      // Pass the file and audio URL to the parent component
      onAudioSelected({
        sourceType: 'file',
        file,
        audioUrl
      });
    }
  };

  const handlePodcastUrlSubmit = async (event) => {
    event.preventDefault();
    
    if (!podcastUrl.trim()) {
      setUrlError('Please enter a podcast URL');
      return;
    }
    
    setIsProcessingUrl(true);
    setUrlError('');
    
    try {
      // Make a request to the backend to process the podcast URL
      const response = await fetch(`${serverBaseUrl}/process_podcast_url/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          podcast_url: podcastUrl 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process podcast URL');
      }
      
      const data = await response.json();
      
      // Pass the audio URL and file path to the parent component
      onAudioSelected({
        sourceType: 'url',
        audioUrl: `${serverBaseUrl}${data.audio_url}`, // Adjust the URL as needed
        file_path: data.file_path, // Pass the file path for transcription
        metadata: data.metadata // Optional podcast metadata
      });
      
    } catch (error) {
      console.error('Error processing podcast URL:', error);
      setUrlError(`Error: ${error.message}`);
    } finally {
      setIsProcessingUrl(false);
    }
  };

  return (
    <div className="audio-input-container">
      <h1>Audio Visualizer</h1>
      
      <div className="api-key-container">
        <label className="api-key-label">
          OpenRouter API Key:
          <input 
            type="password" 
            value={apiKey} 
            onChange={onApiKeyChange} 
            placeholder="Enter your OpenRouter API key" 
            className="api-key-input"
          />
        </label>
        <div className="api-key-help">
          Sign up at <a href="https://openrouter.ai" target="_blank" rel="noreferrer">openrouter.ai</a> to get your API key
        </div>
      </div>
      
      <div className="input-type-toggle">
        <button 
          className={`toggle-btn ${inputType === 'file' ? 'active' : ''}`}
          onClick={() => setInputType('file')}
        >
          Upload Audio File
        </button>
        <button 
          className={`toggle-btn ${inputType === 'url' ? 'active' : ''}`}
          onClick={() => setInputType('url')}
        >
          Podcast URL
        </button>
      </div>
      
      {inputType === 'file' ? (
        <div className="upload-container">
          <label className="file-upload">
            Choose Audio File
            <input type="file" accept="audio/*" onChange={handleFileUpload} />
          </label>
        </div>
      ) : (
        <form onSubmit={handlePodcastUrlSubmit} className="url-input-form">
          <input 
            type="url"
            value={podcastUrl}
            onChange={(e) => setPodcastUrl(e.target.value)}
            placeholder="Enter podcast URL (e.g., https://podcasts.apple.com/...)"
            className="podcast-url-input"
            disabled={isProcessingUrl}
          />
          <button 
            type="submit" 
            className="podcast-url-submit"
            disabled={isProcessingUrl}
          >
            {isProcessingUrl ? 'Processing...' : 'Process Podcast'}
          </button>
          {urlError && <div className="url-error">{urlError}</div>}
        </form>
      )}
    </div>
  );
}

export default AudioInput;