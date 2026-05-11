export const metadata = {
  title: "Privacy Policy • Music Cal",
};

const panelClass = "border-2 border-[var(--border)] bg-[var(--panel)] shadow-[4px_4px_0_0_var(--border)]";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <div className="border-l-[3px] border-[var(--accent)] pl-5 sm:pl-6">
          <h1 className="site-title m-0 text-[clamp(1.75rem,4vw,2.25rem)]">
            Privacy Policy
          </h1>
          <p className="site-lede mt-3 mb-0">
            Plain-language notes on what this app touches and why.
          </p>
        </div>
      </header>
      <section className={`p-5 sm:p-6 ${panelClass}`}>
        <p className="m-0 text-sm text-[var(--muted)]">Last updated: May 10, 2026</p>

        <h2 className="mt-6 mb-2 text-base font-medium">Quick version</h2>
        <p className="m-0 text-sm">
          Music Cal only asks for read-only calendar access. It uses that to draw your event grid
          and generate playback timing. It does not edit your calendar.
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">What we access</h2>
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>Basic Google account identity (email/profile) for sign-in.</li>
          <li>Read-only event data from your calendar to render this app’s views.</li>
        </ul>

        <h2 className="mt-6 mb-2 text-base font-medium">What we store</h2>
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>
            Session/auth data needed to keep you signed in (including access/refresh tokens).
          </li>
          <li>
            Calendar events are fetched when needed. We do not intentionally keep a long-term event
            database.
          </li>
        </ul>

        <h2 className="mt-6 mb-2 text-base font-medium">How we use your data</h2>
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>Show your events in calendar and song-grid views.</li>
          <li>Open Google Calendar links when you click an event.</li>
          <li>Generate audio playback timing from event layout.</li>
        </ul>

        <h2 className="mt-6 mb-2 text-base font-medium">Sharing</h2>
        <p className="m-0 text-sm">
          We do not sell personal information. Data is only shared with services needed to run the
          app (mainly Google APIs).
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">Security</h2>
        <p className="m-0 text-sm">
          We take reasonable measures to protect your data, but no method of transmission or
          storage is 100% secure.
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">Your choices</h2>
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>You can sign out at any time.</li>
          <li>You can revoke Music Cal’s access from your Google Account settings.</li>
        </ul>
        <h2 className="mt-6 mb-2 text-base font-medium">Contact</h2>
        <p className="m-0 text-sm">
          Questions? Reach out to the site owner (the person who shared this app with you).
        </p>
      </section>
    </main>
  );
}