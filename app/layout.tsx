import type { Metadata } from "next";
import { JetBrains_Mono, Poppins } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import "./globals.css";

const poppins = Poppins({
  weight: ["400", "600"],
  display: "swap",
  subsets: ["latin"],
});

// Exposed as a CSS variable; Tailwind's `font-mono` (--font-mono in
// app/globals.css) resolves to it.
const jetbrainsMono = JetBrains_Mono({
  weight: ["400"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Lete · Share a secret once",
  description:
    "Send passwords and other secrets through a one-time link, encrypted in your browser.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Render every page per request so proxy.ts can attach a fresh CSP nonce.
  await connection();

  return (
    <html lang="en" data-theme="trappist" className={jetbrainsMono.variable}>
      <body
        className={`${poppins.className} flex min-h-dvh flex-col bg-base-100`}
      >
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-8 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            Lete
          </Link>
          <a
            href="https://t-s.dev"
            className="text-sm text-faint transition-colors hover:text-muted"
          >
            t-s.dev
          </a>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-2xl px-4 pb-8 text-xs text-faint sm:px-6">
          Encrypted in your browser with AES-256-GCM. The server never sees the
          secret or the key.
        </footer>
      </body>
    </html>
  );
}
