# Slice 5 implementation notes (for Claude Code)

Companion to `data/prompts/*.md`. Captures the implementation details
that need to be ported from her existing TSX files but don't live
inside the prompt templates themselves.

## `cleanClaudeResponse` — required post-processing

Every API response from Anthropic must be passed through this function
before being shown to the user or fed into the next pass. Strips
markdown artifacts Claude sometimes emits despite being told not to.

```ts
function cleanClaudeResponse(text: string): string {
  if (!text) return "";
  return text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/<[^>]*>/g, "")  // HTML tags (from Joanne variant)
    .trim();
}
```

Notes:
- Six of her seven TSX files have the same function minus the HTML tag
  strip; one (Joanne's) added the HTML strip. Take the superset — it's
  defensive and costs nothing.
- The function is applied per-pass: after draft, after review, after
  streamline. Cleaned output of pass N becomes input to pass N+1.

## Three-pass pipeline shape

```
formData → draftPrompt → API → cleanClaudeResponse → draftNote
draftNote → reviewPrompt → API → cleanClaudeResponse → reviewedNote
reviewedNote → streamlinePrompt → API → cleanClaudeResponse → finalNote
```

All three passes use the same model and `max_tokens`. Token settings
from her existing files:

- Regular: `max_tokens: 1500`
- Filming-day: `max_tokens: 1000`

Keep these for parity. If she reports truncation, bump.

Model is the project default (Claude Sonnet 4.6 — `claude-sonnet-4-6`).
Optionally use Haiku for review/streamline to reduce cost — both passes
are corrective rather than generative and Haiku handles them well.

## Per-student processing

- Each student in a session gets their own three-pass run, sequentially
  or in parallel. Parallel is fine — they don't depend on each other.
- Absent students bypass the pipeline. Their note is the literal string
  `"[Student] was absent."` — no API call, generated at the form layer.
- Students with no goals selected and no activity data still produce a
  note, but the prompt's "do not invent" rules carry more weight. In
  practice this should be rare since the form requires at least one
  filled-in activity.

## Deterministic post-processing

After the streamline pass returns, run any per-teacher deterministic
post-processing before showing the note. Currently one rule:

- **Nina, Spanish support:** if `student.needsSpanish` is true, append:
  `" All interactions occurred in both Spanish and English with teacher or paraprofessional translation support as needed."`
  to the final note. This is a literal string append, no API call.
  Reason: the sentence is identical every time; no point paying tokens
  to have the LLM regenerate it.

If more deterministic appends appear later, the pattern generalizes to
a per-teacher `postProcess` hook on `data/teachers.json`.

## Feedback rules — where they go

The contents of `data/feedback-rules.md` (populated by the regenerate-
with-feedback workflow when she opts in to "save as a rule for future
notes") are appended to the **draft pass only**. Not to review or
streamline.

Reason: review and streamline are quality gates with their own focused
rule sets. Mixing user-promoted feedback into them risks
overconstraining the corrective pass — the model might start "fixing"
text that doesn't have the problem her feedback describes.

Implementation: when rendering `regular-draft.md` or `filming-draft.md`,
if `data/feedback-rules.md` exists and is non-empty, append its
contents as an additional rules block at the end of the prompt
(after any `teacher.draftAppend` content).

## Per-teacher overrides

Templates have `{{#if teacher.draftAppend}}...{{/if}}` slots at the end
of each pass. Strings on the teacher record in `data/teachers.json`:

```ts
interface Teacher {
  id: string;
  name: string;
  color: string;
  // ... other fields ...
  promptOverrides?: {
    draftAppend?: string;
    reviewAppend?: string;
    streamlineAppend?: string;
  };
}
```

Known overrides to port from existing TSX files:

- **José.** His draft prompt has this addendum (currently inline in
  jose.tsx, lift to `promptOverrides.draftAppend`):

  > CRITICAL: If the activity says "Displayed appropriate pragmatic
  > language skills (...) while" followed by additional info, you MUST
  > keep the complete activity description intact: "Displayed
  > appropriate pragmatic language skills by [skills list] while
  > [event/location from additional info]"

- Others as you encounter them while reading the TSX files. The general
  rule: anything that's specific to one teacher's vocabulary or
  activities lives as an override, not in the base template.

## Quirk-specific input handling

Three quirks affect how the prompt's input data is built, not the
prompt text itself:

1. **Joanne — Bengali.** When `student.needsBengali && student.bengaliUsed`,
   build an `additionalContext` string:

   ```ts
   const additionalContext = `\nBengali language support: ${student.bengaliDetails || "Bengali translations were provided when needed"}`;
   ```

   Inject after the activity summaries block in the draft prompt
   (the `{{#if additionalContext}}{{additionalContext}}{{/if}}` slot).

2. **Nina — journal method.** When the activity name starts with
   `"Completed a journal entry"`, interpolate `student.journalMethod`
   (`"traced"` or `"wrote"`) into the activity description string
   *before* it goes into the prompt:

   ```ts
   if (activity.name.startsWith("Completed a journal entry") && student.journalMethod) {
     activityDescription = `Completed a journal entry during a lesson led by the collaborative teacher, with SLP support. Glued in a picture illustrating today's National Day and ${student.journalMethod} a comment about it.`;
   }
   ```

3. **Nina — Spanish.** As described above, this is a post-streamline
   deterministic append. Not in the prompt input.

## Filming-day role data formatting

The `roleData` string in `filming-draft.md` is pre-formatted before it
hits the prompt. Each role (Anchor, Studio Audience, Reporter, etc.)
has its own data-building logic in alfredo-filming-day.tsx /
lefkie-filming-day.tsx. The patterns to port:

- **Anchor** has: visual cues (percent + target + prompting level),
  facial expressions (percent + prompting level), decoding carryover
  (percent without prompting), rehearsal-to-broadcast (free text).
- **Studio Audience** has: pragmatic skill set (multi-skill list, each
  with quality level and prompting level), gave compliments
  (toggle + prompting level).
- **Reporter / Sports / Weather / Lunch Anchor / Other** have
  combinations of the above; see the per-role buildRoleData logic.

Output format is sentence-like text, e.g.:
```
Increased pacing in approximately 75% of opportunities given moderate visual cues
Facial expressions: 80% given minimal visual prompting
Decoding carryover: 90% without prompting
Rehearsal carryover: 2 rehearsals
```

This is what `{{roleData}}` becomes in the rendered prompt. Each line
is one performance metric. The filming-draft prompt's rule about
"preserve the exact wording" relies on these lines being well-formed.

Don't try to embed role-data formatting logic in the prompt template.
Format in TS code, pass to the prompt as a finished string.

## Sequence

1. User clicks "Generate N notes" on the Generate page.
2. For each student in the session:
   a. If absent → push `"[Name] was absent."` and continue.
   b. Build `activitySummaries` for the student (regular) or
      `roleData` (filming-day).
   c. Build `additionalContext` if any teacher quirk applies.
   d. Render the appropriate `-draft.md` template; call API; clean.
   e. Render the `-review.md` template with the cleaned draft; call API;
      clean.
   f. Render the `-streamline.md` template with the cleaned reviewed
      note; call API; clean.
   g. Apply deterministic post-processing (e.g., Spanish append).
   h. Push to results, also save metadata to `sessions/YYYY-MM-DD-{teacher}.json`.
3. Show the result page.

## Error handling

- Each pass can fail (rate limit, network, validation). On failure for
  a single student, show an error card with retry rather than aborting
  the whole session.
- Backoff: 1s → 3s → 10s. After third failure, surface to user.
- The error message should include what pass failed (draft/review/streamline)
  so user feedback is targeted.

## Storage to `sessions/`

Per the spec, sessions store metadata only — no narrative. After
generating, write:

```json
{
  "date": "2026-05-12",
  "teacherId": "alfredo",
  "mode": "regular",
  "students": [
    {
      "studentId": "stu_eduardo",
      "goalIds": ["goal_001", "goal_002"],
      "mode": "regular"
    }
  ]
}
```

Narrative text stays in IndexedDB for the current/recent sessions and
is never committed to the repo. This means re-opening an old session
from history shows the metadata but not the notes themselves — that's
intentional (FERPA-safe default).
