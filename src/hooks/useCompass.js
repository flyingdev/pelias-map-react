import { useState, useCallback } from 'react';

export function useCompass() {
  const [heading, setHeading] = useState(0);
  const [isCompassActive, setIsCompassActive] = useState(false);

  const handleOrientation = useCallback((event) => {
    let currentHeading = 0;
    if (event.webkitCompassHeading) {
      currentHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
      currentHeading = 360 - event.alpha;
    }
    setHeading(currentHeading);
  }, []);

  const toggleCompass = useCallback(async () => {
    if (isCompassActive) {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      setIsCompassActive(false);
      return;
    }

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, true);
          setIsCompassActive(true);
        }
      } else {
        if ('ondeviceorientationabsolute' in window) {
          window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        } else {
          window.addEventListener('deviceorientation', handleOrientation, true);
        }
        setIsCompassActive(true);
      }
    } catch (err) {
      console.warn('[Compass] Error:', err);
    }
  }, [isCompassActive, handleOrientation]);

  return { heading, isCompassActive, toggleCompass };
}
