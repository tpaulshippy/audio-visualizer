import { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [transcription, setTranscription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const audioRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setIsLoading(true);
      setTranscription('');
      
      // Create audio URL for playback
      const audioUrl = URL.createObjectURL(file);
      setAudioSrc(audioUrl);

      const formData = new FormData();
      formData.append('audio_file', file);

      try {
        const response = await fetch('http://localhost:8000/transcribe/', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          setTranscription(data.transcription);
        } else {
          setTranscription('Error: Unable to transcribe the audio file.');
        }
      } catch (error) {
        setTranscription('Error: Something went wrong with the transcription service.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="App">
      <h1>Audio Transcription</h1>
      <div className="upload-container">
        <label className="file-upload">
          Choose Audio File
          <input type="file" accept="audio/*" onChange={handleFileUpload} />
        </label>
      </div>

      {audioSrc && (
        <div className="audio-player">
          <audio 
            ref={audioRef}
            controls
            src={audioSrc}
            style={{ width: '100%', marginTop: '20px' }}
          />
        </div>
      )}

      {isLoading && <div className="loading">Transcribing audio... This may take a moment.</div>}

      {transcription && !isLoading && (
        <div className="transcription-container">
          <h3>Transcription:</h3>
          <div className="transcription-text">{transcription}</div>
        </div>
      )}
    </div>
  );
}

export default App;
