import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * MainPointTitle Component
 * Extracts and displays the main point or topic being discussed from transcription content
 * Enhanced to analyze ~30 second windows of content
 * Now generates a new title only every 30 seconds of audio playback
 * Only generates titles when a section is actually played
 * Added seeking support to generate titles when skipping to different parts
 * 
 * @param {number} props.currentChunkId - The ID of the current chunk being processed
 * @param {string} props.chunkText - The text content to extract a title from (now containing ~30s of content)
 * @param {function} props.onTitleGenerated - Callback when a title is generated
 */
const MainPointTitle = ({ currentChunkId, chunkText, onTitleGenerated }) => {
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mainPointTitles, setMainPointTitles] = useState({}); // Map of text hashes to titles
  const processingTitleRef = useRef(false); // Flag to track if we're currently processing
  const lastProcessedHash = useRef(null); // Track the last processed text hash
  const currentTextHashRef = useRef(null); // Track the current text hash for the displayed content
  const previousTitleRef = useRef(''); // Track the previous title to show during loading
  const lastTitleTimeRef = useRef(0); // Track the timestamp of the last title generation
  const currentAudioTimeRef = useRef(0); // Track the current audio playback time
  
  // Create a hash of the text to use as a cache key
  // This helps us identify when we have the same ~30s window of content
  const getTextHash = useCallback((text) => {
    // Simple hash function - get first 100 chars + length as a key
    // This is efficient and sufficient for our caching needs
    const prefix = text.slice(0, 100);
    const suffix = text.slice(-100);
    return `${prefix.length}:${prefix}:${suffix}:${text.length}`;
  }, []);
  
  // Function to send text to Ollama and get a main point title
  const generateMainPointTitle = async (text, windowIdentifier) => {
    // Update the last title time to the current audio time
    lastTitleTimeRef.current = currentAudioTimeRef.current;
    
    if (!text || text.trim().length < 20) return null; // Skip if text is too short
    
    try {
      // Include timestamp in logging to track the specific window
      console.log(`Generating main point title at audio time ${lastTitleTimeRef.current.toFixed(1)}s: ${text}`);
      
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3', // Use your preferred Ollama model
          prompt: `Extract the main topic or point being discussed in this ~30 second audio transcript. 
Create a short, concise title (5-7 words maximum) that captures the essence of the discussion. 
Do not wrap output in quotes. Only output the title with no additional text:
${text}`,
          stream: false
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error(`Error generating main point title:`, error);
      return 'Topic unavailable';
    }
  };
  
  // Check if we should generate a new title based on time difference
  const shouldGenerateNewTitle = useCallback((currentTime) => {
    // Store the current audio time for reference
    currentAudioTimeRef.current = currentTime;
    
    // Only generate a new title if it's been at least 30 seconds since the last one
    const timeSinceLastTitle = currentTime - lastTitleTimeRef.current;
    return timeSinceLastTitle >= 30 || lastTitleTimeRef.current === 0;
  }, []);
  
  // Directly process the current text chunk (no queue)
  const processCurrentTextChunk = useCallback(async (text, chunkId, currentTime) => {
    // Don't process if already processing or if text is invalid
    if (processingTitleRef.current || !text) return;
    
    const textHash = getTextHash(text);
    
    // If we already have a title for this text hash, use it
    if (mainPointTitles[textHash]) {
      setTitle(mainPointTitles[textHash]);
      return;
    }
    
    // Check if we should generate a new title based on time
    if (!shouldGenerateNewTitle(currentTime)) {
      return;
    }
    
    // Skip duplicate processing
    if (textHash === lastProcessedHash.current) {
      console.log(`Skipping duplicate processing for hash ${textHash.substring(0, 20)}...`);
      return;
    }
    
    // Start processing
    processingTitleRef.current = true;
    setIsLoading(true);
    lastProcessedHash.current = textHash;
    
    try {
      const titleText = await generateMainPointTitle(text, chunkId);
      
      if (titleText) {
        setMainPointTitles(prev => {
          const updated = {
            ...prev,
            [textHash]: titleText
          };
          
          // Call the callback to inform parent component
          onTitleGenerated(chunkId, titleText);
          
          // Update the displayed title if this is still the current text
          if (textHash === currentTextHashRef.current) {
            setTitle(titleText);
          }
          
          return updated;
        });
      }
    } finally {
      processingTitleRef.current = false;
      setIsLoading(false);
    }
  }, [getTextHash, mainPointTitles, onTitleGenerated, shouldGenerateNewTitle]);
  
  // Force title generation for the current content (used when seeking)
  const forceGenerateTitleForCurrentContent = useCallback(() => {
    if (!chunkText || currentChunkId === null || processingTitleRef.current) return;
    
    const textHash = getTextHash(chunkText);
    currentTextHashRef.current = textHash;
    
    // If we already have a cached title, use it
    if (mainPointTitles[textHash]) {
      setTitle(mainPointTitles[textHash]);
      return;
    }
    
    // Otherwise, get current audio time and generate a new title
    const audioElement = document.querySelector('audio');
    if (audioElement) {
      const currentTime = audioElement.currentTime;
      // Reset the time threshold to force generation regardless of timing
      lastTitleTimeRef.current = 0;
      
      // Process the current chunk with current time
      processCurrentTextChunk(chunkText, currentChunkId, currentTime);
    }
  }, [chunkText, currentChunkId, getTextHash, mainPointTitles, processCurrentTextChunk]);
  
  // Effect for detecting changes to the current audio segment
  useEffect(() => {
    if (chunkText && currentChunkId !== null && currentChunkId !== undefined) {
      const newTextHash = getTextHash(chunkText);
      
      // Store previous title before we update to a new segment
      if (currentTextHashRef.current !== newTextHash && title) {
        previousTitleRef.current = title;
      }
      
      currentTextHashRef.current = newTextHash;
      
      // If we already have a title for this text window, use it immediately
      if (mainPointTitles[newTextHash]) {
        setTitle(mainPointTitles[newTextHash]);
      } else {
        // Keep previous title visible until new one is generated
        // Don't set isLoading here as we'll only generate during playback
      }
    }
  }, [chunkText, currentChunkId, getTextHash, mainPointTitles, title]);
  
  // Effect for time-based title generation during playback only
  useEffect(() => {
    // Only check during playback by listening to timeupdate events
    const audioElement = document.querySelector('audio');
    if (!audioElement) return;
    
    const handleTimeUpdate = () => {
      // Only process if we have content and are in the MainPoint visualization mode
      const isMainPointVisible = document.querySelector('.main-point-title-container')?.offsetParent !== null;
      if (!isMainPointVisible || !chunkText || currentChunkId === null) return;
      
      const currentTime = audioElement.currentTime;
      currentAudioTimeRef.current = currentTime;
      
      // Only generate a title if we're actively playing (not paused)
      if (!audioElement.paused) {
        processCurrentTextChunk(chunkText, currentChunkId, currentTime);
      }
    };
    
    // Handle seeking events - when user jumps to a different part of audio
    const handleSeeking = () => {
      // Only process if we have content and are in the MainPoint visualization mode
      const isMainPointVisible = document.querySelector('.main-point-title-container')?.offsetParent !== null;
      if (!isMainPointVisible || !chunkText || currentChunkId === null) return;
      
      // Since seeking is a deliberate user action, force generate a title
      // for where they've seeked to
      forceGenerateTitleForCurrentContent();
    };
    
    // Handle the play event to generate a title when starting playback
    const handlePlay = () => {
      const isMainPointVisible = document.querySelector('.main-point-title-container')?.offsetParent !== null;
      if (!isMainPointVisible || !chunkText || currentChunkId === null) return;
      
      forceGenerateTitleForCurrentContent();
    };
    
    // Listen for timeupdate and seeking events
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('seeked', handleSeeking);
    audioElement.addEventListener('play', handlePlay);
    
    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('seeked', handleSeeking);
      audioElement.removeEventListener('play', handlePlay);
    };
  }, [chunkText, currentChunkId, processCurrentTextChunk, forceGenerateTitleForCurrentContent]);

  return (
    <div className="main-point-title-container">
      <div className="main-point-content">
        <div className="main-point-title">
          {title || previousTitleRef.current || 'Topic will appear here'}
        </div>
      </div>
    </div>
  );
};

MainPointTitle.propTypes = {
  currentChunkId: PropTypes.number,
  chunkText: PropTypes.string,
  onTitleGenerated: PropTypes.func
};

MainPointTitle.defaultProps = {
  currentChunkId: null,
  chunkText: '',
  onTitleGenerated: () => {}
};

export default MainPointTitle;