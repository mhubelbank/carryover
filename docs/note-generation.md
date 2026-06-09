# Note generation: prompts vs. templates

A clinical session note has to be two things at once:

- **Exact and consistent** — trial counts, prompting language, and overall
  structure are legally binding and must read the same way every time.
- **Natural** — flowing clinical prose across arbitrary activities and goals.

A pure-template engine nails the first and reads like a robot. A pure-LLM engine
reads beautifully and quietly rewords numbers, drifts structure, and invents
detail. So the generator is a **hybrid**: code owns everything that must be
deterministic, the LLM owns the prose, and code then enforces the invariants back
onto the LLM's output.

> **Rule of thumb:** push everything that *can* be deterministic into code; use the
> LLM only for what genuinely needs natural-language judgment; then deterministically
> enforce the invariants on what it returns.

## Who owns what

**Code / deterministic** (`app/src/domain/trial.ts`, `notes.ts`)

- **Trial-data sentences** — the verb (conjugated), count-before-noun, the
  descending prompting rows, and the miss clause — are built entirely in code and
  spliced into the note **verbatim** via an opaque `[[TRIAL:n]]` token. The LLM only
  *places* the token; it never writes or rewords the numbers. (We tried letting it:
  it re-punctuated, dropped clauses, and merged sentences.)
- **Verb conjugation** is the one deterministic-feeling task handed to a tiny LLM
  pass at generation time — it handles irregulars (`make → made`) reliably — backed
  by a rules + small-map fallback so the form's live preview stays synchronous.
- **Week-to-week variety** is derived from the calendar, not from a "be creative"
  instruction (see below).
- **Post-processing guarantees** on the final note: re-splice the exact trial text,
  collapse stray line breaks into one paragraph, allow at most one semicolon, and
  normalize acronym casing.

**LLM / prompt** (three passes, `carryover-data/data/prompts/*.md`)

- The **narrative**: what the student did, where prompting/redirection sit, the
  integrated clinical-significance closing — the parts that need language judgment
  and must adapt to any activity.
- **draft → review → streamline**: the draft writes the note from the session data
  plus the "golden" style examples and accumulated feedback rules; review and
  streamline fix structure, grammar, and house-style violations. Each pass returns
  *only* the note (no commentary, no questions).

An earlier "let the LLM flag suspect inputs" pass was removed for the same reason
the trial text moved to code: the pass can't see the structured source data, so it
hallucinated issues. Input validation, if added, belongs in deterministic checks.

## Same voice, no repetition

Two requirements in tension:

1. **No variety between students in a session** — two students who did the same
   activity read the *same* way, differing only in their data. No thesaurus.
2. **No repetition across weeks** for one student — and notes are never stored, so
   there's nothing to diff against.

Both fall out of "vary by the calendar, not the content":

- **Consistency** — the same pipeline, prompts, and golden examples for every
  student, plus an explicit instruction to vary only the data and never reword for
  variety. Because the trial sentences are deterministic, two notes diverge only
  where the *data* does.
- **Variety** — `varietyNote(weekIndex)` keys a 3-way rotation (section order + the
  angle the closing leads with: long-term goal, activity, or language domain) to the
  week number. Same week → the same variant for everyone (req 1); successive weeks →
  a different variant (req 2). Only the *arrangement* rotates; vocabulary and the
  per-student template are fixed.

Three variants is the minimum that guarantees a week differs from the previous
**two** before repeating — the "previous two weeks" window the clinician wanted —
with zero storage and full determinism (same date → same variant).
