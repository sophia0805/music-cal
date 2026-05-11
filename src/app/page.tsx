"use client";

import dynamic from "next/dynamic";
import { signIn, signOut, useSession } from "next-auth/react";

const CalendarGrid = dynamic(() => import("@/components/calendar-grid"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[200px] items-center justify-center border-2 border-[var(--border)] bg-[var(--panel)] px-4 py-10 text-sm text-[var(--muted)]">
      Loading…
    </div>
  ),
});

const panelClass = "border-2 border-[var(--border)] bg-[var(--panel)] shadow-[4px_4px_0_0_var(--border)]";

export default function Home() {
  const { data: session, status } = useSession();
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
      ) : !session ? (
        <section className={`mt-1 max-w-md p-5 ${panelClass}`}>
          <p className="m-0 text-sm">
            Sign in with Google to load your Google Calendar.
          </p>
          <button
            type="button"
            className="mt-5 border-2 border-[var(--foreground)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#faf7f2] hover:bg-[var(--accent-hover)]"
            onClick={() => void signIn("google")}
          >
            Continue with Google
          </button>
        </section>
      ) : (
        <section className="mt-1 flex flex-col gap-3">
          <div
            className={`flex shrink-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between ${panelClass}`}
          >
            <p className="m-0 text-sm">{session.user?.email}</p>
            <button
              type="button"
              className="w-fit border-2 border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--background)]"
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
