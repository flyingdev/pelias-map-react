import { useEffect } from 'react';

export function useReverseGeocode(mcRef, onNavigate) {
  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;

    mc.enableReverseGeocode(onNavigate);

    return () => mc._removeReverseGeocodeListeners();
  }, [mcRef, onNavigate]);
}
