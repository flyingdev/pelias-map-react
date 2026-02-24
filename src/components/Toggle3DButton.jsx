import React, { useState, useCallback } from 'react';

export default React.memo(function Toggle3DButton({ mcRef }) {
  const [is3D, setIs3D] = useState(false);

  const toggle = useCallback(() => {
    const mc = mcRef.current;
    if (!mc) return;
    const result = mc.toggle3D();
    setIs3D(result);
  }, [mcRef]);

  return (
    <button id="toggle-3d-btn" onClick={toggle}>
      {is3D ? '2D' : '3D'}
    </button>
  );
});
