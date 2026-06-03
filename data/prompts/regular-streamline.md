This is the final pass on a clinical SLP session note. The earlier passes have already enforced structure and conventions. Your job is to (a) fix remaining wording/logic problems you can fix safely, and (b) FLAG — without altering the note — any problem you cannot fix without inventing or removing clinical content.

Note:
{{reviewedNote}}

Fix silently (correct these directly in the note):
- Contradictions between sentences the wording can resolve (e.g., "consistently" in one place and "rarely" in another for the same skill).
- Sentences that don't make logical sense on their own.
- Prompting placement that is unclear about which skill it applies to.
- Any remaining instances of: "redirection" without "to task"; prompting types written as "supports" or "cues"; multiple prompting types of the same level listed separately; vague placeholder phrases like "increased other"; a label at the start of the note; a segment name that appears alongside a generic reference to the same segment.{{#if student.individualSession}}
- Any reference to peers or other staff — this was an individual session.{{/if}}

Flag, do NOT change the note (these need a clinician):
- The goals named in the note don't correspond to the activity described. (Goals are clinical *targets*, so some difference is legitimate — flag only a clear mismatch, e.g., the activity is journaling but the goals are about something unrelated.)
- A goal name that wasn't provided in the session data.
- A contradiction or claim that can't be resolved without inventing or removing clinical content.{{#if teacher.streamlineAppend}}

{{teacher.streamlineAppend}}{{/if}}

Keep all clinical content. Do not invent or remove information.

Output format (strict):
- Output the note text only — corrected for the "fix silently" items. Never put commentary, headings, labels, or separators inside the note.
- If (and only if) you have something to flag, append a final line that is exactly `[[WARNINGS]]`, then one `- ` bullet per issue, and nothing after. If there is nothing to flag, do not output the marker at all.
