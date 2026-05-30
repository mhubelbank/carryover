# Restructure data model

Move durable data (student attributes, shared activity catalog) into top-level data files; reduce `teachers.json` to per-teacher workflow declarations (which students it serves, which activities it surfaces, what session-time captures to render).

## `data/students.csv` columns

```
id, name, pronouns, teacherId, age, aacDevice, needsSpanish, needsBengali, journalMethod, nextIEP, archived
```

Empty for most students. Sparse columns are fine.

- `aacDevice`: string, free text (e.g. "Dynamic display SGD", "Single cell devices for activities with choices", "")
- `needsSpanish`: bool
- `needsBengali`: bool
- `journalMethod`: "traced" | "wrote" | ""

## `data/activities.json` — shared activity catalog

9 of 11 activities in her existing TSX files are word-for-word identical across all five teachers. The news-production curriculum is shared, not per-teacher. Pull it out into a single catalog with per-activity metadata.

```json
[
  { "id": "watch_news_wh", "name": "Watched the 811X Dragon news and answered WH questions about it" },
  { "id": "watch_news_worksheet", "name": "Watched the 811X Dragon news and completed a corresponding, provider created, differentiated worksheet" },
  { "id": "write_script_next_week", "name": "Wrote the script for next week's news" },
  { "id": "research_visuals", "name": "Researched/created visuals for upcoming news segments", "requiresSegmentName": true },
  { "id": "class_choose_segment", "name": "Worked together as a class to choose the next news segment they plan to create", "requiresSegmentName": true },
  { "id": "filmed_gave_directions", "name": "Filmed for a news segment: gave directions (i.e., quiet on set, roll tape, action, cut)", "requiresSegmentName": true },
  { "id": "filmed_responded_directions", "name": "Filmed for a news segment: responded to directions given by staff and peers (i.e., quiet on set, roll tape, action, cut)", "requiresSegmentName": true },
  { "id": "write_script_upcoming", "name": "Wrote the script for an upcoming segment", "requiresSegmentName": true },
  {
    "id": "journal_entry",
    "name": "Completed journal entries for collaborative teacher. Glued in a picture illustrating today's National Day and wrote or traced a self-generated comment about it.",
    "descriptionTemplate": "Completed a journal entry during a lesson led by the collaborative teacher, with SLP support. Glued in a picture illustrating today's National Day and {student.journalMethod} a comment about it.",
    "requiresAttribute": "journalMethod"
  },
  { "id": "pragmatic_skills", "name": "Displayed appropriate pragmatic language skills while" },
  { "id": "other", "name": "Other" }
]
```

Per-activity metadata:

- `requiresSegmentName: true` — shows a "Segment name" text input next to the activity when selected. Was previously a separate `segmentActivities[]` list in alfredo.tsx; now lives per-activity.
- `descriptionTemplate` — overrides the `name` when building the prompt. Interpolates `{student.<attr>}` placeholders. Used for Nina's journal (substitutes "traced" / "wrote").
- `requiresAttribute` — declares which student attribute must exist for the activity's `descriptionTemplate` to apply. If the student lacks the attribute, the plain `name` is used.

## `data/teachers.json` — per-teacher workflow

Teachers reference activities by id and declare session captures. Nothing durable lives here.

