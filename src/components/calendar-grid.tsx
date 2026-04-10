"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventClickArg, EventSourceFunc } from "@fullcalendar/core";
import { useCallback, useState } from "react";

type ApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  link?: string;
};

export default function CalendarGrid() {
  const [loadError, setLoadError] = useState<string | null>(null);

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
        successCallback(
          list.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            allDay: e.allDay,
            extendedProps: { link: e.link },
          })),
        );
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
    <div className="w-full rounded-lg border border-zinc-200 bg-white text-zinc-900">
      {loadError ? (
        <div
          className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}
      <div className="google-calendar-shell min-h-[640px] w-full p-2 md:p-3">
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
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          buttonText={{
            today: "Today",
            month: "Month",
            week: "Week",
            day: "Day",
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
          --fc-border-color: #e4e4e7;
          --fc-button-bg-color: #fff;
          --fc-button-border-color: #d4d4d8;
          --fc-button-text-color: #18181b;
          --fc-button-hover-bg-color: #f4f4f5;
          --fc-button-hover-border-color: #a1a1aa;
          --fc-button-active-bg-color: #e4e4e7;
          --fc-button-active-border-color: #a1a1aa;
          --fc-today-bg-color: rgba(59, 130, 246, 0.08);
          --fc-event-bg-color: #1a73e8;
          --fc-event-border-color: #1557b0;
          --fc-page-bg-color: #fff;
          --fc-neutral-bg-color: #fafafa;
          font-family: inherit;
          font-size: 0.875rem;
        }
        .google-calendar-shell .fc .fc-button {
          font-weight: 500;
          text-transform: capitalize;
          padding: 0.35em 0.65em;
        }
        .google-calendar-shell .fc .fc-button-primary:not(:disabled).fc-button-active,
        .google-calendar-shell .fc .fc-button-primary:not(:disabled):active {
          background-color: var(--fc-button-active-bg-color);
          border-color: var(--fc-button-active-border-color);
          color: var(--fc-button-text-color);
        }
        .google-calendar-shell .fc .fc-toolbar-title {
          font-size: 1.25rem;
          font-weight: 600;
          letter-spacing: -0.02em;
        }
        .google-calendar-shell .fc .fc-col-header-cell-cushion {
          font-weight: 600;
          color: #52525b;
          text-decoration: none;
        }
        .google-calendar-shell .fc .fc-daygrid-day-number {
          font-size: 0.8125rem;
          color: #3f3f46;
          text-decoration: none;
          padding: 4px 6px;
        }
        .google-calendar-shell .fc .fc-daygrid-event {
          border-radius: 4px;
          font-size: 0.75rem;
        }
        .google-calendar-shell .fc .fc-timegrid-slot-label {
          font-size: 0.75rem;
          color: #71717a;
        }
        .google-calendar-shell .fc .fc-scrollgrid {
          min-height: 560px;
        }
      `}</style>
    </div>
  );
}
