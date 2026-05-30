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

- [ ] Generate → Dana, a needsBengali student: toggle "Bengali translations provided," fill details → final note includes the Bengali-support sentence.
- [ ] Generate → Robin, a needsSpanish student → final note ends with the Spanish-support sentence.
- [ ] Generate → Robin, activity starting "Completed a journal entry…" → description reads "traced/wrote" per the student.
- [ ] Generate → Morgan (no captures) → a normal note still generates; text/bool capture fields elsewhere still render.

## Captures quirks — new capabilities (NOT testable until data added)

- [ ] multiselect field / join / promptOverrides — only visible once a capture with a multiselect field (or a promptOverrides) is added to teachers.json. Verified via function harness, not browser.

## Activity catalog refactor (needs migrated data on the data branch)

Note: the journal rewrite now lives on the catalog activity (a_journal: descriptionTemplate + requiresAttribute), NOT a Robin sessionCapture. Migrated data is in the working tree (data/activities.json + teachers.json activityIds); sync to the data branch WITH the code deploy.

- [ ] Activities tab appears in nav; lists the catalog including the locked "Other (reserved)" row.
- [ ] Add an activity, toggle Segment name / Free text, open Advanced → descriptionTemplate + requiresAttribute fields show; Save writes data/activities.json; edit again → no stale-sha error (sha refresh).
- [ ] Delete an activity used by a teacher → confirm dialog shows "used by N teachers"; allow → it disappears; that teacher no longer offers it (dangling id dropped, no crash).
- [ ] Teachers tab → a teacher's "Regular mode · activities" is now a checkbox picker of catalog activities (no inline name/flag editor); "Manage catalog" button jumps to Activities; toggling writes activityIds.
- [ ] Generate · regular → activity dropdown = teacher's catalog activities + "Other"; requiresSegmentName surfaces the segment input; freeText surfaces additional-info.
- [ ] Generate → pick "Other", type free text → generated description is the raw free text (not "Other …"); leave it blank → that row is dropped.
- [ ] Generate → Robin, "Completed a journal entry" activity, student journalMethod="traced" → description renders "…traced a comment…"; a student with empty journalMethod → plain name (confirms catalog descriptionTemplate + requiresAttribute, and that removing the journal capture didn't regress).
- [ ] Generate + save session metadata → session file still contains only goals + mode (no activity coupling leaked).

## Filming-roles catalog (needs migrated data on the data branch)

Note: filming roles are now a shared catalog (data/filming-roles.json); teachers reference `filmingRoleIds`. Migrated data is in the working tree; sync to the data branch WITH the code deploy.

- [ ] Activities tab now has a "Filming roles" section below activities; subtitle reads "N activities · M filming roles".
- [ ] Add a role → name + phrase inputs and the field-component checkboxes (Visual cues, Facial expressions, …); Save writes data/filming-roles.json.
- [ ] Delete a role used by a teacher → "used by N teachers" confirm; allow → gone, that teacher loses it (no crash).
- [ ] Teachers tab → a filming-capable teacher (Morgan/Carter) shows a role checkbox picker (no inline role editor); toggling writes filmingRoleIds; "Manage catalog" jumps to Activities.
- [ ] Generate · filming day → Morgan: role dropdown lists Anchor + Reporter (his filmingRoleIds); picking a role surfaces that role's field-components; note generates correctly.
- [ ] One save bar covers both catalogs: edit an activity AND a role, Save once → both files written; Discard resets both.

## Activity "Custom description" madlib editor

- [ ] Activity row → "Custom description" disclosure shows a "Per-student word" dropdown (— Same for all students —, journal method, AAC device), not raw template/attribute boxes.
- [ ] Journal activity → select "journal method": Before/After prefill from the existing template; Preview shows "…National Day and {journal method} a comment about it."
- [ ] Type in Before/After → Preview updates live; Save → reopen the row → values round-trip (no drift).
- [ ] Pick "— Same for all students —" → one Description box (fixed wording); Generate uses it verbatim for any student.
- [ ] Discard with an unsaved madlib edit → Before/After revert to the saved values.
- [ ] Generate → Robin, journal activity, journalMethod="traced" → still renders "…traced a comment…" (engine unchanged — regression).
- [ ] Reserved "Other" row → no "Custom description" disclosure.

## Configurable student fields (needs migrated data on the data branch)

Note: student attributes are now a catalog (data/student-fields.json); values live in students.csv columns by key. The two language toggles collapsed into one "Language support" multi-select; the Dana/Robin captures now gate on `student.language includes "…"`. Migrated data is in the working tree; sync to the data branch WITH the code deploy.

- [ ] Activities tab has a "Student fields" section; subtitle shows "… · N student fields".
- [ ] Add a field: key input (editable, monospace) + label + type (Toggle/Dropdown); choosing Dropdown reveals an options sub-editor (add/remove option strings). Save writes data/student-fields.json.
- [ ] Existing field's key is read-only (gray monospace); label/type/options editable. Invalid key (spaces/dots/reserved) or duplicate key blocks Save with an error.
- [ ] Delete a field → "used by N references" confirm; existing student values are preserved in the CSV (re-add restores them).
- [ ] Students detail → "Supports" section renders the catalog: toggles as checkboxes, selects as **multi-select checkbox groups** (pick several). A stored value not in the option list still shows, marked "(not in list)".
- [ ] Set a student's Language support to both Spanish + Bengali → both persist (saved as one pipe-joined cell).
- [ ] Activities madlib "Per-student word" dropdown lists only the **select** fields; preview shows a real sample value (options[0], e.g. "traced") + "(varies per student)".
- [ ] Generate → a Bengali student under Dana still gets the Bengali capture (now via `language includes "Bengali"`); a Spanish student under Robin gets the Spanish append; Robin journal renders the method word.
- [ ] Roster table no longer has an AAC device column.

## Sessions move — expected-broken until data-branch sync

- [ ] Goals → "Used in N sessions" counts will read 0 until the live session files move from sessions/ to data/sessions/ on the data branch. That's expected — not a regression. Re-check after the sync.
