import React, { useState } from 'react';
import { Plus, X, FileText, Loader2, Copy, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

const studentGoalsData = {
  "Anasur": [
    { longTerm: "Given structured opportunities, visual supports, and verbal prompts, Anasur will independently use his speech-generating device (SGD) to produce functional phrases (e.g., 'snack,' 'I want snack,' 'Help, please,' 'break,' 'I need break') to request, comment, or respond to questions in 4 out of 5 opportunities, as measured by clinician or collaborative teacher data collection and observation.", shortName: "Device for functional phrases" },
    { longTerm: "During structured meals and snacks, Anasur will take bites of an appropriate size, chew adequately, swallow before initiating the next bite, and use liquid to clear oral residue when indicated, given visual and verbal cues, in 4 out of 5 opportunities across three consecutive sessions.", shortName: "safe feeding behaviors" }
  ],
  "Dominic": [
    { longTerm: "During structured and natural communication opportunities, Dominic will expand his spoken utterances to 3-5 words that convey more complete information (e.g., descriptors, actions, or locations), given verbal and visual supports, in 4 out of 5 opportunities across three consecutive sessions.", shortName: "MLU 3-5" },
    { longTerm: "Dominic will retell a story read aloud by identifying and communicating 5 key story details using pictures and/or words through his preferred mode of communication (PMC), with 80% accuracy across 3 consecutive trials.", shortName: "Story retell" },
    { longTerm: "Dominic will demonstrate understanding of personal boundaries by waiting for verbal or nonverbal consent before entering another person's personal space (e.g., moving within arm's length) in 5 different social situations, with 80% accuracy across 3 consecutive sessions, as measured by teacher/staff observation and data collection.", shortName: "Personal boundaries and not interrupting" }
  ],
  "Arianna": [
    { longTerm: "Arianna will retell events from her day or a grade-level text by verbally telling 5 details", shortName: "Story retell" },
    { longTerm: "Arianna will wait for the right time to interrupt an ongoing conversation between other people", shortName: "Interjections" },
    { longTerm: "Arianna will improve her ability to retell stories and share personal narratives by accurately sequencing events in both academic texts and end-of-day reporting.", shortName: "Sequencing" }
  ],
  "Joshua": [
    { longTerm: "Joshua will be able to communicate and express his needs 5 times per day using his preferred mode of communication (PMC), with one of those five instances being a request to use the bathroom.", shortName: "Express needs" },
    { longTerm: "Joshua will be able to sequence a 10 picture story card to retell a story.", shortName: "Sequencing" },
    { longTerm: "Joshua will respond to 'who' and 'where' questions relating to characters and places using verbal prompting as necessary during language based activities.", shortName: "WH questions" }
  ],
  "Alyenison": [
    { longTerm: "Alyenison will demonstrate improved comprehension skills by accurately answering 'wh' questions related to a story or text.", shortName: "WH questions" },
    { longTerm: "Alyenison will be able to write details about a given topic (e.g., favorite holiday, event, activity etc.) by completing sentence starter.", shortName: "Details" },
    { longTerm: "Alyenison will use 1- 6. word utterances using correct syntax ( word order) independently.", shortName: "MLU 1-6, proper syntax/word order" }
  ],
  "Pedro": [
    { longTerm: "Pedro will answer 5 wh-questions (who, what, when, where, why) about key details in a grade-level informational text read aloud to him, using visual supports or sentence starters, with 80% accuracy over 3 consecutive sessions", shortName: "WH questions" },
    { longTerm: "Pedro will verbally dictate a recount of a familiar event including 2 characters and at least 3 relevant details, with visual prompts and adult support, with 90% accuracy in 4 out of 5 trials.", shortName: "Story retell" },
    { longTerm: "During structured classroom or small-group activities, Pedro will increase verbal participation by responding to and maintaining conversational exchanges across two to three turns with peers or adults, given verbal and visual supports, in 4 out of 5 opportunities across three consecutive sessions.", shortName: "respond, topic maintenance" }
  ]
};

const savedStudents = [
  { name: "Anasur", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsBengali: true },
  { name: "Dominic", gender: "he", aacDevice: "", needsBengali: false },
  { name: "Joshua", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsBengali: false },
  { name: "Arianna", gender: "she", aacDevice: "", needsBengali: false },
  { name: "Alyenison", gender: "he", aacDevice: "", needsBengali: false },
  { name: "Pedro", gender: "he", aacDevice: "", needsBengali: false }
];

const scheduleData = {
  "Monday": {
    "10:00-10:30": ["Alyenison"],
    "10:31-11:01": ["Anasur"]
  },
  "Tuesday": {
    "9:46-10:16": ["Anasur", "Dominic"],
    "10:17-10:47": ["Arianna", "Pedro"],
    "10:48-11:18": ["Joshua"]
  },
  "Wednesday": {},
  "Thursday": {
    "9:46-10:16": ["Dominic", "Joshua"],
    "10:17-10:47": ["Arianna", "Pedro"],
    "10:48-11:18": ["Alyenison"]
  },
  "Friday": {}
};

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
  return text
    .replace(/```json\s*/g, '').replace(/```\s*/g, '')
    .replace(/\*\*/g, '').replace(/\*/g, '')
    .replace(/#{1,6}\s+/g, '').replace(/<[^>]*>/g, '')
    .trim();
};

const buildRedirectionText = (redirection) => {
  return Object.entries(redirection)
    .filter(([k, v]) => v)
    .map(([k]) => k === 'no' ? 'no redirection to task' : `${k} redirection to task`)
    .join(', ');
};

const buildActivitySummaries = (activities, student) => {
  return activities.map((activity, actIdx) => {
    const actData = student.activitiesData[actIdx];
    if (!actData) return null;

    const domains = ['expressive', 'receptive', 'pragmatic'].filter(d => activity.domains[d]);
    const selectedGoals = actData.goals
      .map(gIdx => (studentGoalsData[student.name] || [])[gIdx]?.shortName)
      .filter(Boolean);

    const levelOrder = ['no', 'minimal', 'moderate', 'significant'];
    const promptingLevels = Object.entries(actData.promptingLevel).filter(([k, v]) => v).map(([k]) => k);
    let promptingLevelText = '';
    if (promptingLevels.length === 1) {
      promptingLevelText = promptingLevels[0];
    } else if (promptingLevels.length > 1) {
      const sorted = promptingLevels.sort((a, b) => levelOrder.indexOf(a) - levelOrder.indexOf(b));
      promptingLevelText = `${sorted[0]} to ${sorted[sorted.length - 1]}`;
    }

    const promptingTypes = Object.entries(actData.promptingType).filter(([k, v]) => v).map(([k]) => k);
    const redirectionText = buildRedirectionText(actData.redirection);
    const responses = Object.entries(actData.response).filter(([k, v]) => v).map(([k]) => k);

    let activityDescription = activity.name;
    if (activity.name === "Other" && activity.additionalInfo) {
      activityDescription = activity.additionalInfo;
    }
    if (activity.name === "Displayed appropriate pragmatic language skills while" && actData.pragmaticSkills?.length > 0) {
      const skillsList = actData.pragmaticSkills
        .map(skill => skill === "other" ? (actData.pragmaticSkillsOther || '') : skill)
        .filter(Boolean).join(', ');
      activityDescription = `Displayed appropriate pragmatic language skills (${skillsList}) while`;
    }

    return {
      activity: activityDescription,
      additionalInfo: activity.name === "Other" ? "" : activity.additionalInfo,
      domains: domains.length > 0 ? domains.join(', ') : 'not specified',
      goals: selectedGoals.length > 0 ? selectedGoals.join(', ') : 'general language skills',
      promptingLevel: promptingLevelText || 'not specified',
      promptingType: promptingTypes.length > 0 ? promptingTypes.join(', ') : '',
      redirection: redirectionText || '',
      response: responses.length > 0 ? responses.join(', ') : '',
      additionalNotes: actData.additionalNotes || '',
      individual: activity.individual || false
    };
  }).filter(a => a && a.activity);
};

const buildDraftPrompt = (student, activitySummaries, additionalContext) => {
  const pronoun = student.gender === 'he' ? 'he/him' : student.gender === 'she' ? 'she/her' : 'they/them';
  return `You are writing a professional SLP session note for ${student.name} (${pronoun}).

Session data:
${activitySummaries.map((a, idx) => {
  let activityDesc = a.additionalInfo ? `${a.activity} ${a.additionalInfo}` : a.activity;
  return `Activity ${idx + 1}: ${activityDesc}
   Language domains: ${a.domains}
   Goals addressed: ${a.goals}
   Prompting: ${a.promptingLevel} ${a.promptingType}
   Redirection: ${a.redirection}
   Student response: ${a.response}
   Additional notes: ${a.additionalNotes || 'none'}
   Individual session: ${a.individual ? 'yes (one-on-one with the provider)' : 'no'}`;
}).join('\n\n')}${additionalContext}

BEFORE WRITING:
1. Understand the selected activity.
2. Compare the selected activity to what is written in the additional details.
3. Synthesize - determine what the student actually did by combining your understanding of both.

Write a detailed, professional clinical narrative. You must explain the clinical significance of the activity itself in one sentence, woven naturally into the note. You must NOT add anything about the student beyond what is explicitly stated in the data. Do NOT invent specific details not provided.

If individual session is "yes": Do NOT announce that it was individual. Simply remove peer references and attribute directions/support to the provider only.

Make sure to:
- Describe what the student did
- Include the activity context
- Place prompting and redirection appropriately, using "given," immediately after what they apply to
- Include student response
- End with: "This session addressed [domains], targeting [goals]."

ABSOLUTE RULES:
- Use ${student.name}'s name at the start, then use ${pronoun} pronouns. Past tense throughout.
- CRITICAL: Prompting types are ALWAYS written as "[type] prompting." NEVER write "visual supports," "verbal cues," or any variation.
- When multiple prompting types share the same level, combine: "[level] verbal and visual prompting." NEVER list separately.
- Redirection is ALWAYS written exactly as given in the data (e.g., "occasional redirection to task"). Never shorten to just "redirection."
- Goals must be stated specifically using the actual goal names provided.
- Do not begin the note with "Note:" or any label. Begin directly with the student's name.`;
};

const buildReviewPrompt = (draftNote, pronoun) => `Review this clinical SLP session note and correct any problems.

Note: ${draftNote}

RULES:
1. Do NOT fabricate any information.
2. Structure: [Name] [what student did], while [activity], given [prompting]. [Response.] This session addressed [domains], targeting [goals].
3. Prompting goes immediately after the activity it applies to, using "given."
4. Use EXACT goal names — never vague phrases like "communication goals."
5. Pronouns: ${pronoun}. Past tense throughout.
6. Prompting types ALWAYS written as "[type] prompting." Never "visual supports," "verbal cues," etc.
7. Multiple prompting types at same level: "[level] verbal and visual prompting." Never listed separately.
8. Redirection must be written exactly as given (e.g., "occasional redirection to task"). Never just "redirection."
9. Do not repeat the same noun or phrase twice in the same sentence.
10. Do not begin with "Note:". Begin directly with the student's name.
11. Exactly one sentence of clinical significance about the activity.
12. Prompting levels joined by range: "minimal to moderate" not "minimal and moderate."

Return only the corrected note.`;

const buildStreamlinePrompt = (reviewedNote) => `Check this clinical SLP note for logic problems and fix them. Keep ALL clinical information.

Note: ${reviewedNote}

CHECK FOR:
1. Do the stated goals match what the student actually did?
2. Vague phrases like "increased other"? Replace with concrete descriptions.
3. Does every sentence make logical sense?
4. Prompting types written as "[type] prompting"? Fix any variation.
5. Multiple prompting types at same level combined into single phrase? Fix if separate.
6. Goals stated specifically? Fix any vague replacements.
7. Redirection written exactly as given (e.g., "occasional redirection to task")? Fix if shortened.
8. Repeated nouns/phrases within same sentence? Eliminate them.
9. Note begins with "Note:"? Remove the label.

Fix any problems. Do not remove clinical content. Return ONLY the corrected note with no explanation.`;

const callAPI = async (prompt) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error (${res.status}): ${errText.substring(0, 150)}`);
  }
  const data = await res.json();
  if (!data.content?.[0]?.text) throw new Error('Unexpected API response structure.');
  return cleanClaudeResponse(data.content[0].text);
};

const generateNoteForStudent = async (student, activities, additionalContext) => {
  const pronoun = student.gender === 'he' ? 'he/him' : student.gender === 'she' ? 'she/her' : 'they/them';
  const activitySummaries = buildActivitySummaries(activities, student);
  const draft = await callAPI(buildDraftPrompt(student, activitySummaries, additionalContext));
  const reviewed = await callAPI(buildReviewPrompt(draft, pronoun));
  const final = await callAPI(buildStreamlinePrompt(reviewed));
  return final;
};

const pragmaticSkillsOptions = [
  "attending to a performance (clapping at appropriate times, facing the stage)",
  "asking for help",
  "effectively interacting with members of the community",
  "expressing wants",
  "following social cues from peers and adults",
  "initiating social greetings appropriately",
  "responding to social greetings appropriately",
  "using appropriate volume for the setting",
  "waiting for their turn to speak",
  "other"
];

const availableActivities = [
  "Watched the 811X Dragon news and answered WH questions about it",
  "Watched the 811X Dragon news and completed a corresponding, provider created, differentiated worksheet",
  "Wrote the script for next week's news",
  "Researched/created visuals for an upcoming news segment",
  "Worked together as a class to choose the next news segment they plan to create",
  "Filmed for a news segment: gave directions (i.e., quiet on set, roll tape, action, cut)",
  "Filmed for a news segment: responded to directions given by staff and peers (i.e., quiet on set, roll tape, action, cut)",
  "Wrote the script for an upcoming segment",
  "Completed journal entries for collaborative teacher. Glued in a picture illustrating today's National Day and wrote or traced a self-generated comment about it.",
  "Displayed appropriate pragmatic language skills while",
  "Other"
];

export default function JoanneSESISNoteGenerator() {
  const [date, setDate] = useState('');
  const [activities, setActivities] = useState([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false }, individual: false }]);
  const [students, setStudents] = useState([]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState([0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [regeneratingNoteIndex, setRegeneratingNoteIndex] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');

  React.useEffect(() => {
    const loadData = async () => {
      try {
        const result = await window.storage.get('joanne-session-data');
        if (result?.value) {
          const data = JSON.parse(result.value);
          if (data.date) setDate(data.date);
          if (data.activities) setActivities(data.activities);
          if (data.students) setStudents(data.students);
          if (data.expandedStudents) setExpandedStudents(data.expandedStudents);
        }
      } catch (error) {
        console.log('No saved data');
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  React.useEffect(() => {
    if (!isLoaded) return;
    const timeoutId = setTimeout(async () => {
      try {
        await window.storage.set('joanne-session-data', JSON.stringify({ date, activities, students, expandedStudents }));
      } catch (error) {
        console.error('Save failed:', error);
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [date, activities, students, expandedStudents, isLoaded]);

  React.useEffect(() => {
    if (date && students.length > 0) {
      setStudents(prev => prev.map(student => ({
        ...student,
        sessionTime: student.name ? getSessionTime(student.name, date) : ''
      })));
    }
  }, [date]);

  const emptyActivityData = () => ({
    goals: [],
    promptingLevel: { no: false, minimal: false, moderate: false, significant: false, 'one to one para support': false },
    promptingType: { verbal: false, visual: false, tactile: false },
    redirection: { no: false, regular: false, occasional: false, continuous: false },
    response: { enthusiastic: false, engaged: false, alert: false, disregulated: false, unengaged: false, tired: false, distracted: false },
    pragmaticSkills: [],
    pragmaticSkillsOther: '',
    additionalNotes: ''
  });

  const handleClearAllData = () => {
    window.storage.delete('joanne-session-data').catch(err => console.error(err));
    setDate('');
    setActivities([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
    setStudents([]);
    setGeneratedNotes([]);
    setExpandedStudents([0]);
    setShowClearConfirmation(false);
  };

  const addActivity = () => {
    setActivities(prev => [...prev, { name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false }, individual: false }]);
    setStudents(prev => prev.map(s => ({ ...s, activitiesData: [...s.activitiesData, emptyActivityData()] })));
  };

  const updateActivity = (index, field, value) => {
    setActivities(prev => {
      const next = [...prev];
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        next[index] = { ...next[index], [parent]: { ...next[index][parent], [child]: value } };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const removeActivity = (index) => {
    setActivities(prev => prev.filter((_, i) => i !== index));
    setStudents(prev => prev.map(s => ({ ...s, activitiesData: s.activitiesData.filter((_, i) => i !== index) })));
  };

  const addStudent = () => {
    setStudents(prev => [...prev, {
      name: '', gender: 'he', sessionTime: '', aacDevice: '', needsBengali: false, bengaliUsed: false, bengaliDetails: '', absent: false,
      activitiesData: activities.map(() => emptyActivityData())
    }]);
    setExpandedStudents(prev => [...prev, students.length]);
  };

  const updateStudent = (index, field, value) => {
    setStudents(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'name' && value) {
        const saved = savedStudents.find(s => s.name.toLowerCase() === value.trim().toLowerCase());
        if (saved) {
          next[index] = {
            ...next[index],
            name: saved.name,
            gender: saved.gender,
            aacDevice: saved.aacDevice,
            needsBengali: saved.needsBengali,
            bengaliUsed: false,
            bengaliDetails: '',
            sessionTime: getSessionTime(saved.name, date) || ''
          };
        }
      }
      return next;
    });
  };

  const updateStudentActivityData = (sIdx, aIdx, field, value) => {
    setStudents(prev => {
      const next = [...prev];
      const newActData = [...next[sIdx].activitiesData];
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        newActData[aIdx] = { ...newActData[aIdx], [parent]: { ...newActData[aIdx][parent], [child]: value } };
      } else {
        newActData[aIdx] = { ...newActData[aIdx], [field]: value };
      }
      next[sIdx] = { ...next[sIdx], activitiesData: newActData };
      return next;
    });
  };

  const toggleGoal = (sIdx, aIdx, goalIdx) => {
    setStudents(prev => {
      const next = [...prev];
      const goals = next[sIdx].activitiesData[aIdx].goals;
      const newGoals = goals.includes(goalIdx) ? goals.filter(g => g !== goalIdx) : [...goals, goalIdx];
      const newActData = [...next[sIdx].activitiesData];
      newActData[aIdx] = { ...newActData[aIdx], goals: newGoals };
      next[sIdx] = { ...next[sIdx], activitiesData: newActData };
      return next;
    });
  };

  const togglePragmaticSkill = (sIdx, aIdx, skill) => {
    setStudents(prev => {
      const next = [...prev];
      const skills = next[sIdx].activitiesData[aIdx].pragmaticSkills;
      const newSkills = skills.includes(skill) ? skills.filter(s => s !== skill) : [...skills, skill];
      const newActData = [...next[sIdx].activitiesData];
      newActData[aIdx] = { ...newActData[aIdx], pragmaticSkills: newSkills };
      next[sIdx] = { ...next[sIdx], activitiesData: newActData };
      return next;
    });
  };

  const removeStudent = (index) => {
    setStudents(prev => prev.filter((_, i) => i !== index));
  };

  const copyToClipboard = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
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

      let additionalContext = '';
      if (student.needsBengali && student.bengaliUsed) {
        additionalContext = `\nBengali language support: ${student.bengaliDetails || 'Bengali translations were provided when needed'}`;
      }

      try {
        const finalNote = await generateNoteForStudent(student, activities, additionalContext);
        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote });
      } catch (error) {
        console.error('Error generating note for', student.name, error);
        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: `Error: ${error.message}` });
      }
    }

    const nameOrder = ["Anasur", "Dominic", "Joshua", "Arianna", "Alyenison", "Pedro"];
    notes.sort((a, b) => {
      const iA = nameOrder.indexOf(a.name), iB = nameOrder.indexOf(b.name);
      if (iA === -1 && iB === -1) return 0;
      if (iA === -1) return 1;
      if (iB === -1) return -1;
      return iA - iB;
    });

    if (notes.length > 0 && date) {
      const d = new Date(date + 'T00:00:00');
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      notes[0].formattedDate = `${dayNames[d.getDay()]}, ${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getFullYear()).slice(-2)}`;
    }

    setGeneratedNotes(notes);
    setIsGenerating(false);
  };

  const regenerateNoteWithFeedback = async (noteIndex) => {
    const note = generatedNotes[noteIndex];
    const student = students.find(s => s.name === note.name);
    if (!student) return;
    setRegeneratingNoteIndex(noteIndex);

    let additionalContext = '';
    if (student.needsBengali && student.bengaliUsed) {
      additionalContext = `\nBengali language support: ${student.bengaliDetails || 'Bengali translations were provided when needed'}`;
    }

    try {
      const pronoun = student.gender === 'he' ? 'he/him' : student.gender === 'she' ? 'she/her' : 'they/them';
      const activitySummaries = buildActivitySummaries(activities, student);
      const draftPrompt = buildDraftPrompt(student, activitySummaries, additionalContext);
      const feedbackDraftPrompt = `USER FEEDBACK ON PREVIOUS VERSION: ${feedbackText}\n\n${draftPrompt}`;
      const draft = await callAPI(feedbackDraftPrompt);
      const reviewed = await callAPI(buildReviewPrompt(draft, pronoun));
      const final = await callAPI(buildStreamlinePrompt(reviewed));

      setGeneratedNotes(prev => {
        const next = [...prev];
        next[noteIndex] = { ...next[noteIndex], finalNote: final };
        return next;
      });
      setFeedbackText('');
    } catch (error) {
      console.error('Error regenerating note:', error);
    } finally {
      setRegeneratingNoteIndex(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Joanne - SESIS Note Generator</h1>
            <button onClick={() => setShowClearConfirmation(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors">
              <Trash2 size={16} /> Clear All Data
            </button>
          </div>
        </div>

        {showClearConfirmation && (
          <div className="bg-red-50 border-2 border-red-500 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-red-800 mb-2">⚠️ Clear All Data?</h2>
            <p className="text-red-700 mb-4">This will delete all session data, activities, students, and generated notes. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={handleClearAllData} className="px-6 py-2 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700">Yes, Delete Everything</button>
              <button onClick={() => setShowClearConfirmation(false)} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-md font-semibold hover:bg-gray-400">Cancel</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Session Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Activities</h2>
          {activities.map((activity, idx) => (
            <div key={idx} className="mb-4 p-4 border rounded-lg">
              {activities.length > 1 && (
                <button onClick={() => removeActivity(idx)} className="float-right px-2 py-1 bg-red-500 text-white rounded"><X size={16} /></button>
              )}
              <select value={activity.name} onChange={e => updateActivity(idx, 'name', e.target.value)} className="w-full px-3 py-2 border rounded-md mb-2">
                <option value="">Select activity...</option>
                {availableActivities.map((name, i) => <option key={i} value={name}>{name}</option>)}
              </select>
              <textarea value={activity.additionalInfo} onChange={e => updateActivity(idx, 'additionalInfo', e.target.value)} placeholder="Additional info..." rows="2" className="w-full px-3 py-2 border rounded-md mb-2" />
              <div className="grid grid-cols-4 gap-2">
                {['expressive', 'receptive', 'pragmatic'].map(d => (
                  <label key={d} className="flex items-center gap-2 capitalize">
                    <input type="checkbox" checked={activity.domains[d]} onChange={e => updateActivity(idx, `domains.${d}`, e.target.checked)} /> {d}
                  </label>
                ))}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={activity.individual} onChange={e => updateActivity(idx, 'individual', e.target.checked)} /> Individual
                </label>
              </div>
            </div>
          ))}
          <button onClick={addActivity} className="px-4 py-2 bg-blue-600 text-white rounded-md"><Plus size={16} className="inline mr-1" /> Add Activity</button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Students</h2>
          {students.map((student, sIdx) => (
            <div key={sIdx} className="mb-4 border rounded-lg">
              <div className="bg-gray-50 p-4 flex justify-between cursor-pointer" onClick={() => setExpandedStudents(prev => prev.includes(sIdx) ? prev.filter(i => i !== sIdx) : [...prev, sIdx])}>
                <h3 className="font-semibold">{student.name || `Student ${sIdx + 1}`}</h3>
                {expandedStudents.includes(sIdx) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>

              {expandedStudents.includes(sIdx) && (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Student Name</label>
                      <input type="text" value={student.name} onChange={e => updateStudent(sIdx, 'name', e.target.value)} className="w-full px-3 py-2 border rounded-md" list="students-list" />
                      <datalist id="students-list">
                        {Object.keys(studentGoalsData).map((name, i) => <option key={i} value={name} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Pronouns</label>
                      <select value={student.gender} onChange={e => updateStudent(sIdx, 'gender', e.target.value)} className="w-full px-3 py-2 border rounded-md">
                        <option value="he">He/Him</option>
                        <option value="she">She/Her</option>
                        <option value="they">They/Them</option>
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Session Time</label>
                    <input type="text" value={student.sessionTime || ''} onChange={e => updateStudent(sIdx, 'sessionTime', e.target.value)} placeholder="e.g., 10:00-10:30" className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>

                  {student.aacDevice && <p className="text-sm text-gray-600 mb-2">AAC: {student.aacDevice}</p>}

                  {student.needsBengali && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.bengaliUsed || false} onChange={e => updateStudent(sIdx, 'bengaliUsed', e.target.checked)} />
                        <span className="text-sm font-medium">Bengali translations provided when needed</span>
                      </label>
                      {student.bengaliUsed && (
                        <textarea value={student.bengaliDetails || ''} onChange={e => updateStudent(sIdx, 'bengaliDetails', e.target.value)} placeholder="Describe Bengali support provided..." rows="2" className="w-full px-2 py-1 border rounded text-xs mt-2" />
                      )}
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={student.absent || false} onChange={e => updateStudent(sIdx, 'absent', e.target.checked)} />
                      <span className="text-sm font-medium">Student was absent</span>
                    </label>
                  </div>

                  {!student.absent && activities.map((activity, aIdx) => (
                    <div key={aIdx} className="mb-4 p-3 bg-gray-50 rounded border">
                      <h4 className="font-semibold text-sm mb-2">{activity.name || `Activity ${aIdx + 1}`}</h4>

                      {activity.name === "Displayed appropriate pragmatic language skills while" && (
                        <div className="mb-2 p-2 bg-blue-50 rounded border">
                          <label className="block text-xs font-medium mb-1">Pragmatic skills displayed:</label>
                          <div className="space-y-1">
                            {pragmaticSkillsOptions.map((skill, skillIdx) => (
                              <label key={skillIdx} className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={student.activitiesData[aIdx].pragmaticSkills.includes(skill)} onChange={() => togglePragmaticSkill(sIdx, aIdx, skill)} />
                                {skill}
                              </label>
                            ))}
                          </div>
                          {student.activitiesData[aIdx].pragmaticSkills.includes("other") && (
                            <input type="text" value={student.activitiesData[aIdx].pragmaticSkillsOther} onChange={e => updateStudentActivityData(sIdx, aIdx, 'pragmaticSkillsOther', e.target.value)} placeholder="Specify other skill..." className="w-full px-2 py-1 border rounded text-xs mt-2" />
                          )}
                        </div>
                      )}

                      <div className="mb-2">
                        <label className="block text-xs font-medium mb-1">Goals</label>
                        {(studentGoalsData[student.name] || []).map((goal, gIdx) => (
                          <label key={gIdx} className="flex items-start gap-2 text-xs mb-1">
                            <input type="checkbox" checked={student.activitiesData[aIdx].goals.includes(gIdx)} onChange={() => toggleGoal(sIdx, aIdx, gIdx)} className="mt-1" />
                            <span>{goal.shortName}</span>
                          </label>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-xs font-medium mb-1">Prompting Level</label>
                          {['no', 'minimal', 'moderate', 'significant', 'one to one para support'].map(level => (
                            <label key={level} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={student.activitiesData[aIdx].promptingLevel[level]} onChange={e => updateStudentActivityData(sIdx, aIdx, `promptingLevel.${level}`, e.target.checked)} />
                              {level}
                            </label>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Prompting Type</label>
                          {['verbal', 'visual', 'tactile'].map(type => (
                            <label key={type} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={student.activitiesData[aIdx].promptingType[type]} onChange={e => updateStudentActivityData(sIdx, aIdx, `promptingType.${type}`, e.target.checked)} />
                              {type}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-xs font-medium mb-1">Redirection</label>
                          {['no', 'occasional', 'regular', 'continuous'].map(level => (
                            <label key={level} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={student.activitiesData[aIdx].redirection[level]} onChange={e => updateStudentActivityData(sIdx, aIdx, `redirection.${level}`, e.target.checked)} />
                              {level === 'no' ? 'no redirection to task' : `${level} redirection to task`}
                            </label>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Response</label>
                          {['enthusiastic', 'engaged', 'alert', 'disregulated', 'unengaged', 'tired', 'distracted'].map(resp => (
                            <label key={resp} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={student.activitiesData[aIdx].response[resp]} onChange={e => updateStudentActivityData(sIdx, aIdx, `response.${resp}`, e.target.checked)} />
                              {resp}
                            </label>
                          ))}
                        </div>
                      </div>

                      <textarea value={student.activitiesData[aIdx].additionalNotes} onChange={e => updateStudentActivityData(sIdx, aIdx, 'additionalNotes', e.target.value)} placeholder="Additional notes..." rows="2" className="w-full px-2 py-1 border rounded text-xs" />
                    </div>
                  ))}

                  <button onClick={() => removeStudent(sIdx)} className="text-sm text-red-600 underline mt-2">Remove Student</button>
                </div>
              )}
            </div>
          ))}
          <button onClick={addStudent} className="px-4 py-2 bg-blue-600 text-white rounded-md"><Plus size={16} className="inline mr-1" /> Add Student</button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <button onClick={generateNotes} disabled={isGenerating} className="w-full px-6 py-3 bg-green-600 text-white rounded-md text-lg font-semibold disabled:bg-gray-400">
            {isGenerating ? <><Loader2 size={20} className="inline animate-spin mr-2" /> Generating...</> : <><FileText size={20} className="inline mr-2" /> Generate Notes</>}
          </button>
        </div>

        {generatedNotes.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-semibold">Generated Notes</h2>
              <button onClick={() => copyToClipboard(generatedNotes.map(n => `${n.formattedDate ? n.formattedDate + '\n\n' : ''}${n.sessionTime ? n.sessionTime + '\n' : ''}${n.name}:\n${n.finalNote}\n`).join('\n'))} className="px-3 py-1 bg-green-600 text-white rounded text-sm">
                <Copy size={14} className="inline mr-1" /> Copy All Notes
              </button>
            </div>
            {generatedNotes.map((note, idx) => (
              <div key={idx} className="mb-6 border-t pt-4">
                {note.formattedDate && <p className="text-sm font-semibold text-blue-600 mb-1">{note.formattedDate}</p>}
                {note.sessionTime && <p className="text-sm font-semibold text-gray-600 mb-1">{note.sessionTime}</p>}
                <h3 className="font-semibold mb-2">{note.name}</h3>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Final Note</span>
                    <button onClick={() => copyToClipboard(`${note.formattedDate ? note.formattedDate + '\n\n' : ''}${note.sessionTime ? note.sessionTime + '\n' : ''}${note.name}:\n${note.finalNote}`)} className="px-2 py-1 bg-gray-500 text-white rounded text-xs"><Copy size={12} /></button>
                  </div>
                  <p className="text-sm bg-green-50 p-3 rounded border">{note.finalNote}</p>
                </div>
                <div className="mt-3">
                  <textarea value={regeneratingNoteIndex === idx ? feedbackText : feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="Feedback for regeneration..." rows="2" className="w-full px-2 py-1 border rounded text-xs mb-2" />
                  <button onClick={() => regenerateNoteWithFeedback(idx)} disabled={regeneratingNoteIndex === idx} className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:bg-gray-400">
                    {regeneratingNoteIndex === idx ? <><Loader2 size={12} className="inline animate-spin mr-1" /> Regenerating...</> : 'Regenerate with Feedback'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}