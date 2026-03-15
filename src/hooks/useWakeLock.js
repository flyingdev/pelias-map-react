import { useState, useEffect, useCallback } from 'react';

export function useWakeLock(isNavigating) {
  const [wakeLock, setWakeLock] = useState(null);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
      } catch (err) {
        console.warn('[WakeLock] Failed:', err.message);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock !== null) {
      await wakeLock.release();
      setWakeLock(null);
    }
  }, [wakeLock]);

  // Reacquire when user returns to the tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isNavigating && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isNavigating, requestWakeLock]);

  // Lock when navigating, release when done
  useEffect(() => {
    if (isNavigating) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isNavigating, requestWakeLock, releaseWakeLock]);
}
