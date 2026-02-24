import { useState, useEffect, useCallback } from 'react';

export function useGpsTracking(mcRef) {
  const [speedMph, setSpeedMph] = useState(0);
  const [accuracyM, setAccuracyM] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);

  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;

    const unsubs = [
      mc.on('speed', ({ mph }) => setSpeedMph(mph)),
      mc.on('accuracy', ({ meters }) => setAccuracyM(meters)),
      mc.on('tracking', ({ active }) => setIsTracking(active)),
      mc.on('following', ({ active }) => setIsFollowing(active)),
      mc.on('activeStep', ({ index }) => setActiveStepIndex(index)),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [mcRef]);

  const startTracking = useCallback(() => mcRef.current?.startTracking(), [mcRef]);
  const stopTracking = useCallback(() => mcRef.current?.stopTracking(), [mcRef]);
  const recenter = useCallback(() => mcRef.current?.recenter(), [mcRef]);

  return {
    speedMph,
    accuracyM,
    isTracking,
    isFollowing,
    activeStepIndex,
    startTracking,
    stopTracking,
    recenter,
  };
}
