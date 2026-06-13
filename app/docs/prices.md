# Note generation: cost & quality

How Carryover keeps AI note generation good *and* cheap — the model setup, the
cost optimizations, how they were measured, and how the models were chosen.

> **Budget:** keep spend under **~$100/year** at the cousin's volume (~44 notes/week,
> ≈ 2,300/year). Numbers below are measured at that volume; halve the volume, halve
> the cost.

---

## 1. How a note is generated

Each note runs a **three-pass pipeline** (`src/domain/notes.ts`):

1. **draft** — writes the note from the session data. Gets the big inputs: the
   golden-example notes (style/structure reference) + the system prompt + the
   draft template + the student's data.
2. **review** — checks the draft against the data and the clinician's feedback
   rules and fixes problems. This is the **fidelity-enforcement** pass.
3. **streamline** — light cosmetic polish (cleans phrasing). No correction logic.

Notes for a session are generated **in parallel, per student** (cap 4).

## 2. Where the money goes

**Input tokens are ~95% of the bill.** Each pass re-sends a large, mostly-static
prompt; the golden examples alone dominate the draft pass. Output is small (a note
is ~90 words) — except reasoning models (GPT-5.5) which bill hidden reasoning as
output. Measured per-pass input/output (3-sample average, 2026-06-13):

| Pass | Claude (Opus→Sonnet→Haiku) | ChatGPT (5.5→5.4→5.4-mini) |
|---|---|---|
| draft       | 6,062 in / 88 out  | 3,959 in / 533 out |
| review      | 2,837 in / 59 out  | 2,642 in / 51 out |
| streamline  |   979 in / 59 out  |   913 in / 51 out |

The draft pass is by far the most expensive (it carries the golden examples). That
single fact drives the whole optimization: **spend the premium model only where it
matters, and stop re-paying for the static prefix.**

## 3. The two pipelines (and why these models)

The user picks a **provider pipeline**, not a single model. Each runs a premium
draft then progressively cheaper cleanup, so every note gets the best model on the
hard part (the draft) while cleanup runs cheap (`PIPELINES` in `src/clients/models.ts`):

| | draft (premium) | review (mid) | streamline (low) |
|---|---|---|---|
| **Claude**  | Opus 4.8 | Sonnet 4.6 | Haiku 4.5 |
| **ChatGPT** | GPT-5.5 | GPT-5.4 | GPT-5.4-mini |

**Why this split (driven by the quality eval, §5):**
- **Draft = premium.** Drafting is where fabrication happens. The eval found the
  mid models, used as sole drafters, invent clinical detail (Sonnet) or pile on
  filler (GPT-5.4). The premium models draft faithfully — so the draft, which the
  later passes can only lightly fix, must be premium.
- **Review = mid, not cheapest.** Review enforces data-accuracy, so it keeps a
  capable model rather than the rock-bottom one.
- **Streamline = cheapest.** It only polishes prose on an already-correct note, so
  Haiku / GPT-5.4-mini are fine — and the cost delta is tiny anyway.

Regenerate reuses the same pipeline.

## 4. The three cost levers

1. **Per-pass models (shipped in the pipeline above).** Premium draft + cheaper
   cleanup instead of premium-for-everything. This is the bulk of the savings.
2. **Prompt caching** *(shipped).* The draft's static content — system prompt +
   instructions + golden examples — is identical across every note, so the draft
   template was restructured (static instructions first, a `===CACHE_SPLIT===`
   marker, then the per-note data) and `notes.ts` sends that static block as a cached
   `system` prefix (`cache_control` for Anthropic; OpenAI caches the prefix
   automatically). The rest of a batch reads it at ~10% of the input price. Claude
   caches ~5,780 tokens (95% of the draft input); OpenAI caches less (see §6).
   **Caching only pays off when notes are generated close together** — a cold cache
   pays a write premium with no read payoff (`CACHE_MULT` in `models.ts`).
3. **Generation modality.**
   - **On-demand (default):** generate a session's notes per click — they share a
     warm cache window (~4 notes).
   - **Whole-day batch (opt-in):** generate the day at once, so one cache write
     amortizes across ~9 notes. Strictly cheaper, but opt-in — not the default.

## 5. How quality was tested

Cost is only half the decision; the model split is justified by a quality eval.

- **Batch harness** (`npm run eval:batch`, `scripts/eval-batch.ts`): generates
  N×M notes from reproducible synthetic data (seeded, no PII) through the real
  pipeline, for any model, into `eval-output/`. A token-bucket paces requests under
  the providers' per-minute limits; `--patch` regenerates only the notes that
  errored (cheap top-up rather than a full rerun).
- **Heuristic metrics** (`src/__eval__/metrics.ts`): per-note flags for pronoun
  mismatches, bloated closings, "addressed"-style filler, and closing length —
  a fast comparable floor across models.
- **Manual cross-model read:** all six models were run at 5×10 on the same seed
  (identical inputs) and read side-by-side. This caught what the heuristics can't —
  **fabrication**, which is the real risk in a clinical/legal record:
  - **GPT-5.5** — most faithful, cleanest; occasionally over-terse.
  - **Opus** — best prose and best fidelity in regular notes; mild "smoothing" of
    absent data in news-day notes.
  - **Sonnet** — reads well but most fabrication-prone (invents "three-word
    phrases," reports a goal's *target* as an achieved *result*, misattributes
    percentages); leaked its review-pass reasoning into one note.
  - **GPT-5.4** — perfect pronouns but ~56% filler.
  - **Haiku** — boilerplate closings that assert unmeasured skills; domain drift.
  - **GPT-5.4-mini** — weakest: run-ons, dropped/duplicated fragments, one activity
    conflation.

