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

/** Saturated blocks — readable with white labels; also used for calendar event chips. */
const FUN_EVENT_COLORS = [
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
  return h % FUN_EVENT_COLORS.length;
}

function eventStyleFromId(eventId: string): {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
} {
  const bg = FUN_EVENT_COLORS[colorIndexFromId(eventId)];
  return { backgroundColor: bg, borderColor: "#475569", textColor: "#f8fafc" };
}

const KEY_WIDTH = 0;
const ROW_HEIGHT = 36;
const RULER_HEIGHT = 34;
const PIXELS_PER_COL = 52;
const GRID_COLS = 7;

const RULER_FONT = '12px ui-monospace, monospace';
const NOTE_LABEL_FONT = '11px ui-monospace, monospace';

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

function baseMidiFromWeekRow(weekRow: number, numWeekRows: number): number {
  const hi = 84;
  const lo = 48;
  if (numWeekRows <= 1) return Math.round((hi + lo) / 2);
  const r = Math.max(0, Math.min(numWeekRows - 1, weekRow));
  const t = r / (numWeekRows - 1);
  return Math.round(hi - t * (hi - lo));
}

const CHORD_STEPS = [0, 4, 7, 12, 16, 19];

function chordVoiceFromBase(base: number, voiceIndex: number): number {
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

function compareCellsForChordVoicing(a: LayoutCell, b: LayoutCell): number {
  return (
    b.weekRow - a.weekRow ||
    b.stack - a.stack ||
    a.start.getTime() - b.start.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function assignChordMidiByCellHeight(cells: LayoutCell[], totalDays: number): void {
  const numWeekRows = Math.max(1, Math.ceil(totalDays / GRID_COLS));
  const byCell = new Map<string, LayoutCell[]>();
  for (const c of cells) {
    const key = `${c.weekRow}-${c.col}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push(c);
  }
  for (const arr of byCell.values()) {
    arr.sort(compareCellsForChordVoicing);
    const first = arr[0];
    const base = baseMidiFromWeekRow(first.weekRow, numWeekRows);
    arr.forEach((c, i) => {
      c.midi = chordVoiceFromBase(base, i);
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

function layoutRollCells(segments: LayoutNote[], totalDays: number): LayoutCell[] {
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
  assignChordMidiByCellHeight(out, totalDays);
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
    const cells = layoutRollCells(segments, totalDays);
    layoutRef.current = cells;

    const rollBg = "#f1f5f9";
    const rulerBg = "#e8eef4";
    const line = "#cbd5e1";
    const labelFg = "#334155";

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
      const x = c * PIXELS_PER_COL;
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, RULER_HEIGHT);
      ctx.stroke();

      const name = DAY_NAMES[(firstDay + c) % 7];
      ctx.fillStyle = labelFg;
      const pad = 6;
      const colW = PIXELS_PER_COL - pad * 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, 1, PIXELS_PER_COL - 2, RULER_HEIGHT - 2);
      ctx.clip();
      fillTextClipped(ctx, name, x + pad, RULER_HEIGHT - 8, colW);
      ctx.restore();
    }

    ctx.fillStyle = rollBg;
    ctx.fillRect(0, RULER_HEIGHT, rollW, rollH - RULER_HEIGHT);

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let c = 1; c < GRID_COLS; c++) {
      const x = c * PIXELS_PER_COL;
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

    const cellPad = 4;
    const sortedCells = [...cells].sort(
      (a, b) =>
        a.weekRow - b.weekRow ||
        a.col - b.col ||
        a.stack - b.stack
    );
    for (const c of sortedCells) {
      const cellLeft = c.col * PIXELS_PER_COL + 1;
      const cellW = PIXELS_PER_COL - 2;
      const yBase = yForWeekRow(c.weekRow);
      const inner = ROW_HEIGHT - cellPad * 2;
      const slotH = inner / c.depth;
      const y = yBase + cellPad + c.stack * slotH;
      const h = Math.max(3, slotH - 1);
      const color = FUN_EVENT_COLORS[colorIndexFromId(c.id)];

      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(cellLeft, y, cellW, h);

      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.strokeRect(cellLeft + 0.5, y + 0.5, cellW - 1, h - 1);

      ctx.fillStyle = "#f8fafc";
      ctx.font = NOTE_LABEL_FONT;
      const label = c.title || "(No title)";
      ctx.save();
      ctx.beginPath();
      ctx.rect(cellLeft, y, cellW, h);
      ctx.clip();
      fillTextClipped(ctx, label, cellLeft + 3, y + h - 4, Math.max(0, cellW - 8));
      ctx.restore();
    }

    if (playheadColumn !== null) {
      const px = playheadColumn * PIXELS_PER_COL;
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1;
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
    const px = playheadColumn * PIXELS_PER_COL;
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
    const cells = layoutRollCells(segments, totalViewDays);
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
      if (y < RULER_HEIGHT) return;

      const cellPad = 4;
      const sorted = [...layoutRef.current].sort(
        (a, b) =>
          b.weekRow - a.weekRow ||
          b.col - a.col ||
          b.stack - a.stack
      );
      for (const c of sorted) {
        const cellLeft = c.col * PIXELS_PER_COL + 1;
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

      const fcEvents: EventInput[] = list.map((e) => {
        const colors = eventStyleFromId(e.id);
        return {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          extendedProps: { link: e.link },
          ...colors,
        };
      });
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
    <div className="w-full border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <p className="m-0 text-sm text-[var(--muted)]">Click a block to open the event.</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={playCalendarSong}
            disabled={isPlaying || calEvents.length === 0}
            className="border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm disabled:opacity-40"
          >
            {isPlaying ? "Playing…" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => stopPlaybackRef.current?.()}
            disabled={!isPlaying}
            className="border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm disabled:opacity-40"
          >
            Stop
          </button>
        </div>
      </div>

      {loadError && (
        <div className="border-b border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
          {loadError}
        </div>
      )}

      <div className="relative w-full bg-[#f1f5f9]">
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

      <div className="fc-shell relative w-full border-t border-[var(--border)] bg-[var(--background)] p-2 md:p-2">
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
          --fc-border-color: #e2e8f0;
          --fc-button-bg-color: #ffffff;
          --fc-button-border-color: #cbd5e1;
          --fc-button-text-color: #334155;
          --fc-button-hover-bg-color: #f1f5f9;
          --fc-today-bg-color: #e0f2fe;
          --fc-event-bg-color: #2563eb;
          --fc-event-border-color: #475569;
          --fc-page-bg-color: #f6f8fb;
          --fc-neutral-text-color: #334155;
          font-family: inherit;
        }
        .fc-shell .fc .fc-toolbar-title {
          font-size: 1rem;
          font-weight: normal;
        }
        .fc-view-harness {
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}