import React, { useState, useRef, useEffect, useCallback } from 'react';

export default function SamChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

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

  const send = useCallback(async () => {
    const text = input.trim();
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

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

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
              placeholder="Ask Sam..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="sam-chat-send"
              onClick={send}
              disabled={loading || !input.trim()}
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
