import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * UnsplashVisualizer Component
 * Displays images from Unsplash API based on the current 30-second chunk being played
 * Preloads images for the next 30-second chunk to ensure smooth transitions
 * 
 * @param {number} props.currentChunkId - The ID of the current chunk being played
 * @param {string} props.chunkText - The text content of the current chunk
 * @param {function} props.onImageFetched - Callback when an image is fetched
 * @param {boolean} props.isPlaying - Whether the audio is currently playing
 */
const UnsplashVisualizer = ({ currentChunkId, chunkText, onImageFetched, isPlaying }) => {
  const [currentImage, setCurrentImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchedImages, setFetchedImages] = useState({}); // Map of chunk_id to image data
  const [nextImageTime, setNextImageTime] = useState(Date.now());
  const processingImageRef = useRef(false);
  const pendingChunkRef = useRef(null);
  
  // Track the next chunk to preload
  const nextChunkToPreloadRef = useRef(null);
  
  // API rate limiting settings
  const API_RATE_LIMIT_MS = 30000; // 30 seconds between API calls
  
  // Access Unsplash API key from environment variables
  const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY; 
  
  // Function to generate a search query from the text
  const generateSearchQuery = async (text) => {
    if (!text || text.trim().length < 20) return null;
    console.log("Generating search query from text:", text);
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3',
          prompt: `Extract 3-5 relevant keywords from this text to use for an image search. Focus on the main themes, subjects, and visual elements. Only output the keywords, separated by commas, with no additional text or punctuation: "${text}"`,
          stream: false
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.response.trim();
    } catch (error) {
      console.error('Error generating search query:', error);
      // Fallback to using a simple keyword extraction
      const words = text.split(/\s+/).filter(word => word.length > 4);
      const uniqueWords = [...new Set(words)].slice(0, 3);
      return uniqueWords.join(',');
    }
  };
  
  // Function to fetch an image from Unsplash based on the query
  const fetchUnsplashImage = async (query) => {
    try {
      // Check if we have an API key
      if (!UNSPLASH_ACCESS_KEY) {
        console.warn("Missing Unsplash API key, using fallback sample image");
        return {
          url: 'https://images.unsplash.com/photo-1579547621706-1a9f0e4b8c8b',
          alt: 'Sample Image',
          photographer: 'John Doe',
          photographerUrl: 'https://unsplash.com/@johndoe'
        };
      }
        
      console.log("Fetching image for query:", query);
      const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`, {
        headers: {
          'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Unsplash API error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const image = data.results[0];
        return {
          url: image.urls.regular,
          alt: image.alt_description || 'Image based on speech content',
          photographer: image.user.name,
          photographerUrl: image.user.links.html
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching Unsplash image:', error);
      // Return fallback image in case of error
      return {
        url: 'https://images.unsplash.com/photo-1579547621706-1a9f0e4b8c8b',
        alt: 'Sample Image (Fallback)',
        photographer: 'John Doe',
        photographerUrl: 'https://unsplash.com/@johndoe'
      };
    }
  };
  
  // Process image request with rate limiting
  const processImageRequest = useCallback(async (text, chunkId, isPrefetch = false) => {
    // Skip if we're already processing an image
    if (processingImageRef.current) {
      return;
    }
    
    // Don't process if audio is not playing and not prefetching
    if (!isPlaying && !isPrefetch) {
      // Store the chunk for processing when audio starts playing
      pendingChunkRef.current = { text, chunkId };
      return;
    }
    
    // Check if we already have this image
    if (fetchedImages[chunkId]) {
      console.log(`Image for chunk ${chunkId} already fetched`);
      // If this is the current chunk, set it as current image
      if (chunkId === currentChunkId) {
        setCurrentImage(fetchedImages[chunkId]);
      }
      return;
    }
    
    // Check rate limiting
    const now = Date.now();
    if (now < nextImageTime) {
      console.log(`Rate limited: Next image allowed in ${Math.ceil((nextImageTime - now)/1000)} seconds`);
      return;
    }
    
    processingImageRef.current = true;
    
    // Only show loading indicator for current chunk, not prefetching
    if (!isPrefetch) {
      setIsLoading(true);
    }
    
    try {
      console.log(`${isPrefetch ? 'Prefetching' : 'Processing'} image for chunk ${chunkId}`);
      const searchQuery = await generateSearchQuery(text);
      
      if (searchQuery) {
        const imageData = await fetchUnsplashImage(searchQuery);
        
        if (imageData) {
          // Update rate limiting for next call
          setNextImageTime(Date.now() + API_RATE_LIMIT_MS);
          
          // Store the image
          setFetchedImages(prev => {
            const updated = {
              ...prev,
              [chunkId]: imageData
            };
            
            // If we're processing the current chunk, update the displayed image
            if (chunkId === currentChunkId) {
              setCurrentImage(imageData);
            }
            
            // Call callback to inform parent component
            onImageFetched(chunkId, imageData);
            
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Error processing image request:', error);
    } finally {
      processingImageRef.current = false;
      if (!isPrefetch) {
        setIsLoading(false);
      }
      
      // Try to prefetch the next chunk if we're not already prefetching
      if (!isPrefetch && nextChunkToPreloadRef.current) {
        const nextChunkData = nextChunkToPreloadRef.current;
        nextChunkToPreloadRef.current = null;
        
        // Small delay to avoid overlapping requests
        setTimeout(() => {
          processImageRequest(nextChunkData.text, nextChunkData.chunkId, true);
        }, 500);
      }
    }
  }, [currentChunkId, fetchedImages, isPlaying, onImageFetched, UNSPLASH_ACCESS_KEY]);
  
  // Effect to handle play state changes
  useEffect(() => {
    // If audio starts playing and we have a pending chunk, process it
    if (isPlaying && pendingChunkRef.current) {
      const { text, chunkId } = pendingChunkRef.current;
      pendingChunkRef.current = null;
      processImageRequest(text, chunkId);
    }
  }, [isPlaying, processImageRequest]);
  
  // Effect to display the image for the current chunk
  useEffect(() => {
    if (currentChunkId === null || currentChunkId === undefined) {
      return;
    }
    
    // If we already have the image for this chunk, display it immediately
    if (fetchedImages[currentChunkId]) {
      setCurrentImage(fetchedImages[currentChunkId]);
    } 
    // Otherwise, need to fetch it if we're playing
    else if (isPlaying && chunkText) {
      processImageRequest(chunkText, currentChunkId);
    }
    
    // Set up prefetching for the next chunk
    const nextChunkId = currentChunkId + 1;
    
    // If we don't already have the next chunk's image, queue it for prefetching
    if (!fetchedImages[nextChunkId] && chunkText) {
      // For now, we can only prefetch if we have text for that chunk
      // In a real implementation, we might need to fetch the text for the next chunk
      nextChunkToPreloadRef.current = {
        chunkId: nextChunkId,
        text: chunkText // Ideally we'd have the next chunk's text
      };
    }
  }, [currentChunkId, chunkText, fetchedImages, isPlaying, processImageRequest]);

  return (
    <div className="unsplash-visualizer-container">
      {isLoading ? (
        <div className="image-loading">Finding an image for the current audio segment...</div>
      ) : currentImage ? (
        <div className="image-container">
          <img 
            src={currentImage.url} 
            alt={currentImage.alt} 
            className="unsplash-image"
          />
        </div>
      ) : (
        <div className="no-image">
          {!isPlaying 
            ? "Images will load when audio playback begins" 
            : "Loading image for current audio content..."}
        </div>
      )}
      
      {!isPlaying && pendingChunkRef.current && (
        <div className="paused-info">
          Play audio to see images for current content
        </div>
      )}
    </div>
  );
};

UnsplashVisualizer.propTypes = {
  currentChunkId: PropTypes.number,
  chunkText: PropTypes.string,
  onImageFetched: PropTypes.func,
  isPlaying: PropTypes.bool
};

UnsplashVisualizer.defaultProps = {
  currentChunkId: null,
  chunkText: '',
  onImageFetched: () => {},
  isPlaying: false
};

export default UnsplashVisualizer;