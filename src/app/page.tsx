"use client";

import dynamic from "next/dynamic";
import { signIn, signOut, useSession } from "next-auth/react";

const CalendarGrid = dynamic(() => import("@/components/calendar-grid"), {
  ssr: false,
  loading: () => (
    <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-12 text-center text-sm text-zinc-600">
      Loading calendar…
    </p>
  ),
});

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col p-6 md:p-10">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Google Calendar
      </h1>
      <p className="mt-2 text-zinc-600">
        Month, week, day, and agenda views synced from your primary calendar.
      </p>

      {status === "loading" ? (
        <p className="mt-8 text-zinc-600">Checking session…</p>
      ) : !session ? (
        <button
          type="button"
          className="mt-8 w-fit rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700"
          onClick={() => void signIn("google")}
        >
          Connect Google Account
        </button>
      ) : (
        <section className="mt-8 space-y-6">
          {session.error ? (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              role="alert"
            >
              Your Google session could not be refreshed.{" "}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => void signOut()}
              >
                Sign out
              </button>{" "}
              and connect again so calendar access stays authorized.
            </div>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-zinc-500">Signed in as</p>
              <p className="font-medium text-zinc-900">{session.user?.email}</p>
            </div>
            <button
              type="button"
              className="w-fit rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 hover:bg-zinc-100"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 shadow-sm md:p-6">
            <CalendarGrid />
          </div>
        </section>
      )}
    </main>
  );
}
