"use client";

import dynamic from "next/dynamic";
import { signIn, signOut, useSession } from "next-auth/react";

const CalendarGrid = dynamic(() => import("@/components/calendar-grid"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[200px] items-center justify-center border border-[var(--border)] bg-[var(--panel)] px-4 py-10 text-sm text-[var(--muted)]">
      Loading…
    </div>
  ),
});

const panelClass = "border border-[var(--border)] bg-[var(--panel)]";

export default function Home() {
  const { data: session, status } = useSession();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-3 py-8 sm:px-5">
      <header className="mb-8 w-full border-b border-[var(--border)] pb-6">
        <h1 className="m-0 text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          Music Cal
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
          Turn your calendar into a fun song!
        </p>
      </header>
      {status === "loading" ? (
        <div
          className="mt-1 h-16 max-w-md border border-[var(--border)] bg-[var(--panel)]"
          aria-hidden
        />
      ) : !session ? (
        <section className={`mt-1 max-w-md p-5 ${panelClass}`}>
          <p className="m-0 text-sm">
            Sign in with Google to load your Google Calendar.
          </p>
          <button
            type="button"
            className="mt-4 border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-sm text-white"
            onClick={() => void signIn("google")}
          >
            Continue with Google
          </button>
        </section>
      ) : (
        <section className="mt-1 space-y-3">
          <div
            className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${panelClass}`}
          >
            <p className="m-0 text-sm">{session.user?.email}</p>
            <button
              type="button"
              className="w-fit border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
          <CalendarGrid />
        </section>
      )}
    </main>
  );
}
