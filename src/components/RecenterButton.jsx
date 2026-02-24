import React from 'react';

export default React.memo(function RecenterButton({ visible, onRecenter }) {
  if (!visible) return null;

  return (
    <button id="recenter-btn" onClick={onRecenter}>
      Recenter
    </button>
  );
});
