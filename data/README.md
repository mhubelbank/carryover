# Data

Emily's live SESIS Notes data. Edited through the app, not by hand.

```
data/
├── teachers.json           Teachers + their per-mode setup
├── students.csv            One row per student
├── goals.csv               One row per short-term goal
├── schedule.csv            One row per (day, slot, student)
├── term.json               Current term metadata
├── feedback-rules.md       Notes prompt rules promoted from regenerate dialog
├── prompts/
│   ├── regular-draft.md    Three-pass templates for regular notes
│   ├── regular-review.md
│   ├── regular-streamline.md
│   ├── filming-draft.md    Three-pass templates for filming day
│   ├── filming-review.md
│   └── filming-streamline.md
└── iep-history/
    └── {studentId}.jsonl   Append-only log of IEP reviews per student
```

Generated session notes live in `sessions/YYYY-MM-DD-teacher.json` (one
per generated session), inside this folder.
