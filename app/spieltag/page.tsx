"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/lib/useAdmin";
import type { GameDay, Match, MatchPlayer, Player } from "@/lib/types";

type CourtAssignment = {
  court: number;
  teamA: string[]; // player ids
  teamB: string[];
  scoreA: string;
  scoreB: string;
};

type RoundPlan = {
  round: number;
  courts: CourtAssignment[];
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

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function emptyCourts(): CourtAssignment[] {
  return [1, 2].map((court) => ({ court, teamA: [], teamB: [], scoreA: "", scoreB: "" }));
}

function emptyRoundPlan(round: number): RoundPlan {
  return { round, courts: emptyCourts() };
}

function computeNextRound(matches: MatchWithPlayers[]) {
  return matches.length ? Math.max(...matches.map((m) => m.round)) + 1 : 1;
}

/** Baut aus den bereits gespeicherten Runden des Tages die Partner- und Pausenhistorie auf. */
function buildHistory(matches: MatchWithPlayers[], presentIds: string[]) {
  const partnerCount = new Map<string, number>();
  const sitOutCount = new Map<string, number>(presentIds.map((id) => [id, 0]));

  const byRound = new Map<number, MatchWithPlayers[]>();
  matches.forEach((m) => {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  });

  byRound.forEach((ms) => {
    const playedIds = new Set<string>();
    ms.forEach((m) => {
      const team1 = m.players.filter((p) => p.team === 1).map((p) => p.player_id);
      const team2 = m.players.filter((p) => p.team === 2).map((p) => p.player_id);
      [team1, team2].forEach((team) => {
        team.forEach((id) => playedIds.add(id));
        if (team.length === 2) {
          const key = pairKey(team[0], team[1]);
          partnerCount.set(key, (partnerCount.get(key) ?? 0) + 1);
        }
      });
    });
    presentIds.forEach((id) => {
      if (!playedIds.has(id)) sitOutCount.set(id, (sitOutCount.get(id) ?? 0) + 1);
    });
  });

  return { partnerCount, sitOutCount };
}

/**
 * Plant mehrere Runden im Voraus: verteilt Pausen fair und bildet pro Runde
 * möglichst Teams, die tagsüber noch nicht zusammengespielt haben.
 */
function planRounds(
  presentIds: string[],
  startRound: number,
  count: number,
  history: { partnerCount: Map<string, number>; sitOutCount: Map<string, number> }
): RoundPlan[] {
  const partnerCount = new Map(history.partnerCount);
  const sitOutCount = new Map(history.sitOutCount);
  const rounds: RoundPlan[] = [];

  for (let i = 0; i < count; i++) {
    const roundNumber = startRound + i;
    const maxActive = Math.min(presentIds.length, 8);
    const activeCount = maxActive - (maxActive % 4);
    const sitOutNeeded = presentIds.length - activeCount;

    const byFairness = [...presentIds].sort((a, b) => {
      const diff = (sitOutCount.get(a) ?? 0) - (sitOutCount.get(b) ?? 0);
      return diff !== 0 ? diff : Math.random() - 0.5;
    });
    const sitters = byFairness.slice(0, sitOutNeeded);
    const active = shuffle(byFairness.slice(sitOutNeeded));
    sitters.forEach((id) => sitOutCount.set(id, (sitOutCount.get(id) ?? 0) + 1));

    const used = new Set<string>();
    const pairs: [string, string][] = [];
    for (const p of active) {
      if (used.has(p)) continue;
      used.add(p);
      let bestPartner: string | null = null;
      let bestCount = Infinity;
      for (const q of active) {
        if (used.has(q)) continue;
        const cnt = partnerCount.get(pairKey(p, q)) ?? 0;
        if (cnt < bestCount) {
          bestCount = cnt;
          bestPartner = q;
        }
      }
      if (bestPartner) {
        used.add(bestPartner);
        pairs.push([p, bestPartner]);
        partnerCount.set(pairKey(p, bestPartner), (partnerCount.get(pairKey(p, bestPartner)) ?? 0) + 1);
      }
    }

    const shuffledPairs = shuffle(pairs);
    const courts: CourtAssignment[] = [];
    for (let j = 0; j + 1 < shuffledPairs.length; j += 2) {
      courts.push({
        court: courts.length + 1,
        teamA: [...shuffledPairs[j]],
        teamB: [...shuffledPairs[j + 1]],
        scoreA: "",
        scoreB: "",
      });
    }
    while (courts.length < 2) {
      courts.push({ court: courts.length + 1, teamA: [], teamB: [], scoreA: "", scoreB: "" });
    }

    rounds.push({ round: roundNumber, courts });
  }

  return rounds;
}

export default function SpieltagPage() {
  const { isAdmin } = useAdmin();
  const [date, setDate] = useState(todayIso());

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("date");
    if (fromQuery) setDate(fromQuery);
  }, []);

  const [gameDay, setGameDay] = useState<GameDay | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [newPlayerName, setNewPlayerName] = useState("");
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [plan, setPlan] = useState<RoundPlan[]>([emptyRoundPlan(1)]);
  const [roundsToPlan, setRoundsToPlan] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presentPlayers = useMemo(
    () => allPlayers.filter((p) => presentIds.has(p.id)),
    [allPlayers, presentIds]
  );

  async function loadPlayers() {
    const { data, error } = await supabase.from("players").select("*").order("name");
    if (error) setError(error.message);
    else setAllPlayers((data as Player[]) ?? []);
  }

  async function loadMatches(gameDayId: string): Promise<MatchWithPlayers[]> {
    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select("*")
      .eq("game_day_id", gameDayId)
      .order("round", { ascending: true })
      .order("court", { ascending: true });
    if (matchError) {
      setError(matchError.message);
      return [];
    }
    const ms = (matchRows as Match[]) ?? [];
    if (ms.length === 0) {
      setMatches([]);
      return [];
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
      return [];
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
    return withPlayers;
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
      if (!isAdmin) {
        setGameDay(null);
        setPresentIds(new Set());
        setMatches([]);
        setPlan([emptyRoundPlan(1)]);
        setLoading(false);
        return;
      }
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

    const ms = await loadMatches((gd as GameDay).id);
    setPlan([emptyRoundPlan(computeNextRound(ms))]);
    setRoundsToPlan(1);
    setLoading(false);
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    loadGameDay(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isAdmin]);

  async function toggleAttendance(playerId: string) {
    if (!gameDay || !isAdmin) return;
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
        setPlan((ps) =>
          ps.map((rp) => ({
            ...rp,
            courts: rp.courts.map((c) => ({
              ...c,
              teamA: c.teamA.filter((id) => id !== playerId),
              teamB: c.teamB.filter((id) => id !== playerId),
            })),
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
    if (!name || !gameDay || !isAdmin) return;
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

  function planAction() {
    if (presentPlayers.length < 4) return;
    const history = buildHistory(matches, presentPlayers.map((p) => p.id));
    const startRound = plan[0]?.round ?? computeNextRound(matches);
    setPlan(planRounds(presentPlayers.map((p) => p.id), startRound, Math.max(1, roundsToPlan), history));
  }

  function resetPlan() {
    const startRound = plan[0]?.round ?? computeNextRound(matches);
    setPlan([emptyRoundPlan(startRound)]);
    setRoundsToPlan(1);
  }

  function playerLabel(id: string) {
    return allPlayers.find((p) => p.id === id)?.name ?? "?";
  }

  function assignPlayer(roundIndex: number, playerId: string, courtIdx: number, team: "A" | "B") {
    setPlan((prev) =>
      prev.map((rp, ri) => {
        if (ri !== roundIndex) return rp;
        const courts = rp.courts.map((c) => ({
          ...c,
          teamA: c.teamA.filter((id) => id !== playerId),
          teamB: c.teamB.filter((id) => id !== playerId),
        }));
        const target = courts[courtIdx];
        if (team === "A" && target.teamA.length < 2) target.teamA = [...target.teamA, playerId];
        if (team === "B" && target.teamB.length < 2) target.teamB = [...target.teamB, playerId];
        return { ...rp, courts };
      })
    );
  }

  function unassignPlayer(roundIndex: number, playerId: string) {
    setPlan((prev) =>
      prev.map((rp, ri) =>
        ri !== roundIndex
          ? rp
          : {
              ...rp,
              courts: rp.courts.map((c) => ({
                ...c,
                teamA: c.teamA.filter((id) => id !== playerId),
                teamB: c.teamB.filter((id) => id !== playerId),
              })),
            }
      )
    );
  }

  function updateScore(roundIndex: number, courtIdx: number, field: "scoreA" | "scoreB", value: string) {
    setPlan((prev) =>
      prev.map((rp, ri) =>
        ri !== roundIndex
          ? rp
          : { ...rp, courts: rp.courts.map((c, ci) => (ci !== courtIdx ? c : { ...c, [field]: value })) }
      )
    );
  }

  function assignedIdsForRound(rp: RoundPlan) {
    const s = new Set<string>();
    rp.courts.forEach((c) => {
      c.teamA.forEach((id) => s.add(id));
      c.teamB.forEach((id) => s.add(id));
    });
    return s;
  }

  async function saveOneRound(roundIndex: number) {
    if (!gameDay || !isAdmin) return;
    const rp = plan[roundIndex];
    const readyCourts = rp.courts.filter(
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
          round: rp.round,
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
    setPlan((prev) => {
      const next = prev.filter((_, i) => i !== roundIndex);
      return next.length === 0 ? [emptyRoundPlan(rp.round + 1)] : next;
    });
    await loadMatches(gameDay.id);
    setBusy(false);
  }

  async function deleteMatch(matchId: string) {
    if (!gameDay || !isAdmin) return;
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
      ) : !gameDay ? (
        <p className="text-sm text-gray-500">Für diesen Tag wurden noch keine Daten erfasst.</p>
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
                  const pill = (
                    <span
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                        present
                          ? "border-court bg-court text-white"
                          : "border-gray-300 text-gray-600"
                      }`}
                    >
                      {p.name}
                    </span>
                  );
                  return isAdmin ? (
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
                  ) : (
                    <span key={p.id}>{pill}</span>
                  );
                })}
            </div>
            {isAdmin && (
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
            )}
            <p className="mt-2 text-sm text-gray-500">
              {presentPlayers.length} Spieler heute dabei
              {presentPlayers.length % 4 !== 0 &&
                presentPlayers.length >= 4 &&
                " – nicht alle können in jeder Runde spielen, es muss immer mind. 1 Person pro Runde aussetzen."}
            </p>
          </section>

          {/* Rundenplanung */}
          {isAdmin && (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Runden planen</h2>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  Anzahl Runden
                  <input
                    type="number"
                    min={1}
                    value={roundsToPlan}
                    onChange={(e) => setRoundsToPlan(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 rounded-md border px-2 py-1 text-center text-sm"
                  />
                </label>
                <button
                  onClick={planAction}
                  disabled={presentPlayers.length < 4 || busy}
                  className="rounded-md border border-court px-3 py-1.5 text-xs font-medium text-court hover:bg-court-light disabled:opacity-50"
                >
                  🎲 Teams mischen
                </button>
                <button
                  onClick={resetPlan}
                  disabled={busy}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Zurücksetzen
                </button>
              </div>
            </div>
            <p className="mb-3 text-xs text-gray-400">
              „Teams mischen" berücksichtigt bereits gespielte Runden von heute und versucht, pro Runde
              möglichst neue Team-Partner zu bilden sowie Pausen fair zu verteilen.
            </p>

            {presentPlayers.length < 4 ? (
              <p className="text-sm text-gray-500">Mindestens 4 anwesende Spieler nötig, um eine Runde zu erfassen.</p>
            ) : (
              <div className="space-y-6">
                {plan.map((rp, roundIndex) => {
                  const assignedIds = assignedIdsForRound(rp);
                  const sittingOut = presentPlayers.filter((p) => !assignedIds.has(p.id));
                  return (
                    <div key={rp.round} className="rounded-xl border-2 border-court-light p-3">
                      <h3 className="mb-2 text-sm font-bold text-court">Runde {rp.round}</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {rp.courts.map((c, courtIdx) => (
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
                                    onSelect={(id) => assignPlayer(roundIndex, id, courtIdx, "A")}
                                    onClear={() => c.teamA[slot] && unassignPlayer(roundIndex, c.teamA[slot])}
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
                                    onSelect={(id) => assignPlayer(roundIndex, id, courtIdx, "B")}
                                    onClear={() => c.teamB[slot] && unassignPlayer(roundIndex, c.teamB[slot])}
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
                                onChange={(e) => updateScore(roundIndex, courtIdx, "scoreA", e.target.value)}
                                className="w-14 rounded-md border px-2 py-1 text-center text-sm"
                              />
                              <span className="text-sm text-gray-400">:</span>
                              <input
                                type="number"
                                min={0}
                                value={c.scoreB}
                                onChange={(e) => updateScore(roundIndex, courtIdx, "scoreB", e.target.value)}
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
                        onClick={() => saveOneRound(roundIndex)}
                        disabled={busy}
                        className="mt-4 w-full rounded-md bg-court py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Runde {rp.round} speichern
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          )}

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
                            {isAdmin && (
                              <button
                                onClick={() => deleteMatch(m.id)}
                                disabled={busy}
                                className="text-xs text-red-500 hover:underline"
                              >
                                löschen
                              </button>
                            )}
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
