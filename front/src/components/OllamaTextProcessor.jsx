import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * OllamaTextProcessor Component
 * A unified component that can provide AI-generated visual descriptions or main point titles
 * based on transcription content.
 * 
 * @param {string} props.mode - The processing mode ('visual' or 'mainPoint')
 * @param {number} props.currentChunkId - The ID of the current chunk being processed
 * @param {string} props.chunkText - The text content to process
 * @param {function} props.onResultGenerated - Callback when a result is generated
 */
const OllamaTextProcessor = ({ mode, currentChunkId, chunkText, onResultGenerated }) => {
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resultCache, setResultCache] = useState({}); // Map of text hashes to results
  const processingRef = useRef(false); // Flag to track if we're currently processing
  const lastProcessedHash = useRef(null); // Track the last processed text hash
  const currentTextHashRef = useRef(null); // Track the current text hash for the displayed content
  const previousResultRef = useRef(''); // Track the previous result to show during loading
  const lastResultTimeRef = useRef(0); // Track the timestamp of the last result generation
  const currentAudioTimeRef = useRef(0); // Track the current audio playback time

  // Determine configurations based on the mode
  const config = {
    visual: {
      prompt: `Create a brief visual description (1-2 sentences only) for an image that captures the essence of this text. Only output the description with no introductory text. Focus on the most important visual elements only: "${chunkText}"`,
      loadingText: 'Generating visual description...',
      defaultText: 'Visual description will appear here',
      logPrefix: 'visual description'
    },
    mainPoint: {
      prompt: `Extract the main topic or point being discussed in this ~30 second audio transcript. 
Create a short, concise title (5-7 words maximum) that captures the essence of the discussion. 
Do not wrap output in quotes. Only output the title with no additional text:
${chunkText}`,
      loadingText: 'Processing topic...',
      defaultText: 'Topic will appear here',
      logPrefix: 'main point title'
    }
  }[mode];
  
  // Create a hash of the text to use as a cache key
  const getTextHash = useCallback((text) => {
    // Simple hash function - get first 100 chars + length as a key
    const prefix = text.slice(0, 100);
    const suffix = text.slice(-100);
    return `${prefix.length}:${prefix}:${suffix}:${text.length}`;
  }, []);
  
  // Function to send text to Ollama and get result
  const generateResult = async (text, windowIdentifier) => {
    // Update the last result time to the current audio time
    lastResultTimeRef.current = currentAudioTimeRef.current;
    
    if (!text || text.trim().length < 20) return null; // Skip if text is too short
    
    try {
      // Include timestamp in logging to track the specific window
      console.log(`Generating ${config.logPrefix} at audio time ${lastResultTimeRef.current.toFixed(1)}s: ${text}`);
      
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3', // Use your preferred Ollama model
          prompt: config.prompt,
          stream: false
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error(`Error generating ${config.logPrefix}:`, error);
      return mode === 'visual' ? 
        'Could not generate visual description at this time.' : 
        'Topic unavailable';
    }
  };
  
  // Check if we should generate a new result based on time difference
  const shouldGenerateNewResult = useCallback((currentTime) => {
    // Store the current audio time for reference
    currentAudioTimeRef.current = currentTime;
    
    // Only generate a new result if it's been at least 30 seconds since the last one
    const timeSinceLastResult = currentTime - lastResultTimeRef.current;
    return timeSinceLastResult >= 30 || lastResultTimeRef.current === 0;
  }, []);
  
  // Directly process the current text chunk
  const processCurrentTextChunk = useCallback(async (text, chunkId, currentTime) => {
    // Don't process if already processing or if text is invalid
    if (processingRef.current || !text) return;
    
    const textHash = getTextHash(text);
    
    // If we already have a result for this text hash, use it
    if (resultCache[textHash]) {
      setResult(resultCache[textHash]);
      return;
    }
    
    // Check if we should generate a new result based on time
    if (!shouldGenerateNewResult(currentTime)) {
      return;
    }
    
    // Skip duplicate processing
    if (textHash === lastProcessedHash.current) {
      console.log(`Skipping duplicate processing for hash ${textHash.substring(0, 20)}...`);
      return;
    }
    
    // Start processing
    processingRef.current = true;
    setIsLoading(true);
    lastProcessedHash.current = textHash;
    
    try {
      const resultText = await generateResult(text, chunkId);
      
      if (resultText) {
        setResultCache(prev => {
          const updated = {
            ...prev,
            [textHash]: resultText
          };
          
          // Call the callback to inform parent component
          onResultGenerated(chunkId, resultText);
          
          // Update the displayed result if this is still the current text
          if (textHash === currentTextHashRef.current) {
            setResult(resultText);
          }
          
          return updated;
        });
      }
    } finally {
      processingRef.current = false;
      setIsLoading(false);
    }
  }, [getTextHash, resultCache, onResultGenerated, shouldGenerateNewResult, config.prompt, config.logPrefix]);
  
  // Force result generation for the current content (used when seeking)
  const forceGenerateResultForCurrentContent = useCallback(() => {
    if (!chunkText || currentChunkId === null || processingRef.current) return;
    
    const textHash = getTextHash(chunkText);
    currentTextHashRef.current = textHash;
    
    // If we already have a cached result, use it
    if (resultCache[textHash]) {
      setResult(resultCache[textHash]);
      return;
    }
    
    // Otherwise, get current audio time and generate a new result
    const audioElement = document.querySelector('audio');
    if (audioElement) {
      const currentTime = audioElement.currentTime;
      // Reset the time threshold to force generation regardless of timing
      lastResultTimeRef.current = 0;
      
      // Process the current chunk with current time
      processCurrentTextChunk(chunkText, currentChunkId, currentTime);
    }
  }, [chunkText, currentChunkId, getTextHash, resultCache, processCurrentTextChunk]);
  
  // Effect for detecting changes to the current audio segment
  useEffect(() => {
    if (chunkText && currentChunkId !== null && currentChunkId !== undefined) {
      const newTextHash = getTextHash(chunkText);
      
      // Store previous result before we update to a new segment
      if (currentTextHashRef.current !== newTextHash && result) {
        previousResultRef.current = result;
      }
      
      currentTextHashRef.current = newTextHash;
      
      // If we already have a result for this text window, use it immediately
      if (resultCache[newTextHash]) {
        setResult(resultCache[newTextHash]);
      } else {
        // Keep previous result visible until new one is generated
        // Don't set isLoading here as we'll only generate during playback
      }
    }
  }, [chunkText, currentChunkId, getTextHash, resultCache, result]);
  
  // Effect for time-based result generation during playback only
  useEffect(() => {
    // Only check during playback by listening to timeupdate events
    const audioElement = document.querySelector('audio');
    if (!audioElement) return;
    
    const handleTimeUpdate = () => {
      // Only process if we have content and are in the current visualization mode
      const isContainerVisible = document.querySelector(`.ollama-processor-container.${mode}`)?.offsetParent !== null;
      if (!isContainerVisible || !chunkText || currentChunkId === null) return;
      
      const currentTime = audioElement.currentTime;
      currentAudioTimeRef.current = currentTime;
      
      // Only generate a result if we're actively playing (not paused)
      if (!audioElement.paused) {
        processCurrentTextChunk(chunkText, currentChunkId, currentTime);
      }
    };
    
    // Handle seeking events - when user jumps to a different part of audio
    const handleSeeking = () => {
      // Only process if we have content and are in the current visualization mode
      const isContainerVisible = document.querySelector(`.ollama-processor-container.${mode}`)?.offsetParent !== null;
      if (!isContainerVisible || !chunkText || currentChunkId === null) return;
      
      // Since seeking is a deliberate user action, force generate a result
      // for where they've seeked to
      forceGenerateResultForCurrentContent();
    };
    
    // Handle the play event to generate a result when starting playback
    const handlePlay = () => {
      const isContainerVisible = document.querySelector(`.ollama-processor-container.${mode}`)?.offsetParent !== null;
      if (!isContainerVisible || !chunkText || currentChunkId === null) return;
      
      forceGenerateResultForCurrentContent();
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
  }, [chunkText, currentChunkId, processCurrentTextChunk, forceGenerateResultForCurrentContent, mode]);

  return (
    <div className={`ollama-processor-container ${mode}`}>
      <div className="ollama-processor-content">
        {isLoading && !result && !previousResultRef.current ? (
          <div className="ollama-processor-loading">{config.loadingText}</div>
        ) : (
          <div className="ollama-processor-result">
            {result || previousResultRef.current || config.defaultText}
          </div>
        )}
      </div>
    </div>
  );
};

OllamaTextProcessor.propTypes = {
  mode: PropTypes.oneOf(['visual', 'mainPoint']).isRequired,
  currentChunkId: PropTypes.number,
  chunkText: PropTypes.string,
  onResultGenerated: PropTypes.func
};

OllamaTextProcessor.defaultProps = {
  currentChunkId: null,
  chunkText: '',
  onResultGenerated: () => {}
};

export default OllamaTextProcessor;