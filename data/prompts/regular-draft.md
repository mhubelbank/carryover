You are writing a professional SLP session note for {{student.name}} ({{student.pronouns}}).

Session data:
{{#each activities}}
Activity {{@index_plus_one}}: {{this.description}}{{#if this.segmentName}}
   Segment name: {{this.segmentName}}{{/if}}
   Language domains: {{this.domains}}
   IEP goals — use only these: {{this.goals}}
   Prompting: {{this.promptingLevel}} {{this.promptingType}}
   Redirection: {{this.redirection}}
   Student response: {{this.response}}
   Additional notes: {{this.additionalNotes | default: "none"}}
{{/each}}{{#if additionalContext}}{{additionalContext}}{{/if}}

Write a professional clinical narrative.

The note must include exactly one **standalone sentence** describing the clinical significance of the *activity* — what the activity involves and why it is therapeutically meaningful as a structure. This must be its own period-delimited sentence, NOT joined to the student-action sentence via a "which" clause, an appositive, a "making it…" continuation, or any other relative-clause connector. Infer about the activity, not about the student. Example: "This activity provided a naturalistic context for practicing conversational initiation, question formulation, and peer relationship-building." Do not extend, infer, or elaborate anything about the student beyond what the session data states.

Structure:
- Begin directly with {{student.name}}. No "Note:" or any label.
- Describe what {{student.pronoun}} did, with prompting and redirection placed using "given" immediately after the activity they apply to.
- Include student response.
- Close with one sentence naming the language domains addressed and the specific goals targeted. Do not restate goals or domains anywhere else.

Language conventions (non-negotiable):
- Past tense throughout.
- Prompting types are written as "[type] prompting" — "verbal prompting," "visual prompting," "tactile prompting." Never "visual supports," "verbal cues," or other variations.
- When multiple prompting types share the same level, combine them: "minimal verbal and visual prompting." Never list separately.
- Prompting levels joined together: "minimal to moderate." Not "minimal and moderate."
- Redirection is written as "redirection to task." Never just "redirection."
- Goals are named exactly as provided in the session data. Never replaced with vague phrases like "her communication goals."
- If a session field is empty or shows no value, do not mention that category at all.

Do NOT:
- Invent details not in the data — no specific questions asked, no percentages, no observations, no fabricated behaviors. If the data says "getting-to-know-you questions," do not write "questions about their interests and background."
- Use placeholder phrases like "increased other" or "demonstrated skills."
- Substitute different goals or describe activities in place of goals.
- Transcribe additional notes verbatim. Transform them into clinical prose without changing meaning.
- Chain multiple ideas into one run-on sentence. Each major idea — student action, clinical significance, student response, language domains/goals — gets its own period-delimited sentence. No "which," "making it," or relative-clause fusion across these.{{#if student.individualSession}}
- Reference peers or other staff. This was an individual session.{{/if}}{{#if teacher.draftAppend}}

{{teacher.draftAppend}}{{/if}}
