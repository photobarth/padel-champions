# Rivella Padel Champions

Web-App zur Erfassung von Padel-Spieltagen, Punkten und der Rangliste für die
Gruppe rund um Rivella. Läuft unter `rivellapadelchampions.photobarth.ch`.

## Konzept

- **Spieler** sammeln Punkte individuell, nicht als festes Team – die Teams
  werden an jedem Spieltag neu gemischt.
- Pro Spieltag wird erfasst, wer dabei ist ("Anwesenheit"). Neue, kurzfristige
  Spieler können direkt am Spieltag angelegt werden.
- Gespielt wird auf 2 Plätzen. Pro Runde entstehen so bis zu 2 Matches
  (je 2 gegen 2). Bei ungerader Spielerzahl setzt zwangsläufig mind. eine
  Person pro Runde aus – die App zeigt das an und kann die Teams auch
  zufällig verteilen.
- Punkte: Sieg = 3, Unentschieden = 1, Niederlage = 0 – pro Spieler, nicht
  pro Team.
- Tordifferenz = Summe (eigene Punkte − gegnerische Punkte) über alle Spiele.
  Bei Punktgleichstand entscheidet die Differenz.

## Setup

### 1. Datenbank (Supabase, Projekt "free-fit stats")

1. Im Supabase SQL Editor das Skript [`supabase/schema.sql`](supabase/schema.sql)
   ausführen. Es legt das Schema `padel` mit allen Tabellen, der
   `standings`-View, RLS-Policies und den bekannten Stammspielern an.
2. Unter **Project Settings → Data API → Exposed schemas** das Schema
   `padel` zur Liste hinzufügen (standardmässig ist nur `public` freigegeben).
   Ohne diesen Schritt kann die App nicht auf die Tabellen zugreifen.

### 2. App

```bash
npm install
cp .env.local.example .env.local   # ggf. Werte anpassen
npm run dev
```

Benötigte Umgebungsvariablen (siehe `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key, kein Service-Role-Key!)
- `ADMIN_KEY` (serverseitiges Secret für den Admin-Link, siehe unten)

### 3. Admin-Zugriff

Erfassen (Anwesenheit, Runden, Spieler hinzufügen/deaktivieren, Matches
löschen) ist nur im Admin-Modus möglich. Alle anderen Besucher sehen die
Seiten nur lesend.

Der Admin-Modus wird über einen einmaligen Link aktiviert:

```
https://rivellapadelchampions.photobarth.ch/api/admin?key=<ADMIN_KEY>
```

Der Aufruf setzt ein Cookie im Browser des Geräts (1 Jahr gültig) – der
eigentliche Schlüssel wird dabei nur serverseitig geprüft und taucht nie im
Browser-Code auf. Über den Link "beenden" neben "✏️ Admin-Modus" in der
Navigation lässt sich der Modus auf diesem Gerät wieder deaktivieren.
Diesen Link nur an die Personen weitergeben, die erfassen dürfen (z. B.
Nicole und Nadine B.) – jede von ihnen öffnet ihn einmal auf ihrem Gerät.

### 4. Deployment

Deployment erfolgt über Vercel. Die Umgebungsvariablen müssen im
Vercel-Projekt hinterlegt werden. Anschliessend `rivellapadelchampions.photobarth.ch`
als Custom Domain im Vercel-Projekt hinzufügen und beim DNS-Provider einen
CNAME-Eintrag auf `cname.vercel-dns.com` setzen.

## Seiten

- `/` – Rangliste
- `/spieltag` – Anwesenheit, Runden mit Teams & Ergebnissen erfassen
- `/spieler` – Spielerverwaltung (hinzufügen, deaktivieren)
