import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Drawer, TextInput, ActionIcon, Group, Text, Box,
  ScrollArea, Avatar, Loader,
} from '@mantine/core';
import { IconMicrophone, IconSend, IconX, IconRobotFace, IconPlayerStop, IconStar, IconTrash } from '@tabler/icons-react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { transcribeAudio } from '../utils/stt';
import { useAudioQueue } from '../context/AudioQueueContext';

const pulseStyle = `
  @keyframes pulse-record {
    0%   { box-shadow: 0 0 0 0 rgba(224, 49, 49, 0.7); }
    70%  { box-shadow: 0 0 0 12px rgba(224, 49, 49, 0); }
    100% { box-shadow: 0 0 0 0 rgba(224, 49, 49, 0); }
  }
  .recording-active {
    animation: pulse-record 1.5s infinite !important;
    background-color: #e03131 !important;
    color: white !important;
  }
`;

export default function SamChat({ userLocation, favorites = [], onRemoveFavorite }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const listRef = useRef(null);

  const { recording, startRecord, stopRecord } = useVoiceRecorder();
  const { enqueueAudio } = useAudioQueue();

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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
        body: JSON.stringify({
          message: text,
          context: {
            lat: userLocation?.lat || null,
            lng: userLocation?.lng || null,
            savedPlaces: favorites.length > 0 ? favorites : undefined,
          },
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'sam', text: data.reply }]);
      if (data.reply) {
        enqueueAudio(data.reply);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'sam', text: 'Sorry, I could not reach the server.' }]);
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
        if (text.trim()) await send(text.trim());
      } catch (err) {
        console.warn('[SamChat] Transcription error:', err);
        setMessages((prev) => [...prev, { role: 'sam', text: 'Sorry, I could not transcribe the audio.' }]);
      } finally {
        setTranscribing(false);
      }
    } else {
      await startRecord();
    }
  }, [recording, stopRecord, startRecord, send]);

  const placeholder = recording ? 'Recording...' : transcribing ? 'Transcribing...' : 'Ask Sam to navigate or find places...';

  return (
    <>
      <style>{pulseStyle}</style>

      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          padding: '12px 28px',
          borderRadius: 24,
          background: open ? '#228be6' : '#1a1a2e',
          color: 'white',
          fontWeight: 700,
          fontSize: 15,
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          letterSpacing: 1,
        }}
        aria-label="Toggle Sam chat"
      >
        Sam
      </button>

      <Drawer
        opened={open}
        onClose={() => setOpen(false)}
        position="bottom"
        size="45vh"
        withCloseButton={false}
        zIndex={2000}
        overlayProps={{ opacity: 0.2, blur: 2 }}
        styles={{
          content: {
            backgroundColor: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(14px)',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.12)',
          },
          body: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '16px 20px 20px',
          },
        }}
      >
        {/* Header */}
        <Group justify="space-between" mb="sm">
          <Group gap="sm">
            <Avatar color="blue" radius="xl" size="md">
              <IconRobotFace size={20} />
            </Avatar>
            <Box>
              <Text fw={700} size="md" c="#222">Sam</Text>
              <Text size="xs" c="dimmed">Scisbo Spatial Assistant</Text>
            </Box>
          </Group>
          <ActionIcon onClick={() => setOpen(false)} radius="xl" size="lg" variant="subtle">
            <IconX size={18} color="#888" />
          </ActionIcon>
        </Group>

        {/* Favorites */}
        {favorites.length > 0 && (
          <Box mb="xs">
            <Text size="xs" fw={600} c="dimmed" mb={4}>Saved Places</Text>
            <Group gap={6} wrap="wrap">
              {favorites.map((fav) => (
                <Box
                  key={fav.name}
                  px="sm" py={4}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    backgroundColor: '#fff9db', border: '1px solid #fcc419',
                    borderRadius: 16, cursor: 'pointer', fontSize: 12,
                  }}
                >
                  <IconStar size={12} color="#f59f00" />
                  <span
                    onClick={() => send(`Navigate to ${fav.name}`)}
                    style={{ fontWeight: 600 }}
                  >{fav.name}</span>
                  <IconTrash
                    size={12} color="#aaa"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onRemoveFavorite?.(fav.name)}
                  />
                </Box>
              ))}
            </Group>
          </Box>
        )}

        {/* Messages */}
        <ScrollArea style={{ flexGrow: 1 }} mb="sm" viewportRef={listRef}>
          {messages.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" mt="xl">
              Ask Sam to navigate, find places, or draw travel areas on the map.
            </Text>
          )}
          {messages.map((msg, i) => (
            <Box
              key={i}
              mb="xs"
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <Box
                p="sm"
                style={{
                  backgroundColor: msg.role === 'user' ? '#228be6' : '#f1f3f5',
                  color: msg.role === 'user' ? 'white' : '#222',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  maxWidth: '80%',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {msg.text}
              </Box>
            </Box>
          ))}
          {loading && (
            <Box mb="xs" style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Box p="sm" style={{ backgroundColor: '#f1f3f5', borderRadius: '18px 18px 18px 4px' }}>
                <Loader size="xs" color="blue" type="dots" />
              </Box>
            </Box>
          )}
        </ScrollArea>

        {/* Input */}
        <TextInput
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          radius="xl"
          size="md"
          disabled={loading || recording || transcribing}
          styles={{
            input: {
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: '1px solid #dee2e6',
              boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
              paddingRight: 90,
            },
          }}
          rightSectionWidth={88}
          rightSection={
            <Group gap={4} wrap="nowrap">
              {transcribing ? (
                <ActionIcon size="lg" radius="xl" variant="subtle" disabled>
                  <Loader size="xs" color="blue" />
                </ActionIcon>
              ) : (
                <ActionIcon
                  size="lg"
                  radius="xl"
                  variant={recording ? 'filled' : 'subtle'}
                  color={recording ? 'red' : 'gray'}
                  onClick={handleMicToggle}
                  disabled={loading || transcribing}
                  className={recording ? 'recording-active' : ''}
                  aria-label={recording ? 'Stop recording' : 'Start voice input'}
                >
                  {recording ? <IconPlayerStop size={18} /> : <IconMicrophone size={18} />}
                </ActionIcon>
              )}
              <ActionIcon
                size="lg"
                radius="xl"
                variant="filled"
                color="blue"
                onClick={() => send()}
                disabled={loading || !input.trim() || recording}
                aria-label="Send message"
              >
                <IconSend size={16} />
              </ActionIcon>
            </Group>
          }
        />
      </Drawer>
    </>
  );
}
