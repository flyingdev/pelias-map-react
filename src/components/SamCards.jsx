import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Drawer, ActionIcon, Group, Text, Box, Badge, ScrollArea, Loader,
} from '@mantine/core';
import { IconX, IconRefresh } from '@tabler/icons-react';

/**
 * Findings — what Sam actually found for you, on the phone.
 *
 * A card is a FINDING, not a call. Sam answering "no street closures today" is
 * a perfectly good answer and a useless card, so empty results are filtered out
 * rather than pinned to a wall.
 *
 * Source is sam.tool_called in ClickHouse, which has been recording every tool
 * call with its arguments and result since Sprint 3 - built for monitoring, and
 * it turns out "what did Sam find for me" and "what did Sam do" are the same
 * question asked twice.
 */

// A coloured badge rather than an icon: it reads at a glance, it labels the
// card honestly, and it costs no icon imports that might not exist.
const KIND = {
  look_up_book:         { label: 'Book',      color: 'violet' },
  find_nearest_place:   { label: 'Place',     color: 'blue' },
  find_place_by_name:   { label: 'Place',     color: 'blue' },
  get_road_closures:    { label: 'Roadworks', color: 'orange' },
  get_local_happenings: { label: "What's on", color: 'grape' },
  get_weather:          { label: 'Weather',   color: 'cyan' },
  my_notes:             { label: 'Note',      color: 'yellow' },
  send_sms:             { label: 'Text',      color: 'teal' },
  get_time:             { label: 'Time',      color: 'gray' },
  calculate:            { label: 'Maths',     color: 'gray' },
};

const kindOf = (tool) => KIND[tool] || { label: tool || 'Sam', color: 'gray' };

/** What was asked, in words, from the tool arguments. */
function askedFor(tool, args) {
  if (!args || typeof args !== 'object') return '';
  const v = (k) => (args[k] == null ? '' : String(args[k]).trim());
  switch (tool) {
    case 'look_up_book':
      return v('title') || v('author');
    case 'find_nearest_place':
      return [v('cuisine'), (v('category') || '').replace(/_/g, ' ')].filter(Boolean).join(' ');
    case 'find_place_by_name':
      return v('name');
    case 'get_road_closures':
      return [v('street'), v('when'), v('near') && `near ${v('near')}`].filter(Boolean).join(', ');
    case 'get_local_happenings':
      return [v('venue'), v('when')].filter(Boolean).join(', ');
    case 'get_weather':
      return v('location');
    case 'my_notes':
      return v('add');
    default:
      return Object.values(args).filter((x) => x !== '' && x != null).join(', ');
  }
}

/**
 * An answer that found nothing is not a finding.
 *
 * Deliberately a shape test rather than a list of prefixes - the first version
 * was a growing NOT LIKE list and "I have nothing listed for State Theater"
 * walked straight through it.
 */
