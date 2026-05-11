"use client";

import type { EventInput } from "@fullcalendar/core";
import type { EventSourceFunc, EventClickArg } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  useCallback,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  type PointerEvent,
} from "react";

export type CalendarInputEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  link?: string;
};

const SECONDS_PER_COLUMN = 0.68;

const EVENT_COLORS = [
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#0891b2",
];

function colorIndexFromId(eventId: string): number {
  let h = 0;
  for (let i = 0; i < eventId.length; i++) h = (h * 31 + eventId.charCodeAt(i)) >>> 0;
  return h % EVENT_COLORS.length;
}

function eventStyleFromId(eventId: string): {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
} {
  const bg = EVENT_COLORS[colorIndexFromId(eventId)];
  return { backgroundColor: bg, borderColor: "#44403c", textColor: "#faf7f2" };
}

const ROW_HEIGHT = 64;
const RULER_HEIGHT = 52;
const FALLBACK_ROLL_WIDTH = 672;
const GRID_COLS = 7;

const RULER_FONT = '14px ui-monospace, monospace';
const NOTE_LABEL_FONT = '600 13px ui-monospace, monospace';

function drawTextWithin(
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

const getWeekY = (weekRow: number) => RULER_HEIGHT + weekRow * ROW_HEIGHT;
const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
function rowBaseMidi(weekRow: number, numWeekRows: number): number {
  const hi = 84;
  const lo = 48;
  if (numWeekRows <= 1) return Math.round((hi + lo) / 2);
  const r = Math.max(0, Math.min(numWeekRows - 1, weekRow));
  const t = r / (numWeekRows - 1);
  return Math.round(hi - t * (hi - lo));
}

const CHORD_STEPS = [0, 4, 7, 12, 16, 19];

function voiceMidi(base: number, voiceIndex: number): number {
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

function cmpColCells(a: LayoutCell, b: LayoutCell): number {
  return (
    a.weekRow - b.weekRow ||
    a.start.getTime() - b.start.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function cmpVoiceCells(a: LayoutCell, b: LayoutCell): number {
  return (
    b.weekRow - a.weekRow ||
    b.stack - a.stack ||
    a.start.getTime() - b.start.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function setChordMidi(cells: LayoutCell[], totalDays: number): void {
  const numWeekRows = Math.max(1, Math.ceil(totalDays / GRID_COLS));
  const byCell = new Map<string, LayoutCell[]>();
  for (const c of cells) {
    const key = `${c.weekRow}-${c.col}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push(c);
  }
  for (const arr of byCell.values()) {
    arr.sort(cmpVoiceCells);
    const first = arr[0];
    const base = rowBaseMidi(first.weekRow, numWeekRows);
    arr.forEach((c, i) => {
      c.midi = voiceMidi(base, i);
    });
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseAllDayDate(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!m) return new Date(ymd);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDayBounds(
  ev: CalEvent,
  viewStart: Date,
  totalDays: number
): { startD: number; endD: number } | null {
  const dayMs = 86400000;
  const vs = dayStart(viewStart).getTime();
  const startDayMs = dayStart(ev.start).getTime();
  const startD = Math.floor((startDayMs - vs) / dayMs);

  const endExclusiveMs = ev.allDay
    ? dayStart(ev.end).getTime()
    : dayStart(ev.end).getTime() + dayMs;

  const endD = Math.min(
    totalDays,
    Math.max(0, Math.round((endExclusiveMs - vs) / dayMs))
  );
  const s = Math.max(0, startD);
  const e = endD;
  if (e <= s) return null;
  return { startD: s, endD: e };
}

function splitByWeek(
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

function buildNotes(
  events: CalEvent[],
  activeRange: ActiveRange,
  totalDays: number
): LayoutNote[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: LayoutNote[] = [];

  sorted.forEach((ev) => {
    const bounds = getDayBounds(ev, activeRange.start, totalDays);
    if (!bounds) return;
    const { startD, endD } = bounds;
    const segments = splitByWeek(startD, endD);

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

function buildCells(segments: LayoutNote[], totalDays: number): LayoutCell[] {
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
  setChordMidi(out, totalDays);
  return out;
}

type CalendarGridProps = {
  inputEvents?: CalendarInputEvent[];
};

export default function CalendarGrid({ inputEvents }: CalendarGridProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadCol, setPlayheadCol] = useState(0);
  const [activeRange, setActiveRange] = useState<ActiveRange | null>(null);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);

  const calendarRef = useRef<FullCalendar>(null);
  const stopPlaybackRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rollScrollRef = useRef<HTMLDivElement>(null);
  const rollMeasureRef = useRef<HTMLDivElement>(null);
  const rollLayoutRef = useRef({ pxPerCol: FALLBACK_ROLL_WIDTH / GRID_COLS });
  const layoutRef = useRef<LayoutCell[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);

  const parseDate = (v: unknown): Date | null => {
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(v as string | number);
    return isNaN(d.getTime()) ? null : d;
  };

  const totalDays = activeRange
    ? Math.round((activeRange.end.getTime() - activeRange.start.getTime()) / 86400000)
    : 0;

  const [dpr, setDpr] = useState(1);
  const [rollWidth, setRollWidth] = useState(0);

  useEffect(() => {
    const upd = () => setDpr(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  useEffect(() => {
    const g = masterGainRef.current;
    if (!g) return;
    const ctx = g.context;
    if (ctx.state === "closed") return;
    const v = volume;
    g.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }, [volume]);

  useLayoutEffect(() => {
    const el = rollMeasureRef.current;
    if (!el) return;
    const apply = (w: number) => {
      const floored = Math.floor(w);
      if (floored > 0) setRollWidth(floored);
    };
    apply(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      apply(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeRange || totalDays <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const numWeekRows = Math.max(1, Math.ceil(totalDays / GRID_COLS));
    const rollW =
      rollWidth > 0 ? rollWidth : FALLBACK_ROLL_WIDTH;
    const pixelsPerCol = rollW / GRID_COLS;
    rollLayoutRef.current = { pxPerCol: pixelsPerCol };
    const rollH = RULER_HEIGHT + numWeekRows * ROW_HEIGHT;
    const scale = dpr;
    const firstDay =
      (calendarRef.current?.getApi().getOption("firstDay") as number | undefined) ?? 0;
    canvas.width = Math.round(rollW * scale);
    canvas.height = Math.round(rollH * scale);
    canvas.style.width = `${rollW}px`;
    canvas.style.height = `${rollH}px`;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const segments = buildNotes(events, activeRange, totalDays);
    const cells = buildCells(segments, totalDays);
    layoutRef.current = cells;

    const rollBg = "#e3ddd2";
    const rulerBg = "#d8d0c4";
    const line = "#a8a29e";
    const labelFg = "#44403c";

    ctx.fillStyle = rollBg;
    ctx.fillRect(0, 0, rollW, rollH);

    ctx.fillStyle = rulerBg;
    ctx.fillRect(0, 0, rollW, RULER_HEIGHT);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(rollW, RULER_HEIGHT - 0.5);
    ctx.stroke();

    ctx.font = RULER_FONT;
    for (let c = 0; c < GRID_COLS; c++) {
      const x = c * pixelsPerCol;
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, RULER_HEIGHT);
      ctx.stroke();

      const name = DAY_NAMES[(firstDay + c) % 7];
      ctx.fillStyle = labelFg;
      const pad = Math.min(10, Math.max(4, pixelsPerCol * 0.07));
      const colW = pixelsPerCol - pad * 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, 1, pixelsPerCol - 2, RULER_HEIGHT - 2);
      ctx.clip();
      drawTextWithin(ctx, name, x + pad, RULER_HEIGHT - 8, colW);
      ctx.restore();
    }

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let c = 1; c < GRID_COLS; c++) {
      const x = c * pixelsPerCol;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, RULER_HEIGHT);
      ctx.lineTo(x + 0.5, rollH);
      ctx.stroke();
    }

    ctx.strokeStyle = line;
    for (let wr = 0; wr <= numWeekRows; wr++) {
      const y = RULER_HEIGHT + wr * ROW_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(rollW, y + 0.5);
      ctx.stroke();
    }

    const cellPad = 6;
    const sortedCells = [...cells].sort(
      (a, b) =>
        a.weekRow - b.weekRow ||
        a.col - b.col ||
        a.stack - b.stack
    );
    for (const c of sortedCells) {
      const colL = c.col * pixelsPerCol;
      const colR = (c.col + 1) * pixelsPerCol;
      const cellLeft = colL + 1;
      const cellW = Math.max(3, colR - colL - 2);
      const yBase = getWeekY(c.weekRow);
      const inner = ROW_HEIGHT - cellPad * 2;
      const slotH = inner / c.depth;
      const y = yBase + cellPad + c.stack * slotH;
      const h = Math.max(3, slotH - 1);
      const color = EVENT_COLORS[colorIndexFromId(c.id)];

      ctx.fillStyle = color;
      ctx.fillRect(cellLeft, y, cellW, h);

      ctx.strokeStyle = "#78716c";
      ctx.lineWidth = 1;
      ctx.strokeRect(cellLeft + 0.5, y + 0.5, cellW - 1, h - 1);

      ctx.fillStyle = "#f8fafc";
      ctx.font = NOTE_LABEL_FONT;
      const label = c.title || "(No title)";
      ctx.save();
      ctx.beginPath();
      ctx.rect(cellLeft, y, cellW, h);
      ctx.clip();
      drawTextWithin(ctx, label, cellLeft + 3, y + h - 4, Math.max(0, cellW - 8));
      ctx.restore();
    }

    const ph = Math.max(0, Math.min(GRID_COLS, playheadCol));
    const px = ph * pixelsPerCol;
    const stickW = Math.max(3, Math.min(6, pixelsPerCol * 0.045));
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(px - stickW / 2, 0, stickW, rollH);
    ctx.fillStyle = "#9c4221";
    ctx.fillRect(px - (stickW - 2) / 2, 0, Math.max(1, stickW - 2), rollH);
  }, [events, activeRange, totalDays, playheadCol, dpr, rollWidth]);

  useEffect(() => {
    if (!isPlaying) return;
    const el = rollScrollRef.current;
    if (!el) return;
    const { pxPerCol } = rollLayoutRef.current;
    const px = playheadCol * pxPerCol;
    const target = px - el.clientWidth * 0.38;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
  }, [isPlaying, playheadCol, rollWidth]);

  const playSong = useCallback(() => {
    if (isPlaying || events.length === 0 || !activeRange) return;
    const totalViewDays = Math.round(
      (activeRange.end.getTime() - activeRange.start.getTime()) / 86400000
    );
    const secPerCol = SECONDS_PER_COLUMN / speed;
    const totalDurationSeconds = GRID_COLS * secPerCol;
    const segments = buildNotes(events, activeRange, totalViewDays);
    const cells = buildCells(segments, totalViewDays);
    const cellsByCol = new Map<number, LayoutCell[]>();
    for (const c of cells) {
      if (!cellsByCol.has(c.col)) cellsByCol.set(c.col, []);
      cellsByCol.get(c.col)!.push(c);
    }
    for (const arr of cellsByCol.values()) {
      arr.sort(cmpColCells);
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
        masterGainRef.current = null;
        setIsPlaying(false);
        setPlayheadCol(0);
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

      const masterGain = audioContext.createGain();
      masterGain.gain.value = volume;
      compressor.connect(masterGain);
      masterGain.connect(audioContext.destination);
      masterGainRef.current = masterGain;

      const audioStart = audioContext.currentTime + 0.05;
      const holdDuration = secPerCol * 0.9;

      for (let col = 0; col < GRID_COLS; col++) {
        const group = cellsByCol.get(col);
        if (!group || group.length === 0) continue;

        const t0 = audioStart + col * secPerCol;
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
        const col = Math.min(GRID_COLS, elapsed / secPerCol);
        setPlayheadCol(col);
        if (progress < 1) {
          animationFrameRef.current = window.requestAnimationFrame(tick);
        } else {
          finishPlayback();
        }
      };
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    void run();
  }, [events, isPlaying, activeRange, speed, volume]);

  const onRollPointerDown = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < RULER_HEIGHT) return;
      const cellPad = 6;
      const sorted = [...layoutRef.current].sort(
        (a, b) =>
          b.weekRow - a.weekRow ||
          b.col - a.col ||
          b.stack - a.stack
      );
      const { pxPerCol } = rollLayoutRef.current;
      for (const c of sorted) {
        const colL = c.col * pxPerCol;
        const colR = (c.col + 1) * pxPerCol;
        const cellLeft = colL + 1;
        const cellW = Math.max(3, colR - colL - 2);
        const yBase = getWeekY(c.weekRow);
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
      let list: CalendarInputEvent[] = [];
      if (inputEvents) {
        list = inputEvents;
      } else {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const params = new URLSearchParams({ timeMin: info.startStr, timeMax: info.endStr, timeZone });
        const response = await fetch(`/api/calendar?${params.toString()}`, { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) {
          setLoadError(payload.error || "Failed to load.");
          successCallback([]);
          return;
        }
        list = (payload.events as CalendarInputEvent[]) ?? [];
      }

      const parsed: CalEvent[] = list.flatMap((e): CalEvent[] => {
        if (e.allDay) {
          const start = parseAllDayDate(String(e.start));
          if (isNaN(start.getTime())) return [];
          let end = e.end ? parseAllDayDate(String(e.end)) : new Date(start);
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
        const start = parseDate(e.start);
        let end = parseDate(e.end);
        if (!start) return [];
        if (!end || end <= start) {
          end = new Date(start);
          end.setDate(start.getDate() + 1);
        }
        return [{ id: e.id, title: e.title, start, end, allDay: false, link: e.link }];
      });
      setEvents(parsed);
      const fcEvents: EventInput[] = list.map((e) => {
        const eventColors = eventStyleFromId(e.id);
        return {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          extendedProps: { link: e.link },
          ...eventColors,
        };
      });
      successCallback(fcEvents);
    } catch (err) {
      setLoadError("Could not load calendar.");
      failureCallback(err as Error);
    }
  }, [inputEvents]);

  const onEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const link = info.event.extendedProps.link as string | undefined;
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="flex w-full flex-col border-2 border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] shadow-[4px_4px_0_0_var(--border)]">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-8 gap-y-3 border-b-2 border-[var(--border)] px-3 py-2 sm:px-4">
        <div className="min-w-0 text-center sm:text-left">
          <p className="m-0 text-base font-normal text-[var(--foreground)] [font-family:Georgia,serif]">
            Song Grid
          </p>
          <p className="m-0 mt-0.5 text-xs text-[var(--muted)]">
            Click a block to open the event.
          </p>
        </div>
        <div className="flex shrink-0 justify-center gap-2">
          <button
            type="button"
            onClick={playSong}
            disabled={isPlaying || events.length === 0}
            className="border-2 border-[var(--border)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#faf7f2] disabled:opacity-40 hover:bg-[var(--accent-hover)]"
          >
            {isPlaying ? "Playing…" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => stopPlaybackRef.current?.()}
            disabled={!isPlaying}
            className="border-2 border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-col flex-wrap items-stretch justify-center gap-3 border-b-2 border-[var(--border)] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-6 sm:px-4">
        <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
          <span className="w-14 shrink-0 text-[var(--foreground)]">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            className="h-2 min-w-[100px] flex-1 accent-[var(--accent)]"
            aria-label="Playback volume"
          />
          <span className="w-8 tabular-nums text-[var(--foreground)]">
            {Math.round(volume * 100)}
          </span>
        </label>
        <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
          <span className="w-14 shrink-0 text-[var(--foreground)]">Speed</span>
          <input
            type="range"
            min={50}
            max={160}
            step={5}
            value={Math.round(speed * 100)}
            onChange={(e) => setSpeed(Number(e.target.value) / 100)}
            disabled={isPlaying}
            className="h-2 min-w-[100px] flex-1 accent-[var(--accent)] disabled:opacity-45"
            aria-label="Playback speed"
          />
          <span className="w-10 tabular-nums text-[var(--foreground)]">{Math.round(speed * 100)}%</span>
        </label>
      </div>

      {loadError && (
        <div className="shrink-0 border-b-2 border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm sm:px-4">
          {loadError}
        </div>
      )}

      <div ref={rollMeasureRef} className="relative w-full shrink-0 bg-[var(--roll)]">
        <div
          ref={rollScrollRef}
          className="flex w-full justify-center overflow-visible"
        >
          <canvas
            ref={canvasRef}
            className="mx-auto block touch-pan-x"
            onPointerDown={onRollPointerDown}
            role="img"
            aria-label="Calendar events as a piano roll"
          />
        </div>
      </div>

      <div className="fc-shell relative w-full shrink-0 border-t-2 border-[var(--border)] bg-[var(--background)] p-2 md:p-3">
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
          --fc-border-color: #c9c4bc;
          --fc-button-bg-color: #faf7f2;
          --fc-button-border-color: #a8a29e;
          --fc-button-text-color: #292524;
          --fc-button-hover-bg-color: #e3ddd2;
          --fc-button-hover-border-color: #78716c;
          --fc-button-active-bg-color: #e7d8c8;
          --fc-button-active-border-color: #9c4221;
          --fc-today-bg-color: #e7d8c8;
          --fc-event-bg-color: #9c4221;
          --fc-event-border-color: #44403c;
          --fc-page-bg-color: #f0ebe3;
          --fc-neutral-text-color: #44403c;
          font-family: inherit;
        }
        .fc-shell .fc .fc-toolbar-title {
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif;
          font-size: 1.2rem;
          font-weight: 400;
        }
      `}</style>
    </div>
  );
}