import { useState, useRef, useCallback } from 'react';

/**
 * Hook that manages browser microphone recording via MediaRecorder.
 *
 * Returns:
 *   recording    - boolean, true while actively recording
 *   startRecord  - () => Promise<void>, begins recording
 *   stopRecord   - () => Promise<Blob>, stops and returns the audio Blob
 *   error        - string | null, error message if mic access failed
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecord = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (err) {
      setError('Microphone access denied');
      console.warn('[useVoiceRecorder]', err);
    }
  }, []);

  const stopRecord = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') {
        resolve(null);
        return;
      }

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        mr.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        setRecording(false);
        resolve(blob);
      };

      mr.stop();
    });
  }, []);

  return { recording, startRecord, stopRecord, error };
}