const EMPTY = /^(i (could not|couldn't|cannot|can't|do not|don't|did not|have nothing)|no |none|that is (everything|all)|sorry)/i;
const isFinding = (r) => !!r && r.trim().length > 0 && !EMPTY.test(r.trim());

/** Same tool, same question, same answer, seconds apart - one thing happened. */
function dedupe(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const key = `${r.tool}|${JSON.stringify(r.args)}|${r.result}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dayLabel(d) {
  const today = new Date();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const timeLabel = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const SAMPLE = [
  { at: '2026-09-08 22:29:55', tool: 'find_nearest_place', args: { category: 'restaurant' }, result: "The nearest restaurant is Kelly's Steak and Seafood, about 0.1 miles away (open now until 8 PM)." },
  { at: '2026-09-08 22:28:48', tool: 'look_up_book', args: { title: 'The Magic Mountain' }, result: 'That is by Thomas Mann. It came out in 1924.' },
  { at: '2026-09-08 17:32:46', tool: 'get_road_closures', args: { near: 'Boalsburg' }, result: 'Gas work on West South Hill Avenue. That is about three miles away.' },
  { at: '2026-09-08 16:43:11', tool: 'get_local_happenings', args: { when: 'today' }, result: "Boalsburg Farmers Market at 2 PM. Nittany Valley Writers' Network Meeting at 6 PM." },
  { at: '2026-09-07 02:23:49', tool: 'get_weather', args: { location: 'Boalsburg, PA' }, result: "In Boalsburg, Pennsylvania, it's currently 62 degrees Fahrenheit and clear." },
];

export default function SamCards() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Explicit opt-in so the layout can be reviewed before the endpoint exists.
  // Never a silent fallback - sample rows shown as real findings would be the
  // same class of lie we spend our time removing from Sam's answers.
  const demo = typeof window !== 'undefined' && window.location.search.includes('cardsDemo');

  const load = useCallback(async () => {
    if (demo) { setRows(SAMPLE); setError(''); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sam/cards?limit=60');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : (data.cards || []));
    } catch (e) {
      setError(String(e.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [demo]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const days = useMemo(() => {
    const findings = dedupe(rows.filter((r) => isFinding(r.result)));
    const groups = new Map();
    for (const r of findings) {
      // ClickHouse returns "YYYY-MM-DD HH:MM:SS.mmm"; Safari will not parse that
      // with a space, so normalise before constructing the Date.
      const d = new Date(String(r.at).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) continue;
      const key = dayLabel(d);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...r, when: d });
    }
    return [...groups.entries()];
  }, [rows]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed',
          bottom: 24,
          left: 'calc(50% + 58px)',
          zIndex: 1000,
          padding: '12px 20px',
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
        aria-label="Toggle findings"
      >
        Findings
      </button>

      <Drawer
        opened={open}
        onClose={() => setOpen(false)}
        position="bottom"
        size="60vh"
        withCloseButton={false}
        zIndex={2000}
        overlayProps={{ opacity: 0.2, blur: 2 }}
        styles={{
          content: {
            backgroundColor: 'rgba(255,255,255,0.9)',
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
        <Group justify="space-between" mb="sm">
          <Box>
            <Text fw={700} size="md" c="#222">Findings</Text>
            <Text size="xs" c="dimmed">
              {demo ? 'Sample data — not real findings' : 'What Sam found for you'}
            </Text>
          </Box>
          <Group gap={4}>
            <ActionIcon onClick={load} radius="xl" size="lg" variant="subtle" aria-label="Refresh">
              <IconRefresh size={18} color="#888" />
            </ActionIcon>
            <ActionIcon onClick={() => setOpen(false)} radius="xl" size="lg" variant="subtle" aria-label="Close">
              <IconX size={18} color="#888" />
            </ActionIcon>
          </Group>
        </Group>

        <ScrollArea style={{ flexGrow: 1 }}>
          {loading && (
            <Group justify="center" mt="xl"><Loader size="sm" color="blue" type="dots" /></Group>
          )}

          {!loading && error && (
            <Text size="sm" c="dimmed" ta="center" mt="xl">
              Could not load findings ({error}).
            </Text>
          )}

          {!loading && !error && days.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" mt="xl">
              Nothing yet. Ask Sam something on the phone and it will show up here.
            </Text>
          )}

          {days.map(([label, items]) => (
            <Box key={label} mb="md">
              <Text size="xs" fw={700} c="dimmed" mb={6} tt="uppercase">{label}</Text>
              {items.map((r, i) => {
                const kind = kindOf(r.tool);
                const asked = askedFor(r.tool, r.args);
                return (
                  <Box
                    key={`${label}-${i}`}
                    p="sm"
                    mb={8}
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      border: '1px solid #e9ecef',
                      borderRadius: 14,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}
                  >
                    <Group justify="space-between" mb={4} wrap="nowrap">
                      <Badge color={kind.color} variant="light" radius="sm" size="sm">
                        {kind.label}
                      </Badge>
                      <Text size="xs" c="dimmed">{timeLabel(r.when)}</Text>
                    </Group>
                    {asked && (
                      <Text size="sm" fw={600} c="#222" mb={2}>{asked}</Text>
                    )}
                    <Text size="sm" c="#495057" style={{ lineHeight: 1.45 }}>
                      {r.result}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </ScrollArea>
      </Drawer>
    </>
  );
}
