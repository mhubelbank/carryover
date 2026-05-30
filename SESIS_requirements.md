# SESIS Notes — Requirements

## Background

Emily is an NYC special-ed speech-language pathologist writing ~16 SESIS notes per day across ~40 students and 5 teachers. Notes are legally binding. Her current tool is seven near-duplicate TSX files (one per teacher, two with "filming day" variants) running inside Claude Artifacts, with hardcoded rosters/goals/schedules.

This project replaces those files with a single configurable web app that:
- Consolidates the seven TSX files into one form engine
- Replaces her separate Google Sheet with in-app data management
- Preserves the existing three-pass LLM pipeline (draft → review → streamline)
- Provides durable storage and an audit trail
- Requires no developer maintenance after launch

## Stack

**Cloudflare Pages + Cloudflare Access + Bring-Your-Own-Key.** Static React app deployed to Cloudflare Pages, gated by Cloudflare Access (email-based auth at the edge). No backend.

- Two keys in browser `localStorage`: Anthropic API key + GitHub PAT
- Direct browser→Anthropic calls using header `anthropic-dangerous-direct-browser-access: true`
- GitHub PAT reads/writes data files in the private repo `emily-sesis/sesis-data`
- IndexedDB for in-progress drafts, last-session defaults, and feedback rules
- Cloudflare Pages auto-deploys on push to `main`. Both code and app data commit to `main` (data commits are prefixed `data:` for log delineation). A separate `data` branch was prototyped to keep saves from triggering production rebuilds; reverted for simplicity — see Deployment TODO.

**Privacy.** Student data is FERPA-protected. The app URL is gated by Cloudflare Access — only Emily's email gets through. The repo is private; the Anthropic API key has a monthly spend cap. Both keys live only in Emily's browser.

Chosen over GitHub Pages (private Pages requires Enterprise plan; Pro only hides the source, not the deployed site), local-first (developer-tooling install friction for a non-developer), and Vercel (paid tier for password protection). Cloudflare's free tier provides real auth gating with `git push` deploys.

## Data model

### Stored in the repo (GitHub API)

