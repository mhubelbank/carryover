# Browser tests — pending verification

Delete lines as each passes. (Untracked scratch file — not meant to be committed.)

## Schedule — departed student in cell editor (Bug #1, testable now)

- [ ] Week view, a week AFTER Marco's last day: Marco is not a chip in his usual cell (regression).
- [ ] Click that timeslot → editor does NOT list Marco as assigned.
- [ ] Same editor → Marco is NOT in the "add students" list either.
- [ ] Same cell in a week ON/BEFORE his last day → Marco still appears (window still open).
- [ ] Usual mode, open any timeslot → enrollment filtering does NOT apply (Marco still listed) — intended.

## Schedule — stale-sha write recovery (Bug #2, needs live data branch)

- [ ] Edit week of 2026-05-25, add a student, Save → succeeds (no "does not match <sha>" error).
- [ ] Add another student, Save again → still succeeds.
- [ ] Remove all deviations so the week matches the usual template, Save → deviation file deletes cleanly.

## Captures quirks — regression (refactored captures.ts + capture form)

- [ ] Generate → Joanne, a needsBengali student: toggle "Bengali translations provided," fill details → final note includes the Bengali-support sentence.
- [ ] Generate → Nina, a needsSpanish student → final note ends with the Spanish-support sentence.
- [ ] Generate → Nina, activity starting "Completed a journal entry…" → description reads "traced/wrote" per the student.
- [ ] Generate → Alfredo (no captures) → a normal note still generates; text/bool capture fields elsewhere still render.

## Captures quirks — new capabilities (NOT testable until data added)

- [ ] multiselect field / join / promptOverrides — only visible once a capture with a multiselect field (or a promptOverrides) is added to teachers.json. Verified via function harness, not browser.

## Activity catalog refactor (needs migrated data on the data branch)

Note: the journal rewrite now lives on the catalog activity (a_journal: descriptionTemplate + requiresAttribute), NOT a Nina sessionCapture. Migrated data is in the working tree (data/activities.json + teachers.json activityIds); sync to the data branch WITH the code deploy.

- [ ] Activities tab appears in nav; lists the catalog including the locked "Other (reserved)" row.
- [ ] Add an activity, toggle Segment name / Free text, open Advanced → descriptionTemplate + requiresAttribute fields show; Save writes data/activities.json; edit again → no stale-sha error (sha refresh).
- [ ] Delete an activity used by a teacher → confirm dialog shows "used by N teachers"; allow → it disappears; that teacher no longer offers it (dangling id dropped, no crash).
- [ ] Teachers tab → a teacher's "Regular mode · activities" is now a checkbox picker of catalog activities (no inline name/flag editor); "Manage catalog" button jumps to Activities; toggling writes activityIds.
- [ ] Generate · regular → activity dropdown = teacher's catalog activities + "Other"; requiresSegmentName surfaces the segment input; freeText surfaces additional-info.
- [ ] Generate → pick "Other", type free text → generated description is the raw free text (not "Other …"); leave it blank → that row is dropped.
- [ ] Generate → Nina, "Completed a journal entry" activity, student journalMethod="traced" → description renders "…traced a comment…"; a student with empty journalMethod → plain name (confirms catalog descriptionTemplate + requiresAttribute, and that removing the journal capture didn't regress).
- [ ] Generate + save session metadata → session file still contains only goals + mode (no activity coupling leaked).

## Sessions move — expected-broken until data-branch sync

- [ ] Goals → "Used in N sessions" counts will read 0 until the live session files move from sessions/ to data/sessions/ on the data branch. That's expected — not a regression. Re-check after the sync.