**Conclusion:** premium draft (fidelity) + cheaper cleanup (cost) — exactly the
pipeline in §3.

## 6. Measured costs (2026-06-13, 44 notes/week)

From `npm run measure:prices -- --pipelines`. Scenarios are cumulative (each adds a
lever). Caching is **implemented and measured for both pipelines**: the draft
template was restructured (static instructions first, per-note data last) so the
cached prefix is now `system + instructions + golden`. Claude caches **5,780 tokens**
(95% of the draft input); OpenAI's automatic caching populated only **1,109 tokens**
in the 3-sample run (see takeaways).

### Claude pipeline (Opus → Sonnet → Haiku) — *measured cache, 5,780 tok*

| Scenario | $/note | $/year |
|---|---|---|
| 1. No caching, one model ×3 — Opus (premium) | 5.50¢ | $126 |
| 1. — Sonnet (mid, the old default) | 3.30¢ | $75 |
| 1. — Haiku (low) | 1.10¢ | $25 |
| **Today — mixed pipeline, no caching, on-demand** | **~4.4¢** | **~$100** |
| 2. + caching (premium ×3, on-demand) | 3.73¢ | $85 *(−32%)* |
| 3. + cheaper cleanup, on-demand ◀ **default** | 2.59¢ | **$59** *(−53%)* |
| 4. + whole-day batch, opt-in | 2.12¢ | $49 *(−61%)* |

### ChatGPT pipeline (GPT-5.5 → GPT-5.4 → GPT-5.4-mini) — *measured cache, 1,109 tok*

| Scenario | $/note | $/year |
|---|---|---|
| 1. No caching, one model ×3 — GPT-5.5 (premium) | 5.72¢ | $131 |
| 1. — GPT-5.4 (mid) | 2.86¢ | $65 |
| 1. — GPT-5.4-mini (low) | 0.86¢ | $20 |
| **Today — mixed pipeline, no caching, on-demand** | **~4.5¢** | **~$102** |
| 2. + caching (premium ×3, on-demand) | 5.34¢ | $122 *(−7%)* |
| 3. + cheaper cleanup, on-demand ◀ **default** | 4.09¢ | **$94** *(−28%)* |
| 4. + whole-day batch, opt-in | 4.02¢ | $92 *(−30%)* |

**Takeaways:**
- The budget problem was *only* the premium models doing all three passes (Opus
  $126, GPT-5.5 $131). The mid tiers were already affordable — but the eval showed
  they fabricate as sole drafters, which is why we draft premium and clean up cheap.
- **The Claude pipeline (the default) lands at $59/year — half the premium cost and
  well under budget.** Both levers pull their weight: the cheaper-cleanup split
  ($126 → ~$100) *and* template caching ($100 → $59). Batched, it's $49.
- **ChatGPT is $94/year — under budget, but caching barely helped.** OpenAI's cache
  populated only 1,109 of the ~4,000-token prefix in the 3-sample run (vs Claude's
  5,780, which is explicitly marked via `cache_control`). OpenAI caches automatically
  and warms up over traffic, so it likely caches more at production volume — but
  that's unconfirmed. If ChatGPT stays the secondary option, $94 is fine; if it needs
  to match Claude, this warrants investigation.

## 7. Reproducing / keeping fresh

- **Per-model token usage:** `npm run measure:prices` — measures each model doing
  all three passes and writes `noteTokens` + the prompt-size baseline into `models.ts`.
- **Pipeline scenarios:** `npm run measure:prices -- --pipelines` — measures the two
  pipelines end-to-end (per-pass tokens), prints scenarios 1–4, and writes the
  per-pass tokens + `PIPELINES_MEASURED_ON` into `models.ts`. Tunables: `NOTES_PER_WEEK`,
  `NOTES_PER_SESSION` (on-demand window), `NOTES_PER_DAY` (batch), `SAMPLES`.
- **Prices** live in `PRICING` (`models.ts`) — update from the providers' pages when
  they change; token counts don't change, prices do.
- **Re-measure when the prompts change.** Settings compares the live prompt size to
  `BASELINE_PROMPT_CHARS` and nudges past `PROMPT_DRIFT_THRESHOLD` (20%).
- **Out of credits:** generation distinguishes a billing exhaustion (`isOutOfCredits`,
  `src/clients/llm.ts`) from a transient rate limit, so the app can tell the user to
  top up rather than show a raw error.

## 8. Status

- ✅ Per-pass pipelines, measured costs, quality eval.
- ✅ Prompt caching — draft template restructured + cached. **Claude default $59/yr**
  (53% off, measured). ChatGPT $94/yr (OpenAI cached only 1,109 tok in the sample;
  may warm up at volume — unconfirmed).
- ⬜ Quality re-check: the genericized pronoun line needs an `eval:batch` pronoun pass
  before the restructured templates are trusted in production.
- ⬜ UI: collapse the model picker to the two pipelines.
- ⬜ Out-of-credits banner wired into the Generate screen.
