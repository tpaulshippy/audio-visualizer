import { useState, useRef, useEffect } from 'react';
import './App.css';
import AnimatedTranscription from './components/AnimatedTranscription';
import SlideGeneratorComponent from './components/SlideGenerator';
import AudioInput from './components/AudioInput';

function App() {
  // State for shared functionality
  const [_transcription, setTranscription] = useState(''); // Prefixed with underscore since it's tracked but not directly used
  const [segments, setSegments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [currentSegmentId, setCurrentSegmentId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isAwaitingTranscription, setIsAwaitingTranscription] = useState(false);
  const [visualizationMode, setVisualizationMode] = useState('transcription'); // 'transcription', 'visual', 'mainPoint', or 'creativeSlide'
  
  // Refs
  const audioRef = useRef(null);
  const eventSourceRef = useRef(null);
  
  // State for visual descriptions and main points
  const [currentChunkId, setCurrentChunkId] = useState(null);
  const [currentChunkText, setCurrentChunkText] = useState('');
  
  // State for API key
  const [apiKey, setApiKey] = useState(
    localStorage.getItem('openrouter_api_key') || ''
  );

  // Function to handle API key changes
  const handleApiKeyChange = (event) => {
    const newApiKey = event.target.value;
    setApiKey(newApiKey);
    localStorage.setItem('openrouter_api_key', newApiKey);
  };

  const handleAudioSelected = async (audioData) => {
    setIsLoading(true);
    setTranscription('');
    setSegments([]);
    setCurrentSegmentId(null);
    setCurrentChunkId(null);
    setCurrentChunkText('');
    setProgress(0);
    
    // Set the audio source URL for playback
    setAudioSrc(audioData.audioUrl);

    // Process based on the source type
    if (audioData.sourceType === 'file') {
      await processAudioFile(audioData.file);
    } else if (audioData.sourceType === 'url') {
      // Transcribe the podcast file that was downloaded on the server
      await transcribePodcastFile(audioData.file_path);
      
      // If there's any additional metadata or processing needed, it would go here
      if (audioData.metadata) {
        console.log('Podcast metadata:', audioData.metadata);
        // You could set this to state if you want to display it in the UI
      }
    }
  };

  const processAudioFile = async (file) => {
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
      
      await processTranscriptionResponse(response);
    } catch (error) {
      console.error('Error:', error);
      setTranscription(`Error: ${error.message}`);
      setIsLoading(false);
    }
  };
  
  const transcribePodcastFile = async (filePath) => {
    try {
      // Close any existing event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Set up a POST request to start the transcription process
      const fetchUrl = 'http://localhost:8000/transcribe_podcast/';
      
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          file_path: filePath 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      await processTranscriptionResponse(response);
    } catch (error) {
      console.error('Error:', error);
      setTranscription(`Error: ${error.message}`);
      setIsLoading(false);
    }
  };
  
  const processTranscriptionResponse = async (response) => {
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
  };

  // Update current segment and visual description based on audio time
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || segments.length === 0) return;

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
    
    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('seeking', handleTimeUpdate);
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

  // Get combined text from multiple chunks for a ~30 second window
  const getCombinedWindowText = () => {
    if (currentSegment === null || segments.length === 0) return '';
    
    const currentTime = currentSegment.start;
    // Look for segments within a 30 second window (15 seconds before and 15 after current position)
    const windowStart = Math.max(0, currentTime - 15);
    const windowEnd = currentTime + 15;
    
    // Find all segments within this time window
    const segmentsInWindow = segments.filter(segment => 
      segment.start >= windowStart && segment.start <= windowEnd
    );
    
    // Sort them by time
    segmentsInWindow.sort((a, b) => a.start - b.start);
    
    // Combine their text
    return segmentsInWindow.map(segment => segment.text).join(' ');
  };

  return (
    <div className="App">
      {!audioSrc && (
        <AudioInput 
          onAudioSelected={handleAudioSelected}
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
        />
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
              className={`toggle-btn ${visualizationMode === 'mainPoint' ? 'active' : ''}`}
              onClick={() => setVisualizationMode('mainPoint')}
            >
              Main Point
            </button>
            <button 
              className={`toggle-btn ${visualizationMode === 'creativeSlide' ? 'active' : ''}`}
              onClick={() => setVisualizationMode('creativeSlide')}
            >
              Creative Slide
            </button>
          </div>

          {visualizationMode === 'visual' ? (
            <SlideGeneratorComponent
              mode="visual"
              currentChunkId={currentChunkId}
              chunkText={currentChunkText || getCurrentChunkText()}
            />
          ) : visualizationMode === 'mainPoint' ? (
            <SlideGeneratorComponent
              mode="mainPoint"
              currentChunkId={currentChunkId}
              chunkText={getCombinedWindowText() || getCurrentChunkText()}
            />
          ) : visualizationMode === 'creativeSlide' ? (
            <SlideGeneratorComponent
              mode="creativeSlide"
              currentChunkId={currentChunkId}
              chunkText={getCombinedWindowText() || getCurrentChunkText()}
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
