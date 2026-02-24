import React, { useEffect, useRef } from 'react';

function formatDuration(seconds) {
  if (seconds < 60) return '< 1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function formatArrival(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default React.memo(function DirectionsPanel({ maneuvers, activeIndex, summary }) {
  const listRef = useRef(null);

  // Auto-scroll active step into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const li = listRef.current.children[activeIndex];
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIndex]);

  if (!maneuvers || maneuvers.length === 0) return null;

  return (
    <div id="turn-by-turn">
      <h3>Directions</h3>
      {summary && (
        <div className="route-summary">
          <span>{summary.distanceMi.toFixed(1)} mi</span>
          <span className="route-eta">
            {formatDuration(summary.timeSeconds)}
            {summary.arrivalTime && (
              <span className="route-arrival">
                {' '}· {formatArrival(summary.arrivalTime)}
              </span>
            )}
          </span>
        </div>
      )}
      <ul id="directions-list" ref={listRef}>
        {maneuvers.map((step, i) => (
          <li key={i} className={i === activeIndex ? 'active' : ''}>
            <b>{step.instruction}</b>
            {step.length > 0 && (
              <>
                <br />
                <small>{(step.length * 0.621371).toFixed(1)} mi</small>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
});
