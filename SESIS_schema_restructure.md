# Restructure student/teacher schema

Restructure the data model so durable student attributes live on the student record, not the teacher schema. Session-time workflow stays on the teacher.

## `data/students.csv` columns

```
id, name, pronouns, teacherId, age, aacDevice, needsSpanish, needsBengali, journalMethod, nextIEP, archived
```

Empty for most students. Sparse columns are fine.

- `aacDevice`: string, free text (e.g. "Dynamic display SGD", "Single cell devices for activities with choices", "")
- `needsSpanish`: bool
- `needsBengali`: bool
- `journalMethod`: "traced" | "wrote" | ""

## `data/teachers.json` — add `sessionCaptures`

Per-teacher list of session-time UI fields and their prompt/post-processing effects. Each capture conditionally appears in the Generate form based on a student attribute.

```json
{
  "id": "dana",
  "name": "Dana",
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
}
```

```json
{
  "id": "robin",
  "name": "Robin",
  "sessionCaptures": [
    {
      "name": "spanish",
      "showIf": "student.needsSpanish",
      "fields": [],
      "postProcess": {
        "when": "student.needsSpanish",
        "appendToFinalNote": " All interactions occurred in both Spanish and English with teacher or paraprofessional translation support as needed."
      }
    },
    {
      "name": "journal",
      "showIf": "student.journalMethod && activity.name startsWith 'Completed a journal entry'",
      "fields": [],
      "activityDescriptionTemplate": "Completed a journal entry during a lesson led by the collaborative teacher, with SLP support. Glued in a picture illustrating today's National Day and {student.journalMethod} a comment about it."
    }
  ]
}
```

Morgan, José, and Carter have no `sessionCaptures` (empty array or omit).

## Three capture types to support

1. **Form fields + prompt injection** (Dana's Bengali): renders extra UI in the Generate form when the condition is met; appends to `additionalContext` when the session value is set.
2. **Post-process append** (Robin's Spanish): no UI, no LLM call — deterministic string append to the final note when the condition is met. Bypasses the pipeline entirely.
3. **Activity description rewrite** (Robin's journal): interpolates the student attribute into the activity description string *before* it goes into the prompt. No extra form fields.

The slice-5 generation flow already does these things; restructuring just means moving the "is this needed?" condition from hardcoded teacher logic to reading the `sessionCaptures` array.

## Migration

For each teacher's preset roster in the original TSX files, port student records into `data/students.csv` with the attributes above. Where an attribute didn't exist on that teacher's preset (e.g., Carter's students never had `aacDevice`), leave the column empty.

## Spec changes

Update `SESIS_requirements.md`:

1. `students.csv` schema — list the new columns above (replacing the prior "per-teacher quirk values" vagueness).
2. `teachers.json` schema — add `sessionCaptures` array, drop "per-student field declarations" language.
3. Quirk handling section in LLM details — point to the three capture types instead of listing each teacher's quirk in prose.
