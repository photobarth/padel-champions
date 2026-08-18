"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { GameDay } from "@/lib/types";

type DaySummary = GameDay & {
  playerCount: number;
  roundCount: number;
  matchCount: number;
};

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function VerlaufPage() {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data: gameDays, error: gdError } = await supabase
        .from("game_days")
        .select("*")
        .order("play_date", { ascending: false });
      if (gdError) {
        setError(gdError.message);
        setLoading(false);
        return;
      }

      const { data: attendance, error: attError } = await supabase
        .from("attendance")
        .select("game_day_id");
      if (attError) {
        setError(attError.message);
        setLoading(false);
        return;
      }

      const { data: matches, error: matchError } = await supabase
        .from("matches")
        .select("game_day_id, round");
      if (matchError) {
        setError(matchError.message);
        setLoading(false);
        return;
      }

      const summaries: DaySummary[] = ((gameDays as GameDay[]) ?? []).map((gd) => {
        const playerCount = (attendance ?? []).filter((a: any) => a.game_day_id === gd.id).length;
        const dayMatches = (matches ?? []).filter((m: any) => m.game_day_id === gd.id);
        const roundCount = new Set(dayMatches.map((m: any) => m.round)).size;
        return { ...gd, playerCount, roundCount, matchCount: dayMatches.length };
      });

      setDays(summaries.filter((d) => d.playerCount > 0 || d.matchCount > 0));
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Verlauf</h1>

      {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Lade Spieltage…</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Spieltage erfasst.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white shadow-sm">
          {days.map((d) => (
            <li key={d.id}>
              <Link
                href={`/spieltag?date=${d.play_date}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-court-light"
              >
                <span className="font-medium">{formatDate(d.play_date)}</span>
                <span className="text-sm text-gray-500">
                  {d.playerCount} Spieler · {d.roundCount} Runde{d.roundCount === 1 ? "" : "n"} ·{" "}
                  {d.matchCount} Match{d.matchCount === 1 ? "" : "es"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
