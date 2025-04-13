import React from 'react';

/**
 * AIVisualDescription Component
 * Displays AI-generated visual descriptions based on transcription content
 * 
 * @param {string} props.description - The AI-generated visual description
 * @param {boolean} props.isLoading - Whether the AI is currently generating content
 */
const AIVisualDescription = ({ description, isLoading }) => {
  return (
    <div className="ai-visual-description-container">
      <div className="ai-visual-content">
        {isLoading ? (
          <div className="ai-loading">Generating visual description...</div>
        ) : (
          <div className="ai-description">{description || 'Visual description will appear here'}</div>
        )}
      </div>
    </div>
  );
};

export default AIVisualDescription;