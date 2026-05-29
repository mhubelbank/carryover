# Prompts

Six base prompt templates for the three-pass note generation pipeline,
plus notes on per-teacher overrides and deterministic post-processing.

## Files

- `regular-draft.md` / `regular-review.md` / `regular-streamline.md` —
  the three-pass pipeline for regular sessions
- `filming-draft.md` / `filming-review.md` / `filming-streamline.md` —
  the three-pass pipeline for filming-day sessions

Each pass is a separate Claude API call. Outputs feed forward as inputs
to the next pass.

## Template variables

These prompts use Handlebars-style `{{variable}}` substitution. The
variables expected at render time:

**Common to all six prompts:**

- `student.name`
- `student.pronouns` — e.g. "he/him"
- `student.pronounSubject` — "he" / "she" (used in filming-draft only)
- `student.individualSession` — boolean; triggers the "do not reference
  peers or other staff" clause
- `additionalContext` — optional string appended to the session data
  block. Used for per-teacher quirks (see below).
- `teacher.draftAppend` / `teacher.reviewAppend` / `teacher.streamlineAppend` —
  optional per-teacher prompt overrides from `data/teachers.json`,
  appended at the end of the relevant pass.

**Regular pass only:**

- `activities` — array of activity objects with `description`,
  `segmentName` (optional), `domains`, `goals`, `promptingLevel`,
  `promptingType`, `redirection`, `response`, `additionalNotes`

**Filming pass only:**

- `student.role` — name of the role (e.g., "Anchor", "Studio Audience")
- `role.phrase` — the prepositional phrase that appears in the opening
  sentence (e.g., "an anchor", "a member of the studio audience").
  Defined per role in `data/teachers.json`.
- `selectedGoals` — array of goal shortnames
- `roleData` — pre-formatted string of role-specific performance data
  (visual cues, facial expressions, decoding carryover, etc.)

**Review and streamline passes only:**

- `draftNote` (review pass) / `reviewedNote` (streamline pass) — the
  output of the previous pass

## Per-teacher quirks

Most teacher-specific behavior lives in data, not prompts:

- **Joanne — Bengali support.** When `student.bengaliUsed` is true, the
  app builds `additionalContext` as:
  > `Bengali language support: <student.bengaliDetails or default>`
  This gets injected after the activity summaries. No prompt change
  needed; the LLM weaves it into the narrative naturally.

- **Nina — journal method.** The student's `journalMethod` ("traced" or
  "wrote") is interpolated directly into the activity description at
  activity-build time, before the prompt is rendered. The activity
  string becomes something like:
  > `Completed a journal entry... and {{traced|wrote}} a comment about it.`
  No prompt change needed.

- **Nina — Spanish support.** This is handled as a **deterministic
  post-processing step** after the streamline pass returns: the app
  literally appends the sentence:
  > `All interactions occurred in both Spanish and English with teacher
  > or paraprofessional translation support as needed.`
  to the final note when `student.needsSpanish` is true. NOT done in
  the prompt — the appended sentence is identical every time and there
  is no reason to spend tokens on it.

- **Alfredo, José — segment names.** Activities that have a
  `segmentName` field (e.g., "filmed a news segment for Cinco de Mayo")
  pass it through to the prompt; the draft and review/streamline
  passes already have language for keeping the segment name singular.

- **José — pragmatic-skills activity preservation.** José's activities
  include the "displayed appropriate pragmatic language skills" pattern
  which is sensitive to how the LLM rephrases it. This is currently
  handled via a per-teacher `teacher.draftAppend` override in
  `data/teachers.json`:
  > `CRITICAL: If the activity says "Displayed appropriate pragmatic
  > language skills (...) while" followed by additional info, you MUST
  > keep the complete activity description intact: "Displayed
  > appropriate pragmatic language skills by [skills list] while
  > [event/location from additional info]"`

When porting more per-teacher quirks from the existing TSX files, add
them as `teacher.draftAppend` / `teacher.reviewAppend` /
`teacher.streamlineAppend` strings on the teacher record in
`data/teachers.json`. The base templates already include `{{#if}}`
slots that inject these at the end of each pass.

## Important conventions encoded in the prompts

These are non-negotiable language rules baked into all three passes:

- Prompting **types** (verbal, visual, tactile) are always written as
  `[type] prompting`. Never "visual supports," "verbal cues," etc.
- When multiple prompting types share the same level, combine into one
  phrase: `minimal verbal and visual prompting`. Never split.
- Prompting **levels** joined together are written `minimal to
  moderate` (not "minimal and moderate").
- Redirection is always written as `redirection to task`. Never just
  "redirection."
- Filming-day opening sentence must be verbatim:
  > `[Student] collaborated with classmates to produce an episode of
  > the 811X Dragon News, serving as [role-phrase].`
- Note must not begin with "Note:" or any label — start with the
  student's name.
- Past tense throughout.
- Empty fields are omitted, not mentioned as empty.

These show up across multiple prompts on purpose — the review and
streamline passes are quality gates that catch what the draft pass
sometimes misses. Each pass also handles its own scope (draft writes
from scratch, review fixes structure, streamline removes redundancy
and catches logic errors).

## Absent students

Absent students do not go through the pipeline. Their note is a fixed
literal:

> `[Student] was absent.`

Generated at the form layer, no API call.

## Feedback rules

The contents of `data/feedback-rules.md` are appended to the **draft**
pass only, as additional rules the model must follow. These accumulate
from the regenerate-with-feedback workflow when she opts in to "save as
a rule for future notes."
