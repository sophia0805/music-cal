"use client";

import type { EventInput } from "@fullcalendar/core";
import type { EventSourceFunc, EventClickArg } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useCallback, useRef, useState, useEffect, type PointerEvent } from "react";

type ApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  link?: string;
};

const SECONDS_PER_COLUMN = 0.48;
const PENTATONIC = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
const NOTE_COLORS = [
  "#f87171","#fb923c","#fbbf24","#a3e635",
  "#34d399","#22d3ee","#60a5fa","#a78bfa",
  "#f472b6","#e879f9","#94a3b8","#67e8f9",
];

const KEY_WIDTH = 82;
const ROW_HEIGHT = 36;
const RULER_HEIGHT = 34;
const PIXELS_PER_COL = 52;
const GRID_COLS = 7;

const RULER_FONT = '12px ui-monospace, monospace';
const ROW_LABEL_FONT = '11px ui-monospace, monospace';
const NOTE_LABEL_FONT = 'bold 11px ui-monospace, monospace';

function fillTextClipped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
) {
  if (maxWidth <= 0) return;
  let t = text;
  while (t.length > 0 && ctx.measureText(t).width > maxWidth) {
    t = t.slice(0, -1);
  }
  if (t.length > 0) ctx.fillText(t, x, y);
}

const yForWeekRow = (weekRow: number) => RULER_HEIGHT + weekRow * ROW_HEIGHT;

const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const noteColor = (midi: number) => NOTE_COLORS[midi % NOTE_COLORS.length];

const COLUMN_MIDI: readonly number[] = [
  PENTATONIC[0],
  PENTATONIC[1],
  PENTATONIC[2],
  PENTATONIC[3],
  PENTATONIC[4],
  PENTATONIC[5],
  PENTATONIC[6],
];

function midiForColumn(col: number): number {
  const c = ((col % GRID_COLS) + GRID_COLS) % GRID_COLS;
  return COLUMN_MIDI[c];
}

const CHORD_STEPS = [0, 4, 7, 12, 16, 19];

function chordVoiceMidi(col: number, voiceIndex: number): number {
  const base = midiForColumn(col);
  const n = CHORD_STEPS.length;
  const step = voiceIndex % n;
  const extraOct = Math.floor(voiceIndex / n);
  const m = base + CHORD_STEPS[step] + extraOct * 12;
  return Math.max(36, Math.min(96, m));
}

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  link?: string;
};

type ActiveRange = { start: Date; end: Date };

type LayoutNote = CalEvent & {
  weekRow: number;
  startCol: number;
  colSpan: number;
};

type LayoutCell = CalEvent & {
  weekRow: number;
  col: number;
  midi: number;
  stack: number;
  depth: number;
};

