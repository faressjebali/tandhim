# Tandhim architecture

> Technical overview: how Tandhim is built. The product and the reasons behind the main choices are in the [README](../README.md); the visual design is in [design.md](design.md).

## 1. The big picture

```
        SOURCES (read-only)                           HOME SERVER (Ubuntu, 4 GB RAM, Docker Compose)
 ┌──────────────────────────────┐          ┌──────────────────────────────────────────────────────┐
 │ Gmail ×2      ─┐             │          │  ┌────────────────┐            ┌──────────────────┐  │
 │ Classroom ×2  ─┼─ Google APIs├──┐       │  │ worker (Node)  │◄─ Matrix ──│ Matrix server    │  │
 │ Drive         ─┘  (OAuth)    │  │       │  │ syncs, AI,     │   client   │   ▲ appservice   │  │
 │                              │  ├──────►│  │ reminders,     │   API      │ mautrix-meta     │  │
 │ Messenger group ── bridge ───┼──┼──────►│  │ backups        │            │ (Messenger)      │  │
 │                              │  │       │  └───────┬────────┘            └──────────────────┘  │
 │ Gemini API (free tier) ◄─────┼──┘       │          │ SQLite (WAL, Docker volume)               │
 └──────────────────────────────┘          │  ┌───────▼────────┐                                   │
                                           │  │ web (Next.js)  │  bound to 127.0.0.1               │
                                           │  └────────────────┘                                   │
                                           └───────────────┬──────────────────────────────────────┘
                                                           │ Tailscale (HTTPS, private network only)
                                          iPhone (PWA) ────┴──── desktop browser
```

- **Fully automatic**: the worker collects, the AI extracts, the app displays. Every item keeps a link to its source, gets a "to check" badge when the AI is unsure, and can be corrected in one gesture. A manual correction is never overwritten (`locked_by_user`).
- **Read-only** on every source: nothing is ever sent, submitted or modified on Google or Meta.
- **Free**, **self-hosted**, **never exposed to the Internet** (Tailscale only).

## 2. Repository (pnpm monorepo, TypeScript everywhere)

```
apps/web/        Next.js 16 (App Router): UI, server actions, API routes
apps/worker/     separate Node process: syncs, AI engine, reminders, scheduled jobs
packages/core/   PURE, tested business logic (dates, A/B weeks, Darija rules, groups…)
packages/db/     Drizzle schema, migrations, seed, demo data, all queries (SQLite)
packages/ai/     prompt, JSON output schema, Gemini client, Darija lexicon, test set
infra/           Dockerfile, docker-compose, deploy / backup / restore scripts, demo launcher
docs/            this architecture, design
```

Dependency rule: `core` depends on nothing application-specific; `db` and `ai` depend on `core`; `web` and `worker` depend on all three. Anything testable (date maths, poll counting, message grouping…) lives in `core`, with no network or database access.

| Module                                                      | Main content                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `core/time.ts`                                              | the **only** entry point for dates (Africa/Tunis time zone, `DayKey` = `YYYY-MM-DD`)                   |
| `core/calendar.ts`                                          | A/B weeks, sessions of a day, next session of a subject                                                |
| `core/dates-relatives.ts`                                   | Darija relative days ("hedha" = this, "jey" = next, past tense, weekends); ambiguous cases are flagged |
| `core/extraction.ts`                                        | deadline resolution, title similarity, conflict detection before merging                               |
| `core/changements.ts`                                       | cancelled / postponed / online / make-up sessions, room changes, off-slot sessions                     |
| `core/groupes.ts`                                           | class groups (visibility, which groups can be merged)                                                  |
| `core/messenger.ts`                                         | Matrix events, conversation slices, polls, Meta export import                                          |
| `core/liens.ts`                                             | exact source message in a conversation, files cited in a text                                          |
| `core/demo.ts`                                              | demo mode (invented teachers, demo clock)                                                              |
| `core/rappels.ts`, `revisions.ts`, `saisie.ts`, `taches.ts` | reminders, revision planning, quick add, task sorting                                                  |
| `db/schema.ts`                                              | the tables (see §4)                                                                                    |
| `ai/prompt.ts`, `schema.ts`, `client.ts`                    | instructions, structured output (zod → JSON Schema), Gemini call with fallback                         |

## 3. Runtime

### Containers (`infra/docker-compose.yml`)

