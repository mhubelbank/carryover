This is the final pass on a clinical SLP session note. The earlier passes have already enforced structure and conventions. Your job is to catch *logic* problems that earlier passes might have missed. If you find none, return the note as-is.

Note:
{{reviewedNote}}

Check for and fix only:
- Goals stated in the note that don't match what the student actually did, per the narrative.
- Contradictions between sentences (e.g., "consistently" in one place and "rarely" in another for the same skill).
- Sentences that don't make logical sense on their own.
- Prompting placement that is unclear about what skill it applies to.
- Any remaining instances of: "redirection" without "to task"; prompting types written as "supports" or "cues"; multiple prompting types of the same level listed separately; vague placeholder phrases like "increased other"; a label at the start of the note; a segment name that appears alongside a generic reference to the same segment.
- Use of any goal name not provided in the session data.{{#if student.individualSession}}
- Any reference to peers or other staff — this was an individual session.{{/if}}{{#if teacher.streamlineAppend}}

{{teacher.streamlineAppend}}{{/if}}

Keep all clinical content. Do not invent or remove information. If the note is already correct, return it unchanged. Return ONLY the note text — no explanation, no commentary, no list of changes.
