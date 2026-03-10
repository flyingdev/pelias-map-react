// Piper TTS via gateway route (avoids mixed-content on HTTPS pages)
import { stopAllAudio } from './audioManager';

let piperEnabled = true;

// Module-level Audio ref — lets us interrupt any currently playing speech
let currentAudio = null;

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    // Revoke blob URL if we created one
    if (currentAudio.src?.startsWith('blob:')) {
      URL.revokeObjectURL(currentAudio.src);
    }
    currentAudio = null;
  }
}

// --- Piper TTS (primary) ---
// Fetches audio as a blob first so a 404/error page never reaches Audio(),
// which would throw NotSupportedError and make the error look scarier than it is.
async function speakPiper(text) {
  stopAllAudio();
  stopCurrentAudio();

  try {
    const url = `/api/sam/speak?text=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Piper HTTP ${res.status}`);

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio(blobUrl);
    currentAudio = audio;

    await audio.play();

    audio.onended = () => {
      URL.revokeObjectURL(blobUrl);
      if (currentAudio === audio) currentAudio = null;
    };
  } catch (err) {
    console.warn('Piper TTS unavailable, falling back to Web Speech:', err.message);
    currentAudio = null;
    speakBrowser(text);
  }
}

// --- Web Speech API (fallback) ---
// Voices load asynchronously on first call — wait for them if not ready yet.
function speakBrowser(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const msg = new SpeechSynthesisUtterance(text);
  msg.rate = 1.0;
  msg.pitch = 1.0;
  msg.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    window.speechSynthesis.speak(msg);
  } else {
    // Voices haven't loaded yet — speak as soon as they do
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.speak(msg);
    };
  }
}

// --- Unified speak() ---
export function speak(text) {
  if (!text) return;
  if (piperEnabled) {
    speakPiper(text); // async, errors handled internally
    return;
  }
  speakBrowser(text);
}

export function setPiperEnabled(enabled) {
  piperEnabled = enabled;
}
