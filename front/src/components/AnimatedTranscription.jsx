import React from 'react';
import PropTypes from 'prop-types';

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

AnimatedTranscription.propTypes = {
  segment: PropTypes.shape({
    id: PropTypes.number,
    text: PropTypes.string,
    start: PropTypes.number,
    end: PropTypes.number,
    chunk_id: PropTypes.number
  }),
  isVisible: PropTypes.bool
};

AnimatedTranscription.defaultProps = {
  segment: null,
  isVisible: false
};

export default AnimatedTranscription;