"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/lib/types";

export default function SpielerPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else setPlayers((data as Player[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("players").insert({ name });
    if (error) setError(error.message);
    else {
      setNewName("");
      await load();
    }
    setBusy(false);
  }

  async function toggleActive(player: Player) {
    setBusy(true);
    const { error } = await supabase
      .from("players")
      .update({ active: !player.active })
      .eq("id", player.id);
    if (error) setError(error.message);
    await load();
    setBusy(false);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Spieler</h1>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <div className="mb-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          placeholder="Neuer Spieler…"
          className="flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          onClick={addPlayer}
          disabled={busy || !newName.trim()}
          className="rounded-md bg-court px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Hinzufügen
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Lade Spieler…</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white shadow-sm">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <span className={p.active ? "" : "text-gray-400 line-through"}>{p.name}</span>
              <button
                onClick={() => toggleActive(p)}
                disabled={busy}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  p.active
                    ? "border border-gray-300 text-gray-600 hover:bg-gray-50"
                    : "border border-court text-court hover:bg-court-light"
                }`}
              >
                {p.active ? "Deaktivieren" : "Aktivieren"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-gray-400">
        Deaktivierte Spieler erscheinen bei der Anwesenheitsauswahl am Spieltag nicht mehr,
        bleiben aber mit ihren bisherigen Ergebnissen in der Rangliste.
      </p>
    </div>
  );
}
