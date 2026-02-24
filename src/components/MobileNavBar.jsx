import React from 'react';

export default React.memo(function MobileNavBar({ destination, onNavigate, onClear }) {
  if (!destination) return null;

  return (
    <div id="mobile-nav-bar" className="visible">
      <div className="dest-info">
        <div className="dest-label">{destination.label}</div>
        <div className="dest-sub">Tap Navigate to get directions</div>
      </div>
      <button className="nav-btn nav-go" onClick={onNavigate}>
        Navigate
      </button>
      <button className="nav-btn nav-clear" onClick={onClear}>
        ✕
      </button>
    </div>
  );
});
