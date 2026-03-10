import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { registerStopAudio } from '../utils/audioManager';

const AudioQueueContext = createContext();

export function AudioQueueProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const currentAudioRef = useRef(null);

  const enqueueAudio = useCallback((text) => {
    if (!text) return;
    const clean = text.replace(/[*_`#%~^\\]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const url = `/api/sam/speak?text=${encodeURIComponent(clean)}`;
    setQueue((prev) => [...prev, url]);
  }, []);

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setQueue([]);
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    registerStopAudio(stopAudio);
  }, [stopAudio]);

  useEffect(() => {
    if (isPlaying || queue.length === 0) return;

    const url = queue[0];
    setIsPlaying(true);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const audio = new Audio(blobUrl);
        currentAudioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(blobUrl);
          currentAudioRef.current = null;
          setQueue((prev) => prev.slice(1));
          setIsPlaying(false);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          currentAudioRef.current = null;
          setQueue((prev) => prev.slice(1));
          setIsPlaying(false);
        };

        audio.play().catch(() => {
          currentAudioRef.current = null;
          setQueue((prev) => prev.slice(1));
          setIsPlaying(false);
        });
      })
      .catch(() => {
        setQueue((prev) => prev.slice(1));
        setIsPlaying(false);
      });
  }, [queue, isPlaying]);

  return (
    <AudioQueueContext.Provider value={{ enqueueAudio, stopAudio, isPlaying }}>
      {children}
    </AudioQueueContext.Provider>
  );
}

export const useAudioQueue = () => useContext(AudioQueueContext);
