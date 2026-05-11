export const metadata = {
  title: "Terms of Service • Music Cal",
};

const panelClass =
  "border-2 border-[var(--border)] bg-[var(--panel)] shadow-[4px_4px_0_0_var(--border)]";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <div className="border-l-[3px] border-[var(--accent)] pl-5 sm:pl-6">
          <h1 className="site-title m-0 text-[clamp(1.75rem,4vw,2.25rem)]">
            Terms of Service
          </h1>
          <p className="site-lede mt-3 mb-0">Rules for using Music Cal.</p>
        </div>
      </header>

      <section className={`p-5 sm:p-6 ${panelClass}`}>
        <p className="m-0 text-sm text-[var(--muted)]">Last updated: May 10, 2026</p>

        <h2 className="mt-6 mb-2 text-base font-medium">Service</h2>
        <p className="m-0 text-sm">
          Music Cal is a free app that shows your calendar and turns event timing into a simple
          audio/visual experience.
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">Accounts</h2>
        <p className="m-0 text-sm">
          You sign in with Google. Keep your Google account credentials secure.
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">Acceptable use</h2>
        <ul className="m-0 list-disc pl-5 text-sm">
          <li>Don’t misuse the service or attempt to disrupt it.</li>
          <li>Don’t try to access data that isn’t yours.</li>
          <li>Use the service in compliance with applicable laws.</li>
        </ul>

        <h2 className="mt-6 mb-2 text-base font-medium">No warranties</h2>
        <p className="m-0 text-sm">
          The service is provided “as is.” We can’t guarantee uninterrupted service or zero bugs.
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">Limitation of liability</h2>
        <p className="m-0 text-sm">
          To the maximum extent allowed by law, the site owner is not liable for indirect,
          incidental, special, consequential, or punitive damages.
        </p>

        <h2 className="mt-6 mb-2 text-base font-medium">Changes</h2>
        <p className="m-0 text-sm">
          These terms may change over time. Continued use means you accept the current version.
        </p>
      </section>
    </main>
  );
}

