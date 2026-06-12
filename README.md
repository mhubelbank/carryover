# Carryover

## What it is

A browser-only web app for one speech language pathologist (the developer's cousin 🙂) to write session notes quickly, alleviating the manual, tedious effort of writing 80 legally binding documents per week for NYC DOE's Special Education Student Information System (SESIS).

**UX:** The clinician records the day's activities and per-student performance via a structured form; metrics can be entered in aggregate or trial-by-trial. Then, the app drafts a clinical note in the teacher's established voice with three-pass generation via the Anthropic API. In addition, the app is a teacher's hub for day-to-day tasks, providing user-friendly features for roster management, scheduling, and longitudinal student goal tracking.

**Stack:** Vite + React + TypeScript. UI is plain React with CSS-token theming for light/dark modes. Hosted via Cloudflare SPA. The app runs entirely in the browser (localStorage, IndexedDB) and brings its own keys for Anthropic/OpenAI API calls on natural language tasks, and GitHub API calls for CSV read/writes to a private repo. Domain logic is unit-tested.

**PII note:** App is gated with Cloudflare Access. Student data lives in a separate private repo; keys are bring-your-own. See [Privacy](#privacy).

## Repo layout

Two repos, split so FERPA-sensitive data never lives in the public code repo:

```
carryover  (public, this repo)        carryover-data  (private)
└── app/   Vite + React + TS app      └── data/   read/written at runtime
    ├── pages/                            ├── students.csv, goals.csv, schedule.csv, ...
    ├── domain/                           ├── activities.json, teachers.json, term.json, ...
    └── clients/                          ├── sessions/
                                          ├── iep-history/
                                          └── prompts/
```

- **`carryover-data`** holds the live app data and is written on nearly every save, via the GitHub API.
The app reads its **generation prompts** from `data/prompts/` there too, so prompts are tuned without touching the app.

## Data model (`app/src/domain/`)

- **Term** — A school year or summer session; the roster and schedule belong to a term. A new-term wizard rolls the roster forward; finished terms are snapshotted into history.
- **Students / Teachers / Goals** — The caseload. Goals carry IEP and triennial dates, a service mandate, and measurable targets.
- **Schedule** — A weekly grid of teacher-specific time slots -> students, with per-week deviations layered over a "usual" template.
- **Sessions** — Per-`(date, teacher)` metadata including per-student trial data; powers longitudinal views for monitoring student progress towards goals & independence.

## LLM guardrails

We use a hybrid template x prompt structure to ensure consistent clinical quality for these legally binding documents. See [`docs/note-generation.md`](docs/note-generation.md).

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
npm run typecheck  # type-check only
npm run build      # tsc --noEmit && vite build
```

Use the same two keys as production — local dev reads/writes the same private
`carryover-data` repo via the GitHub API. A classic `repo`-scoped GitHub token is
required (a fine-grained token can't be scoped to a repo owned by another account).
See `app/README.md` for the source layout.

## Deployment

Hosted on **Cloudflare** as a static SPA built from `app/` (Workers static
assets; config in `app/wrangler.jsonc`), gated by **Cloudflare Access**. Builds
trigger on push to `main`.

- Only the `carryover` repo is built; the private `carryover-data` repo changes
  constantly at runtime and is pure data — never built or deployed.
- Add a Cloudflare Access policy allowing the clinician's email on the app's
  hostname (and on its preview URLs) so the data behind it stays private.

## Future directions

- **Real datastore** — the private repo doubles as a zero-infra database, but a
  proper store (e.g. Cloudflare D1) would replace the git-as-DB pattern with real
  queries and concurrent-write safety.
- **PII encryption at rest** — encrypt the student data in the data repo so a
  leaked token alone couldn't read it.