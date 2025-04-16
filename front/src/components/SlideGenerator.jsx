import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * SlideGeneratorComponent
 * A unified component that can provide AI-generated visual descriptions or main point titles
 * based on transcription content using OpenRouter API.
 * 
 * @param {string} props.mode - The processing mode ('visual' or 'mainPoint')
 * @param {number} props.currentChunkId - The ID of the current chunk being processed
 * @param {string} props.chunkText - The text content to process
 * @param {function} props.onResultGenerated - Callback when a result is generated
 */
const SlideGeneratorComponent = ({ mode, currentChunkId, chunkText, onResultGenerated }) => {
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resultCache, setResultCache] = useState({}); // Map of text hashes to results
  const processingRef = useRef(false); // Flag to track if we're currently processing
  const activeRequestRef = useRef(false); // Flag to track active API requests
  const abortControllerRef = useRef(null); // Reference to the current request's AbortController
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
      prompt: `Extract the main topic or point being discussed in this ~60 second audio transcript. 
Create a short, concise title (5-7 words maximum) that captures the essence of the discussion. 
Do not wrap output in quotes. Only output the title with no additional text:
${chunkText}`,
      loadingText: 'Processing topic...',
      defaultText: 'Topic will appear here',
      logPrefix: 'main point title'
    },
    creativeSlide: {
        prompt: `Create an engaging, visually interesting slide to illustrate the key point from this audio segment.
  Return ONLY valid HTML and CSS that represents a single slide. The HTML should include a <style> tag with your custom CSS.
  Use modern CSS features for layout, transitions, and visual effects. You can use emoji and Unicode symbols.
  Make the slide visually striking and memorable. We are in dark mode, so the default text color is white.
  Use a dark background and bright colors for text and elements.
  
  Focus on the main point, use short sentences or bullet points, and ensure your design supports the message.
  Do not include any explanatory text, only the HTML/CSS for the slide.
  
  IMPORTANT: Wrap your code in <div class="creative-slide"> and close with </div>. Do not include any markdown code blocks, just the raw HTML and CSS.
  
  Audio segment: "${chunkText}"`,
        loadingText: 'Designing custom slide...',
        defaultText: 'Interactive slide will appear here',
        logPrefix: 'creative slide'
      }
  }[mode];
  
  // Create a hash of the text to use as a cache key
  const getTextHash = useCallback((text) => {
    // Simple hash function - get first 100 chars + length as a key
    const prefix = text.slice(0, 100);
    const suffix = text.slice(-100);
    return `${prefix.length}:${prefix}:${suffix}:${text.length}`;
  }, []);
  
  // Process response text for creative slide mode
  const processCreativeSlideResponse = useCallback((responseText) => {    
    if (!responseText) return '<div class="creative-slide">No content generated</div>';
    
    // If the response already has the creative-slide div wrapper, use it as is
    if (responseText.includes('<div class="creative-slide"') && responseText.includes('</div>')) {
      return responseText;
    }
    
    // If the response contains markdown code blocks, extract just the HTML content
    if (responseText.includes('```html')) {
      const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/);
      if (htmlMatch && htmlMatch[1]) {
        const extractedHtml = htmlMatch[1].trim();
        console.log("Extracted HTML from markdown:", extractedHtml);
        return extractedHtml.startsWith('<div class="creative-slide"') 
          ? extractedHtml 
          : `<div class="creative-slide">${extractedHtml}</div>`;
      }
    }
    
    // If the response contains code blocks without the html tag, try to extract content
    if (responseText.includes('```')) {
      const codeMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch && codeMatch[1]) {
        const extractedCode = codeMatch[1].trim();
        console.log("Extracted code from markdown:", extractedCode);
        return extractedCode.startsWith('<div class="creative-slide"') 
          ? extractedCode 
          : `<div class="creative-slide">${extractedCode}</div>`;
      }
    }
    
    // If it's just raw HTML without the wrapper div, add it
    if (responseText.trim().startsWith('<') && !responseText.includes('<div class="creative-slide"')) {
      return `<div class="creative-slide">${responseText}</div>`;
    }
    
    // Default fallback - wrap response in our div
    return `<div class="creative-slide">${responseText}</div>`;
  }, []);
  
  // Function to send text to OpenRouter and get result
  const generateResult = async (text, windowIdentifier) => {
    // Cancel any previous ongoing request
    if (abortControllerRef.current) {
      console.log(`Cancelling previous ${config.logPrefix} request`);
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Update the last result time to the current audio time
    lastResultTimeRef.current = currentAudioTimeRef.current;
    
    if (!text || text.trim().length < 20) return null; // Skip if text is too short
    
    try {
      // Set the active request flag
      activeRequestRef.current = true;
      
      // Include timestamp in logging to track the specific window
      console.log(`Generating ${config.logPrefix} at audio time ${lastResultTimeRef.current.toFixed(1)}s: ${text}`);
      
      // Create a new controller for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      // Set a timeout for this request
      const timeoutId = setTimeout(() => {
        console.log(`Request timeout after 60 seconds for ${config.logPrefix}`);
        controller.abort();
      }, 60000); // 60 second timeout
      
      // Get API key from environment or localStorage
      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || localStorage.getItem('openrouter_api_key');
      
      if (!apiKey) {
        throw new Error('OpenRouter API key is missing. Please add it to your environment variables or localStorage.');
      }
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin, // Required by OpenRouter
          'X-Title': 'Audio Visualizer' // Optional app name
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-maverick:free', // You can change this to any model available on OpenRouter
          messages: [
            {
              role: 'user',
              content: config.prompt
            }
          ],
          max_tokens: 500
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
      
      if (!response.ok) {
        throw new Error(`OpenRouter API error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const generatedText = data.choices[0]?.message?.content || '';
      
      // For creativeSlide mode, process the response to ensure it's valid HTML
      if (mode === 'creativeSlide') {
        return processCreativeSlideResponse(generatedText);
      }
      
      return generatedText;
    } catch (error) {
      console.error(`Error generating ${config.logPrefix}:`, error);
      let errorMessage;
      
      if (error.name === 'AbortError') {
        // If this was our own cancellation (not a timeout), just return null
        if (abortControllerRef.current === null) {
          console.log('Request was cancelled intentionally');
          return null;
        }
        errorMessage = 'Request timed out. OpenRouter may be overwhelmed.';
      } else if (error.message === 'Failed to fetch') {
        errorMessage = 'Could not connect to OpenRouter service. Check your internet connection.';
        console.error('OpenRouter service connection error');
      } else if (error.message.includes('API key')) {
        errorMessage = 'Missing API key. Please add your OpenRouter API key in the settings.';
      } else {
        errorMessage = `Error: ${error.message}`;
      }
      
      if (mode === 'visual') {
        return `<strong style="color: #ff5555;">Could not generate visual description.</strong><br>${errorMessage}<br><span style="font-size: 0.9rem;">Check your API key or internet connection</span>`;
      } else if (mode === 'mainPoint') {
        return `<strong style="color: #ff5555;">Topic unavailable.</strong><br>${errorMessage}<br><span style="font-size: 0.9rem;">Check your API key or internet connection</span>`;
      } else {
        return `<div class="creative-slide">
          <h1 style="color: #ff5555;">OpenRouter Connection Error</h1>
          <p>${errorMessage}</p>
          <p style="font-size: 0.9rem;">Please verify your API key is configured correctly</p>
        </div>`;
      }
    } finally {
      // Always reset the active request flag when done
      activeRequestRef.current = false;
      // Clear the controller reference if it wasn't already cleared by a new request
      if (abortControllerRef.current && abortControllerRef.current.signal.aborted) {
        abortControllerRef.current = null;
      }
    }
  };
  
  // Check if we should generate a new result based on time difference
  const shouldGenerateNewResult = useCallback((currentTime) => {
    // Store the current audio time for reference
    currentAudioTimeRef.current = currentTime;
    
    // Only generate a new result if it's been at least 20 seconds since the last one
    const timeSinceLastResult = currentTime - lastResultTimeRef.current;
    return timeSinceLastResult >= 20 || lastResultTimeRef.current === 0;
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
          if (onResultGenerated) {
              onResultGenerated(chunkId, resultText);
              }
          
          setResult(resultText);
          
          
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
                <div
                    className="ollama-processor-result"
                    dangerouslySetInnerHTML={{ __html: result || previousResultRef.current || config.defaultText }}
                />
            )}
        </div>
    </div>
);
};

SlideGeneratorComponent.propTypes = {
  mode: PropTypes.oneOf(['visual', 'mainPoint', 'creativeSlide']).isRequired,
  currentChunkId: PropTypes.number,
  chunkText: PropTypes.string,
  onResultGenerated: PropTypes.func
};

SlideGeneratorComponent.defaultProps = {
  currentChunkId: null,
  chunkText: '',
  onResultGenerated: () => {}
};

export default SlideGeneratorComponent;