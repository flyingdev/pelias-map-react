import { useEffect, useRef } from 'react';
import { MapController } from '../map-core';

export function useMap(containerRef, opts) {
  const mcRef = useRef(null);

  useEffect(() => {
    if (mcRef.current || !containerRef.current) return;

    mcRef.current = new MapController(containerRef.current, opts);

    return () => {
      mcRef.current.destroy();
      mcRef.current = null;
    };
  }, [containerRef]);

  return mcRef;
}