- **`data/teachers.json`** — id (stable, name-independent), name (display label), color (one of 12 palette options), supported modes (regular, filming-day), activities[], roles[] (filming-day only), **`sessionCaptures[]`** declaring per-teacher session-time behavior (see below), optional prompt overrides
- **`data/students.csv`** — id, firstName, middle, lastName, pronouns, teacherId, birthday, age (legacy fallback), aacDevice, nextIepReview, nextTriennial, mandate, firstDay, lastDay, archived, needsSpanish, needsBengali, journalMethod. Durable student attributes live as first-class columns (no `fields` blob); empty for most students — sparse columns are fine.
- **`data/goals.csv`** — studentId, longTermGoal text, shortName, archived (bool)
- **`data/schedule.csv`** — teacherId, dayOfWeek, timeSlot, studentId
- **`data/term.json`** — termType (school-year | summer), firstDay, lastDay, label (auto-generated)
- **`data/prompts/*.md`** — six templates: `{regular,filming}-{draft,review,streamline}.md`, plus shared partials
- **`data/feedback-rules.md`** — appended to every draft prompt; populated by user opt-in from regenerate dialog
- **`data/iep-history/{studentId}.jsonl`** — append-only log of IEP reviews per student
- **`sessions/YYYY-MM-DD-teacher.json`** — metadata only, no note narrative: per student, the `studentId`, `goalIds[]` targeted, and `mode`. Powers "used in N sessions" counts and a skeletal session history. Generated note *text* is deliberately not persisted to the repo (see Note retention below). When Trials is enabled for a student, the file also gains an optional `trials` field per student capturing the raw inputs (what's being counted, total, support rows, failed) — note text is still not stored.

**Entities are referenced by stable id, never by name.** Students and teachers each have an `id` independent of their display name; all cross-references (students→teacher, schedule→teacher/student, goals→student) use ids. Names are display labels only. This means a rename never cascades, and two entities can share a name without corrupting data — name collisions become a UX concern (see below), not a data-integrity one.

### Stored in browser (IndexedDB; not synced)

- Session drafts in progress (auto-save every 5s)
- Generated note narrative for the active/recent sessions (transient — never synced to the repo; enables regenerate, copy-all, and recent-notes export during use)
- Per-student last-used defaults (prompting / redirection / response)
- Optimistic write queue (batched, flushed to GitHub on save action — not per keystroke — to avoid rate-limit pressure)

The repo is the source of truth for roster/goals/schedule/session-metadata. IndexedDB is convenience cache that can be wiped without data loss. Note narrative exists only here and only transiently.

## Mode model

**Regular** — default. Session has 1–4 activities at the top; each student gets a goals + prompting + redirection + response form per activity.

**Filming day** — opt-in per teacher (currently Morgan and Carter). Activity is fixed; each student is assigned a role (Anchor, Reporter, Sports, Weather, Studio Audience, Lunch Anchor, Other). Role determines which conditional fields appear.

The opening sentence is preserved exactly: `"{Student} collaborated with classmates to produce an episode of the 811X Dragon News, serving as {role-phrase}."` — "serving as" is established lingo from her current tool.

Mode is selected at the start of the Generate-notes form; it is not stored per-schedule-slot since the schedule data doesn't encode it.

## UX

### First-run welcome
Two-key entry only. Repo path is hardcoded, not shown.

### Settings (gear icon top-right of every nav)
Sections in order:
1. **Term** — current term label, dates, counts; "Prepare new term" button
2. **Keys** — edit/rotate both keys
3. **Export** — Excel (her original sheet format), CSV bundle, recent notes `.txt` (from local cache — see Note retention), full JSON backup of repo data
4. **Reset** — Sign out (clear keys, repo intact) / Test mode (pretend repo is empty for one session, no GitHub changes) / Reset session cache

No "delete all data" affordance — user can delete the repo directly if needed.

### Today (default landing page)
Sessions grouped by time slot and teacher; per-session "Generate N notes" button.

Banners stack at top when triggered:
- **Term over** (on/after `lastDay`): yellow, "{term} is over — time to prepare the next term." with "Prepare new term →". She rarely has the next term's schedule before classes restart, so notifying earlier just creates dismissal fatigue.
- **IEP overdue**: red, "Sam's IEP review was May 27." Actions on the right: **Change IEP date** (inline date editor to push the date back) and **Review goals →**. Persists until either action resolves it.
- **IEP tomorrow**: blue (info), "Riley's IEP review is tomorrow" with the same **Change IEP date** affordance so she can push the date without leaving Today.

**IEP overdue is a soft block**, not a hard one. The student's session-pill turns red with an alert icon (informational) but the Generate button stays enabled — she can still generate notes for an overdue student and resolve the IEP separately.

### Students
List with search and teacher filter. Inline rows: name, teacher, pronouns, AAC, goal count, next IEP date.

Detail view: profile (first / middle / last name, pronouns, birthday + computed age, teacher, AAC), IEP dates, enrollment window (firstDay / lastDay), language / session supports (`needsSpanish`, `needsBengali`, `journalMethod`), and **IEP history timeline** — one row per past review, showing what changed (`+ N goals` / `N retired` / "Nothing changed" affirmation) and linking to a diff view.

Same-teacher first-name collisions are handled by the table's display cascade (first → first L. → first last → first middle last) and the form's collision check, which blocks save when first + middle + last all match another active student on the same teacher. Archived students are out of the collision pool. The Students list has an Active / Archived toggle, and past-`lastDay` rows are flagged with a one-click "Archive N departed students" banner.

### Generate notes

Top controls: date, teacher, mode. Auto-saves to IndexedDB every 5s. "Clear form" top-right; per-student clear.

**Regular mode**: 1–4 activities chosen once (apply to all students); per-student card with goals checklist, prompting level / type / redirection / response columns (plain checkboxes, all options visible). Defaults pre-fill from last session. Absent toggle collapses the rest of the card.

**Filming day mode**: no activities — per-student role picker; role-conditional fields render based on selection. Goals, rehearsal-to-broadcast, and additional-notes always present.

Generation pipeline is unchanged from current: three sequential Claude API calls per student (draft → review → streamline).

### Trials mode (per student per activity)
A checkbox on each per-student card titled "Trials" toggles a structured data-capture panel. Off by default — most sessions don't need it. When on:

- **What's being counted** — free-text input (e.g. "wh questions answered correctly", "times she initiated conversation", "picture cards sequenced"). Required; the unit varies too much across activities for a dropdown. Per-student per-activity last-used value pre-fills.
- **Total trials** — number.
- **Support rows** — one or more rows of (support level, support types, count). Support level is a dropdown: no support, minimal, moderate, maximum. Support types is a multi-select within the row: verbal, visual, tactile, gestural, modeled. Count is a number. "+ Add row" expands a new row. Initial state: one row pre-filled to match the qualitative prompting selections from the rest of the form, if any.
- **Failed attempts** — number. Auto-calculated as total − sum(support rows) and shown as "Failed: N (auto-calculated)" until she explicitly types over it. If totals don't add up (rows sum exceeds total, or no failed-attempts and the math has a remainder she didn't intend), show a small inline validation error.
- **Live preview** — as she fills in, render the generated sentence below the panel in real time. This is the contract — what she sees is what the note will say.

