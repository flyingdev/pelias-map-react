import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { transcribeAudio } from '../utils/stt';

export default function SamChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const { recording, startRecord, stopRecord } = useVoiceRecorder();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const send = useCallback(async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/sam/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'sam', text: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'sam', text: 'Sorry, I could not reach the server.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleMicToggle = useCallback(async () => {
    if (recording) {
      const blob = await stopRecord();
      if (!blob) return;
      setTranscribing(true);
      try {
        const text = await transcribeAudio(blob);
        if (text.trim()) {
          await send(text.trim());
        }
      } catch (err) {
        console.warn('[SamChat] Transcription error:', err);
        setMessages((prev) => [
          ...prev,
          { role: 'sam', text: 'Sorry, I could not transcribe the audio.' },
        ]);
      } finally {
        setTranscribing(false);
      }
    } else {
      await startRecord();
    }
  }, [recording, stopRecord, startRecord, send]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  const placeholder = recording
    ? 'Recording...'
    : transcribing
      ? 'Transcribing...'
      : 'Ask Sam...';

  return (
    <div className="sam-chat-wrap">
      {open && (
        <div className="sam-chat-panel">
          <div className="sam-chat-header">
            <span className="sam-chat-title">Sam</span>
            <button
              className="sam-chat-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              &times;
            </button>
          </div>

          <div className="sam-chat-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="sam-chat-empty">
                Ask Sam to navigate, find places, or draw travel areas on the map.
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`sam-chat-msg sam-chat-msg-${msg.role}`}>
                {msg.text}
              </div>
            ))}
            {loading && (
              <div className="sam-chat-msg sam-chat-msg-sam sam-chat-typing">
                Thinking...
              </div>
            )}
          </div>

          <div className="sam-chat-input-row">
            <input
              ref={inputRef}
              className="sam-chat-input"
              type="text"
              placeholder={placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || recording || transcribing}
            />
            <button
              className={`sam-chat-mic ${recording ? 'recording' : ''}`}
              onClick={handleMicToggle}
              disabled={loading || transcribing}
              aria-label={recording ? 'Stop recording' : 'Start voice input'}
              title={recording ? 'Stop recording' : 'Voice input'}
            >
              {transcribing ? '...' : recording ? '\u23F9' : '\uD83C\uDFA4'}
            </button>
            <button
              className="sam-chat-send"
              onClick={() => send()}
              disabled={loading || !input.trim() || recording}
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        className={`sam-chat-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle Sam chat"
      >
        Sam
      </button>
    </div>
  );
}