function compareCellsSameColumn(a: LayoutCell, b: LayoutCell): number {
  return (
    a.weekRow - b.weekRow ||
    a.start.getTime() - b.start.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** Lower on the roll → lower chord voice (bass/root). */
function compareCellsForChordVoicing(a: LayoutCell, b: LayoutCell): number {
  return (
    b.weekRow - a.weekRow ||
    b.stack - a.stack ||
    a.start.getTime() - b.start.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function assignChordVoicesByColumn(cells: LayoutCell[]): void {
  const byCol = new Map<number, LayoutCell[]>();
  for (const c of cells) {
    if (!byCol.has(c.col)) byCol.set(c.col, []);
    byCol.get(c.col)!.push(c);
  }
  for (const arr of byCol.values()) {
    arr.sort(compareCellsForChordVoicing);
    arr.forEach((c, i) => {
      c.midi = chordVoiceMidi(c.col, i);
    });
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseGoogleAllDayYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!m) return new Date(ymd);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayIndexBoundsForEvent(
  ev: CalEvent,
  viewStart: Date,
  totalDays: number
): { startD: number; endD: number } | null {
  const dayMs = 86400000;
  const vs = startOfLocalDay(viewStart).getTime();
  const startDayMs = startOfLocalDay(ev.start).getTime();
  const startD = Math.floor((startDayMs - vs) / dayMs);

  const endExclusiveMs = ev.allDay
    ? startOfLocalDay(ev.end).getTime()
    : startOfLocalDay(ev.end).getTime() + dayMs;

  const endD = Math.min(
    totalDays,
    Math.max(0, Math.round((endExclusiveMs - vs) / dayMs))
  );
  const s = Math.max(0, startD);
  const e = endD;
  if (e <= s) return null;
  return { startD: s, endD: e };
}

function rowSegments(
  startD: number,
  endD: number
): Array<{ weekRow: number; startCol: number; colSpan: number }> {
  const segments: Array<{ weekRow: number; startCol: number; colSpan: number }> = [];
  let i = startD;
  while (i < endD) {
    const weekRow = Math.floor(i / GRID_COLS);
    const startCol = i % GRID_COLS;
    const rowEnd = (weekRow + 1) * GRID_COLS;
    const segEnd = Math.min(endD, rowEnd);
    const colSpan = segEnd - i;
    segments.push({ weekRow, startCol, colSpan });
    i = segEnd;
  }
  return segments;
}

function layoutRollNotes(
  events: CalEvent[],
  activeRange: ActiveRange,
  totalDays: number
): LayoutNote[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: LayoutNote[] = [];

  sorted.forEach((ev) => {
    const bounds = dayIndexBoundsForEvent(ev, activeRange.start, totalDays);
    if (!bounds) return;
    const { startD, endD } = bounds;
    const segments = rowSegments(startD, endD);

    segments.forEach((seg) => {
      result.push({
        ...ev,
        weekRow: seg.weekRow,
        startCol: seg.startCol,
        colSpan: seg.colSpan,
      });
    });
  });

  return result;
}

function layoutRollCells(segments: LayoutNote[]): LayoutCell[] {
  const buckets = new Map<string, LayoutCell[]>();

  for (const seg of segments) {
    for (let k = 0; k < seg.colSpan; k++) {
      const col = seg.startCol + k;
      const key = `${seg.weekRow}-${col}`;
      const cell: LayoutCell = {
        id: seg.id,
        title: seg.title,
        start: seg.start,
        end: seg.end,
        allDay: seg.allDay,
        link: seg.link,
        weekRow: seg.weekRow,
        col,
        midi: 0,
        stack: 0,
        depth: 1,
      };
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(cell);
    }
  }

  const out: LayoutCell[] = [];
  for (const arr of buckets.values()) {
    arr.sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        a.id.localeCompare(b.id) ||
        a.col - b.col
    );
    const depth = arr.length;
    arr.forEach((c, i) => out.push({ ...c, stack: i, depth }));
  }
  assignChordVoicesByColumn(out);
  return out;
}

export default function CalendarGrid() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadColumn, setPlayheadColumn] = useState<number | null>(null);
  const [activeRange, setActiveRange] = useState<ActiveRange | null>(null);

  const calendarRef = useRef<FullCalendar>(null);
  const stopPlaybackRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rollScrollRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LayoutCell[]>([]);

  const toDate = (v: unknown): Date | null => {
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(v as string | number);
    return isNaN(d.getTime()) ? null : d;
  };

  const gridInfo = activeRange
    ? (() => {
        const totalMs = activeRange.end.getTime() - activeRange.start.getTime();
        const totalDays = Math.round(totalMs / (1000 * 60 * 60 * 24));
        const weeks = totalDays / 7;
        return { totalDays, weeks, cols: 7, rows: weeks };
      })()
    : null;

  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    const upd = () => setDpr(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  // Roll mirrors the month grid: 7 weekday columns × week rows; playhead sweeps columns.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gridInfo || !activeRange) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const totalDays = gridInfo.totalDays;
    const numWeekRows = Math.max(1, Math.ceil(totalDays / GRID_COLS));
    const rollW = KEY_WIDTH + GRID_COLS * PIXELS_PER_COL;
    const rollH = RULER_HEIGHT + numWeekRows * ROW_HEIGHT;
    const scale = dpr;

    const firstDay =
      (calendarRef.current?.getApi().getOption("firstDay") as number | undefined) ?? 0;

    canvas.width = Math.round(rollW * scale);
    canvas.height = Math.round(rollH * scale);
    canvas.style.width = `${rollW}px`;
    canvas.style.height = `${rollH}px`;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const segments = layoutRollNotes(calEvents, activeRange, totalDays);
    const cells = layoutRollCells(segments);
    layoutRef.current = cells;

    ctx.fillStyle = "#101015";
    ctx.fillRect(0, 0, rollW, rollH);

    // Column ruler (weekday headers — same order as FullCalendar)
    ctx.fillStyle = "#1a1a22";
    ctx.fillRect(KEY_WIDTH, 0, rollW - KEY_WIDTH, RULER_HEIGHT);
    ctx.strokeStyle = "#ffffff18";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(KEY_WIDTH, RULER_HEIGHT - 0.5);
    ctx.lineTo(rollW, RULER_HEIGHT - 0.5);
    ctx.stroke();

    ctx.font = RULER_FONT;
    for (let c = 0; c < GRID_COLS; c++) {
      const x = KEY_WIDTH + c * PIXELS_PER_COL;
      ctx.strokeStyle = c === 0 ? "#ffffff22" : "#ffffff0d";
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, RULER_HEIGHT);
      ctx.stroke();

      const name = DAY_NAMES[(firstDay + c) % 7];
      ctx.fillStyle = "#b4b4c8";
      const pad = 6;
      const colW = PIXELS_PER_COL - pad * 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, 1, PIXELS_PER_COL - 2, RULER_HEIGHT - 2);
      ctx.clip();
      fillTextClipped(ctx, name, x + pad, RULER_HEIGHT - 8, colW);
      ctx.restore();
    }

    // Week row labels + grid cells
    for (let wr = 0; wr < numWeekRows; wr++) {
      const y = yForWeekRow(wr);
      const firstIdx = wr * GRID_COLS;
      const d0 = new Date(activeRange.start.getTime() + firstIdx * 86400000);
      let isCurrentMonth = true;
      if (calendarRef.current) {
        const api = calendarRef.current.getApi();
        const cur = api.view.currentStart;
        isCurrentMonth =
          d0.getMonth() === cur.getMonth() && d0.getFullYear() === cur.getFullYear();
      }

      ctx.fillStyle = isCurrentMonth ? "#2a2a38" : "#22222c";
      ctx.fillRect(0, y, KEY_WIDTH, ROW_HEIGHT);
      ctx.strokeStyle = "#00000055";
      ctx.strokeRect(0.5, y + 0.5, KEY_WIDTH - 1, ROW_HEIGHT - 1);
      ctx.fillStyle = isCurrentMonth ? "#c8c8dc" : "#7a7a8e";
      ctx.font = ROW_LABEL_FONT;
      const dateStr = `${d0.getMonth() + 1}/${d0.getDate()}`;
      ctx.save();
      ctx.beginPath();
      ctx.rect(1, y + 1, KEY_WIDTH - 2, ROW_HEIGHT - 2);
      ctx.clip();
      fillTextClipped(ctx, dateStr, 6, y + ROW_HEIGHT / 2 + 4, KEY_WIDTH - 12);
      ctx.restore();

      ctx.fillStyle = wr % 2 === 0 ? "#14141c" : "#12121a";
      ctx.fillRect(KEY_WIDTH, y, rollW - KEY_WIDTH, ROW_HEIGHT);
    }

    ctx.strokeStyle = "#ffffff0a";
    ctx.lineWidth = 1;
    for (let c = 1; c < GRID_COLS; c++) {
      const x = KEY_WIDTH + c * PIXELS_PER_COL;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, RULER_HEIGHT);
      ctx.lineTo(x + 0.5, rollH);
      ctx.stroke();
    }

    ctx.strokeStyle = "#ffffff08";
    for (let wr = 0; wr <= numWeekRows; wr++) {
      const y = RULER_HEIGHT + wr * ROW_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(KEY_WIDTH, y + 0.5);
      ctx.lineTo(rollW, y + 0.5);
      ctx.stroke();
    }

    const cellPad = 4;
    const sortedCells = [...cells].sort(
      (a, b) =>
        a.weekRow - b.weekRow ||
        a.col - b.col ||
        a.stack - b.stack
    );
    for (const c of sortedCells) {
      const cellLeft = KEY_WIDTH + c.col * PIXELS_PER_COL + 1;
      const cellW = PIXELS_PER_COL - 2;
      const yBase = yForWeekRow(c.weekRow);
      const inner = ROW_HEIGHT - cellPad * 2;
      const slotH = inner / c.depth;
      const y = yBase + cellPad + c.stack * slotH;
      const h = Math.max(3, slotH - 1);
      const color = noteColor(c.midi);

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(cellLeft, y, cellW, h, 3);
      ctx.fill();

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cellLeft + 1, y + 1, cellW - 2, 2);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#0a0a10cc";
      ctx.font = NOTE_LABEL_FONT;
      const label = c.title || "(No title)";
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cellLeft, y, cellW, h, 3);
      ctx.clip();
      fillTextClipped(ctx, label, cellLeft + 4, y + h - 5, Math.max(0, cellW - 10));
      ctx.restore();
    }

    if (playheadColumn !== null) {
      const px = KEY_WIDTH + playheadColumn * PIXELS_PER_COL;
      const grad = ctx.createLinearGradient(px - 16, 0, px + 16, 0);
      grad.addColorStop(0, "#fffc0022");
      grad.addColorStop(0.5, "#fffc0088");
      grad.addColorStop(1, "#fffc0022");
      ctx.fillStyle = grad;
      ctx.fillRect(px - 16, 0, 32, rollH);

      ctx.strokeStyle = "#fffef0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, 0);
      ctx.lineTo(px + 0.5, rollH);
      ctx.stroke();
    }
  }, [calEvents, activeRange, gridInfo, playheadColumn, dpr]);

  useEffect(() => {
    if (!isPlaying || playheadColumn === null) return;
    const el = rollScrollRef.current;
    if (!el) return;
    const px = KEY_WIDTH + playheadColumn * PIXELS_PER_COL;
    const target = px - el.clientWidth * 0.38;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
  }, [isPlaying, playheadColumn]);

  const playCalendarSong = useCallback(() => {
    if (isPlaying || calEvents.length === 0 || !activeRange) return;

    const viewStart = activeRange.start;
    const totalViewDays = Math.round(
      (activeRange.end.getTime() - viewStart.getTime()) / 86400000
    );
    const totalDurationSeconds = GRID_COLS * SECONDS_PER_COLUMN;
    const segments = layoutRollNotes(calEvents, activeRange, totalViewDays);
    const cells = layoutRollCells(segments);
    const cellsByCol = new Map<number, LayoutCell[]>();
    for (const c of cells) {
      if (!cellsByCol.has(c.col)) cellsByCol.set(c.col, []);
      cellsByCol.get(c.col)!.push(c);
    }
    for (const arr of cellsByCol.values()) {
      arr.sort(compareCellsSameColumn);
    }

    type WindowWithWebKitAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor =
      window.AudioContext || (window as WindowWithWebKitAudio).webkitAudioContext;
    if (!AudioContextCtor) {
      setLoadError("Web Audio not supported.");
      return;
    }

    rollScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    setIsPlaying(true);

    const run = async () => {
      const audioContext = new AudioContextCtor();
      let cancelled = false;

      const finishPlayback = () => {
        setIsPlaying(false);
        setPlayheadColumn(null);
        if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        stopPlaybackRef.current = null;
        void audioContext.close();
      };

      stopPlaybackRef.current = () => {
        cancelled = true;
        finishPlayback();
      };

      try {
        await audioContext.resume();
      } catch {
        setLoadError("Could not start audio. Try again.");
        finishPlayback();
        return;
      }

      if (cancelled) return;

      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 6;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.connect(audioContext.destination);

      const audioStart = audioContext.currentTime + 0.05;
      const holdDuration = SECONDS_PER_COLUMN * 0.9;

      for (let col = 0; col < GRID_COLS; col++) {
        const group = cellsByCol.get(col);
        if (!group || group.length === 0) continue;

        const t0 = audioStart + col * SECONDS_PER_COLUMN;
        const n = group.length;
        const peakEach = Math.min(0.2, 0.12 / Math.sqrt(n));

        for (const c of group) {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(midiToFreq(c.midi), t0);

          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(peakEach, t0 + 0.04);
          gain.gain.setValueAtTime(peakEach, t0 + holdDuration - 0.05);
          gain.gain.linearRampToValueAtTime(0, t0 + holdDuration);

          osc.connect(gain);
          gain.connect(compressor);
          osc.start(t0);
          osc.stop(t0 + holdDuration + 0.02);
        }
      }

      const tick = () => {
        const elapsed = audioContext.currentTime - audioStart;
        const progress = Math.min(1, elapsed / totalDurationSeconds);
        const col = Math.min(GRID_COLS, elapsed / SECONDS_PER_COLUMN);
        setPlayheadColumn(col);
        if (progress < 1) {
          animationFrameRef.current = window.requestAnimationFrame(tick);
        } else {
          finishPlayback();
        }
      };

      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    void run();
  }, [calEvents, isPlaying, activeRange]);

  const onRollPointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < KEY_WIDTH || y < RULER_HEIGHT) return;

      const cellPad = 4;
      const sorted = [...layoutRef.current].sort(
        (a, b) =>
          b.weekRow - a.weekRow ||
          b.col - a.col ||
          b.stack - a.stack
      );
      for (const c of sorted) {
        const cellLeft = KEY_WIDTH + c.col * PIXELS_PER_COL + 1;
        const cellW = PIXELS_PER_COL - 2;
        const yBase = yForWeekRow(c.weekRow);
        const inner = ROW_HEIGHT - cellPad * 2;
        const slotH = inner / c.depth;
        const y0 = yBase + cellPad + c.stack * slotH;
        const h = Math.max(3, slotH - 1);
        if (x >= cellLeft && x <= cellLeft + cellW && y >= y0 && y <= y0 + h) {
          if (c.link) window.open(c.link, "_blank", "noopener,noreferrer");
          break;
        }
      }
    },
    []
  );

  const fetchEvents: EventSourceFunc = useCallback(async (info, successCallback, failureCallback) => {
    setLoadError(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const params = new URLSearchParams({ timeMin: info.startStr, timeMax: info.endStr, timeZone });
      const response = await fetch(`/api/calendar?${params.toString()}`, { credentials: "include" });
      const payload = await response.json();
      if (!response.ok) {
        setLoadError(payload.hint || payload.error || "Failed to load.");
        successCallback([]);
        return;
      }

      const list = (payload.events as ApiEvent[]) ?? [];
      const parsed: CalEvent[] = list.flatMap((e): CalEvent[] => {
        if (e.allDay) {
          const start = parseGoogleAllDayYmd(String(e.start));
          if (isNaN(start.getTime())) return [];
          let end = e.end ? parseGoogleAllDayYmd(String(e.end)) : new Date(start);
          if (!e.end || isNaN(end.getTime())) {
            end = new Date(start);
            end.setDate(end.getDate() + 1);
          }
          if (end.getTime() <= start.getTime()) {
            end = new Date(start);
            end.setDate(end.getDate() + 1);
          }
          return [{ id: e.id, title: e.title, start, end, allDay: true, link: e.link }];
        }

        const start = toDate(e.start);
        let end = toDate(e.end);
        if (!start) return [];
        if (!end || end <= start) {
          end = new Date(start);
          end.setDate(start.getDate() + 1);
        }
        return [{ id: e.id, title: e.title, start, end, allDay: false, link: e.link }];
      });

      setCalEvents(parsed);

      const fcEvents: EventInput[] = list.map((e) => ({
        id: e.id, title: e.title, start: e.start, end: e.end,
        allDay: e.allDay, extendedProps: { link: e.link },
      }));
      successCallback(fcEvents);
    } catch (err) {
      setLoadError("Could not load calendar.");
      failureCallback(err as Error);
    }
  }, []);

  const onEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const link = info.event.extendedProps.link as string | undefined;
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="w-full rounded-xl border border-zinc-200/70 bg-white text-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/70 px-4 py-3">
        <p className="text-sm text-zinc-500 font-mono tracking-tight">
          Roll matches the calendar grid: 7 weekday columns × week rows. Play sweeps Sun→Sat — every
          Sunday lines up in one column and sounds together. Click a block to open the event.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={playCalendarSong}
            disabled={isPlaying || calEvents.length === 0}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {isPlaying ? "Playing..." : "▶ Play"}
          </button>
          <button
            type="button"
            onClick={() => stopPlaybackRef.current?.()}
            disabled={!isPlaying}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            ■ Stop
          </button>
        </div>
      </div>

      {loadError && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {loadError}
        </div>
      )}

      <div className="relative w-full bg-[#0f0f14]">
        <div
          ref={rollScrollRef}
          className="max-h-[min(88vh,860px)] w-full overflow-x-auto overflow-y-auto overscroll-x-contain"
        >
          <canvas
            ref={canvasRef}
            className="block max-w-none touch-pan-x"
            onPointerDown={onRollPointerDown}
            role="img"
            aria-label="Calendar events as a piano roll"
          />
        </div>
      </div>

      <div className="fc-shell relative w-full bg-white p-2.5 md:p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          height="auto"
          dayMaxEvents={3}
          nowIndicator
          events={fetchEvents}
          eventClick={onEventClick}
          editable={false}
          selectable={false}
          datesSet={(arg) => {
            setActiveRange({ start: arg.view.activeStart, end: arg.view.activeEnd });
          }}
        />
      </div>

      <style jsx global>{`
        .fc-shell .fc {
          --fc-border-color: rgb(236, 236, 240);
          --fc-today-bg-color: rgba(15, 23, 42, 0.04);
          --fc-event-bg-color: rgb(114, 79, 114);
          font-family: inherit;
        }
        .fc-view-harness { overflow: hidden; }
      `}</style>
    </div>
  );
}