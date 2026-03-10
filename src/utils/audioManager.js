// Shared audio manager — ensures Sam and navigation never talk over each other.
// Both tts.js and AudioQueueContext register here so either can stop the other.

let stopFn = null;

export function registerStopAudio(fn) {
  stopFn = fn;
}

export function stopAllAudio() {
  if (stopFn) stopFn();
}
