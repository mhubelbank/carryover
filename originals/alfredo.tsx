import React, { useState } from 'react';
import { Plus, X, FileText, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const savedStudents = [
  { name: "Eduardo", gender: "he", aacDevice: "", needsSpanish: false },
  { name: "Lemir", gender: "he", aacDevice: "", needsSpanish: false },
  { name: "Justin", gender: "he", aacDevice: "", needsSpanish: false },
  { name: "Reynaldo", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsSpanish: false },
  { name: "Ty'Heem", gender: "he", aacDevice: "", needsSpanish: false },
  { name: "Alisia", gender: "she", aacDevice: "", needsSpanish: false },
  { name: "Joel", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsSpanish: false },
  { name: "Fabian", gender: "he", aacDevice: "", needsSpanish: false },
  { name: "Payton", gender: "she", aacDevice: "", needsSpanish: false }
];

const studentGoalsData = {
  "Eduardo": [
    { longTerm: "Eduardo will identify the main topic of a multi-paragraph text.", shortName: "identify main topic" },
    { longTerm: "Eduardo will answer who, what, and where questions.", shortName: "answer who questions" },
    { longTerm: "Eduardo will answer who, what, and where questions.", shortName: "answer what questions" },
    { longTerm: "Eduardo will answer who, what, and where questions.", shortName: "answer where questions" },
    { longTerm: "Eduardo will sequence 2-step picture cards.", shortName: "sequence picture cards 2-step" },
    { longTerm: "Eduardo will sequence 3-step picture cards.", shortName: "sequence picture cards 3-step" },
    { longTerm: "Eduardo will retell a 3-step narrative in sequence.", shortName: "retell 3-step narrative" }
  ],
  "Lemir": [
    { longTerm: "Lemir will answer WH questions using text evidence.", shortName: "answer WH questions with text evidence" },
    { longTerm: "Lemir will identify and communicate his feelings.", shortName: "identify and communicate feelings" },
    { longTerm: "Lemir will justify the emotion he feels.", shortName: "justify emotion" },
    { longTerm: "Lemir will use positive affirming words to self and peers.", shortName: "use positive affirming words" },
    { longTerm: "Lemir will demonstrate a coping strategy.", shortName: "demonstrate coping strategy" },
    { longTerm: "Lemir will identify supporting details in a text.", shortName: "identify supporting details" },
    { longTerm: "Lemir will identify the main idea of a text.", shortName: "identify main idea" }
  ],
  "Justin": [
    { longTerm: "Justin will retell a story by pointing to or telling details from the text.", shortName: "retell story by pointing/telling details" },
    { longTerm: "Justin will ask and answer questions in a group setting.", shortName: "ask and answer questions in group" },
    { longTerm: "Justin will interact appropriately with his peers.", shortName: "interact with peers" }
  ],
  "Reynaldo": [
    { longTerm: "Reynaldo will identify the action when given the function.", shortName: "identify action given function" },
    { longTerm: "Reynaldo will name the action and function.", shortName: "name action/function" },
    { longTerm: "Reynaldo will formulate a sentence to describe an action.", shortName: "formulate sentence to describe action" },
    { longTerm: "Reynaldo will initiate communication with peers and adults.", shortName: "initiate communication" },
    { longTerm: "Reynaldo will answer who and what questions.", shortName: "answer who/what questions" },
    { longTerm: "Reynaldo will answer when questions.", shortName: "answer when questions" },
    { longTerm: "Reynaldo will answer where questions.", shortName: "answer where questions" },
    { longTerm: "Reynaldo will produce a 1-sentence response.", shortName: "produce 1 sentence response" },
    { longTerm: "Reynaldo will produce a 1-2 sentence response.", shortName: "produce 1-2 sentence response" },
    { longTerm: "Reynaldo will produce a 1-3 sentence response.", shortName: "produce 1-3 sentence response" }
  ],
  "Ty'Heem": [
    { longTerm: "Ty'Heem will respond to how and why questions.", shortName: "respond to how/why questions" },
    { longTerm: "Ty'Heem will respond to where and when questions.", shortName: "respond to where/when questions" },
    { longTerm: "Ty'Heem will select and initiate a topic.", shortName: "select and initiate topic" },
    { longTerm: "Ty'Heem will offer supportive comments.", shortName: "offer supportive comments" },
    { longTerm: "Ty'Heem will bridge the topic to expand conversation.", shortName: "bridge topic to expand" },
    { longTerm: "Ty'Heem will brainstorm 3 ideas related to a topic.", shortName: "brainstorm 3 ideas" },
    { longTerm: "Ty'Heem will elaborate on a topic with details.", shortName: "elaborate on topic" },
    { longTerm: "Ty'Heem will use transitional words when writing.", shortName: "use transitional words" },
    { longTerm: "Ty'Heem will craft an introduction and conclusion.", shortName: "craft introduction/conclusion" }
  ],
  "Alisia": [
    { longTerm: "Alisia will respond to who and what questions.", shortName: "respond to who/what questions" },
    { longTerm: "Alisia will respond to where and when questions.", shortName: "respond to where/when questions" },
    { longTerm: "Alisia will respond to how and why questions.", shortName: "respond to how/why questions" },
    { longTerm: "Alisia will initiate social interaction with peers.", shortName: "initiate social interaction" },
    { longTerm: "Alisia will request desired items.", shortName: "request desired items" },
    { longTerm: "Alisia will respond to peer questions.", shortName: "respond to peer questions" },
    { longTerm: "Alisia will understand sentence structure.", shortName: "understand sentence structure" },
    { longTerm: "Alisia will write a 3-5 word sentence.", shortName: "write 3-5 word sentence" },
    { longTerm: "Alisia will write two 3-5 word sentences.", shortName: "write two 3-5 word sentences" }
  ],
  "Joel": [
    { longTerm: "Joel will identify feelings in himself and others.", shortName: "identify feelings" },
    { longTerm: "Joel will identify coping strategies for different emotions.", shortName: "identify coping strategies" },
    { longTerm: "Joel will use a coping skill with a prompt.", shortName: "use coping skill with prompt" },
    { longTerm: "Joel will use a coping skill independently.", shortName: "use coping skill independently" },
    { longTerm: "Joel will recall explicit details from text.", shortName: "recall explicit text details" },
    { longTerm: "Joel will write sentences with visual and verbal supports.", shortName: "write sentences with supports" },
    { longTerm: "Joel will initiate a comment using 3-4 words.", shortName: "initiate comment (3-4 words)" },
    { longTerm: "Joel will initiate a question using 3-5 words.", shortName: "initiate question (3-5 words)" },
    { longTerm: "Joel will answer WH questions using 2-3 words.", shortName: "answer WH questions 2-3 words" }
  ],
  "Fabian": [
    { longTerm: "Fabian will identify key details in a text.", shortName: "identify key details" },
    { longTerm: "Fabian will compare and contrast information.", shortName: "compare and contrast" },
    { longTerm: "Fabian will answer inference questions about a text.", shortName: "answer inference questions" },
    { longTerm: "Fabian will make inferences about characters.", shortName: "make inferences about characters" },
    { longTerm: "Fabian will answer when questions.", shortName: "answer when questions" },
    { longTerm: "Fabian will answer how questions.", shortName: "answer how questions" },
    { longTerm: "Fabian will answer why questions.", shortName: "answer why questions" }
  ],
  "Payton": [
    { longTerm: "Payton will stay on topic when engaged in a 5-minute conversation with an adult and/or peer in 5 situations independently.", shortName: "stay on topic in 5-minute conversation" },
    { longTerm: "Given verbal and visual prompts, Payton will verbally produce 3+ word utterances during interactions with communication partners, indicate feelings, and respond to questions.", shortName: "produce 3+ word utterances" },
    { longTerm: "Given verbal and visual prompts, Payton will verbally produce 3+ word utterances during interactions with communication partners, indicate feelings, and respond to questions.", shortName: "indicate feelings" },
    { longTerm: "Given verbal and visual prompts, Payton will verbally produce 3+ word utterances during interactions with communication partners, indicate feelings, and respond to questions.", shortName: "respond to questions" }
  ]
};

const scheduleData = {
  "Monday": { "12:04-12:34": ["Fabian"] },
  "Tuesday": { "8:44-9:14": ["Eduardo", "Lemir", "Justin", "Payton"], "9:15-9:45": ["Ty'Heem", "Alisia", "Joel"] },
  "Wednesday": { "8:44-9:14": ["Eduardo", "Lemir", "Justin", "Payton"], "9:15-9:45": ["Fabian"] },
  "Friday": { "8:44-9:14": ["Fabian"], "9:15-9:45": ["Ty'Heem", "Alisia", "Joel"] }
};

const segmentActivities = [
  "Researched/created visuals for upcoming news segments",
  "Worked together as a class to choose the next news segment they plan to create",
  "Filmed for a news segment: gave directions (i.e., quiet on set, roll tape, action, cut)",
  "Filmed for a news segment: responded to directions given by staff and peers (i.e., quiet on set, roll tape, action, cut)",
  "Wrote the script for an upcoming segment"
];

const getSessionTime = (studentName, dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T00:00:00');
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = dayNames[date.getDay()];
  if (!scheduleData[dayOfWeek]) return '';
  for (const [timeSlot, students] of Object.entries(scheduleData[dayOfWeek])) {
    if (students.includes(studentName)) return timeSlot;
  }
  return '';
};

const cleanClaudeResponse = (text) => {
  if (!text) return '';
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s+/g, '');
  return cleaned.trim();
};

