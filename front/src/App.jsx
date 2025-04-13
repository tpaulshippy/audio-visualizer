import { useState, useRef, useEffect } from 'react';
import './App.css';
import AnimatedTranscription from './components/AnimatedTranscription';
import AIVisualDescription from './components/AIVisualDescription';

function App() {
  // Remove the unused 'transcription' variable and keep the setter
  const [, setTranscription] = useState('');
  const [segments, setSegments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [currentSegmentId, setCurrentSegmentId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isAwaitingTranscription, setIsAwaitingTranscription] = useState(false);
  const [visualDescriptions, setVisualDescriptions] = useState({}); // Map of chunk_id to descriptions
  const [currentVisualDescription, setCurrentVisualDescription] = useState('');
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);
  const audioRef = useRef(null);
  const eventSourceRef = useRef(null);
  const chunksForProcessingRef = useRef([]); // Store chunks for processing
  const processingVisualRef = useRef(false); // Flag to track if we're currently processing
  
  // Function to send text to Ollama and get image description
  const generateVisualDescription = async (text, chunkId) => {
    if (!text || text.trim().length < 20) return null; // Skip if text is too short
    
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3', // Use your preferred Ollama model
          prompt: `Create a brief visual description (1-2 sentences only) for an image that captures the essence of this text. Only output the description with no introductory text. Focus on the most important visual elements only: "${text}"`,
          stream: false
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error(`Error generating visual description for chunk ${chunkId}:`, error);
      return 'Could not generate visual description at this time.';
    }
  };
  
  // Process the queue of chunks for visual descriptions
  const processVisualDescriptionQueue = async () => {
    if (processingVisualRef.current || chunksForProcessingRef.current.length === 0) {
      return;
    }
    
    processingVisualRef.current = true;
    setIsGeneratingVisual(true);
    
    try {
      const chunk = chunksForProcessingRef.current.shift();
      const description = await generateVisualDescription(chunk.text, chunk.id);
      
      if (description) {
        setVisualDescriptions(prev => ({
          ...prev,
          [chunk.id]: description
        }));
      }
    } finally {
      processingVisualRef.current = false;
      setIsGeneratingVisual(false);
      
      // Continue processing the queue if there are more items
      if (chunksForProcessingRef.current.length > 0) {
        setTimeout(processVisualDescriptionQueue, 100); // Small delay to prevent API flooding
      }
    }
  };
  
  // Add chunk to the queue for visual description processing
  const queueChunkForProcessing = (chunkText, chunkId) => {
    chunksForProcessingRef.current.push({
      id: chunkId,
      text: chunkText
    });
    
    // Start processing if not already running
    if (!processingVisualRef.current) {
      processVisualDescriptionQueue();
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setIsLoading(true);
      setTranscription('');
      setSegments([]);
      setCurrentSegmentId(null);
      setProgress(0);
      setVisualDescriptions({});
      setCurrentVisualDescription('');
      chunksForProcessingRef.current = [];
      
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
                
                // Queue this chunk for visual description processing
                queueChunkForProcessing(data.chunk_text, data.chunk_id);
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
        const chunkId = currentSegment.chunk_id;
        
        // Set the visual description for this chunk if available
        if (visualDescriptions[chunkId]) {
          setCurrentVisualDescription(visualDescriptions[chunkId]);
        }
        
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
          
          // Find which chunk this upcoming segment belongs to
          const chunkId = upcomingSegment.chunk_id;
          
          // Set the visual description for this chunk if available
          if (visualDescriptions[chunkId]) {
            setCurrentVisualDescription(visualDescriptions[chunkId]);
          }
        }
      }
    };

    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('seeking', handleTimeUpdate);
    
    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('seeking', handleTimeUpdate);
    };
  }, [segments, isLoading, visualDescriptions]);

  // Scroll to current segment (for the detailed view)
  useEffect(() => {
    if (currentSegmentId !== null) {
      const element = document.getElementById(`segment-${currentSegmentId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSegmentId]);

  // Clean up EventSource on unmount - fixing the React hooks dependency warning
  useEffect(() => {
    // Store the current value of the ref in a variable that won't change
    const eventSource = eventSourceRef.current;
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // Format time from seconds to MM:SS format - kept for future use
  // Marked with _ prefix to indicate it's intentionally unused
  const _formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Jump to specific segment time in the audio - kept for future use
  // Marked with _ prefix to indicate it's intentionally unused
  const _jumpToSegment = (startTime) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      if (audioRef.current.paused) {
        audioRef.current.play();
      }
    }
  };

  // Get current segment object
  const getCurrentSegment = () => {
    if (currentSegmentId === null || segments.length === 0) return null;
    return segments.find(segment => segment.id === currentSegmentId);
  };

  // Get current segment text
  const currentSegment = getCurrentSegment();

  return (
    <div className="App">
      <h1>Audio Visualizer</h1>
      <div className="upload-container">
        <label className="file-upload">
          Choose Audio File
          <input type="file" accept="audio/*" onChange={handleFileUpload} />
        </label>
      </div>

      <AIVisualDescription 
        description={currentVisualDescription} 
        isLoading={isGeneratingVisual && Object.keys(visualDescriptions).length === 0} 
      />

      <div className="animated-transcription-container">
        {isAwaitingTranscription ? (
          <div className="animated-segment fade-in">
            Still transcribing...
          </div>
        ) : segments.length > 0 ? (
          <AnimatedTranscription 
            segment={currentSegment}
            isVisible={!!currentSegment}
          />
        ) : (
          <div className="animated-segment empty-message">
            {isLoading ? 'Processing audio...' : 'Upload an audio file to see transcription'}
          </div>
        )}
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
    </div>
  );
}

export default App;