**Output sentence template** (used by the LLM prompt when Trials is on for this student):
```
{Student} correctly {what's being counted} {count}/{total} given {support phrase},
{count}/{total} given {support phrase}, ...
{Pronoun} did not {verb} {failed}/{total} {what's being counted}.
```
Where `{support phrase}` is formatted as `{level} {type1}[ and additional {type2}] prompting`, matching her established phrasing ("minimal verbal prompting", "moderate verbal prompting and an additional visual prompt").

When Trials is on for a student, the qualitative prompting-level and prompting-type checkboxes for that student collapse (data is now derived from the trial rows, no double-entry). Redirection and response checkboxes stay — those are independent of trial counting.

### Generated notes (result page)
Top: an "All notes" textarea formatted for SESIS paste with "Copy all" inside the block:
```
Tuesday, May 12, 2026

8:44-9:14

Marco:
[paragraph]

Cody:
[paragraph]
```
Below: one card per student with the final note + copy / regenerate / show-drafts controls.

**Note retention.** Generated note text is *not* saved to the repo. It lives in local cache (IndexedDB) for the active and recent sessions so copy-all, regenerate, and recent-notes export work during use, but the canonical home for a finished note is SESIS itself, where she pastes it. Only session *metadata* (date, students, goals targeted, mode) is persisted to the repo. If she wants a durable copy of the narrative, she exports it at generation time. (Whether she wants a full searchable note archive is an open question to raise at the first demo.)

### Regenerate with feedback (modal)
Triggered from per-note Regenerate button. Free-text feedback + quick-fix chips (Too long, Sounds robotic, Made up details, Wrong tone) that populate the textarea. Optional **"Apply this guidance to all future notes"** opt-in — promotes the feedback into `data/feedback-rules.md`.

### Goals (per student)
Long-term goals as cards; each short-term goal shows **usage count for the current term** ("Used in 14 sessions" or "Not used yet"), drawn from the session log. Drag-orderable. Archived goals are hidden from generation but remain referenceable.

**Add goals for {student}** workflow (replaces the original "paste raw goals" idea after analysis of her real spreadsheet paste shape and existing data):

Single page with two stacked sections:

1. **Input.** A repeated pair of textareas per long-term goal she's adding: a small 2–3 row textarea for the LTG text (per the mock), and a taller multi-line textarea below it for that LTG's short-term goals (one per line — newline-pasted from a spreadsheet column lands correctly). Live count under the ST textarea ("↑ 4 short-term goals detected") updates as she types/pastes. "+ Add another long-term goal" expands a new pair. Parsing is purely `text.split('\n').filter(nonempty)` — no LLM call, no auto-detection of tab structure.
2. **Review and confirm.** Below the input, on click of "Suggest shortnames", a list appears grouped by LTG, with one row per short-term: the original ST text, an editable shortname field (LLM-suggested), and a per-row regenerate button. The per-row regenerate and the "Re-suggest all" button both open the **Re-suggest shortname modal** — same pattern as the note regenerate modal but with shortname-specific quick-fix chips (Too long / Too vague / Too specific / Wrong words) and no "save as a rule" opt-in (shortname corrections are one-offs, not durable preferences). She can also type her own shortname directly in the input without using the modal. The "Save N goals to {student}" button commits everything visible.

**One ST always maps to exactly one shortname.** If she wants two shortnames from what's currently one ST line, she splits the line in the input textarea and re-suggests. Keeps the data model clean (one goals.csv row per goal, one shortname, one ST text).

Only short-term goals get shortnames; the LTG text is captured for context but not separately tracked or checkbox-rendered during note generation. The LTG is included in the shortname-suggestion LLM prompt so the model has skill context.