const blankActivityData = () => ({
  goals: [],
  promptingLevel: { no: false, minimal: false, moderate: false, significant: false, 'one to one para support': false },
  promptingType: { verbal: false, visual: false, tactile: false },
  redirection: { no: false, regular: false, occasional: false, continuous: false },
  response: { enthusiastic: false, engaged: false, alert: false, disregulated: false, unengaged: false, tired: false, distracted: false },
  additionalNotes: ''
});

const blankActivity = () => ({ name: '', additionalInfo: '', segmentName: '', domains: { expressive: false, receptive: false, pragmatic: false } });

const blankStudent = (numActivities) => ({
  name: '', gender: 'he', sessionTime: '', aacDevice: '', needsSpanish: false, absent: false, individualSession: false,
  activitiesData: Array.from({ length: numActivities }, blankActivityData)
});

const AlfredoSESISGenerator = () => {
  const [date, setDate] = useState('');
  const [activities, setActivities] = useState([blankActivity()]);
  const [students, setStudents] = useState([blankStudent(1)]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState([0]);
  const [saveStatus, setSaveStatus] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const saveData = async () => {
    try {
      await window.storage.set('alfredo-session-data', JSON.stringify({ date, activities, students, generatedNotes, timestamp: new Date().toISOString() }), false);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) { console.error('Failed to save:', err); }
  };

  React.useEffect(() => {
    const loadData = async () => {
      try {
        const result = await window.storage.get('alfredo-session-data', false);
        if (result?.value) {
          const d = JSON.parse(result.value);
          setDate(d.date || '');
          setActivities(d.activities || [blankActivity()]);
          setStudents(d.students || [blankStudent(1)]);
          setGeneratedNotes(d.generatedNotes || []);
        }
      } catch (err) { console.log('No saved data:', err); }
    };
    loadData();
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => saveData(), 5000);
    return () => clearTimeout(timer);
  }, [date, activities, students, generatedNotes]);

  React.useEffect(() => {
    if (date && students.length > 0) {
      setStudents(prev => prev.map(s => ({ ...s, sessionTime: s.name ? getSessionTime(s.name, date) : '' })));
    }
  }, [date]);

  const confirmClearData = async () => {
    try { await window.storage.delete('alfredo-session-data', false); } catch (err) { console.error(err); }
    setDate(''); setActivities([blankActivity()]); setStudents([blankStudent(1)]);
    setGeneratedNotes([]); setExpandedStudents([0]); setShowClearConfirm(false);
  };

  const availableActivities = [
    "Watched the 811X Dragon news and answered WH questions about it",
    "Watched the 811X Dragon news and completed a corresponding, provider created, differentiated worksheet",
    "Wrote the script for next week's news",
    "Researched/created visuals for upcoming news segments",
    "Worked together as a class to choose the next news segment they plan to create",
    "Filmed for a news segment: gave directions (i.e., quiet on set, roll tape, action, cut)",
    "Filmed for a news segment: responded to directions given by staff and peers (i.e., quiet on set, roll tape, action, cut)",
    "Wrote the script for an upcoming segment",
    "Completed journal entries for collaborative teacher. Glued in a picture illustrating today's National Day and wrote or traced a self-generated comment about it.",
    "Other"
  ];

  const addActivity = () => {
    setActivities(prev => [...prev, blankActivity()]);
    setStudents(prev => prev.map(s => ({ ...s, activitiesData: [...s.activitiesData, blankActivityData()] })));
  };

  const updateActivity = (index, field, value) => {
    setActivities(prev => {
      const next = [...prev];
      if (field.includes('.')) { const [p, c] = field.split('.'); next[index][p][c] = value; }
      else next[index][field] = value;
      return next;
    });
  };

  const removeActivity = (index) => {
    setActivities(prev => prev.filter((_, i) => i !== index));
    setStudents(prev => prev.map(s => ({ ...s, activitiesData: s.activitiesData.filter((_, i) => i !== index) })));
  };

  const addStudent = () => {
    setStudents(prev => [...prev, blankStudent(activities.length)]);
    setExpandedStudents(prev => [...prev, students.length]);
  };

  const updateStudent = (index, field, value) => {
    setStudents(prev => {
      const next = [...prev];
      next[index][field] = value;
      if (field === 'name' && value) {
        const saved = savedStudents.find(s => s.name === value);
        if (saved) {
          next[index].gender = saved.gender;
          next[index].aacDevice = saved.aacDevice;
          next[index].needsSpanish = saved.needsSpanish;
          next[index].sessionTime = getSessionTime(value, date) || '';
        }
      }
      return next;
    });
  };

  const removeStudent = (index) => {
    setStudents(prev => prev.filter((_, i) => i !== index));
    setExpandedStudents(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
  };

  const updateStudentActivityData = (sIdx, aIdx, field, value) => {
    setStudents(prev => {
      const next = [...prev];
      if (field.includes('.')) { const [p, c] = field.split('.'); next[sIdx].activitiesData[aIdx][p][c] = value; }
      else next[sIdx].activitiesData[aIdx][field] = value;
      return next;
    });
  };

  const toggleGoal = (sIdx, aIdx, goalIdx) => {
    setStudents(prev => {
      const next = [...prev];
      const goals = next[sIdx].activitiesData[aIdx].goals;
      next[sIdx].activitiesData[aIdx].goals = goals.includes(goalIdx) ? goals.filter(g => g !== goalIdx) : [...goals, goalIdx];
      return next;
    });
  };

  const generateNotes = async () => {
    setIsGenerating(true);
    const notes = [];

    for (const student of students) {
      if (!student.name) continue;

      if (student.absent) {
        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: "absent" });
        continue;
      }

      const activitySummaries = student.activitiesData.map((actData, idx) => {
        const activity = activities[idx];
        if (!activity) return null;
        const domains = Object.entries(activity.domains).filter(([,v]) => v).map(([k]) => k);
        const selectedGoals = actData.goals.map(gIdx => (studentGoalsData[student.name] || [])[gIdx]?.shortName).filter(Boolean);
        const promptingLevels = Object.entries(actData.promptingLevel).filter(([,v]) => v).map(([k]) => k);
        const promptingTypes = Object.entries(actData.promptingType).filter(([,v]) => v).map(([k]) => k);
        const redirections = Object.entries(actData.redirection).filter(([,v]) => v).map(([k]) => k);
        const responses = Object.entries(actData.response).filter(([,v]) => v).map(([k]) => k);
        return {
          activity: activity.name,
          additionalInfo: activity.additionalInfo,
          segmentName: activity.segmentName || '',
          domains: domains.join(', '),
          goals: selectedGoals.join(', '),
          promptingLevel: promptingLevels.join(', '),
          promptingType: promptingTypes.join(', '),
          redirection: redirections.join(', '),
          response: responses.join(', '),
          additionalNotes: actData.additionalNotes
        };
      }).filter(a => a && a.activity);

      const pronoun = student.gender === 'he' ? 'he/him' : 'she/her';

      try {
        const draftPrompt = `You are writing a professional SLP session note for ${student.name} (${pronoun}).

Session data:
${activitySummaries.map((a, idx) => {
  const activityDesc = a.additionalInfo ? a.activity + ' ' + a.additionalInfo : a.activity;
          return `Activity ${idx + 1}: ${activityDesc}${a.segmentName ? `\n   Segment name: ${a.segmentName}` : ''}
   Language domains: ${a.domains}
   IEP goals — use only these, do not substitute or invent: ${a.goals}
   Prompting: ${a.promptingLevel} ${a.promptingType}
   Redirection: ${a.redirection}
   Student response: ${a.response}
   Additional notes: ${a.additionalNotes || 'none'}`;
}).join('\n\n')}

Write a detailed, professional clinical narrative. You must explain the clinical significance of the activity itself — what the activity involves and why it is therapeutically meaningful — in one sentence, woven naturally into the note. For example: "This activity provided a naturalistic context for practicing conversational initiation, question formulation, and peer relationship-building." You must NOT add anything about the student beyond what is explicitly stated in the data. Do not infer, extend, or elaborate on the student's behavior, performance, independence, or affect beyond what is provided. Do NOT invent specific details not provided — do not specify what questions were asked, do not add percentages or observations not in the data, do not fabricate what was said or done. FABRICATION EXAMPLE — this is forbidden: if the data says "getting-to-know-you questions," do not write "questions about their interests and background." Use only the exact activity description provided. The clinical significance sentence is mandatory in every note. If you do not include it, the note is incomplete.

Make sure to:
- Describe what the student did
- Include the activity context
- If a segment name is provided, use it specifically (e.g., "a news segment on [segment name]") when referring to the segment. Do NOT use generic phrases like "an upcoming news segment" — the segment name IS the segment. Refer to it once by name; do not reference it again as a separate or unnamed thing.
- Place prompting and redirection appropriately, using "given," immediately after what they apply to
- Include student response
- Close the note with a sentence that names the language domains addressed and the specific goals targeted. This sentence should read as a natural conclusion to the narrative, not a formulaic summary. Do not restate goals or domains anywhere else in the note.

ABSOLUTE RULES:
- Do NOT add specific details not provided. Do not invent questions asked, percentages, or observations not in the data.
- Do NOT use vague placeholder phrases like "increased other" or "demonstrated skills."
- Use ${student.name}'s name at the start, then ${pronoun} pronouns. Past tense throughout.
- Include ALL data provided. Do not omit anything.
- CRITICAL: Prompting types are ALWAYS written as "[type] prompting" — verbal prompting, visual prompting, tactile prompting. NEVER write "visual supports," "verbal cues," or any other variation. Always use the word "prompting."
- When multiple prompting types share the same level, combine them into a single phrase: "[level] verbal and visual prompting" — NEVER list them separately as "[level] verbal prompting, visual prompting."
- Goals must be stated specifically using the actual goal names provided, never replaced with vague phrases like "her communication goals."
- Redirection is ALWAYS written as "redirection to task." Never just "redirection."
- Do not begin the note with "Note:" or any label. Begin directly with the student's name.
- Additional notes must be transformed into clinical prose. Do not change the meaning of what is stated. Do not reframe, invert, or draw inferences beyond what is explicitly written. Do not reproduce them verbatim.
- Use only the goals provided in the session data. Do not describe activities, behaviors, or anything else in place of the provided goals.${student.individualSession ? '\n- This was an individual session. Do not reference peers or other staff anywhere in the note.' : ''}`;

        const draftRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, messages: [{ role: "user", content: draftPrompt }] })
        });
        if (!draftRes.ok) throw new Error('API Error (' + draftRes.status + '): ' + (await draftRes.text()).substring(0, 150));
        const draftData = await draftRes.json();
        if (!draftData.content?.[0]?.text) throw new Error('Unexpected API response structure.');
        const draftNote = cleanClaudeResponse(draftData.content[0].text);

        const reviewPrompt = `Review this clinical SLP session note and correct any problems with clinical language, grammar, and structure.

Note: ${draftNote}

RULES:
1. Do NOT fabricate any information. Only reword what is explicitly provided.
2. Do NOT use vague phrases like "increased other" or "demonstrated skills." Use concrete action verbs.
3. Structure must be: [Name] [what student did], while [activity], given [prompting]. [Response.] This session addressed [domains], targeting [goals].
4. Prompting goes immediately after the activity it applies to, using "given" — not in a separate sentence.
5. Goals are clinical targets, not actions or activities. Use the EXACT goal names provided — never replace with vague phrases like "communication goals."
6. Pronouns: ${pronoun}. Past tense throughout.
7. Every sentence must be grammatically correct and logically coherent.
8. CRITICAL: Prompting types are ALWAYS written as "[type] prompting" — verbal prompting, visual prompting, tactile prompting. NEVER write "visual supports," "verbal cues," or any other variation. Always use the word "prompting."
9. When multiple prompting types share the same level, combine them into a single phrase: "[level] verbal and visual prompting." NEVER list them separately as "[level] verbal prompting, visual prompting."
10. Redirection is ALWAYS written as "redirection to task." Never just "redirection."
11. Do not repeat the same noun or phrase twice in the same sentence.
12. Do not begin the note with "Note:" or any label. Begin directly with the student's name.
13. Check that the note contains exactly one sentence of clinical significance about the activity. If it is missing, add it. If there is more than one, condense to one.
14. Prompting levels joined by "and" must be written as "minimal to moderate" not "minimal and moderate."
15. If a specific segment name is present in the note, it must appear only once. The segment must not also be referred to generically as "an upcoming news segment" or similar — the named segment and the generic reference are the same thing. Remove any duplicate reference.
16. Use only the goals provided in the session data. Do not describe activities, behaviors, or anything else in place of the provided goals.${student.individualSession ? '\n17. This was an individual session. Do not reference peers or other staff anywhere in the note.' : ''}

Return only the corrected note.`;

        const reviewRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, messages: [{ role: "user", content: reviewPrompt }] })
        });
        if (!reviewRes.ok) throw new Error('Review API Error (' + reviewRes.status + '): ' + (await reviewRes.text()).substring(0, 150));
        const reviewData = await reviewRes.json();
        if (!reviewData.content?.[0]?.text) throw new Error('Unexpected API response structure.');
        const reviewedNote = cleanClaudeResponse(reviewData.content[0].text);

        const streamlinePrompt = `Check this clinical SLP note for logic problems and fix them. Keep ALL clinical information.

Note: ${reviewedNote}

CHECK FOR:
1. Do the stated goals match what the student actually did? Fix any mismatch.
2. Are there vague phrases like "increased other"? Replace with concrete descriptions.
3. Does every sentence make logical sense on its own?
4. Is prompting placement clear and unambiguous?
5. Are there any contradictions or illogical statements?
6. Prompting types must be written as "[type] prompting" — verbal prompting, visual prompting, tactile prompting. Fix any variation.
7. When multiple prompting types share the same level, combine them into a single phrase: "[level] verbal and visual prompting." NEVER list them separately as "[level] verbal prompting, visual prompting." Fix any instance of this.
8. Goals must be stated specifically — never replaced with vague phrases like "communication goals."
9. Redirection must always be written as "redirection to task." Fix any instance of "redirection" alone.
10. Check for repeated nouns or phrases within the same sentence and eliminate them.
11. Do not begin the note with "Note:" or any label. If it does, remove the label. Begin directly with the student's name.
12. If a specific segment name appears in the note, check that the segment is not also referred to generically elsewhere in the same note (e.g., "an upcoming news segment," "the segment," "a news segment" without the name). If it is, remove the duplicate generic reference.
13. Use only the goals provided in the session data. Do not describe activities, behaviors, or anything else in place of the provided goals.${student.individualSession ? '\n14. This was an individual session. Do not reference peers or other staff anywhere in the note.' : ''}

Fix any problems found. Do not remove clinical content. Return ONLY the corrected note with no explanation, no list of changes, no commentary of any kind.`;

        const streamlineRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, messages: [{ role: "user", content: streamlinePrompt }] })
        });
        if (!streamlineRes.ok) throw new Error('Streamline API Error (' + streamlineRes.status + '): ' + (await streamlineRes.text()).substring(0, 150));
        const streamlineData = await streamlineRes.json();
        if (!streamlineData.content?.[0]?.text) throw new Error('Unexpected API response structure.');
        const streamlinedNote = cleanClaudeResponse(streamlineData.content[0].text);

        notes.push({ name: student.name, sessionTime: student.sessionTime, draftNote, reviewedNote, finalNote: streamlinedNote });
      } catch (error) {
        const errorMessage = 'Error generating note: ' + error.message;
        notes.push({ name: student.name, sessionTime: student.sessionTime, draftNote: errorMessage, reviewedNote: errorMessage, finalNote: errorMessage });
      }
    }

    setGeneratedNotes(notes);
    setIsGenerating(false);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      {saveStatus && (
        <div className="fixed top-4 left-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">{saveStatus}</div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-lg font-semibold mb-2">Clear all saved data?</p>
            <p className="text-sm text-gray-600 mb-6">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 border rounded-md text-sm font-medium">Cancel</button>
              <button onClick={confirmClearData} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium">Clear</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Alfredo - SESIS Note Generator</h1>
        <button onClick={() => setShowClearConfirm(true)} className="text-sm text-gray-600 underline">Clear saved data</button>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Session Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Activities</h2>
        {activities.map((activity, aIdx) => (
          <div key={aIdx} className="mb-4 p-4 border rounded-lg">
            <div className="flex justify-between mb-2">
              <h3 className="font-semibold">Activity {aIdx + 1}</h3>
              {activities.length > 1 && <button onClick={() => removeActivity(aIdx)} className="text-red-600"><X size={16} /></button>}
            </div>
            <div className="mb-2">
              <label className="block text-sm font-medium mb-1">Activity</label>
              <select value={activity.name} onChange={(e) => updateActivity(aIdx, 'name', e.target.value)} className="w-full px-3 py-2 border rounded-md">
                <option value="">Select an activity</option>
                {availableActivities.map((act, i) => <option key={i} value={act}>{act}</option>)}
              </select>
            </div>
            {segmentActivities.includes(activity.name) && (
              <div className="mb-2">
                <label className="block text-sm font-medium mb-1">Segment name</label>
                <input
                  type="text"
                  value={activity.segmentName || ''}
                  onChange={(e) => updateActivity(aIdx, 'segmentName', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="e.g., Cinco de Mayo"
                />
              </div>
            )}
            <div className="mb-2">
              <label className="block text-sm font-medium mb-1">Additional Activity Info</label>
              <input type="text" value={activity.additionalInfo} onChange={(e) => updateActivity(aIdx, 'additionalInfo', e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Add details about this activity" />
            </div>
            <div className="mb-2">
              <label className="block text-sm font-medium mb-1">Language Domains</label>
              <div className="flex gap-4">
                {['expressive', 'receptive', 'pragmatic'].map(d => (
                  <label key={d} className="flex items-center gap-2">
                    <input type="checkbox" checked={activity.domains[d]} onChange={(e) => updateActivity(aIdx, 'domains.' + d, e.target.checked)} />
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}
        <button onClick={addActivity} className="px-4 py-2 bg-blue-600 text-white rounded-md flex items-center gap-2">
          <Plus size={16} /> Add Activity
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Students</h2>
        {students.map((student, sIdx) => (
          <div key={sIdx} className="mb-4 border rounded-lg">
            <div className="bg-gray-50 p-4 flex justify-between cursor-pointer" onClick={() => setExpandedStudents(prev => prev.includes(sIdx) ? prev.filter(i => i !== sIdx) : [...prev, sIdx])}>
              <h3 className="font-semibold">{student.name || 'Student ' + (sIdx + 1)}</h3>
              {expandedStudents.includes(sIdx) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>

            {expandedStudents.includes(sIdx) && (
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Student Name</label>
                    <input type="text" value={student.name} onChange={(e) => updateStudent(sIdx, 'name', e.target.value)} className="w-full px-3 py-2 border rounded-md" list="students-list" />
                    <datalist id="students-list">
                      {Object.keys(studentGoalsData).map((name, i) => <option key={i} value={name} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Pronouns</label>
                    <select value={student.gender} onChange={(e) => updateStudent(sIdx, 'gender', e.target.value)} className="w-full px-3 py-2 border rounded-md">
                      <option value="he">He/Him</option>
                      <option value="she">She/Her</option>
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Session Time</label>
                  <input type="text" value={student.sessionTime || ''} onChange={(e) => updateStudent(sIdx, 'sessionTime', e.target.value)} placeholder="e.g., 10:00-10:30" className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>

                {student.aacDevice && <p className="text-sm text-gray-600 mb-2">AAC: {student.aacDevice}</p>}

                <div className="mb-4 flex gap-6">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={student.absent || false} onChange={(e) => updateStudent(sIdx, 'absent', e.target.checked)} />
                    <span className="text-sm font-medium">Student was absent</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={student.individualSession || false} onChange={(e) => updateStudent(sIdx, 'individualSession', e.target.checked)} />
                    <span className="text-sm font-medium">Individual session</span>
                  </label>
                </div>

                {!student.absent && (
                  <>
                    <h4 className="font-semibold mb-2">Other</h4>
                    {student.activitiesData.map((actData, aIdx) => (
                      <div key={aIdx} className="mb-4 p-3 bg-gray-50 rounded">
                        <h5 className="font-medium mb-2">Activity {aIdx + 1}: {activities[aIdx]?.name || 'Not selected'}</h5>

                        {student.name && studentGoalsData[student.name] && (
                          <div className="mb-2">
                            <label className="block text-sm font-medium mb-1">Goals</label>
                            <div className="space-y-1">
                              {studentGoalsData[student.name].map((goal, gIdx) => (
                                <label key={gIdx} className="flex items-start gap-2 text-sm">
                                  <input type="checkbox" checked={actData.goals.includes(gIdx)} onChange={() => toggleGoal(sIdx, aIdx, gIdx)} className="mt-1" />
                                  <span>{goal.shortName}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 mb-2">
                          <div>
                            <label className="block text-sm font-medium mb-1">Prompting Level</label>
                            <div className="space-y-1">
                              {['no', 'minimal', 'moderate', 'significant', 'one to one para support'].map(level => (
                                <label key={level} className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={actData.promptingLevel[level]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'promptingLevel.' + level, e.target.checked)} />
                                  {level}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Prompting Type</label>
                            <div className="space-y-1">
                              {['verbal', 'visual', 'tactile'].map(type => (
                                <label key={type} className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={actData.promptingType[type]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'promptingType.' + type, e.target.checked)} />
                                  {type}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-2">
                          <div>
                            <label className="block text-sm font-medium mb-1">Redirection</label>
                            <div className="space-y-1">
                              {['no', 'occasional', 'regular', "continuous"].map(level => (
                                <label key={level} className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={actData.redirection[level]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'redirection.' + level, e.target.checked)} />
                                  {level}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Response</label>
                            <div className="space-y-1">
                              {['enthusiastic', 'engaged', 'alert', 'disregulated', 'unengaged', 'tired', 'distracted'].map(resp => (
                                <label key={resp} className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={actData.response[resp]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'response.' + resp, e.target.checked)} />
                                  {resp}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Additional notes</label>
                          <textarea value={actData.additionalNotes} onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'additionalNotes', e.target.value)} className="w-full px-3 py-2 border rounded-md text-sm" rows="2" placeholder="Additional notes..." />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                <button onClick={() => removeStudent(sIdx)} className="mt-4 text-sm text-red-600 underline">Remove Student</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={addStudent} className="px-4 py-2 bg-blue-600 text-white rounded-md flex items-center gap-2 mt-4">
          <Plus size={16} /> Add Student
        </button>
      </div>

      <button onClick={generateNotes} disabled={isGenerating || !date || students.every(s => !s.name)} className="w-full py-3 bg-green-600 text-white rounded-md font-semibold text-lg mb-6 disabled:bg-gray-400">
        {isGenerating ? <><Loader2 className="inline animate-spin mr-2" />Generating...</> : <><FileText className="inline mr-2" />Generate Notes</>}
      </button>

      {generatedNotes.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Generated Notes</h2>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">All Notes (Click to select, then Ctrl+C to copy):</label>
            <textarea
              readOnly
              value={(date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '\n\n' : '') + generatedNotes.map(n => (n.sessionTime ? n.sessionTime + '\n' : '') + n.name + ':\n' + n.finalNote + '\n').join('\n')}
              className="w-full p-3 border rounded font-mono text-sm bg-white"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              rows="10"
              onClick={(e) => { e.target.select(); e.target.setSelectionRange(0, e.target.value.length); }}
            />
          </div>
          {generatedNotes.map((note, idx) => (
            <div key={idx} className="mb-6 border-t pt-4">
              {note.sessionTime && <p className="text-sm font-semibold text-gray-600 mb-1">{note.sessionTime}</p>}
              <h3 className="font-semibold mb-2">{note.name}</h3>
              <textarea
                readOnly
                value={(note.sessionTime ? note.sessionTime + '\n' : '') + note.name + ':\n' + note.finalNote}
                className="w-full p-3 border rounded text-sm bg-green-50"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                rows="4"
                onClick={(e) => { e.target.select(); e.target.setSelectionRange(0, e.target.value.length); }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlfredoSESISGenerator;
