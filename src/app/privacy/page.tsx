export const metadata = {
  title: "Privacy Policy • Music Cal",
};

const panelClass =
  "border-2 border-[var(--border)] bg-[var(--panel)] shadow-[4px_4px_0_0_var(--border)]";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <div className="border-l-[3px] border-[var(--accent)] pl-5 sm:pl-6">
          <h1 className="site-title m-0 text-[clamp(1.75rem,4vw,2.25rem)]">
            Privacy Policy
          </h1>
          <p className="site-lede mt-3 mb-0">
            How Music Cal handles your data.
          </p>
        </div>
      </header>
      <section className={`p-5 sm:p-6 ${panelClass}`}>
        <p className="m-0 text-sm text-[var(--muted)]">Last updated: May 10, 2026</p>

        <h2 className="mt-6 mb-2 text-base font-medium">What we access</h2>
        <p className="m-0 text-sm">
          Music Cal uses Google Sign-In to read your Google Calendar events (read-only) so it can
          display them and generate the “song grid”.
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">What we store</h2>
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>
            Authentication session data required to keep you signed in (including Google access
            tokens / refresh tokens).
          </li>
          <li>
            We do not intentionally store your calendar event contents in a database. Events are
            fetched from Google when needed.
          </li>
        </ul>

        <h2 className="mt-6 mb-2 text-base font-medium">How we use your data</h2>
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>To show your calendar events inside the app.</li>
          <li>To open an event in Google Calendar when you click it.</li>
          <li>To generate audio playback based on event timing.</li>
        </ul>

        <h2 className="mt-6 mb-2 text-base font-medium">Sharing</h2>
        <p className="m-0 text-sm">
          We do not sell your personal information. We do not share your calendar data with third
          parties except as necessary to provide the service (Google APIs).
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
          If you have questions, contact the site owner (the person who shared this link with you).
        </p>
      </section>
    </main>
  );
}

