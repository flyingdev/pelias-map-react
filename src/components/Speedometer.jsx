import React from 'react';

export default React.memo(function Speedometer({ speed, accuracy, visible }) {
  if (!visible) return null;

  return (
    <div id="speedometer">
      {speed}
      <br />
      <span>MPH</span>
      {accuracy != null && (
        <span className="accuracy">&plusmn;{Math.round(accuracy)}m</span>
      )}
    </div>
  );
});
