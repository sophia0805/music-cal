"use client";

import dynamic from "next/dynamic";
import { signIn, signOut, useSession } from "next-auth/react";

const CalendarGrid = dynamic(() => import("@/components/calendar-grid"), {
  ssr: false,
  loading: () => (
    <p className="rounded-2xl border border-zinc-200/70 bg-white/70 px-4 py-14 text-center text-sm text-zinc-500 shadow-sm backdrop-blur">
      Loading calendar…
    </p>
  ),
});

const shellCardClass =
  "rounded-2xl border border-zinc-200/70 bg-white/75 shadow-sm backdrop-blur";

export default function Home() {
  const { data: session, status } = useSession();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 md:px-8 md:py-10">
      <div className="mb-6 space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
          Calendar
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-800 md:text-4xl">
          Google Calendar
        </h1>
      </div>
      {status === "loading" ? (
        <p className="mt-4 text-sm text-zinc-500">Loading…</p>
      ) : !session ? (
        <section className={`mt-4 max-w-xl p-6 ${shellCardClass}`}>
          <p className="text-sm leading-7 text-zinc-600">
            Connect your Google account to view your events and make a song out of them.
          </p>
          <button
            type="button"
            className="mt-5 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
            onClick={() => void signIn("google")}
          >
            Connect Google Account
          </button>
        </section>
      ) : (
        <section className="mt-4 space-y-4">
          <div
            className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between ${shellCardClass}`}
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                Signed in as
              </p>
              <p className="font-medium text-zinc-700">{session.user?.email}</p>
            </div>
            <button
              type="button"
              className="w-fit rounded-xl border border-zinc-300/80 bg-white px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
          <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-3 shadow-sm backdrop-blur md:p-5">
            <CalendarGrid />
          </div>
        </section>
      )}
    </main>
  );
}
