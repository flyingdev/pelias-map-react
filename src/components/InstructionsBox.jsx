import React from 'react';

export default React.memo(function InstructionsBox({ onReset }) {
  return (
    <div id="instructions">
      <b>Interactive Routing</b>
      <br />
      <p>
        1. Left Click to set <b>Start</b> (Green)
        <br />
        2. Left Click again to set <b>End</b> (Red)
      </p>
      <button onClick={onReset} className="mode-btn">
        Clear Route
      </button>
    </div>
  );
});