- **worker**: migrates the database, applies the seed, then runs continuously. Memory capped at 384 MB.
- **web**: Next.js in `standalone` mode, bound to `127.0.0.1`, waits until the worker is ready. Memory capped at 512 MB.
- One Docker volume mounted on `/data`: the SQLite database (WAL), backups and signal files.
- Secrets come from `.env` on the server, never from the repository (see `.env.example`).

### Messenger

Messenger has no public API for personal group chats. A [mautrix-meta](https://github.com/mautrix/meta) bridge copies the class group into a private Matrix room (federation and registration disabled), and the worker reads that room with the Matrix client API. The bridge and the Matrix server run next to the app on the same Docker network.

### Scheduling (worker, `apps/worker/src/index.ts`)

| When                                                  | What                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| every 15 min, at startup, and on request from the app | Classroom → Gmail → Drive → Messenger → AI engine → revision planning               |
| every 5 min                                           | deadline reminders, session-change and new-information notifications, outage alerts |
| every night at 03:00                                  | verified SQLite backup (14 days kept)                                               |

Robustness: a timeout on every network call (Google 60 s, Gemini 3 min, Matrix 60 s) and a 20-minute watchdog per step; a sync requested during a run is replayed afterwards. Every failure is visible on the **sync status** page (`sync_status`) and retried with backoff; never silent.

## 4. Data (SQLite + Drizzle, `packages/db`)

| Domain             | Tables                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar           | `subjects`, `semesters`, `academic_weeks`, `academic_events`, `timetables`, `timetable_slots`                                                                                                                    |
| Work               | `items` (tasks, assignments, labs, exams; group, reliability level, `locked_by_user`, `needs_review`), `consignes` (cumulative instructions with a reliability level), `projects` (manual or AI), `item_history` |
| Sources            | `source_items` (an email, an announcement, a Drive file, a conversation slice with its messages), `item_sources` (source ↔ task links with the quoted text)                                                      |
| Accounts and syncs | `accounts` (Google tokens encrypted with AES-256-GCM), `classroom_courses`, `classroom_posts`, `dossiers_drive`, `sondages_messenger`, `sync_status`, `settings`                                                 |
| Living calendar    | `changements_seance` (cancelled, postponed, online, make-up, room; per group)                                                                                                                                    |
| Usage              | `push_subscriptions`, `notifications_envoyees`, `seances_revision`, `ai_usage` (Gemini quota)                                                                                                                    |

- All instants are stored as **UTC ISO** strings; days as `DayKey` in Tunis time.
- The **seed** (timetable, academic calendar, subjects) is idempotent and never touches a row edited by hand.
- Migrations are generated (`pnpm db:generate`) and applied by the worker at startup.

## 5. How a piece of information flows

```
 source ──► collection (worker/synchro/*) ──► source_items (to process)
                                                 │  batches, model chosen by attachments
                                                 ▼
                                   AI engine (worker/moteur.ts + packages/ai)
                                   Gemini → validated JSON (zod): items {type, subject, group,
                                   deadline "as written", how, confidence, quote}
                                                 │
                        dates computed by CODE (core) from the message's own date
                                                 ▼
                          appliquerElement / appliquerSeance (db/moteur.ts, db/changements.ts)
             ┌──────────────┬────────────────┬──────────────────┬───────────────────┐
             ▼              ▼                ▼                  ▼                   ▼
        new task       task updated     submission         session change      plain info
        (to check      (merge, same     detected           (calendar)          (analysis kept)
        if unsure)     group)           (task done)
```

Per source:

- **Gmail**: only an allow-list of senders (teachers, class representative, administration; `core/expediteurs.ts`), plus the user's own sent emails to those addresses (to detect submissions). Attached PDFs are read by Gemini.
- **Classroom**: assignments (marked done automatically when submitted), announcements and materials; attached Drive files are read.
- **Drive**: followed folders; every file is listed on the subject page, new files are read by the AI.
- **Messenger**: messages grouped into slices (1 h of silence or a new day) with the previous messages as context; polls are counted (last vote per person) and summarized when the leading option changes; the exact message of each item is kept for the source link.
- Google links (Sheets, Docs, Drive) cited in a text are read like attachments.

Merging new information into a known task: the information becomes a dated **instruction** with a reliability level (the user's own edit > written teacher source > chat message). The AI says whether it replaces or completes the previous one; an instruction is struck through only by information at least as reliable, otherwise both stay visible ("to check"). A less reliable date is never applied automatically: it is offered ("Apply this date"). A task edited by the user is never changed: it gets a "New info" badge instead. Work items of a real multi-deliverable course project are grouped into an AI-proposed project, marked "to check".

Engine safeguards: deadlines more than 7 days in the past are ignored; undated work from messages older than 3 weeks is ignored; merging only for the same piece of work (title similarity, conflicting numbers or kinds, same group); a student question or request is never a decision; an ambiguous relative day is flagged "to check".

## 6. Interface (`apps/web`)

- **Pages**: Today, Calendar (Monday → Sunday), To-do, Projects (list / Kanban), Subjects (one page per subject), Search (`Ctrl+K`), Revisions, More (accounts and courses, Drive folders, notifications, source feed, sync status).
- **Server-side rendering** (React Server Components) reading SQLite directly; changes go through **server actions** with optimistic UI.
- **Gestures**: swipe (done / postpone), long press (menu), 5-second "Undo", natural-language quick add (`core/saisie.ts`).
- **PWA**: manifest, service worker `public/sw.js` (Web Push, offline cache of visited pages with a "server unreachable" banner).
- **Emails are readable inside the app** (text and attachments relayed from Gmail), because the Gmail iOS app cannot open a specific email from a link.
- **Access**: single password (scrypt hash), signed session cookie, `proxy.ts` protects every page except login, health, manifest and service worker. Demo mode (`TANDHIM_DEMO=1`) skips the password and every external source.

## 7. Notifications

Web Push (VAPID, `web-push`) to subscribed devices (on iPhone, the app must be added to the home screen).

- Reminder **2 days before** each deadline, once per deadline, never between 22:00 and 07:30 (moved to 21:00 the day before).
- Session changes in the next **48 hours**.
- New information on a task that changes the date, place, submission method or rules.
- A source failing for more than 3 hours (once per outage, with what to do); for Messenger, no message for 30 hours means the bridge is probably disconnected.

## 8. AI (Gemini, free tier)

- Configurable models: `GEMINI_MODEL` (Flash-Lite), `GEMINI_FALLBACK_MODEL`, `GEMINI_DOCS_MODEL` (documents); automatic fallback on quota errors (429).
- Enforced **structured JSON output** (zod schema converted to JSON Schema), validated again on reception.
- The prompt (`packages/ai/src/prompt.ts`) and the lexicon (`packages/ai/lexique.md`) hold the rules (relevance, task vs information, groups, session changes, chat, polls). **The AI never computes a date.**
- Quota tracked per day and per model (`ai_usage`); the engine stops before the daily limit.
- **Test set**: `pnpm test:ai` replays invented public cases ([`packages/ai/jeu-de-test`](../packages/ai/jeu-de-test)) plus real anonymized conversations that are never published. Results are in the [README](../README.md#ai-extraction-quality).

## 9. Security and privacy

- Secrets only in `.env` (never committed); Google refresh tokens encrypted in the database.
- Network access through Tailscale only; container ports bound to `127.0.0.1`.
- Read-only OAuth scopes on every source.
- This public repository is generated from a private one by an allow-list script that replaces real data with demo data, then blocks the publication if a scan (gitleaks + fingerprints of real messages and names, [`infra/controle-donnees.mjs`](../infra/controle-donnees.mjs)) finds anything.

## 10. Commands

| Command                                                                   | Purpose                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm demo`                                                               | run the app with invented data, no account, no password                                  |
| `pnpm dev` / `pnpm test` / `pnpm lint` / `pnpm typecheck`                 | development (Vitest; time zones can be varied with `TEST_TZ`)                            |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed`                   | database                                                                                 |
| `pnpm test:ai`                                                            | AI extraction evaluation (needs a Gemini key)                                            |
| `pnpm deploy:serveur`                                                     | builds the images locally and ships them to the server over SSH (no build on the server) |
| `pnpm sauvegardes:copier` / `pnpm restaurer:serveur [date] [--confirmer]` | copy backups locally; restore (dry run by default)                                       |

Screen preview at a given date: run the web app with `TANDHIM_APERCU=1`, then open `/?a=2026-11-23T10:00`.

## 11. Known limitations

- Gemini Flash-Lite sometimes misses an item when one message gives a different date per group, and a few online sessions without an explicit date escape extraction.
- The Messenger bridge depends on a session cookie; if Meta disconnects the account, the login must be redone.
- Messenger history from before the bridge depends on the official Meta export.
- Backup restore has only been tested in dry-run mode.
- Second-semester timetable import from a photo is not done yet.
