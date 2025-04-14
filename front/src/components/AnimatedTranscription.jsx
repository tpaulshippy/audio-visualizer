import React from 'react';
import PropTypes from 'prop-types';

/**
 * AnimatedTranscription Component
 * Displays transcript segments with fade-in/fade-out animations
 * and handles transcription-specific functionality
 * 
 * @param {Object[]} props.segments - All transcription segments
 * @param {Object} props.currentSegment - The current segment to display
 * @param {boolean} props.isVisible - Whether the segment should be visible
 * @param {boolean} props.isAwaitingTranscription - Whether we're waiting for more transcription
 * @param {boolean} props.isLoading - Whether transcription is in progress
 */
const AnimatedTranscription = ({ 
  segments, 
  currentSegment, 
  isVisible, 
  isAwaitingTranscription, 
  isLoading 
}) => {
  return (
    <div className="animated-transcription-container">
      {isAwaitingTranscription ? (
        <div className="animated-segment fade-in">
          Still transcribing...
        </div>
      ) : segments.length > 0 ? (
        <div className={`animated-segment ${isVisible ? 'fade-in' : 'fade-out'}`}>
          {currentSegment?.text || ''}
        </div>
      ) : (
        <div className="animated-segment empty-message">
          {isLoading ? 'Processing audio...' : 'Upload an audio file to see transcription'}
        </div>
      )}
    </div>
  );
};

AnimatedTranscription.propTypes = {
  segments: PropTypes.array,
  currentSegment: PropTypes.shape({
    id: PropTypes.number,
    text: PropTypes.string,
    start: PropTypes.number,
    end: PropTypes.number,
    chunk_id: PropTypes.number
  }),
  isVisible: PropTypes.bool,
  isAwaitingTranscription: PropTypes.bool,
  isLoading: PropTypes.bool
};

AnimatedTranscription.defaultProps = {
  segments: [],
  currentSegment: null,
  isVisible: false,
  isAwaitingTranscription: false,
  isLoading: false
};

export default AnimatedTranscription;