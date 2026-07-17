import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gist",
  description: "Approve website changes without reading code.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
          <header style={{ marginBottom: "1.5rem" }}>
            <Link href="/" className="brand">
              Gist
            </Link>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
