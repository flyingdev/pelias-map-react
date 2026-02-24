import React, { useState, useCallback, useEffect } from 'react';

const CONTOUR_OPTIONS = [5, 10, 15, 20];
const COLORS = { 5: '#44bb44', 10: '#ffcc00', 15: '#ff8800', 20: '#ff4444' };
const MODES = [
  { key: 'auto',       label: 'Drive' },
  { key: 'bicycle',   label: 'Bike'  },
  { key: 'pedestrian', label: 'Walk' },
];

export default React.memo(function IsochronePanel({
  mcRef,
  userLocation,
  activeCosting,
  contours: defaultContours = [5, 10, 15],
  enabled,
  onEnabledChange,
}) {
  const [open, setOpen]       = useState(false);
  const [selected, setSelected] = useState(defaultContours);
  const [isoMode, setIsoMode] = useState(activeCosting ?? 'auto');
  const [loading, setLoading] = useState(false);

  // Keep isoMode in sync if the parent routing mode changes (only when panel is closed)
  useEffect(() => {
    if (!open) setIsoMode(activeCosting ?? 'auto');
  }, [activeCosting, open]);

  const toggleContour = useCallback((time) => {
    setSelected((prev) =>
      prev.includes(time)
        ? prev.filter((t) => t !== time)
        : [...prev, time].sort((a, b) => a - b)
    );
  }, []);

  const handleShow = useCallback(async () => {
    const mc = mcRef.current;
    if (!mc || !userLocation || selected.length === 0) return;
    setLoading(true);
    try {
      await mc.fetchIsochrone(userLocation, { contours: selected, costing: isoMode });
      onEnabledChange?.(true);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }, [mcRef, userLocation, selected, isoMode, onEnabledChange]);

  const handleClear = useCallback(() => {
    mcRef.current?.clearIsochrone();
    onEnabledChange?.(false);
  }, [mcRef, onEnabledChange]);

  return (
    <div className="isochrone-wrap">
      {open && (
        <div className="isochrone-panel">
          <div className="isochrone-title">Reachable Area</div>

          {/* Mode selector */}
          <div className="isochrone-mode">
            {MODES.map(({ key, label }) => (
              <button
                key={key}
                className={`isochrone-mode-btn${isoMode === key ? ' active' : ''}`}
                onClick={() => setIsoMode(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Contour checkboxes */}
          <div className="isochrone-contours">
            {CONTOUR_OPTIONS.map((t) => (
              <label key={t} className="isochrone-check">
                <input
                  type="checkbox"
                  checked={selected.includes(t)}
                  onChange={() => toggleContour(t)}
                />
                <span style={{ color: COLORS[t], fontWeight: 600 }}>{t} min</span>
              </label>
            ))}
          </div>

          <div className="isochrone-actions">
            <button
              className="isochrone-btn isochrone-btn-show"
              onClick={handleShow}
              disabled={loading || !userLocation || selected.length === 0}
            >
              {loading ? 'Loading…' : 'Show'}
            </button>
            {enabled && (
              <button className="isochrone-btn isochrone-btn-clear" onClick={handleClear}>
                Clear
              </button>
            )}
          </div>

          {!userLocation && (
            <div className="isochrone-warn">Waiting for GPS location…</div>
          )}
        </div>
      )}
      <button
        className={`isochrone-toggle${enabled ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Reachable area"
      >
        ⏱
      </button>
    </div>
  );
});
