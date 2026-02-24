import React from 'react';

const MODES = [
  { key: 'auto', label: 'Drive' },
  { key: 'bicycle', label: 'Bike' },
  { key: 'pedestrian', label: 'Walk' },
];

export default React.memo(function ModeSelector({ activeMode, onChange }) {
  return (
    <div className="mode-selector">
      {MODES.map(({ key, label }) => (
        <button
          key={key}
          className={`mode-selector-btn${key === activeMode ? ' active' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
});
