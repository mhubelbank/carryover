# Demo / working-session questions for Emily

Open questions to walk through with Emily, grouped by implementation slice (see
`SESIS_requirements.md` → "Implementation slices"). Each notes the decision we've
tentatively made so the conversation is a confirm/adjust, not an open canvas.

---

## Setup / onboarding (gates the whole first run)

- **GitHub access.** Get her GitHub username so we can add her as a collaborator
  (write access) on `mhubelbank/emily-sesis`, then walk her through creating a
  **classic** token with the `repo` scope. A fine-grained token can't reach another
  user's repo, so this is the blocker for her first sign-in.

---

## Slice 1 — Read-only sheet replacement

- **Sheet reference frequency.** How often do you look at the roster/goals during
  the year vs. only at term rollover? (Informs the quality bar for the
  Today/Students screens.)
- **Schedule — non-student blocks.** The source sheet encodes PREP periods,
  "News", Breakfast/Lunch coverage, and an "Available" column. We left these out of
  scope (schedule is student-only). Does she need any of them represented, or is
  student-only fine?

---

## Slice 4 — Note generation

- **Original prompts (blocking).** Need her current draft / review / streamline
  prompt text for **both** modes (regular + filming) — the six `data/prompts/*.md`
  templates. Easiest: drop one of the original TSX artifacts in and we'll extract
  them.
- **Form option lists (blocking).** The exact choices for regular mode's
  *prompting level / type / redirection / response*, and the filming
  *role-conditional field components*. These are clinical specifics from her 7 TSX
  files — we won't invent them.
- **Activity flags.** What do `hasSegmentName` and `freeText` mean for a regular
  activity, and how should each render on the per-student card / feed the prompt?
  (We have a guess but haven't confirmed.)
- **Note archive.** Do you want SESIS Notes to keep a searchable copy of every note
  you generate, or is SESIS itself enough once you've pasted? Today we store only
  session *metadata*, not note text — full narrative retention is a deliberate
  privacy tradeoff we'd make only if she wants it.

---

## Slice 5 — Year setup, IEP review, regenerate

- **Strict IEP block.** Does blocking note generation on an overdue IEP feel right,
  or too aggressive? We chose strict; the "Nothing changed — confirm and unblock"
  affirmation is the fast escape hatch. Could soften to a warning instead.

---

## Slice 7 — Trials data capture

- **Support-level values.** Confirm the dropdown: *no support, minimal, moderate,
  maximum*. Does she also use "max" / "full" / something else?
- **Support-types.** Confirm the multi-select: *verbal, visual, tactile, gestural,
  modeled*. Anything missing?
- **Phrasing.** "6/10" (fractions, as in her example) vs. "60%" vs. "6 out of 10"?
  We're going with fractions per her sketch, but worth confirming.
- **Per activity vs. per student.** Should the Trials toggle be per *activity* (each
  activity in a session can have trials independently) or per *student* (trials
  applies across all activities for that student)? Sketch implies per activity —
  verify.
- **Failed-attempts field.** She asked whether the explicit field is needed at all.
  Decision was "keep explicit, auto-fill from total − sum(support rows), allow
  override" so her sentence reflects her affirmation rather than silent math.
  Confirm this lands right.
