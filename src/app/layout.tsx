import type { Metadata } from "next";
import Providers from "@/components/providers";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Music Cal",
  description: "turn your busy calendar into a fun song!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col text-foreground">
        <Providers>{children}</Providers>
        <footer className="mt-auto border-t-2 border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm text-[var(--muted)] sm:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0">
              <span className="text-[var(--foreground)]">Music Cal</span>
              <span className="mx-2 opacity-60">•</span>
              <span>Read-only Google Calendar viewer</span>
            </p>
            <nav className="flex gap-4">
              <Link className="underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--foreground)]" href="/privacy">
                Privacy
              </Link>
              <Link className="underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--foreground)]" href="/terms">
                Terms
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
