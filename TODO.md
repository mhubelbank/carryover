# TODO

Known gaps and deferred work. Slice-scoped questions to ask Emily live in
`demo.md`; deployment-flavored items live in `SESIS_requirements.md` under
"Deployment TODO (deferred)". This file is for code-level work I deliberately
left for later.

## Slice 5 — Note generation gaps

The 3-pass engine, form, results page, and session-metadata write are in. These
pieces aren't:

- **IndexedDB caching of transient note text.** Results currently live only in
  `<Generate>` component state; navigating away discards them. Per
  `SESIS_requirements.md` → "Note retention", the narrative should cache in
  IndexedDB so copy-all / regenerate / recent-notes export keep working across
  page navigation. Storage helper exists at `app/src/clients/storage.ts`.
- **Form auto-save every 5s.** A quirk-preserved behavior — drafts in progress
  should survive a refresh. Same IndexedDB location.
- **`data/feedback-rules.md` loading + draft-only append.** The engine accepts
  `opts.feedbackRules` (`app/src/domain/notes.ts`) and the rules belong on the
  **draft** pass only (per `data/prompts/README.md`). Not yet wired in
  `handleGenerate`. Deliberately deferred to **Slice 6**: nothing populates
  `data/feedback-rules.md` until the regenerate-with-feedback "save as a rule"
  flow exists, so wiring the load now would be a no-op. Wire it *with* that flow
  — load the file (via `client.readFile`) and pass it through.
- **Per-teacher quirk handlers — DONE (verified live + harness).** All run
  through the declarative `sessionCaptures` system (`app/src/domain/captures.ts`),
  not bespoke code:
  - ✅ **Joanne Bengali** — `bengali` capture (`bengaliUsed`/`bengaliDetails`
    fields → `promptInjection` into `{{additionalContext}}`). Confirmed live.
  - ✅ **Nina Spanish** — `spanish` capture `postProcess.appendToFinalNote`.
    Confirmed live.
  - ✅ **Nina journal** — `journal` capture `activityDescriptionTemplate` with
    `{student.journalMethod}`. Confirmed live.
- **Captures schema extended for José-class quirks — wiring DONE, data
  deferred.** The schema + connection now supports a per-session multiselect that
  rewrites an activity description:
  - `SessionCaptureField.type` adds `"multiselect"` (+ `options[]`); the
    Generate capture panel renders it as a checkbox group.
  - `applyActivityRewrite` threads the capture's field state into the template
    context, so `activityDescriptionTemplate` can interpolate session input.
  - `renderCaptureTemplate` gained a `join` filter (`{skills | join: ", "}`),
    with `default` firing after an empty join.
  - `promptOverrides` (draft/review/streamline appends) path verified end-to-end.
  All five paths exercised against the real functions (esbuild harness, all pass).
  **Remaining = DATA only, deferred (ask Emily):** José's `teachers.json` record
  currently lists a single activity "Cooking group" and no `promptOverrides` —
  his original `jose.tsx` pragmatic-language activity + 9-option skills list +
  the draft/review/streamline CRITICAL rules (`originals/jose.tsx:470,520-521,621`)
  are unported. Whether "Cooking group" is intentional or placeholder is unknown;
  don't recreate his original activities without confirming his current caseload.
  - *Design note:* a capture gated on `activity.name` cannot also feed
    `additionalContext` — that path (`activeCapturesFor`) is student-scoped and
    has no activity in context. Gate injection captures on student/capture state.
- **Regenerate-with-feedback modal.** A plain "Regenerate" button is wired; the
  feedback modal + quick-fix chips + "save as a rule" opt-in are Slice 6 per the
  spec.
- **Generation progress indicator.** Currently the Generate button just reads
  "Generating…" while ~16 students × 3 passes runs (30s+); the results page
  only renders once the whole batch finishes. Surface live progress: which
  student is in flight, which pass is running (draft / review / streamline),
  and overall N of M complete. The runner is already pass-aware — `generateNote`
  in `app/src/domain/notes.ts` runs draft → review → streamline sequentially.
  Likely shape: switch `phase: "running"` into a partial results view that
  reveals each student's card as it lands, with a "draft… → review… →
  streamline…" sublabel on the in-flight one. Either thread a per-pass
  `onProgress(pass)` callback through `generateNote`, or split the call site to
  invoke each pass separately so the form can announce between them.

## Repo / deployment cleanup (deferred — user explicitly said "fix later")

- **Sync the catalog migration to the `data` branch.** The code now reads three
  shared catalogs — `data/activities.json`, `data/filming-roles.json`, and
  `data/student-fields.json` — and teachers reference `activityIds` +
  `filmingRoleIds` (was embedded `activities`/`roles`); student "quirk" values now
  live in students.csv columns by field key. Canonical migrated files are in the
  working tree (the three catalog JSONs + rewritten `data/teachers.json` +
  `data/students.csv` with a `language` column folded from `needsSpanish`/
  `needsBengali`). Sync all of them to the **`data` branch** via the worktree flow
  **with/after** the new code deploys — until then the running app (old code)
  shows empty menus / missing fields. Loaders default to empty, so the pre-sync
  window is degraded, not crashing.
  - **Real-data step for the data branch:** when applying to the live students.csv,
    compute `language` = "Spanish"/"Bengali" from the old `needsSpanish`/
    `needsBengali` columns, and seed `aacDevice` options in `student-fields.json`
    from the distinct device values actually present (here: the full SGD string +
    "SGD"). Capture expressions already retargeted to `student.language includes "…"`.
- **Relocate live session files on the `data` branch.** The code now reads/writes
  `data/sessions/` (was `sessions/`; `SESSIONS_DIR` in `app/src/domain/data.ts`).
  The `main`-side move (constant + tracked files + docs) is done, but the live
  session JSONs on the **`data` branch** still sit at `sessions/`. Move them to
  `data/sessions/` via the worktree-sync flow **with/after** the new code deploys
  — until then the running app would read an empty sessions dir (goal-usage counts
  show 0). Files to move on `data`: the five `sessions/*.json` + `sessions/README.md`.
- **Pre-cutover data commits on `main`.** Roughly a dozen `Update schedule` /
  `Update term` / `Update teachers` commits landed on `main` before we cut over
  to the `data` branch + `data:` prefix. Acceptable for now; the `data` branch
  was forked from `main` so the data is intact there. Two cleanup options when
  there's time:
  1. Leave them — they're harmless history.
  2. Rebase/squash `main` to a code-only history, force-push, and let the `data`
     branch keep its own lineage.

## Pointers (not duplicating)

- **Open questions to ask Emily** → `demo.md` (grouped by slice).
- **Cloudflare Pages + Access + branch-build config** → `SESIS_requirements.md`
  → "Deployment TODO (deferred)".
- **PAT rotation prompt at term rollover** → `SESIS_requirements.md` (inline
  TODO under Slice 5 in "Implementation slices").
- **Sample data → bundled demo (`VITE_DEV_DEMO`)** → in the README dev-setup
  area.
