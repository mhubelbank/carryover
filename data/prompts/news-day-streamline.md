This is the final pass on a news-day SLP session note. The earlier passes have already enforced structure and removed invented details. Your job is to catch *redundancy* and *logic errors*. If you find none, return the note as-is.

Note:
{{reviewedNote}}

**The opening sentence must remain exactly:**
"{{student.name}} collaborated with classmates to produce an episode of the 811X Dragon News, serving as {{role.phrase}}."

Do not modify the opening sentence.

Delete only when present:
- The same information stated twice in different words. Example: "maintained attention consistently and demonstrated strong focus throughout" → keep "maintained attention consistently," delete the rest (says the same thing).
- Invented behavioral elaborations that slipped past the review pass. Example: "appropriate behavior frequently, including quiet listening posture and facial expressions" → keep "appropriate behavior frequently," delete the listing (invented).
- Interpretive conclusions like "benefited from the structured format" or "showing good understanding."

Fix logic errors only when present:
- Inconsistent pronouns (must be {{student.pronouns}} throughout).
- Role mentioned doesn't match {{student.role}}.
- Contradictions across sentences (e.g., "consistently" for a skill in one place, "not observed" in another).

Flag, do NOT change the note (these need a clinician):
- The goals named don't correspond to the role/work described. (Goals are clinical targets, so flag only a clear mismatch.)
- A contradiction or claim that can't be resolved without inventing or removing data.

Keep all data (quality levels, percentages, goals) and connecting phrases ("throughout the session," "during the broadcast," "while working on"). Do not invent or remove information.

Output format (strict):
- Output the note text only — corrected for the fixes above. Never put commentary, headings, labels, or separators inside the note.
- If (and only if) you have something to flag, append a final line that is exactly `[[WARNINGS]]`, then one `- ` bullet per issue, and nothing after. If there is nothing to flag, do not output the marker at all.{{#if teacher.streamlineAppend}}

{{teacher.streamlineAppend}}{{/if}}
