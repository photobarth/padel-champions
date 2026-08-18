import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Rivella Padel Champions",
  description: "Rangliste und Spieltag-Erfassung für die Rivella Padel Champions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <NavBar />
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
