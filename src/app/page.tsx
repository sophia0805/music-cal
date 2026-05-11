"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type ChangeEventHandler } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import type { CalendarInputEvent } from "@/components/calendar-grid";

const CalendarGrid = dynamic(() => import("@/components/calendar-grid"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[200px] items-center justify-center border-2 border-[var(--border)] bg-[var(--panel)] px-4 py-10 text-sm text-[var(--muted)]">
      Loading…
    </div>
  ),
});

const panelClass = "border-2 border-[var(--border)] bg-[var(--panel)] shadow-[4px_4px_0_0_var(--border)]";

function parseIcsDate(raw: string): { value: string; allDay: boolean } | null {
  const text = raw.trim();
  if (/^\d{8}$/.test(text)) {
    return {
      value: `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`,
      allDay: true,
    };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(text);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const iso = text.endsWith("Z")
    ? `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
    : `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  return { value: iso, allDay: false };
}

function parseIcsFile(fileText: string): CalendarInputEvent[] {
  const unfolded: string[] = [];
  const lines = fileText.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  const events: CalendarInputEvent[] = [];
  let inEvent = false;
  let id = "";
  let title = "";
  let startRaw = "";
  let endRaw = "";
  let url = "";
  let allDay = false;

  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      id = "";
      title = "";
      startRaw = "";
      endRaw = "";
      url = "";
      allDay = false;
      continue;
    }
    if (line === "END:VEVENT") {
      if (!inEvent) continue;
      inEvent = false;

      const parsedStart = parseIcsDate(startRaw);
      if (!parsedStart) continue;
      const parsedEnd = endRaw ? parseIcsDate(endRaw) : null;
      const eventAllDay = allDay || parsedStart.allDay || Boolean(parsedEnd?.allDay);
      events.push({
        id: id || `${parsedStart.value}-${Math.random().toString(36).slice(2, 10)}`,
        title: title || "(No title)",
        start: parsedStart.value,
        end: parsedEnd?.value ?? parsedStart.value,
        allDay: eventAllDay,
        link: url || undefined,
      });
      continue;
    }
    if (!inEvent) continue;

    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep);
    const value = line.slice(sep + 1).trim();
    const name = key.split(";")[0];

    if (name === "UID") id = value;
    else if (name === "SUMMARY") title = value;
    else if (name === "URL") url = value;
    else if (name === "DTSTART") {
      startRaw = value;
      if (key.includes("VALUE=DATE")) allDay = true;
    } else if (name === "DTEND") {
      endRaw = value;
    }
  }

  return events;
}

export default function Home() {
  const { data: session, status } = useSession();
  const [fileEvents, setFileEvents] = useState<CalendarInputEvent[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = () => fileInputRef.current?.click();

  const onUploadFile: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setFileError(null);
    try {
      const text = await file.text();
      const parsed = parseIcsFile(text);
      if (parsed.length === 0) {
        setFileError("No events found in this file.");
        setFileEvents(null);
        return;
      }
      setFileEvents(parsed);
    } catch {
      setFileError("Could not read this calendar file.");
      setFileEvents(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="mb-10 w-full shrink-0">
        <div className="border-l-[3px] border-[var(--accent)] pl-5 sm:pl-6">
          <h1 className="site-title m-0">Music Cal</h1>
          <p className="site-lede mt-4 mb-0">
            Turn your calendar into a fun song!
          </p>
        </div>
      </header>
      {status === "loading" ? (
        <div
          className="mt-1 h-16 max-w-md border-2 border-[var(--border)] bg-[var(--panel)]"
          aria-hidden
        />
      ) : !session && !fileEvents ? (
        <section className={`mt-1 max-w-md p-5 ${panelClass}`}>
          <p className="m-0 text-sm">
            Sign in with Google, or upload a `.ics` file from any calendar app.
          </p>
          <button
            type="button"
            className="mt-5 border-2 border-[var(--foreground)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#faf7f2] hover:bg-[var(--accent-hover)]"
            onClick={() => void signIn("google")}
          >
            Continue with Google
          </button>
          <button
            type="button"
            className="mt-3 border-2 border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
            onClick={onPickFile}
          >
            Upload calendar file (.ics)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={onUploadFile}
          />
          {fileError && (
            <p className="mt-3 mb-0 text-sm text-[var(--accent)]">{fileError}</p>
          )}
        </section>
      ) : (
        <section className="mt-1 flex flex-col gap-3">
          <div
            className={`flex shrink-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${panelClass}`}
          >
            <p className="m-0 text-sm">
              {session?.user?.email ?? "Viewing uploaded calendar file"}
            </p>
            {session ? (
              <button
                type="button"
                className="w-fit border-2 border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                className="w-fit border-2 border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
                onClick={() => setFileEvents(null)}
              >
                Clear file
              </button>
            )}
          </div>
          <CalendarGrid inputEvents={fileEvents ?? undefined} />
        </section>
      )}
    </main>
  );
}
