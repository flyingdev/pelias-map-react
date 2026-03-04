import { CONFIG } from '../config';

/**
 * Send a recorded audio Blob to the Whisper transcription endpoint.
 * Returns the transcribed text string, or throws on failure.
 */
export async function transcribeAudio(audioBlob) {
  const form = new FormData();
  form.append('file', audioBlob, 'recording.webm');

  const res = await fetch(CONFIG.samTranscribe, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Transcription failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.transcript || '';
}
