You are writing a professional SLP session note for {{student.name}} ({{student.pronouns}}).

Activity: Collaborated with classmates to produce a live episode of the 811X Dragon News
Role: {{student.role}}
Goals addressed (name these, not the detail sentences): {{selectedGoals | join: ", "}}{{#if selectedGoalDetails.length}}
Goal details (context only — do not quote): {{selectedGoalDetails | join: "; "}}{{/if}}
{{roleData}}
{{#if additionalContext}}{{additionalContext}}{{/if}}

Write ONE cohesive paragraph in past tense.

**Required opening sentence, verbatim:**
"{{student.name}} collaborated with classmates to produce an episode of the 811X Dragon News, serving as {{role.phrase}}."

Do not change any word in this opening sentence.

After the opening, weave in the performance data and goals provided above. The role data lines are pre-formatted — preserve their exact wording (skill names, percentages, prompting levels) and add only connecting language to make them read as prose. Connecting phrases like "throughout the session," "during the broadcast," "while working on" are good. Do not paraphrase the role data.

{{#if selectedGoals.length}}State which goals were addressed: {{selectedGoals | join: ", "}}.{{else}}Do not mention goals — none were provided. Do not invent or infer any.{{/if}}

Ordering rules:
- If additional notes relate to a specific performance metric (e.g., behavioral support needed for audience behavior), place that information immediately after the metric it relates to.
- Information about giving compliments always goes at the END of the paragraph — this happens last in the session.
- Every Studio Audience skill in the data must appear in the note. When multiple Studio Audience skills share the same quality descriptor and prompting level, write them as a series with the descriptor as an adverb before the first verb and "given [level] prompting" at the close. Example: "he occasionally maintained attention to anchors, waited for appropriate times to speak, and demonstrated appropriate audience behavior, given significant prompting." Skills with different descriptors or prompting levels get their own clauses.

Do NOT invent details:
- No behavioral descriptions not in the data (no "frequent redirection," no "quiet listening posture," no "appropriate facial expressions," no "sustained focus," no "responsive engagement," no "attentive posture").
- No interpretive conclusions like "benefited from the structured format" or "showing good understanding."
- No elaboration on what quality levels or percentages mean.
- No filler phrases like "during the collaborative news production activity" or "participated in the broadcast activity."

Additional notes formatting:
- Treat additional notes as observations to integrate into clinical prose. Do not transcribe verbatim, do not append as a separate sequence.
- If the additional notes use the word "para," keep "para" — do not change it to "paraprofessional."
- Behavioral observations are written as clinical prose, not chronological incident accounts.

Use {{student.name}}'s name and pronouns ({{student.pronouns}}) naturally. Do not include date or any labels like "Activity:," "Role:," or "Goals:."{{#if teacher.draftAppend}}

{{teacher.draftAppend}}{{/if}}
