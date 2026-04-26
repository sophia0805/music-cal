"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventClickArg, EventSourceFunc } from "@fullcalendar/core";
import { useCallback, useRef, useState } from "react";

type ApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  link?: string;
};

type ParsedEvent = {
  start: Date;
  end: Date | null;
};

const NOTE_DURATION = 0.22;
const NOTE_GAP = 0.04;

export default function CalendarGrid() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventsForSound, setEventsForSound] = useState<EventInput[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadProgress, setPlayheadProgress] = useState(0);
  const stopPlaybackRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const toDate = (value: Date | string | undefined): Date | null => {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const noteFromDate = (date: Date) => {
    const day = date.getDate();
    const baseMaxMidi = 72;
    const baseMinMidi = 48;
    const midi =
      baseMinMidi +
      Math.round(((day - 1) / 30) * (baseMaxMidi - baseMinMidi));
    const allowedOffsets = [0, 2, 4, 7, 9];
    const pitchClass = midi % 12;
    const octave = Math.floor(midi / 12);
    const closest = allowedOffsets.reduce((prev, curr) =>
      Math.abs(curr - pitchClass) < Math.abs(prev - pitchClass) ? curr : prev,
    );
    const quantizedMidi = octave * 12 + closest;
    return 440 * Math.pow(2, (quantizedMidi - 69) / 12);
  };

  const playCalendarSong = useCallback(() => {
    if (isPlaying || eventsForSound.length === 0) {
      return;
    }
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      setLoadError("Web Audio is not supported in this browser.");
      return;
    }

    setLoadError(null);
    const audioContext = new AudioContextCtor();
    const now = audioContext.currentTime + 0.05;
    const sorted: ParsedEvent[] = [...eventsForSound]
      .map((event) => ({
        start: toDate(event.start as Date | string | undefined),
        end: toDate(event.end as Date | string | undefined),
      }))
      .filter((event): event is ParsedEvent => event.start !== null)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (sorted.length === 0) {
      void audioContext.close();
      return;
    }

    sorted.forEach((event, index) => {
      const startTime = now + index * (NOTE_DURATION + NOTE_GAP);
      const frequency = noteFromDate(event.start);
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + NOTE_DURATION);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + NOTE_DURATION + 0.02);
    });

    const totalDuration = sorted.length * (NOTE_DURATION + NOTE_GAP) + 0.2;
    const totalDurationMs = totalDuration * 1000;
    const playbackStartMs = performance.now();
    const finishPlayback = () => {
      setIsPlaying(false);
      setPlayheadProgress(0);
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      stopPlaybackRef.current = null;
      void audioContext.close();
    };

    const tick = () => {
      const elapsedMs = performance.now() - playbackStartMs;
      const progress = Math.min(1, elapsedMs / totalDurationMs);
      setPlayheadProgress(progress);
      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
      }
    };

    setPlayheadProgress(0);
    animationFrameRef.current = window.requestAnimationFrame(tick);

    const finishTimer = window.setTimeout(() => {
      finishPlayback();
    }, totalDurationMs);

    stopPlaybackRef.current = () => {
      window.clearTimeout(finishTimer);
      finishPlayback();
    };
    setIsPlaying(true);
  }, [eventsForSound, isPlaying]);

  const fetchEvents: EventSourceFunc = useCallback(
    async (info, successCallback, failureCallback) => {
      setLoadError(null);
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const params = new URLSearchParams({
          timeMin: info.startStr,
          timeMax: info.endStr,
          timeZone,
        });
        const response = await fetch(`/api/calendar?${params.toString()}`, {
          credentials: "include",
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
          detail?: string;
          events?: ApiEvent[];
        };

        if (!response.ok) {
          const msg =
            payload.hint ??
            payload.detail ??
            payload.error ??
            `Could not load calendar (HTTP ${response.status}).`;
          setLoadError(msg);
          successCallback([]);
          return;
        }

        const list = payload.events ?? [];
        const calendarEvents: EventInput[] = list.map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          extendedProps: { link: e.link },
        }));
        setEventsForSound(calendarEvents);
        successCallback(calendarEvents);
         } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not load calendar.";
        setLoadError(message);
        failureCallback(err as Error);
      }
    },
    [],
  );
  const onEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const link = info.event.extendedProps.link as string | undefined;
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  }, []);
  return (
    <div className="w-full rounded-xl border border-zinc-200/70 bg-white text-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/70 px-4 py-3">
        <p className="text-sm text-zinc-600">
          Play your schedule like a piano roll: higher rows, higher notes.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={playCalendarSong}
            disabled={isPlaying || eventsForSound.length === 0}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPlaying ? "Playing..." : "Play Calendar Song"}
          </button>
          <button
            type="button"
            onClick={() => stopPlaybackRef.current?.()}
            disabled={!isPlaying}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </div>
      {loadError ? (
        <div
          className="border-b border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}
      <div className="google-calendar-shell relative min-h-[640px] w-full bg-white p-2.5 md:p-3">
        {isPlaying ? (
          <div
            className="calendar-playhead"
            style={{ left: `${playheadProgress * 100}%` }}
            aria-hidden
          />
        ) : null}
        <FullCalendar
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          buttonText={{
            month: "Month",
            week: "Week",
          }}
          height="auto"
          contentHeight="auto"
          dayMaxEvents={3}
          nowIndicator
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          events={fetchEvents}
          eventClick={onEventClick}
          eventTimeFormat={{
            hour: "numeric",
            minute: "2-digit",
            meridiem: "short",
          }}
          slotLabelFormat={{
            hour: "numeric",
            minute: "2-digit",
            meridiem: "short",
          }}
          dayHeaderFormat={{ weekday: "short" }}
          titleFormat={{ year: "numeric", month: "long" }}
          firstDay={0}
          editable={false}
          selectable={false}
        />
      </div>
      <style jsx global>{`
        .google-calendar-shell .fc {
          --fc-border-color:rgb(236, 236, 240);
          --fc-button-bg-color:rgb(255, 255, 255);
          --fc-button-border-color:rgb(226, 228, 234);
          --fc-button-text-color:rgb(84, 55, 90);
          --fc-button-hover-bg-color:rgb(248, 250, 252);
          --fc-button-hover-border-color:rgb(213, 218, 227);
          --fc-button-active-bg-color:rgb(230, 234, 238);
          --fc-button-active-border-color:rgb(213, 218, 227);
          --fc-today-bg-color: rgba(15, 23, 42, 0.04);
          --fc-event-bg-color:rgb(114, 79, 114);
          --fc-event-border-color:rgb(99, 77, 105);
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #ffffff;
          font-family: inherit;
          font-size: 0.875rem;
        }
        .google-calendar-shell .fc .fc-button {
          border-radius: 10px;
          font-weight: 500;
          text-transform: capitalize;
          padding: 0.4em 0.7em;
          box-shadow: none;
        }
        .google-calendar-shell .fc .fc-button-primary:not(:disabled).fc-button-active,
        .google-calendar-shell .fc .fc-button-primary:not(:disabled):active {
          background-color: var(--fc-button-active-bg-color);
          border-color: var(--fc-button-active-border-color);
          color: var(--fc-button-text-color);
        }
        .google-calendar-shell .fc .fc-toolbar-title {
          font-size: 1.18rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          color:rgb(88, 43, 94);
        }
        .google-calendar-shell .fc .fc-col-header-cell-cushion {
          font-weight: 500;
          color:rgb(109, 82, 122);
          text-decoration: none;
        }
        .google-calendar-shell .fc .fc-timegrid-slot-label {
          font-size: 0.75rem;
          color: #9ca3af;
        }
        .google-calendar-shell .fc .fc-event-main {
          color: #f8fafc;
        }
        .google-calendar-shell .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
          color: #111827;
          font-weight: 600;
        }
        .google-calendar-shell .fc .fc-day-other .fc-daygrid-day-number {
          color: #c0c4cc;
        }
        .google-calendar-shell .fc .fc-scrollgrid {
          min-height: 560px;
          border-radius: 14px;
          overflow: hidden;
          background: #ffffff;
        }
        .google-calendar-shell .fc .fc-view-harness,
        .google-calendar-shell .fc .fc-scroller,
        .google-calendar-shell .fc .fc-daygrid-body,
        .google-calendar-shell .fc .fc-timegrid-body {
          background: #ffffff;
        }
        .google-calendar-shell .calendar-playhead {
          position: absolute;
          top: 0.625rem;
          bottom: 0.625rem;
          width: 2px;
          background: linear-gradient(
            to bottom,
            rgba(168, 85, 247, 0.95),
            rgba(236, 72, 153, 0.85)
          );
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 0 14px rgba(168, 85, 247, 0.5);
          border-radius: 9999px;
          pointer-events: none;
          transform: translateX(-1px);
          z-index: 25;
        }
      `}</style>
    </div>
  );
}
