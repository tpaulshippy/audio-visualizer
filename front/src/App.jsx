import { useState, useRef, useEffect } from 'react';
import './App.css';
import AnimatedTranscription from './components/AnimatedTranscription';
import AIVisualDescription from './components/AIVisualDescription';
import UnsplashVisualizer from './components/UnsplashVisualizer';

function App() {
  // State for shared functionality
  const [_transcription, setTranscription] = useState(''); // Prefixed with underscore since it's tracked but not directly used
  const [segments, setSegments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [currentSegmentId, setCurrentSegmentId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isAwaitingTranscription, setIsAwaitingTranscription] = useState(false);
  const [visualizationMode, setVisualizationMode] = useState('transcription'); // 'transcription', 'visual', or 'image'
  const [isPlaying, setIsPlaying] = useState(false); // Add state to track if audio is playing
  
  // Refs
  const audioRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  // State for visual descriptions
  const [currentChunkId, setCurrentChunkId] = useState(null);
  const [currentChunkText, setCurrentChunkText] = useState('');
  const [_visualDescriptions, setVisualDescriptions] = useState({}); // Prefixed with underscore since it's tracked but not directly used
  const [_unsplashImages, setUnsplashImages] = useState({}); // Prefixed with underscore since it's tracked but not directly used

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setIsLoading(true);
      setTranscription('');
      setSegments([]);
      setCurrentSegmentId(null);
      setCurrentChunkId(null);
      setCurrentChunkText('');
      setProgress(0);
      setVisualDescriptions({});
      setUnsplashImages({});
      
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
          const parts = fullText.split('\n\n');
          
          // The last part might be incomplete, save it for the next chunk
          partialData = parts.pop() || '';
          
          // Process each complete part
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              const jsonStr = part.slice(6); // Remove "data: " prefix
              try {
                const data = JSON.parse(jsonStr);
                
                if (data.error) {
                  console.error('Error in transcription:', data.error);
                  setTranscription(`Error: ${data.error}`);
                  setIsLoading(false);
                  return;
                }
                
                // Update progress
                setProgress(Math.round((data.chunk_id + 1) / data.total_chunks * 100));
                
                // Add chunk_id to each segment for easier lookup later
                const segmentsWithChunkId = data.segments.map(segment => ({
                  ...segment,
                  chunk_id: data.chunk_id
                }));
                
                // Append new segments to existing segments
                const newSegments = [...allSegments, ...segmentsWithChunkId];
                allSegments = newSegments;
                setSegments(newSegments);
                
                // Append new chunk text to existing transcription
                setTranscription(prev => prev + ' ' + data.chunk_text);
                
                // Set the current chunk for visual description processing
                setCurrentChunkText(data.chunk_text);
                setCurrentChunkId(data.chunk_id);
              } catch (e) {
                console.error('Error parsing JSON:', e, jsonStr);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error:', error);
        setTranscription(`Error: ${error.message}`);
        setIsLoading(false);
      }
    }
  };

  // Update current segment and visual description based on audio time
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || segments.length === 0) return;

    // Add event listeners for play and pause
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    const handleTimeUpdate = () => {
      const currentTime = audioElement.currentTime;
      // Add a small time offset (300ms) to compensate for perception lag
      const adjustedTime = currentTime + 0.3;
      
      // Find the current segment based on adjusted time
      const currentSegment = segments.find(
        segment => adjustedTime >= segment.start && adjustedTime <= segment.end
      );
      
      if (currentSegment) {
        setCurrentSegmentId(currentSegment.id);
        
        // Find which chunk this segment belongs to
        setCurrentChunkId(currentSegment.chunk_id);
        
        setIsAwaitingTranscription(false);
      } else {
        // Check if we're at a position beyond the last transcribed segment
        const lastSegment = segments[segments.length - 1];
        const isAwaitingMoreTranscripts = lastSegment && 
          currentTime > lastSegment.end && 
          isLoading;

        setIsAwaitingTranscription(isAwaitingMoreTranscripts);
        
        // If not in any segment, find the closest upcoming segment
        const upcomingSegment = segments
          .filter(segment => segment.start > currentTime)
          .sort((a, b) => a.start - b.start)[0];
          
        if (upcomingSegment) {
          setCurrentSegmentId(upcomingSegment.id);
          setCurrentChunkId(upcomingSegment.chunk_id);
        }
      }
    };

    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('seeking', handleTimeUpdate);
    audioElement.addEventListener('play', handlePlay);
    audioElement.addEventListener('pause', handlePause);
    audioElement.addEventListener('ended', handleEnded);
    
    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('seeking', handleTimeUpdate);
      audioElement.removeEventListener('play', handlePlay);
      audioElement.removeEventListener('pause', handlePause);
      audioElement.removeEventListener('ended', handleEnded);
    };
  }, [segments, isLoading]);

  // Scroll to current segment (for the detailed view)
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
    const eventSource = eventSourceRef.current;
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // Callback for when a visual description is generated
  const handleDescriptionGenerated = (chunkId, description) => {
    setVisualDescriptions(prev => ({
      ...prev,
      [chunkId]: description
    }));
  };

  // Callback for when an Unsplash image is fetched
  const handleImageFetched = (chunkId, imageData) => {
    setUnsplashImages(prev => ({
      ...prev,
      [chunkId]: imageData
    }));
  };

  // Get current segment object
  const getCurrentSegment = () => {
    if (currentSegmentId === null || segments.length === 0) return null;
    return segments.find(segment => segment.id === currentSegmentId);
  };

  // Get current segment
  const currentSegment = getCurrentSegment();
  
  // Get the current chunk text for the current chunk ID
  const getCurrentChunkText = () => {
    if (currentChunkId === null) return '';
    
    // Find all segments with the current chunk ID
    const segmentsInCurrentChunk = segments.filter(segment => segment.chunk_id === currentChunkId);
    
    // Combine their text
    return segmentsInCurrentChunk.map(segment => segment.text).join(' ');
  };

  return (
    <div className="App">
      {!audioSrc && (
        <>
          <h1>Audio Visualizer</h1>
          <div className="upload-container">
            <label className="file-upload">
              Choose Audio File
              <input type="file" accept="audio/*" onChange={handleFileUpload} />
            </label>
          </div>
        </>
      )}

      {audioSrc && (
        <div className="visualization-container">
          <div className="visualization-toggle">
            <button 
              className={`toggle-btn ${visualizationMode === 'transcription' ? 'active' : ''}`}
              onClick={() => setVisualizationMode('transcription')}
            >
              Transcription
            </button>
            <button 
              className={`toggle-btn ${visualizationMode === 'visual' ? 'active' : ''}`}
              onClick={() => setVisualizationMode('visual')}
            >
              Visual Description
            </button>
            <button 
              className={`toggle-btn ${visualizationMode === 'image' ? 'active' : ''}`}
              onClick={() => setVisualizationMode('image')}
            >
              Image
            </button>
          </div>

          {visualizationMode === 'visual' ? (
            <AIVisualDescription 
              currentChunkId={currentChunkId}
              chunkText={currentChunkText || getCurrentChunkText()}
              onDescriptionGenerated={handleDescriptionGenerated}
              isPlaying={isPlaying}
            />
          ) : visualizationMode === 'image' ? (
            <UnsplashVisualizer
              currentChunkId={currentChunkId}
              chunkText={currentChunkText || getCurrentChunkText()}
              onImageFetched={handleImageFetched}
              isPlaying={isPlaying}
            />
          ) : (
            <AnimatedTranscription 
              segments={segments}
              currentSegment={currentSegment}
              isVisible={!!currentSegment}
              isAwaitingTranscription={isAwaitingTranscription}
              isLoading={isLoading}
            />
          )}
        </div>
      )}

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
    </div>
  );
}

export default App;
