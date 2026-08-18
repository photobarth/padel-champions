"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Rangliste" },
  { href: "/spieltag", label: "Spieltag" },
  { href: "/spieler", label: "Spieler" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="bg-court text-white shadow">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <span className="font-bold tracking-tight">🎾 Rivella Padel Champions</span>
        <nav className="flex gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-white text-court" : "hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
