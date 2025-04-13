import React from 'react';

/**
 * AnimatedTranscription Component
 * Displays a single transcript segment with fade-in/fade-out animations
 * 
 * @param {Object} props.segment - The current segment to display
 * @param {boolean} props.isVisible - Whether the segment should be visible
 */
const AnimatedTranscription = ({ segment, isVisible }) => {
  return (
    <div className={`animated-segment ${isVisible ? 'fade-in' : 'fade-out'}`}>
      {segment?.text || ''}
    </div>
  );
};

export default AnimatedTranscription;