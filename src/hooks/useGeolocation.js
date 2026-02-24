import { useState, useEffect } from 'react';

export function useGeolocation(mcRef) {
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;

    const unsub = mc.on('userLocation', (loc) => setUserLocation(loc));
    mc.locateUser();

    return unsub;
  }, [mcRef]);

  return userLocation;
}
