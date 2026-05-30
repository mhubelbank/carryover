# Sessions

Generated session notes, one JSON file per (date, teacher).

```
data/sessions/
└── YYYY-MM-DD-teacher.json
```

Each file contains session *metadata only* — per student, the goals targeted and
the mode. Generated note *text* is never persisted to the repo (FERPA-safe
default). Append-only — nothing is deleted.

Files in this directory are written by the app, not edited by hand.
