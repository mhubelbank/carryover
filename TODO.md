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
  `handleGenerate` — load the file (via `client.readFile`) and pass it through.
- **Per-teacher quirk handlers:**
  - **Joanne Bengali `additionalContext`.** Read `student.fields.needsBengali`
    plus a per-session `bengaliUsed` toggle in the form; emit
    `\nBengali language support: ${bengaliDetails || "Bengali translations were provided when needed"}`
    and pass into the template's `{{additionalContext}}` slot.
  - **Nina journal method.** When an activity starts with
    `"Completed a journal entry"`, rewrite its description to interpolate
    `student.journalMethod` (`"traced" | "wrote"`) per `data/prompts/README.md`.
  - **Nina Spanish post-streamline append.** If `student.fields.needsSpanish`,
    append the literal Spanish-support sentence after the streamline pass via
    `opts.postProcess`. Engine already supports the hook.
- **José `draftAppend` override.** The literal addendum is in
  `data/prompts/README.md` ("Per-teacher overrides"). Needs to land on his
  `teachers.json` `promptOverrides.draftAppend`; templates already read
  `{{teacher.draftAppend}}` (flattened by `teacherPromptContext`). Requires
  either (a) a "Prompt overrides" UI in the Teachers page (the requirements
  already list this as advanced/disclosed but it's unbuilt), or (b) hand-edit
  the JSON for now.
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
