import React, { useState, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * AIVisualDescription Component
 * Displays AI-generated visual descriptions based on transcription content
 * and handles the generation of descriptions
 * 
 * @param {number} props.currentChunkId - The ID of the current chunk being processed
 * @param {string} props.chunkText - The text content to generate a description for
 * @param {function} props.onDescriptionGenerated - Callback when a description is generated
 */
const AIVisualDescription = ({ currentChunkId, chunkText, onDescriptionGenerated }) => {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [visualDescriptions, setVisualDescriptions] = useState({}); // Map of chunk_id to descriptions
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
  const processVisualDescriptionQueue = useCallback(async () => {
    if (processingVisualRef.current || chunksForProcessingRef.current.length === 0) {
      return;
    }
    
    processingVisualRef.current = true;
    setIsLoading(true);
    
    try {
      const chunk = chunksForProcessingRef.current.shift();
      const descriptionText = await generateVisualDescription(chunk.text, chunk.id);
      
      if (descriptionText) {
        setVisualDescriptions(prev => {
          const updated = {
            ...prev,
            [chunk.id]: descriptionText
          };
          
          // Call the callback to inform parent component
          onDescriptionGenerated(chunk.id, descriptionText);
          
          // If this is the current chunk, update the displayed description
          if (chunk.id === currentChunkId) {
            setDescription(descriptionText);
          }
          
          return updated;
        });
      }
    } finally {
      processingVisualRef.current = false;
      setIsLoading(false);
      
      // Continue processing the queue if there are more items
      if (chunksForProcessingRef.current.length > 0) {
        setTimeout(processVisualDescriptionQueue, 100); // Small delay to prevent API flooding
      }
    }
  }, [currentChunkId, onDescriptionGenerated]);
  
  // Add chunk to the queue for visual description processing
  const queueChunkForProcessing = useCallback((text, chunkId) => {
    // Check if we already have a description for this chunk
    if (visualDescriptions[chunkId]) {
      // Use existing description
      setDescription(visualDescriptions[chunkId]);
      return;
    }
    
    // Otherwise queue it for processing
    chunksForProcessingRef.current.push({
      id: chunkId,
      text: text
    });
    
    // Start processing if not already running
    if (!processingVisualRef.current) {
      processVisualDescriptionQueue();
    }
  }, [visualDescriptions, processVisualDescriptionQueue]);
  
  // Effect to handle new chunk text
  useEffect(() => {
    if (chunkText && currentChunkId !== null && currentChunkId !== undefined) {
      // If we already have a description for this chunk, use it
      if (visualDescriptions[currentChunkId]) {
        setDescription(visualDescriptions[currentChunkId]);
      } else {
        // Otherwise, queue it for processing
        queueChunkForProcessing(chunkText, currentChunkId);
      }
    }
  }, [chunkText, currentChunkId, visualDescriptions, queueChunkForProcessing]);

  return (
    <div className="ai-visual-description-container">
      <div className="ai-visual-content">
        {isLoading && Object.keys(visualDescriptions).length === 0 ? (
          <div className="ai-loading">Generating visual description...</div>
        ) : (
          <div className="ai-description">{description || 'Visual description will appear here'}</div>
        )}
      </div>
    </div>
  );
};

AIVisualDescription.propTypes = {
  currentChunkId: PropTypes.number,
  chunkText: PropTypes.string,
  onDescriptionGenerated: PropTypes.func
};

AIVisualDescription.defaultProps = {
  currentChunkId: null,
  chunkText: '',
  onDescriptionGenerated: () => {}
};

export default AIVisualDescription;