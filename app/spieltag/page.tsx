"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { GameDay, Match, MatchPlayer, Player } from "@/lib/types";

type CourtAssignment = {
  court: number;
  teamA: string[]; // player ids
  teamB: string[];
  scoreA: string;
  scoreB: string;
};

type MatchWithPlayers = Match & {
  players: (MatchPlayer & { name: string })[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SpieltagPage() {
  const [date, setDate] = useState(todayIso());
  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [newPlayerName, setNewPlayerName] = useState("");
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [courts, setCourts] = useState<CourtAssignment[]>([
    { court: 1, teamA: [], teamB: [], scoreA: "", scoreB: "" },
    { court: 2, teamA: [], teamB: [], scoreA: "", scoreB: "" },
  ]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presentPlayers = useMemo(
    () => allPlayers.filter((p) => presentIds.has(p.id)),
    [allPlayers, presentIds]
  );

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    courts.forEach((c) => {
      c.teamA.forEach((id) => s.add(id));
      c.teamB.forEach((id) => s.add(id));
    });
    return s;
  }, [courts]);

  const sittingOut = presentPlayers.filter((p) => !assignedIds.has(p.id));

  async function loadPlayers() {
    const { data, error } = await supabase.from("players").select("*").order("name");
    if (error) setError(error.message);
    else setAllPlayers((data as Player[]) ?? []);
  }

  async function loadGameDay(forDate: string) {
    setLoading(true);
    setError(null);
    let { data: gd, error: gdError } = await supabase
      .from("game_days")
      .select("*")
      .eq("play_date", forDate)
      .maybeSingle();

    if (gdError) {
      setError(gdError.message);
      setLoading(false);
      return;
    }

    if (!gd) {
      const { data: created, error: createError } = await supabase
        .from("game_days")
        .insert({ play_date: forDate })
        .select("*")
        .single();
      if (createError) {
        setError(createError.message);
        setLoading(false);
        return;
      }
      gd = created;
    }

    setGameDay(gd as GameDay);

    const { data: att, error: attError } = await supabase
      .from("attendance")
      .select("player_id")
      .eq("game_day_id", (gd as GameDay).id);
    if (attError) setError(attError.message);
    setPresentIds(new Set((att ?? []).map((a: { player_id: string }) => a.player_id)));

    await loadMatches((gd as GameDay).id);
    setLoading(false);
  }

  async function loadMatches(gameDayId: string) {
    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("game_day_id", gameDayId)
      .order("round", { ascending: true })
      .order("court", { ascending: true });
    if (matchError) {
      setError(matchError.message);
      return;
    }
    const ms = (matchRows as Match[]) ?? [];
    if (ms.length === 0) {
      setMatches([]);
      return;
    }
    const { data: mpRows, error: mpError } = await supabase
      .from("match_players")
      .select("*, players(name)")
      .in(
        "match_id",
        ms.map((m) => m.id)
      );
    if (mpError) {
      setError(mpError.message);
      return;
    }
    const withPlayers: MatchWithPlayers[] = ms.map((m) => ({
      ...m,
      players: (mpRows ?? [])
        .filter((mp: any) => mp.match_id === m.id)
        .map((mp: any) => ({
          match_id: mp.match_id,
          player_id: mp.player_id,
          team: mp.team,
          name: mp.players?.name ?? "?",
        })),
    }));
    setMatches(withPlayers);
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    loadGameDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function toggleAttendance(playerId: string) {
    if (!gameDay) return;
    setBusy(true);
    setError(null);
    const isPresent = presentIds.has(playerId);
    if (isPresent) {
      const { error } = await supabase
        .from("attendance")
        .delete()
        .eq("game_day_id", gameDay.id)
        .eq("player_id", playerId);
      if (error) setError(error.message);
      else {
        const next = new Set(presentIds);
        next.delete(playerId);
        setPresentIds(next);
        setCourts((cs) =>
          cs.map((c) => ({
            ...c,
            teamA: c.teamA.filter((id) => id !== playerId),
            teamB: c.teamB.filter((id) => id !== playerId),
          }))
        );
      }
    } else {
      const { error } = await supabase
        .from("attendance")
        .insert({ game_day_id: gameDay.id, player_id: playerId });
      if (error) setError(error.message);
      else setPresentIds(new Set(presentIds).add(playerId));
    }
    setBusy(false);
  }

  async function addNewPlayer() {
    const name = newPlayerName.trim();
    if (!name || !gameDay) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("players")
      .insert({ name })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    const player = data as Player;
    setAllPlayers((prev) => [...prev, player].sort((a, b) => a.name.localeCompare(b.name)));
    const { error: attError } = await supabase
      .from("attendance")
      .insert({ game_day_id: gameDay.id, player_id: player.id });
    if (attError) setError(attError.message);
    else setPresentIds(new Set(presentIds).add(player.id));
    setNewPlayerName("");
    setBusy(false);
  }

  function randomizeCourts() {
    const shuffled = shuffle(presentPlayers.map((p) => p.id));
    const next: CourtAssignment[] = courts.map((c) => ({ ...c, teamA: [], teamB: [], scoreA: "", scoreB: "" }));
    let i = 0;
    for (const court of next) {
      if (i + 4 > shuffled.length) break;
      court.teamA = [shuffled[i], shuffled[i + 1]];
      court.teamB = [shuffled[i + 2], shuffled[i + 3]];
      i += 4;
    }
    setCourts(next);
  }

  function clearCourts() {
    setCourts((cs) => cs.map((c) => ({ ...c, teamA: [], teamB: [], scoreA: "", scoreB: "" })));
  }

  function playerLabel(id: string) {
    return allPlayers.find((p) => p.id === id)?.name ?? "?";
  }

  function assignPlayer(playerId: string, courtIdx: number, team: "A" | "B") {
    setCourts((cs) =>
      cs.map((c, idx) => {
        // remove from every slot first
        const cleaned = { ...c, teamA: c.teamA.filter((id) => id !== playerId), teamB: c.teamB.filter((id) => id !== playerId) };
        if (idx !== courtIdx) return cleaned;
        if (team === "A" && cleaned.teamA.length < 2) cleaned.teamA = [...cleaned.teamA, playerId];
        if (team === "B" && cleaned.teamB.length < 2) cleaned.teamB = [...cleaned.teamB, playerId];
        return cleaned;
      })
    );
  }

  function unassignPlayer(playerId: string) {
    setCourts((cs) =>
      cs.map((c) => ({
        ...c,
        teamA: c.teamA.filter((id) => id !== playerId),
        teamB: c.teamB.filter((id) => id !== playerId),
      }))
    );
  }

  const nextRound = matches.length ? Math.max(...matches.map((m) => m.round)) + 1 : 1;

  async function saveRound() {
    if (!gameDay) return;
    const readyCourts = courts.filter(
      (c) => c.teamA.length === 2 && c.teamB.length === 2 && c.scoreA !== "" && c.scoreB !== ""
    );
    if (readyCourts.length === 0) {
      setError("Bitte mind. einen Platz mit 2 vollständigen Teams und Ergebnis ausfüllen.");
      return;
    }
    setBusy(true);
    setError(null);
    for (const c of readyCourts) {
      const { data: match, error: matchError } = await supabase
        .from("matches")
        .insert({
          game_day_id: gameDay.id,
          round: nextRound,
          court: c.court,
          team1_score: Number(c.scoreA),
          team2_score: Number(c.scoreB),
        })
        .select("*")
        .single();
      if (matchError) {
        setError(matchError.message);
        setBusy(false);
        return;
      }
      const rows = [
        ...c.teamA.map((player_id) => ({ match_id: (match as Match).id, player_id, team: 1 })),
        ...c.teamB.map((player_id) => ({ match_id: (match as Match).id, player_id, team: 2 })),
      ];
      const { error: mpError } = await supabase.from("match_players").insert(rows);
      if (mpError) {
        setError(mpError.message);
        setBusy(false);
        return;
      }
    }
    clearCourts();
    await loadMatches(gameDay.id);
    setBusy(false);
  }

  async function deleteMatch(matchId: string) {
    if (!gameDay) return;
    setBusy(true);
    const { error } = await supabase.from("matches").delete().eq("id", matchId);
    if (error) setError(error.message);
    await loadMatches(gameDay.id);
    setBusy(false);
  }

  const matchesByRound = useMemo(() => {
    const map = new Map<number, MatchWithPlayers[]>();
    matches.forEach((m) => {
      const list = map.get(m.round) ?? [];
      list.push(m);
      map.set(m.round, list);
    });
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [matches]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold">Spieltag</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Lade…</p>
      ) : (
        <>
          {/* Anwesenheit */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">Wer ist heute dabei?</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {allPlayers
                .filter((p) => p.active || presentIds.has(p.id))
                .map((p) => {
                  const present = presentIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleAttendance(p.id)}
                      disabled={busy}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                        present
                          ? "border-court bg-court text-white"
                          : "border-gray-300 text-gray-600 hover:border-court"
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
            </div>
            <div className="flex gap-2">
              <input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNewPlayer()}
                placeholder="Kurzfristiger neuer Spieler…"
                className="flex-1 rounded-md border px-3 py-2 text-sm"
              />
              <button
                onClick={addNewPlayer}
                disabled={busy || !newPlayerName.trim()}
                className="rounded-md bg-court px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                + Hinzufügen &amp; anmelden
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {presentPlayers.length} Spieler heute dabei
              {presentPlayers.length % 2 === 1 && " – bei ungerader Anzahl muss pro Runde mind. 1 Person aussetzen."}
            </p>
          </section>

          {/* Rundenerfassung */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Runde {nextRound} erfassen</h2>
              <div className="flex gap-2">
                <button
                  onClick={randomizeCourts}
                  disabled={presentPlayers.length < 4 || busy}
                  className="rounded-md border border-court px-3 py-1.5 text-xs font-medium text-court hover:bg-court-light disabled:opacity-50"
                >
                  🎲 Teams zufällig mischen
                </button>
                <button
                  onClick={clearCourts}
                  disabled={busy}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Zurücksetzen
                </button>
              </div>
            </div>

            {presentPlayers.length < 4 ? (
              <p className="text-sm text-gray-500">Mindestens 4 anwesende Spieler nötig, um eine Runde zu erfassen.</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {courts.map((c, idx) => (
                    <div key={c.court} className="rounded-lg border bg-white p-3 shadow-sm">
                      <p className="mb-2 text-sm font-semibold text-court">Platz {c.court}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="mb-1 text-xs font-medium text-gray-500">Team A</p>
                          {[0, 1].map((slot) => (
                            <PlayerSlot
                              key={slot}
                              value={c.teamA[slot]}
                              options={presentPlayers}
                              takenIds={assignedIds}
                              onSelect={(id) => assignPlayer(id, idx, "A")}
                              onClear={() => c.teamA[slot] && unassignPlayer(c.teamA[slot])}
                              label={c.teamA[slot] ? playerLabel(c.teamA[slot]) : undefined}
                            />
                          ))}
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium text-gray-500">Team B</p>
                          {[0, 1].map((slot) => (
                            <PlayerSlot
                              key={slot}
                              value={c.teamB[slot]}
                              options={presentPlayers}
                              takenIds={assignedIds}
                              onSelect={(id) => assignPlayer(id, idx, "B")}
                              onClear={() => c.teamB[slot] && unassignPlayer(c.teamB[slot])}
                              label={c.teamB[slot] ? playerLabel(c.teamB[slot]) : undefined}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={c.scoreA}
                          onChange={(e) =>
                            setCourts((cs) => cs.map((x, i) => (i === idx ? { ...x, scoreA: e.target.value } : x)))
                          }
                          className="w-14 rounded-md border px-2 py-1 text-center text-sm"
                        />
                        <span className="text-sm text-gray-400">:</span>
                        <input
                          type="number"
                          min={0}
                          value={c.scoreB}
                          onChange={(e) =>
                            setCourts((cs) => cs.map((x, i) => (i === idx ? { ...x, scoreB: e.target.value } : x)))
                          }
                          className="w-14 rounded-md border px-2 py-1 text-center text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {sittingOut.length > 0 && (
                  <p className="mt-3 text-sm text-gray-500">
                    Pause diese Runde: {sittingOut.map((p) => p.name).join(", ")}
                  </p>
                )}

                <button
                  onClick={saveRound}
                  disabled={busy}
                  className="mt-4 w-full rounded-md bg-court py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Runde {nextRound} speichern
                </button>
              </>
            )}
          </section>

          {/* Bisherige Runden */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">Runden von heute</h2>
            {matchesByRound.length === 0 ? (
              <p className="text-sm text-gray-500">Noch keine Runde erfasst.</p>
            ) : (
              <div className="space-y-4">
                {matchesByRound.map(([round, ms]) => (
                  <div key={round}>
                    <p className="mb-1 text-xs font-semibold uppercase text-gray-400">Runde {round}</p>
                    <div className="space-y-2">
                      {ms.map((m) => {
                        const team1 = m.players.filter((p) => p.team === 1).map((p) => p.name);
                        const team2 = m.players.filter((p) => p.team === 2).map((p) => p.name);
                        return (
                          <div key={m.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm shadow-sm">
                            <span className="text-xs text-gray-400">Platz {m.court}</span>
                            <span className="flex-1 px-3">
                              {team1.join(" & ")} <b>{m.team1_score}</b> : <b>{m.team2_score}</b> {team2.join(" & ")}
                            </span>
                            <button
                              onClick={() => deleteMatch(m.id)}
                              disabled={busy}
                              className="text-xs text-red-500 hover:underline"
                            >
                              löschen
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PlayerSlot({
  value,
  options,
  takenIds,
  onSelect,
  onClear,
  label,
}: {
  value?: string;
  options: Player[];
  takenIds: Set<string>;
  onSelect: (id: string) => void;
  onClear: () => void;
  label?: string;
}) {
  if (value) {
    return (
      <button
        onClick={onClear}
        className="mb-1 w-full truncate rounded-md bg-court-light px-2 py-1.5 text-left text-sm text-court"
        title="Klicken zum Entfernen"
      >
        {label} ✕
      </button>
    );
  }
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onSelect(e.target.value)}
      className="mb-1 w-full rounded-md border px-2 py-1.5 text-sm text-gray-500"
    >
      <option value="">– wählen –</option>
      {options
        .filter((p) => !takenIds.has(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
}