```json
[
  {
    "id": "alfredo",
    "name": "Alfredo",
    "color": "...",
    "modes": ["regular", "filming"],
    "activityIds": [
      "watch_news_wh", "watch_news_worksheet", "write_script_next_week",
      "research_visuals", "class_choose_segment", "filmed_gave_directions",
      "filmed_responded_directions", "write_script_upcoming", "journal_entry",
      "other"
    ],
    "sessionCaptures": []
  },
  {
    "id": "joanne",
    "name": "Joanne",
    "color": "...",
    "modes": ["regular"],
    "activityIds": [
      "watch_news_wh", "watch_news_worksheet", "write_script_next_week",
      "research_visuals", "class_choose_segment", "filmed_gave_directions",
      "filmed_responded_directions", "write_script_upcoming", "journal_entry",
      "pragmatic_skills", "other"
    ],
    "sessionCaptures": [
      {
        "name": "bengali",
        "showIf": "student.needsBengali",
        "fields": [
          { "name": "bengaliUsed", "type": "bool", "label": "Bengali translations provided when needed" },
          { "name": "bengaliDetails", "type": "text", "showIf": "bengaliUsed", "placeholder": "Describe Bengali support provided" }
        ],
        "promptInjection": {
          "when": "bengaliUsed",
          "template": "\nBengali language support: {bengaliDetails | default: 'Bengali translations were provided when needed'}"
        }
      }
    ]
  },
  {
    "id": "nina",
    "name": "Nina",
    "modes": ["regular"],
    "activityIds": [
      "watch_news_wh", "watch_news_worksheet", "write_script_next_week",
      "research_visuals", "class_choose_segment", "filmed_gave_directions",
      "filmed_responded_directions", "write_script_upcoming", "journal_entry",
      "pragmatic_skills", "other"
    ],
    "sessionCaptures": [
      {
        "name": "spanish",
        "showIf": "student.needsSpanish",
        "fields": [],
        "postProcess": {
          "when": "student.needsSpanish",
          "appendToFinalNote": " All interactions occurred in both Spanish and English with teacher or paraprofessional translation support as needed."
        }
      }
    ]
  }
]
```

Notes:

- **Only Alfredo omits `pragmatic_skills`.** The other four teachers include it. Confirmed by inspection of the original TSX files.
- **Alfredo gets both `modes`.** He has a separate filming-day flow. Lefkie also has filming-day (`lefkie-filming-day.tsx`). Joanne, José, Nina are regular-only.
- **No "preset students" or "activities" embedded in teacher records.** Students live in `students.csv` keyed by `teacherId`; activities live in the shared catalog referenced by `activityIds`.

## Three session-capture effects

The `sessionCaptures` array supports three orthogonal effects, in any combination:

1. **`fields`** — extra form UI in the Generate form when `showIf` is satisfied. Values stored in session state, not the durable student record.
2. **`promptInjection`** — appends a string to the draft prompt's `additionalContext` block when `when` is satisfied. The string can interpolate session-state field values.
3. **`postProcess`** — runs after the streamline pass returns; performs a deterministic operation on the final note (currently just `appendToFinalNote`). No API call.

Nina's journal method is *not* a session capture — it's an activity-level effect via `descriptionTemplate` + `requiresAttribute` on the `journal_entry` activity record. Joanne's Bengali uses captures 1 + 2. Nina's Spanish uses capture 3 only.

## Lefkie's filming-day

Lefkie's roles differ from Alfredo's: no `Reporter`. The filming-day mode needs its own per-teacher role list, similar to how the regular activities are referenced. Suggest adding `filmingRoleIds` (and a shared `data/filming-roles.json` catalog) following the same pattern, but defer until slice 5's filming-day path is being built.

## Migration

Port from existing TSX files:

- **Students:** From each teacher's `presetStudents` array (or addStudent shape for Lefkie, who has no preset roster), build rows in `students.csv` with the columns above. Missing attributes → empty strings / false.
- **Teachers:** Build the three records above (Alfredo, Joanne, Nina shown). Fill in José and Lefkie with the same activity-id list as Joanne (minus filming-day for José; Lefkie has filming-day mode).
- **Activities:** Lift the catalog above as-is into `data/activities.json`.

## Spec changes

Update `SESIS_requirements.md`:

1. **`students.csv` schema** — list the new columns (replacing prior "per-teacher quirk values" vagueness).
2. **`data/activities.json`** — new top-level data file. Add to the "Stored in the repo" section.
3. **`teachers.json` schema** — list of `activityIds` and `sessionCaptures` (drop the previous "activities" and "per-student field declarations" language).
4. **LLM details / Quirk handling** — replace the per-teacher quirk prose with: "Three capture types: form fields + prompt injection; deterministic post-process append; activity-level description template. Defined in `teachers.json.sessionCaptures` and `activities.json` respectively."

## Why this matters

The current model fuses three things on the teacher record: roster, activity menu, workflow quirks. Of those, only the workflow is genuinely per-teacher. Students are people who can transfer between classes; activities are a shared curriculum. Treating them as durable data and reducing teachers.json to workflow-only declarations makes the model honest, reduces duplication (curriculum edits propagate), and simplifies the eventual case where a student transfers or a teacher's activity list shifts mid-term.
