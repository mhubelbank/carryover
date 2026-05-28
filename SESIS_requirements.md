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
- Cloudflare Pages auto-deploys on push to main

**Privacy.** Student data is FERPA-protected. The app URL is gated by Cloudflare Access — only Emily's email gets through. The repo is private; the Anthropic API key has a monthly spend cap. Both keys live only in Emily's browser.

Chosen over GitHub Pages (private Pages requires Enterprise plan; Pro only hides the source, not the deployed site), local-first (developer-tooling install friction for a non-developer), and Vercel (paid tier for password protection). Cloudflare's free tier provides real auth gating with `git push` deploys.

## Data model

### Stored in the repo (GitHub API)

- **`data/teachers.json`** — id (stable, name-independent), name (display label), color (one of 12 palette options), supported modes (regular, filming-day), activities[], roles[] (filming-day only), per-student field declarations (e.g. Joanne's `needsBengali`), optional prompt overrides
- **`data/students.csv`** — id, name, pronouns, teacherId, age, AAC device, next IEP review date (nullable), per-teacher quirk values
- **`data/goals.csv`** — studentId, longTermGoal text, shortName, archived (bool)
- **`data/schedule.csv`** — teacherId, dayOfWeek, timeSlot, studentId
- **`data/term.json`** — termType (school-year | summer), firstDay, lastDay, label (auto-generated)
- **`data/prompts/*.md`** — six templates: `{regular,filming}-{draft,review,streamline}.md`, plus shared partials
- **`data/feedback-rules.md`** — appended to every draft prompt; populated by user opt-in from regenerate dialog
- **`data/iep-history/{studentId}.jsonl`** — append-only log of IEP reviews per student
- **`sessions/YYYY-MM-DD-teacher.json`** — metadata only, no note narrative: per student, the `studentId`, `goalIds[]` targeted, and `mode`. Powers "used in N sessions" counts and a skeletal session history. Generated note *text* is deliberately not persisted to the repo (see Note retention below).

**Entities are referenced by stable id, never by name.** Students and teachers each have an `id` independent of their display name; all cross-references (students→teacher, schedule→teacher/student, goals→student) use ids. Names are display labels only. This means a rename never cascades, and two entities can share a name without corrupting data — name collisions become a UX concern (see below), not a data-integrity one.

### Stored in browser (IndexedDB; not synced)

- Session drafts in progress (auto-save every 5s)
- Generated note narrative for the active/recent sessions (transient — never synced to the repo; enables regenerate, copy-all, and recent-notes export during use)
- Per-student last-used defaults (prompting / redirection / response)
- Optimistic write queue (batched, flushed to GitHub on save action — not per keystroke — to avoid rate-limit pressure)

The repo is the source of truth for roster/goals/schedule/session-metadata. IndexedDB is convenience cache that can be wiped without data loss. Note narrative exists only here and only transiently.

## Mode model

**Regular** — default. Session has 1–4 activities at the top; each student gets a goals + prompting + redirection + response form per activity.

**Filming day** — opt-in per teacher (currently Alfredo and Lefkie). Activity is fixed; each student is assigned a role (Anchor, Reporter, Sports, Weather, Studio Audience, Lunch Anchor, Other). Role determines which conditional fields appear.

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
- **Term ending** (~14 days before lastDay): yellow, "2025–2026 School Year ends June 26" with "Prepare new term →"
- **IEP overdue**: red, "Joel's IEP review was on May 27. Goal update needed" with "Review Joel's goals →". Persists until resolved.
- **IEP tomorrow**: blue (info), "Janaya's IEP review is tomorrow"

**Overdue IEP blocks note generation** for the affected student. The session containing them dims, the student's pill turns red with an alert icon, and the Generate button disables.

### Students
List with search and teacher filter. Inline rows: name, teacher, pronouns, AAC, goal count, next IEP date.

Detail view: profile (name, pronouns, age, teacher, AAC), IEP dates, teacher-specific fields (rendered from teacher's per-student field declarations), and **IEP history timeline** — one row per past review, showing what changed (`+ N goals` / `N retired` / "Nothing changed" affirmation) and linking to a diff view.

### Generate notes

Top controls: date, teacher, mode. Auto-saves to IndexedDB every 5s. "Clear form" top-right; per-student clear.

**Regular mode**: 1–4 activities chosen once (apply to all students); per-student card with goals checklist, prompting level / type / redirection / response columns (plain checkboxes, all options visible). Defaults pre-fill from last session. Absent toggle collapses the rest of the card.

**Filming day mode**: no activities — per-student role picker; role-conditional fields render based on selection. Goals, rehearsal-to-broadcast, and additional-notes always present.

Generation pipeline is unchanged from current: three sequential Claude API calls per student (draft → review → streamline).

### Generated notes (result page)
Top: an "All notes" textarea formatted for SESIS paste with "Copy all" inside the block:
```
Tuesday, May 12, 2026

8:44-9:14

Eduardo:
[paragraph]

Lemir:
[paragraph]
```
Below: one card per student with the final note + copy / regenerate / show-drafts controls.

**Note retention.** Generated note text is *not* saved to the repo. It lives in local cache (IndexedDB) for the active and recent sessions so copy-all, regenerate, and recent-notes export work during use, but the canonical home for a finished note is SESIS itself, where she pastes it. Only session *metadata* (date, students, goals targeted, mode) is persisted to the repo. If she wants a durable copy of the narrative, she exports it at generation time. (Whether she wants a full searchable note archive is an open question to raise at the first demo.)

### Regenerate with feedback (modal)
Triggered from per-note Regenerate button. Free-text feedback + quick-fix chips (Too long, Sounds robotic, Made up details, Wrong tone) that populate the textarea. Optional **"Apply this guidance to all future notes"** opt-in — promotes the feedback into `data/feedback-rules.md`.

### Goals (per student)
Long-term goals as cards; each short-term goal shows **usage count for the current term** ("Used in 14 sessions" or "Not used yet"), drawn from the session log. Drag-orderable. Archived goals are hidden from generation but remain referenceable.

**Paste raw goals** workflow: textarea on left for raw long-term goal text; AI-suggested shortnames on right (one Claude call); review and commit.

**IEP review screen** (auto-routed when next-IEP date passes):
- "Nothing changed — confirm and unblock" affordance at the top (auditable affirmation)
- Three tabs: Existing / Add new (paste tool) / Retired
- Each existing goal shows usage count to inform keep/retire decisions
- Next IEP review date setter at bottom (can be left blank — set later)
- Completing the review (any path) unblocks note generation for that student

### Schedule
Calendar grid: days × time slots, student pills color-coded by teacher. Click cells to add/remove students. Always starts empty for a new term — no carry-forward.

### Teachers
List of all teachers; per-teacher edit view with:
- **Basics**: name + color (12-swatch palette, preview shows real teachers in their current colors)
- **Regular activities**: drag-orderable, each with edit/remove and optional flags (`hasSegmentName`, `freeText`)
- **Filming-day roles**: drag-orderable; each opens a dialog to set name, phrase, and which conditional field-components are enabled (Visual cues, Facial expressions, Decoding carryover, Pragmatic skills, Gave compliments, Free-text role description). Field types themselves are developer-defined.
- **Per-student fields**: declared here, rendered on student detail (e.g. Joanne declares "Bengali support: bool")
- **Prompt overrides** (advanced, disclosed)

### New term setup wizard
Reachable from Today's term-ending banner (auto-prompts ~14 days before lastDay) or from Settings → Term → "Prepare new term".

5 free-navigation steps with a "Skip this step" affordance on each:
1. **Year** — term type (school-year vs summer) + first/last day. Label auto-generated.
2. **Teachers** — carried forward by default; edit/add as needed.
3. **Students** — two tabs:
   - *Continuing*: flat inline-editable table (name, pronouns, age, teacher, AAC, next IEP). Age 21 cells highlighted yellow, age 22+ red. Stale-ages info banner. Click × greys row out with Undo button. No per-teacher grouping (students change teachers).
   - *New*: bulk-entry grid (name, pronouns, age, teacher, AAC, next IEP). Tab/Enter to add rows. Paste-from-clipboard supported.
4. **Schedule** — starts empty; build by adding time slots and clicking cells.
5. **Goals** — summary listing students with zero short-term goals; "Add goals →" routes each to the paste tool.

**Cross-step data flow**: teacher added in step 2 immediately appears in step 3 dropdowns. Students whose teacher was removed in step 2 get an empty teacher field flagged for assignment.

The wizard is one path through these screens — each section (Students, Goals, Schedule, Teachers) is also reachable directly from main nav and supports the same bulk-edit UI standalone.

### Aging
Manual entry only. No DOB stored (PII avoidance), no auto-increment. Continuing students step shows current age as inline-editable with a banner reminding to update. Yellow at 21 (final eligible year, per NY rules). Red at 22+ (data error or COVID-era extension worth verifying).

### Name collisions
Because data is keyed by id, collisions never corrupt data — they're handled purely as a UX safeguard, with behavior scaled to the real-world risk:

- **Student names — same teacher's caseload (highest risk).** Two students named "Aiden" under the same teacher would produce two `Aiden:` blocks in the all-notes paste target, risking a wrong note landing in a legally-binding record. Don't block — *disambiguate*. On add/edit, detect the match and require a distinguisher before saving (e.g. "Aiden R." / "Aiden M."). The duplicate is allowed; the silent ambiguity is not.
- **Student names — across the roster (different teachers).** Never co-occur in a session, so lower risk, but still surfaced: soft inline warning on add/edit ("Another Aiden is on Nina's caseload") with a suggestion to distinguish. She can dismiss it.
- **Teacher names.** Enforce uniqueness on the display name. Teachers are entered rarely and a duplicate teacher label is almost always a mistake. (Two teachers with the same name remain technically representable via distinct ids, but the UI nudges hard against it.)
- **Goal shortnames within a student, activity names within a teacher, role names within a teacher.** Soft warn within their scope — allow, but show a subtle "already used" hint so it isn't accidental. These only cause duplicate-looking dropdown/checklist entries, not record errors.

The generated all-notes block uses the disambiguated display name, so whatever distinguisher she sets is exactly what appears before the colon when she pastes into SESIS.

## LLM details

- Direct browser calls to `https://api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true`
- Three-pass pipeline per student (draft → review → streamline), sequential
- One-shot goal categorization for the paste-raw-goals workflow
- Model: Claude Sonnet 4.6 default (`claude-sonnet-4-6`); optionally Haiku 4.5 for review/streamline passes to reduce cost
- Estimated cost: ~$0.04 per note at Sonnet rates, ~$50–120/year for her volume
- Spend cap set in her Anthropic dashboard
- Failures retried with backoff; persistent failure shows an error on the per-student card with regenerate option

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
4. **Export** — all four export formats. Safety net before AI generation.
5. **Note generation** — three-pass pipeline on new data model, both modes.
6. **Year setup wizard, IEP review, regenerate-with-feedback** — refinements.
   - TODO (PAT rotation): at the start of summer-term setup, proactively prompt the user to regenerate and re-enter their GitHub PAT. The token is created with a ~1-year expiry, so renewal naturally coincides with term rollover — surfacing it here heads off a surprise mid-year 401.

## Questions to ask Emily at the first demo

- **Note archive.** Do you want SESIS Notes to keep a searchable copy of every note you generate, or is SESIS itself enough once you've pasted? (Currently we store only session metadata, not note text — flipping to full narrative retention is a deliberate privacy tradeoff we'd make only if she wants it.)
- **Sheet reference frequency.** How often do you look at the roster/goals during the year vs. only at term rollover? (Informs the quality bar for the Today/Students screens.)
- **Strict IEP block.** Does blocking note generation on an overdue IEP feel right, or too aggressive? (We chose strict; the "Nothing changed" affirmation is the fast escape hatch. Could soften to a warning instead.)
- **GitHub access.** Get her GitHub username so we can add her as a collaborator (write access) on `mhubelbank/emily-sesis`, then walk her through creating a **classic** token with the `repo` scope. Without the collaborator invite her token can't reach the repo, so this gates her whole first run.

## Deployment TODO (deferred)

- **Cloudflare not set up yet.** Stand up the Cloudflare Pages project + Cloudflare Access application per the root README ("First-time setup (developer)"). Until then there is no gated public URL — local dev only.
- **Whitelist the developer** in the Access policy alongside Emily, so the deployed build can be troubleshot: add `mhubelbank@gmail.com` as an allowed email (its own Allow policy, or added to Emily's Include rule).
