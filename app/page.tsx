"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Standing } from "@/lib/types";

const medal = (rank: number) => (rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `${rank + 1}.`);

export default function RangListePage() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("standings")
      .select("*")
      .order("points", { ascending: false })
      .order("diff", { ascending: false })
      .order("wins", { ascending: false });

    if (error) setError(error.message);
    else setStandings((data as Standing[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const visible = standings.filter((s) => showInactive || s.active || s.games_played > 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rangliste</h1>
        <button
          onClick={load}
          className="rounded-md border border-court px-3 py-1.5 text-sm font-medium text-court hover:bg-court-light"
        >
          Aktualisieren
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          Fehler beim Laden: {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lade Rangliste…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500">
          Noch keine Ergebnisse erfasst. Leg unter „Spieltag" den ersten Spieltag an.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-court-light text-left text-xs uppercase text-gray-600">
                <th className="px-3 py-2">Rang</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-center">Spieltage</th>
                <th className="px-3 py-2 text-center">Sp</th>
                <th className="px-3 py-2 text-center">S</th>
                <th className="px-3 py-2 text-center">U</th>
                <th className="px-3 py-2 text-center">N</th>
                <th className="px-3 py-2 text-center">Punkte</th>
                <th className="px-3 py-2 text-center">Diff</th>
                <th className="px-3 py-2 text-center font-bold">Pkt</th>
                <th className="px-3 py-2 text-center">Ø Pkt</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <tr key={s.player_id} className={`border-b last:border-0 ${!s.active ? "text-gray-400" : ""}`}>
                  <td className="px-3 py-2 font-medium">{medal(i)}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2 text-center">{s.game_days_played ?? "–"}</td>
                  <td className="px-3 py-2 text-center">{s.games_played}</td>
                  <td className="px-3 py-2 text-center">{s.wins}</td>
                  <td className="px-3 py-2 text-center">{s.draws}</td>
                  <td className="px-3 py-2 text-center">{s.losses}</td>
                  <td className="px-3 py-2 text-center">
                    {s.goals_for}:{s.goals_against}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.diff > 0 ? `+${s.diff}` : s.diff}
                  </td>
                  <td className="px-3 py-2 text-center text-base font-bold text-court">{s.points}</td>
                  <td className="px-3 py-2 text-center text-gray-600">
                    {typeof s.avg_points === "number" ? s.avg_points.toFixed(2) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Auch inaktive Spieler ohne Spiele anzeigen
      </label>

      <p className="mt-6 text-xs text-gray-400">
        Sieg = 3 Punkte, Unentschieden = 1 Punkt, Niederlage = 0 Punkte. Bei Punktgleichheit
        entscheidet die Tordifferenz.
      </p>
    </div>
  );
}