Inputs are editable after suggestion — if she fixes a typo in an ST, re-running suggestion reflects it. The button label switches from "Suggest shortnames" to "Re-suggest" after first run.

**Design rationale (goals).** From analysis of her existing data (107 unique shortnames across 5 teachers' files): shortname reuse is deliberate (~13% — `WH questions` under six students, `Sequencing` and `Story retell` under four each), so vocabulary consistency is treated as a feature and the UI enforces no uniqueness. Her shortnames run terse — median 3 words, p90 5 — far shorter than generic LLM summarization, which is why the suggestion prompt anchors on ~6 curated examples from her real data rather than free-form summarizing; hardcoded anchors are simpler than assembling live roster context, ship-ready on day one, and curated to avoid stylistic outliers. The 1:1 ST→shortname rule fits her data too: only 2 of 127 long-term-goal instances had multiple shortnames, and both were LTG-level decompositions the spreadsheet structure already handles.

**IEP review screen** (auto-routed when next-IEP date passes):
- "Nothing changed — confirm and unblock" affordance at the top (auditable affirmation)
- Three tabs: Existing / Add new (paste tool) / Retired
- Each existing goal shows usage count to inform keep/retire decisions
- Next IEP review date setter at bottom (can be left blank — set later)
- Completing the review (any path) unblocks note generation for that student

### Schedule
One column per weekday; each day has its **own** chronological list of time blocks. Times stagger — they line up across days early in the morning but drift apart as the day goes on (different mandates/session lengths), so there is no shared time axis. Each block shows student pills color-coded by teacher; click a block to add/remove students from a searchable roster. Add a block per day via separate start/end fields (joined with a hyphen). Always starts empty for a new term — no carry-forward.

Out of scope for now: non-student activity blocks the source sheet encodes (PREP periods, "News", Breakfast/Lunch coverage, the "Available" column).

### Teachers
List of teachers with an Active / Archived toggle (mirrors Students). Per-teacher edit view with:
- **Basics**: name + color (12-swatch palette, preview shows real teachers in their current colors)
- **Regular activities**: drag-orderable, each with edit/remove and optional flags (`hasSegmentName`, `freeText`)
- **Filming-day roles**: drag-orderable; each opens a dialog to set name, phrase, and which conditional field-components are enabled (Visual cues, Facial expressions, Decoding carryover, Pragmatic skills, Gave compliments, Free-text role description). Field types themselves are developer-defined.
- **Session captures**: declarative per-teacher session-time behavior (see "Session captures" under LLM details below). Authored by editing `data/teachers.json` directly for now; a UI for this is out of scope for v1.
- **Prompt overrides** (advanced, disclosed)

Toolbar action is **Archive / Unarchive** — there is no hard delete. Archiving a teacher hides them from Today's session list, Generate's teacher picker, the Students teacher filter, and uniqueness checks. Their existing records (students' `teacherId`, schedule entries, session metadata) remain valid; archived teachers stay selectable on the **Students detail** form so she can reassign a student off an archived teacher's caseload.

Students follow the same model — toolbar shows **Archive / Unarchive** only, no Remove.

### New term setup wizard
Reachable from Today's term-ending banner (auto-prompts ~14 days before lastDay) or from Settings → Term → "Prepare new term".

5 free-navigation steps with a "Skip this step" affordance on each:
1. **Year** — term type (school-year vs summer) + first/last day. Label auto-generated.
2. **Teachers** — carried forward by default; edit/add as needed.
3. **Students** — two tabs:
   - *Continuing*: flat inline-editable table (name, pronouns, age, teacher, AAC, next IEP). Age 21 cells highlighted yellow, age 22+ red. Stale-ages info banner. Click × greys row out with Undo button. No per-teacher grouping (students change teachers).
   - *New*: bulk-entry grid (name, pronouns, age, teacher, AAC, next IEP). Tab/Enter to add rows. Paste-from-clipboard supported.
4. **Schedule** — starts empty; build per-day by adding time blocks (start/end) and clicking them to add students.
5. **Goals** — summary listing students with zero short-term goals; "Add goals →" routes each to the paste tool.

**Cross-step data flow**: teacher added in step 2 immediately appears in step 3 dropdowns. Students whose teacher was removed in step 2 get an empty teacher field flagged for assignment.

The wizard is one path through these screens — each section (Students, Goals, Schedule, Teachers) is also reachable directly from main nav and supports the same bulk-edit UI standalone.

### Aging
Manual entry only. No DOB stored (PII avoidance), no auto-increment. Continuing students step shows current age as inline-editable with a banner reminding to update. Yellow at 21 (final eligible year, per NY rules). Red at 22+ (data error or COVID-era extension worth verifying).

### Name collisions
Because data is keyed by id, collisions never corrupt data — they're handled purely as a UX safeguard, with behavior scaled to the real-world risk:

- **Student names — same teacher's caseload (highest risk).** Two students named "Kai" under the same teacher would produce two `Kai:` blocks in the all-notes paste target, risking a wrong note landing in a legally-binding record. Don't block — *disambiguate*. On add/edit, detect the match and require a distinguisher before saving (e.g. "Kai R." / "Kai M."). The duplicate is allowed; the silent ambiguity is not.
- **Student names — across the roster (different teachers).** Never co-occur in a session, so lower risk, but still surfaced: soft inline warning on add/edit ("Another Kai is on Robin's caseload") with a suggestion to distinguish. She can dismiss it.
- **Teacher names.** Enforce uniqueness on the display name. Teachers are entered rarely and a duplicate teacher label is almost always a mistake. (Two teachers with the same name remain technically representable via distinct ids, but the UI nudges hard against it.)
- **Goal shortnames.** Shortnames are skill labels, not unique identifiers — her existing data shows ~13% are deliberately reused across students (e.g. `WH questions` under six students, `Sequencing` under four). We don't enforce uniqueness or surface match warnings in the UI; the only collision worth catching is two identical shortnames under the same long-term goal in the same paste — almost certainly a paste duplicate, hard warn or block.
- **Activity names within a teacher, role names within a teacher.** Soft warn within their scope — allow, but show a subtle "already used" hint so it isn't accidental. These only cause duplicate-looking dropdown entries, not record errors.

The generated all-notes block uses the disambiguated display name, so whatever distinguisher she sets is exactly what appears before the colon when she pastes into SESIS.

## LLM details

- Direct browser calls to `https://api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true`
- Three-pass pipeline per student (draft → review → streamline), sequential
- Shortname suggestion (Add-goals workflow): one Claude call per paste, given the LTG and its STs. The prompt includes ~6 hardcoded anchor examples drawn from her real existing data (identify main topic, answer WH questions, sequence picture cards, MLU 1-3 words, etc.) that define the style baseline — terse, 2–5 word action labels matching her established voice. No live roster context in v1; if suggestions drift from her vocabulary as it evolves, revisit then. Single call returns shortnames for all STs in the paste.
- Model: Claude Sonnet 4.6 default (`claude-sonnet-4-6`); optionally Haiku 4.5 for review/streamline passes to reduce cost
- Estimated cost: ~$0.04 per note at Sonnet rates, ~$50–120/year for her volume
- Spend cap set in her Anthropic dashboard
- Failures retried with backoff; persistent failure shows an error on the per-student card with regenerate option
- When trial data is present for a student (Trials mode), the draft prompt receives it as structured input and is instructed to incorporate the trial sentence(s) verbatim in the format above. The review/streamline passes are constrained to preserve those exact numbers.

### Session captures (per-teacher, declarative)

Each teacher in `data/teachers.json` carries a `sessionCaptures` array. Each capture has a top-level `showIf` (typically reads a student attribute like `student.needsBengali`) that gates whether it applies for a given student / activity. Three capture patterns are supported, and a single capture may combine them:

1. **Form fields + prompt injection** — `fields[]` declares per-session UI inputs (bool / text), with optional per-field `showIf` to nest conditional fields. When `promptInjection.when` is met (typically a captured field value), `promptInjection.template` is rendered against `{student, capture}` and appended to the prompt's `additionalContext` (regular and filming both). Example: Dana's Bengali capture surfaces a `bengaliUsed` checkbox and a conditional `bengaliDetails` text field, injecting `\nBengali language support: …` into the draft prompt.
2. **Post-process append** — `postProcess.when` + `postProcess.appendToFinalNote`. No UI, no LLM call — a deterministic string append to the final note after the streamline pass. Example: Robin's Spanish capture, which appends a fixed translation-support sentence whenever `student.needsSpanish`.
3. **Activity description rewrite** — `activityDescriptionTemplate` interpolates student/activity attributes into the activity description string *before* it reaches the prompt. The capture's `showIf` typically combines a student attr with a `startsWith` match on the activity name. Example: Robin's journal capture rewrites the description for activities starting with "Completed a journal entry" to incorporate `student.journalMethod`.

The expression syntax in `showIf` / `when` supports dotted paths (`student.X`, `activity.Y`), bare identifiers (resolved against the capture's current field state), `&&` between atoms, and `<path> startsWith "..."`. Template substitution uses single-brace `{path | default: "fallback"}` (distinct from the double-brace Mustache syntax used by the LLM-prompt templates in `data/prompts/`).

## Quirks preserved from current app

- Date and at least one named student required before Generate enabled
- Auto-save every 5 seconds
- Auto-derive session time from student + date via schedule lookup
- "Absent" toggle replaces the note with `[Name] was absent.`
- "Individual session" toggle adds a "no references to peers or other staff" clause
- Prompting types rendered as "verbal prompting" / "visual prompting" — never "verbal cues"
- Redirection rendered as "redirection to task" — never just "redirection"
- Multiple prompting types at same level combined: "minimal verbal and visual prompting"

## Out of scope (v1)

- Multi-user / multi-device sync
- Mobile / tablet UI (desktop only)
- Importing existing Google Sheet (manual re-entry or paste)
- Admin UI for new filming-day field types (developer-defined palette)
- DOB tracking / automated aging
- Carry-forward of schedule between terms
- Collaboration features

## Implementation slices

Each slice is shippable on its own; validate with Emily before moving to the next.

1. **Read-only sheet replacement** — data model, GitHub persistence, read-only views (Students, Goals, Schedule, Today). She uses it as reference for a week.
2. **Edit affordances** — inline edit on data screens, validation, add/remove rows.
3. **Goal-writing workflow** — bulk paste + AI shortname suggestion.
4. **Note generation** — three-pass pipeline on new data model, both modes.
5. **Year setup wizard, IEP review, regenerate-with-feedback** — refinements.
   - TODO (PAT rotation): at the start of summer-term setup, proactively prompt the user to regenerate and re-enter their GitHub PAT. The token is created with a ~1-year expiry, so renewal naturally coincides with term rollover — surfacing it here heads off a surprise mid-year 401.
6. **Export** — all four export formats.
7. **Trials data capture (optional per-student per-activity)** — quantitative trial-count entry that produces precise sentences like "answered 6/10 wh questions given minimal verbal prompting." Off by default; toggled on per student per activity when she wants to formally record data for that session.

## Questions to ask Emily at the first demo

See **`demo.md`** for the full, slice-grouped checklist of open questions to walk through with Emily; the items below are the original first-demo set.

- **Note archive.** Do you want SESIS Notes to keep a searchable copy of every note you generate, or is SESIS itself enough once you've pasted? (Currently we store only session metadata, not note text — flipping to full narrative retention is a deliberate privacy tradeoff we'd make only if she wants it.)
- **Sheet reference frequency.** How often do you look at the roster/goals during the year vs. only at term rollover? (Informs the quality bar for the Today/Students screens.)
- **Strict IEP block.** Does blocking note generation on an overdue IEP feel right, or too aggressive? (We chose strict; the "Nothing changed" affirmation is the fast escape hatch. Could soften to a warning instead.)
- **GitHub access.** Get her GitHub username so we can add her as a collaborator (write access) on `mhubelbank/emily-sesis`, then walk her through creating a **classic** token with the `repo` scope. Without the collaborator invite her token can't reach the repo, so this gates her whole first run.

## Deployment TODO (deferred)

- **Cloudflare not set up yet.** Stand up the Cloudflare Pages project + Cloudflare Access application per the root README ("First-time setup (developer)"). Until then there is no gated public URL — local dev only.
- **Whitelist the developer** in the Access policy alongside Emily, so the deployed build can be troubleshot: add `mhubelbank@gmail.com` as an allowed email (its own Allow policy, or added to Emily's Include rule).
- **Cloudflare rebuild-on-save trade-off.** Since data commits now land on `main` (the production branch), every save will trigger a Pages rebuild once Pages is wired up. Accept for now (cheap, low traffic); revisit if rebuild churn becomes annoying — the data-branch split lives in git history (reverted commits on `main`) and can be restored.
