"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdmin } from "@/lib/useAdmin";

const links = [
  { href: "/", label: "Rangliste" },
  { href: "/spieltag", label: "Spieltag" },
  { href: "/verlauf", label: "Verlauf" },
  { href: "/spieler", label: "Spieler" },
];

export default function NavBar() {
  const pathname = usePathname();
  const { isAdmin, logout } = useAdmin();

  return (
    <header className="bg-court text-white shadow">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="font-bold tracking-tight">🎾 Rivella Padel Champions</span>
        <div className="flex flex-wrap items-center gap-2">
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
          {isAdmin && (
            <div className="flex items-center gap-2 rounded-md bg-white/15 px-2 py-1 text-xs">
              <span>✏️ Admin-Modus</span>
              <button onClick={logout} className="underline hover:no-underline">
                beenden
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
