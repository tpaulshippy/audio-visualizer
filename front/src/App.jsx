import { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [transcription, setTranscription] = useState('');
  const [segments, setSegments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [currentSegmentId, setCurrentSegmentId] = useState(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);
  const eventSourceRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setIsLoading(true);
      setTranscription('');
      setSegments([]);
      setCurrentSegmentId(null);
      setProgress(0);
      
      // Create audio URL for playback
      const audioUrl = URL.createObjectURL(file);
      setAudioSrc(audioUrl);

      const formData = new FormData();
      formData.append('audio_file', file);

      try {
        // Close any existing event source
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }

        // Set up a POST request to start the transcription process
        const fetchUrl = 'http://localhost:8000/transcribe/';
        
        const response = await fetch(fetchUrl, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Process the response as a stream directly
        const reader = response.body.getReader();
        let allSegments = [];
        let partialData = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            setIsLoading(false);
            break;
          }
          
          // Convert the chunk to text and append to any partial data
          const chunk = new TextDecoder().decode(value);
          const fullText = partialData + chunk;
          
          // Split by double newlines (SSE format uses "data: {...}\n\n")
          const parts = fullText.split("\n\n");
          
          // The last part might be incomplete, save it for the next chunk
          partialData = parts.pop() || '';
          
          // Process each complete part
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              const jsonStr = part.slice(6); // Remove "data: " prefix
              try {
                const data = JSON.parse(jsonStr);
                
                if (data.error) {
                  console.error("Error in transcription:", data.error);
                  setTranscription(`Error: ${data.error}`);
                  setIsLoading(false);
                  return;
                }
                
                // Update progress
                setProgress(Math.round((data.chunk_id + 1) / data.total_chunks * 100));
                
                // Append new segments to existing segments
                const newSegments = [...allSegments, ...data.segments];
                allSegments = newSegments;
                setSegments(newSegments);
                
                // Append new chunk text to existing transcription
                setTranscription(prev => prev + ' ' + data.chunk_text);
              } catch (e) {
                console.error("Error parsing JSON:", e, jsonStr);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error:", error);
        setTranscription(`Error: ${error.message}`);
        setIsLoading(false);
      }
    }
  };

  // Update current segment based on audio time
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || segments.length === 0) return;

    const handleTimeUpdate = () => {
      const currentTime = audioElement.currentTime;
      
      // Find the current segment based on time
      const currentSegment = segments.find(
        segment => currentTime >= segment.start && currentTime <= segment.end
      );
      
      if (currentSegment) {
        setCurrentSegmentId(currentSegment.id);
      }
    };

    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    
    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [segments]);

  // Scroll to current segment
  useEffect(() => {
    if (currentSegmentId !== null) {
      const element = document.getElementById(`segment-${currentSegmentId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSegmentId]);

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Format time from seconds to MM:SS format
  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Jump to specific segment time in the audio
  const jumpToSegment = (startTime) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      if (audioRef.current.paused) {
        audioRef.current.play();
      }
    }
  };

  return (
    <div className="App">
      <h1>Audio Visualizer</h1>
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

      {isLoading && (
        <div className="loading">
          <div>Transcribing audio... {progress}% complete</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      {segments.length > 0 && (
        <div className="transcription-container">
          <h3>Transcription:</h3>
          <div className="captions-view">
            {segments.map((segment) => (
              <div 
                key={segment.id} 
                id={`segment-${segment.id}`}
                className={`caption-segment ${currentSegmentId === segment.id ? 'active-segment' : ''}`}
                onClick={() => jumpToSegment(segment.start)}
              >
                <span className="timestamp">[{formatTime(segment.start)} - {formatTime(segment.end)}]</span>
                <span className="segment-text">{segment.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transcription && !isLoading && segments.length === 0 && (
        <div className="transcription-container">
          <h3>Transcription:</h3>
          <div className="transcription-text">{transcription}</div>
        </div>
      )}
    </div>
  );
}

export default App;
