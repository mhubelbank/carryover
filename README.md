# Carryover

## What it is

A browser-only web app for one speech language pathologist (the developer's cousin 🙂) to write session notes quickly, alleviating
the manual, tedious effort of writing 80 legally binding documents per week for NYC DOE's Special Education Student Information System (SESIS).

**UX:** The clinician records the day's activities and per-student performance via a structured form; metrics can be entered in aggregate or trial-by-trial.
Then, the app drafts a clinical note in the teacher's established voice with three-pass generation via the Anthropic API.
In addition, the app is a hub for day-to-day tasks, providing user-friendly features for roster management, scheduling, and longitudinal student goal tracking.

**Stack:** Vite + React + TypeScript. UI is plain React with CSS-token theming for light/dark modes. Hosted via Cloudflare SPA.
There is no backend: it runs entirely in the browser (localStorage, IndexedDB) and brings its own keys. Domain logic is unit-tested.

**PII note:** Zero Data Retention on the account

## Repo layout

```
[branch: main]
.
└── app/                  Vite + React + TS app — the deployed code
    ├── pages/
    ├── components/
    ├── domain/
    └── clients/

[branch: data]
.
└── data/                 roster, goals, schedule, terms, sessions/
```

- The **`data` branch** holds the live app data and is written on nearly every
  save. It must **never** be a deploy/build branch.
- The app reads prompts from the `data` branch at runtime, so prompt edits on
  `main` only take effect once copied over to `data`.

## Data model (`app/src/domain/`)

- **Term** — a school year or summer session; the roster and schedule belong to a
  term. A new-term wizard rolls the roster forward; finished terms are snapshotted
  into history.
- **Students / Teachers / Goals** — the caseload. Goals carry IEP and triennial
  dates, a service mandate, and measurable targets.
- **Schedule** — a weekly grid of teacher-specific time slots → students, with
  per-week deviations layered over a "usual" template.
- **Sessions** — per `(date, teacher)` metadata including per-student trial data;
  powers the longitudinal progress views.

## Privacy

Student records are FERPA-sensitive. The model:

- **Private repo** — data is invisible without a token scoped to it.
- **Cloudflare Access** — the app URL is gated to an allowlisted email at the
  edge; random visitors can't load it.
- **Spend-capped Anthropic key** — bounded cost if leaked.
- **Keys never leave the browser** — held in `localStorage`; there is no server to
  exfiltrate them from.

## Local development

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # vitest (pure-domain tests)
npm run build      # tsc --noEmit && vite build
```

Use the same two keys as production — local dev reads/writes the same `data`
branch via the GitHub API. A classic `repo`-scoped GitHub token is required (a
fine-grained token can't be scoped to a repo owned by another account). See
`app/README.md` for the source layout.

## Deployment

Hosted on **Cloudflare** as a static SPA built from `app/` (Workers static
assets; config in `app/wrangler.jsonc`), gated by **Cloudflare Access**. Builds
trigger on push to `main`.

- Restrict builds to `main` only — the `data` branch changes constantly at
  runtime and must never trigger a deploy.
- Add a Cloudflare Access policy allowing the clinician's email on the app's
  hostname (and on its preview URLs) so the data behind it stays private.
