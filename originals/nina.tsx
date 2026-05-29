import React, { useState, useEffect } from 'react';
import { Plus, X, FileText, Loader2, Copy, ChevronDown, ChevronUp, Save, AlertCircle } from 'lucide-react';

// Nina Z21 - Student Goals Data
const studentGoalsData = {
  "Romer": [
    { longTerm: "Romer will verbally answer questions when presented with a field of two choices (e.g., \"Do you want apple or banana?\") by pointing to or naming his selection.", shortName: "Verbal answers, field of 2 choices" }
  ],
  "Leslie Ann": [
    { longTerm: "Leslie will listen to a short story, presentation or reading passage and answer 5 related questions.", shortName: "answer questions" },
    { longTerm: "Leslie will independently describe 5 similarities between any two characters from a story she reads or real-life.", shortName: "describe similarities" },
    { longTerm: "Leslie will increase (MLU) Mean Length of Utterance by producing 2-3 word utterances in sentences during an interactions/ staying on task with staff and peers when presented with speech materials, current event digitally or in print.", shortName: "MLU 2-3" }
  ],
  "Arlis": [
    { longTerm: "Arlis will independently take appropriate size bite and swallow after each bite.", shortName: "feeding" },
    { longTerm: "Arlis will independently ask for help or clarification when needed, using preferred mode of communication (gestures, pointing, vocalizations).", shortName: "ask for help" }
  ],
  "Wildele": [
    { longTerm: "Wildele will follow 1-3 step directions with no more than one repetition of directions.", shortName: "follow directions" },
    { longTerm: "Given a familiar classroom or therapy routine, Wildele will independently initiate a request for a needed item (e.g., pencil, help, break) using a verbal utterance, gesture, or picture symbol in 3 out of 5 opportunities across 3 consecutive sessions, as measured by clinician data and observation, in order to increase independence and self-advocacy across environments.", shortName: "initiate requests" }
  ],
  "Marbella": [
    { longTerm: "Marbella will sequence 5 steps to complete an activity of daily living by placing 5 picture cards in the correct order given 1 verbal prompt.", shortName: "Sequencing" },
    { longTerm: "Marbella will follow a visual schedule to complete 5 vocational tasks given 1 verbal and 1 visual prompt.", shortName: "Follow a visual schedule" },
    { longTerm: "Marbella will follow a 2-step verbal direction 3 times per day given 1 visual prompt.", shortName: "follow directions" },
    { longTerm: "Marbella will initiate or respond to communicative exchanges with familiar adults or peers by using 1–3-word utterances across settings to express her needs, wants, or ideas, with minimal verbal or gestural prompting.", shortName: "MLU 1-3; express wants, need, ideas" }
  ],
  "Fernando": [
    { longTerm: "Fernando will expand his length of utterance from one word to up to four words when speaking after being asked questions orally.", shortName: "MLU 1-4" },
    { longTerm: "Fernando will demonstrate self-advocacy skills as related to his visual impairment by explaining to classroom staff when it is hard for him to see something and asking to move closer or to make something bigger, with no more than 1 verbal prompt from adult/classroom staff.", shortName: "self advocacy" },
    { longTerm: "Fernando will use his preferred method of communication to answer simple wh-questions (who, what, where) during both structured and unstructured social and academic interactions", shortName: "WH questions" }
  ],
  "Aiden": [
    { longTerm: "Aiden will use multimodal communication (e.g., his dynamic display speech generating device, gestures, verbal approximations, gestures, communication boards) to initiate/terminate interactions, make a comment, and answer a question given (1) verbal or visual prompt.", shortName: "initiate, terminate, comment, answer; device use" },
    { longTerm: "Given a real life picture cards (enter, exit, stop, go, walk, don't walk) of safety signs and symbols within the community, Aiden will identify and describe what each symbol represents given three verbal and visual cues.", shortName: "identify functional pictures" },
    { longTerm: "Aiden will answer 4 \"wh\" questions about characters in the short story that is read in class given three verbal and visual cues.", shortName: "WH questions" }
  ],
  "Kaily": [
    { longTerm: "Kaily will follow 3-step verbal directions with one repetition of directions, given 1 visual prompt.", shortName: "3 step directions" },
    { longTerm: "Kaily will independently ask for help using total communication (e.g., speaking, signing, etc.) in at least three different settings, with minimal prompting, in 4 out of 5 opportunities.", shortName: "ask for help" }
  ],
  "Namiyah": [
    { longTerm: "When her verbal message is not understood, Namiyah will use her dynamic display AAC device to repair the breakdown with minimal prompting in 4 out of 5 opportunities across three consecutive sessions.", shortName: "communication breakdown" },
    { longTerm: "During classroom-based group activities, Namiyah will use total communication (speech, AAC, or gestures) to engage with peers at least three times within a 30-minute session in 4 out of 5 sessions.", shortName: "engage in classroom activities" }
  ],
  "Dhaneshwar": [
    { longTerm: "Dhaneshwar will make the connection between fingerspelled words, written words, and the sign utilizing flashcards and pictures.", shortName: "Connection between sign and writing" },
    { longTerm: "Dhaneshwar will write out simple short sentences related to the lesson.", shortName: "Write sentences" },
    { longTerm: "Dhaneshwar will complete one structured 3-step assembly/packaging task 5 times using visual directions and a sample model with verbal prompting.", shortName: "3 step directions" },
    { longTerm: "Given one verbal prompt, Dhaneshwar will sequence five steps during a cooking activity by placing five picture cards correctly and following a recipe over three consecutive trials.", shortName: "Sequencing" },
    { longTerm: "Dhaneshwar will use his PMS (e.g., sign language, his SGD, gesture, speech) to ask for help when he is confused, unable to complete a task independently, or when he needs directions to be clarified.", shortName: "ask for help" }
  ],
  "Leudy": [
    { longTerm: "Leudy will use his communication device to write personal information: first and last name and date of birth and age upon request.", shortName: "use communication device" },
    { longTerm: "Leudy will improve expressive communication by using functional vocabulary and sentence structure (spoken words, gestures, and/or picture symbols) to request, respond to WH-questions, and participate in structured classroom and therapy activities.", shortName: "functional vocabulary to request, respond to WH questions, & participate" }
  ],
  "Valentina": [
    { longTerm: "Valentina will answer wh-questions during structured and unstructured activities given fading prompts with 80% accuracy in 8 out of 10 opportunities.", shortName: "answer WH questions" },
    { longTerm: "Valentina will independently identify, select, and implement positive coping and self-regulation strategies (e.g., grounding techniques, relaxation skills, or pain management strategies) in response to emotional or physical discomfort in 4 out of 5 opportunities with 75% accuracy.", shortName: "coping and self-regulation strategies" },
    { longTerm: "In a quiet setting, Valentina will demonstrate improved auditory memory skills by following directions with 2 critical elements, with a variety of syntactic structures and linguistic concepts in 4 out of 5 trials with 80% accuracy.", shortName: "follow 2-element directions" }
  ]
};

const savedStudents = [
  { name: "Romer", gender: "he", aacDevice: "", needsSpanish: false, journalMethod: "traced" },
  { name: "Leslie Ann", gender: "she", aacDevice: "", needsSpanish: false, journalMethod: "wrote" },
  { name: "Arlis", gender: "he", aacDevice: "", needsSpanish: true, journalMethod: "traced" },
  { name: "Wildele", gender: "he", aacDevice: "", needsSpanish: true, journalMethod: "traced" },
  { name: "Marbella", gender: "she", aacDevice: "", needsSpanish: true, journalMethod: "wrote" },
  { name: "Fernando", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsSpanish: false, journalMethod: "wrote" },
  { name: "Aiden", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsSpanish: false, journalMethod: "traced" },
  { name: "Dhaneshwar", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsSpanish: false, journalMethod: "wrote" },
  { name: "Kaily", gender: "she", aacDevice: "", needsSpanish: false, journalMethod: "traced" },
  { name: "Namiyah", gender: "she", aacDevice: "", needsSpanish: false, journalMethod: "wrote" },
  { name: "Leudy", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)", needsSpanish: true, journalMethod: "pasted in" },
  { name: "Valentina", gender: "she", aacDevice: "", needsSpanish: false, journalMethod: "wrote" }
];

// Schedule data: day of week -> time slot -> students
const scheduleData = {
  "Monday": {
    "11:02-11:32": ["Aiden", "Dhaneshwar"],
    "11:33-12:03": ["Kaily", "Namiyah", "Leudy"]
  },
  "Wednesday": {
    "10:00-10:30": ["Romer", "Leslie Ann", "Arlis"],
    "10:31-11:01": ["Wildele", "Marbella", "Fernando"],
    "11:02-11:32": ["Valentina"]
  },
  "Friday": {
    "10:00-10:30": ["Romer", "Leslie Ann", "Arlis"],
    "10:31-11:01": ["Wildele", "Marbella", "Fernando"],
    "11:02-11:32": ["Aiden", "Dhaneshwar", "Valentina"],
    "11:33-12:03": ["Kaily", "Namiyah"],
    "12:04-12:34": ["Leudy"]
  }
};

// Helper function to get session time for a student on a given date
const getSessionTime = (studentName, dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString + 'T00:00:00');
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const actualDayOfWeek = dayNames[date.getDay()];
  
  // Use Monday schedule only for Leudy on Mondays, otherwise use Friday schedule
  const dayOfWeek = (studentName === "Leudy" && actualDayOfWeek === "Monday") ? "Monday" : "Friday";
  
  if (!scheduleData[dayOfWeek]) return '';
  
  for (const [timeSlot, students] of Object.entries(scheduleData[dayOfWeek])) {
    if (students.includes(studentName)) {
      return timeSlot;
    }
  }
  
  return '';
};

// Format prompting levels — two checked levels become a range (e.g. "moderate to significant")
const formatPromptingLevel = (levels) => {
  const ordered = ['no', 'minimal', 'moderate', 'significant'];
  const checked = ordered.filter(l => levels.includes(l));
  const paraSupport = levels.includes('one to one para support');
  let levelStr = checked.length === 2 ? `${checked[0]} to ${checked[1]}` : checked.join(', ');
  if (paraSupport) return levelStr ? `${levelStr}, one to one para support` : 'one to one para support';
  return levelStr;
};

// Helper function to clean Claude API responses
const cleanClaudeResponse = (text) => {
  if (!text) return '';
  
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/#{1,6}\s+/g, '');
  cleaned = cleaned.trim();
  
  return cleaned;
};

export default function NinaSESISNoteGenerator() {
  const [date, setDate] = useState('');
  const [activities, setActivities] = useState([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
  const [students, setStudents] = useState([]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState([0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const availableActivities = [
    "Watched the 811X Dragon news and answered WH questions about it",
    "Watched the 811X Dragon news and completed a corresponding, provider created, differentiated worksheet",
    "Wrote the script for next week's news",
    "Researched/created visuals for upcoming news segments",
    "Worked together as a class to choose the next news segment they plan to create",
    "Filmed for a news segment: gave directions (i.e., quiet on set, roll tape, action, cut)",
    "Filmed for a news segment: responded to directions given by staff and peers (i.e., quiet on set, roll tape, action, cut)",
    "Wrote the script for an upcoming segment",
    "Completed a journal entry for collaborative teacher. Glued in a picture illustrating today's National Day and wrote or traced a comment about it.",
    "Displayed appropriate pragmatic language skills while",
    "Other"
  ];

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await window.storage.get('nina-session-data');
        if (result?.value) {
          const data = JSON.parse(result.value);
          if (data.date) setDate(data.date);
          if (data.activities) setActivities(data.activities);
          if (data.students) setStudents(data.students);
          if (data.expandedStudents) setExpandedStudents(data.expandedStudents);
        }
      } catch (err) {
        console.log('Load failed:', err);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (date || activities.some(a => a.name) || students.length > 0) {
        try {
          await window.storage.set('nina-session-data', JSON.stringify({
            date,
            activities,
            students,
            expandedStudents
          }));
        } catch (err) {
          console.log('Save failed:', err);
        }
      }
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [date, activities, students, expandedStudents]);

  // Update all student session times when date changes
  useEffect(() => {
    if (date && students.length > 0) {
      const updatedStudents = students.map(student => ({
        ...student,
        sessionTime: student.name ? getSessionTime(student.name, date) : ''
      }));
      setStudents(updatedStudents);
    }
  }, [date]);

  const addActivity = () => {
    setActivities([...activities, { name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
    
    if (students.length > 0) {
      const updatedStudents = students.map(student => ({
        ...student,
        activitiesData: [...student.activitiesData, {
          goals: [],
          promptingLevel: { no: false, minimal: false, moderate: false, significant: false, 'one to one para support': false },
          promptingType: { verbal: false, visual: false, tactile: false },
          redirection: { no: false, regular: false, occasional: false, continuous: false },
          response: { enthusiastic: false, engaged: false, alert: false, disregulated: false, unengaged: false, tired: false, distracted: false },
          pragmaticSkills: [],
          pragmaticSkillsOther: '',
          additionalNotes: ''
        }]
      }));
      setStudents(updatedStudents);
    }
  };

  const updateActivity = (index, field, value) => {
    const newActivities = [...activities];
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      newActivities[index][parent][child] = value;
    } else {
      newActivities[index][field] = value;
    }
    setActivities(newActivities);
  };

  const removeActivity = (index) => {
    setActivities(activities.filter((_, i) => i !== index));
    
    if (students.length > 0) {
      const updatedStudents = students.map(student => ({
        ...student,
        activitiesData: student.activitiesData.filter((_, i) => i !== index)
      }));
      setStudents(updatedStudents);
    }
  };

  const addStudent = () => {
    setStudents([...students, {
      name: '', gender: 'he', sessionTime: '', aacDevice: '', needsSpanish: false, absent: false,
      activitiesData: activities.map(() => ({
        goals: [],
        promptingLevel: { no: false, minimal: false, moderate: false, significant: false, 'one to one para support': false },
        promptingType: { verbal: false, visual: false, tactile: false },
        redirection: { no: false, regular: false, occasional: false, continuous: false },
        response: { enthusiastic: false, engaged: false, alert: false, disregulated: false, unengaged: false, tired: false, distracted: false },
        pragmaticSkills: [],
        pragmaticSkillsOther: '',
        additionalNotes: ''
      }))
    }]);
    setExpandedStudents([...expandedStudents, students.length]);
  };

  const updateStudent = (index, field, value) => {
    const newStudents = [...students];
    newStudents[index][field] = value;
    
    if (field === 'name' && value) {
      const trimmedValue = value.trim();
      const saved = savedStudents.find(s => s.name.toLowerCase() === trimmedValue.toLowerCase());
      if (saved) {
        newStudents[index].name = saved.name;
        newStudents[index].gender = saved.gender;
        newStudents[index].aacDevice = saved.aacDevice;
        newStudents[index].needsSpanish = saved.needsSpanish;
        const sessionTime = getSessionTime(saved.name, date);
        newStudents[index].sessionTime = sessionTime || '';
      }
    }
    setStudents(newStudents);
  };

  const updateStudentActivityData = (sIdx, aIdx, field, value) => {
    const newStudents = [...students];
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      newStudents[sIdx].activitiesData[aIdx][parent][child] = value;
    } else {
      newStudents[sIdx].activitiesData[aIdx][field] = value;
    }
    setStudents(newStudents);
  };

  const toggleGoal = (sIdx, aIdx, goalIdx) => {
    const newStudents = [...students];
    const goals = newStudents[sIdx].activitiesData[aIdx].goals;
    if (goals.includes(goalIdx)) {
      newStudents[sIdx].activitiesData[aIdx].goals = goals.filter(g => g !== goalIdx);
    } else {
      newStudents[sIdx].activitiesData[aIdx].goals = [...goals, goalIdx];
    }
    setStudents(newStudents);
  };

  const togglePragmaticSkill = (sIdx, aIdx, skill) => {
    const newStudents = [...students];
    const skills = newStudents[sIdx].activitiesData[aIdx].pragmaticSkills;
    if (skills.includes(skill)) {
      newStudents[sIdx].activitiesData[aIdx].pragmaticSkills = skills.filter(s => s !== skill);
    } else {
      newStudents[sIdx].activitiesData[aIdx].pragmaticSkills = [...skills, skill];
    }
    setStudents(newStudents);
  };

  const removeStudent = (index) => {
    setStudents(students.filter((_, i) => i !== index));
  };

  const copyToClipboard = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const clearAllData = async () => {
    try {
      await window.storage.delete('nina-session-data');
    } catch (err) {
      console.log('Delete failed:', err);
    }
    setDate('');
    setActivities([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
    setStudents([]);
    setGeneratedNotes([]);
    setExpandedStudents([0]);
    setError('');
    setShowClearConfirm(false);
  };

  const generateNotes = async () => {
    setIsGenerating(true);
    setError('');
    setGeneratedNotes([]);
    const notes = [];

    try {
      for (const student of students) {
        if (!student.name) continue;

        // If student is marked absent, create simple absent note
        if (student.absent) {
          notes.push({ 
            name: student.name, 
            sessionTime: student.sessionTime, 
            finalNote: "absent" 
          });
          continue;
        }

        const activitySummaries = activities.map((activity, actIdx) => {
          const actData = student.activitiesData[actIdx];
          const domains = [];
          if (activity.domains.expressive) domains.push('expressive');
          if (activity.domains.receptive) domains.push('receptive');
          if (activity.domains.pragmatic) domains.push('pragmatic');

          const selectedGoals = actData.goals.map(gIdx => (studentGoalsData[student.name] || [])[gIdx]?.shortName).filter(Boolean);
          const promptingLevels = Object.entries(actData.promptingLevel).filter(([k, v]) => v).map(([k]) => k);
          const promptingTypes = Object.entries(actData.promptingType).filter(([k, v]) => v).map(([k]) => k);
          const redirections = Object.entries(actData.redirection).filter(([k, v]) => v).map(([k]) => k === 'no' ? 'no redirection' : `${k} redirection to task`);
          const responses = Object.entries(actData.response).filter(([k, v]) => v).map(([k]) => k);

          // Build activity description with pragmatic skills if applicable
          let activityDescription = activity.name;
          if (activity.name.startsWith("Completed a journal entry") && student.journalMethod) {
            activityDescription = `Completed a journal entry during a lesson led by the collaborative teacher, with SLP support. Glued in a picture illustrating today's National Day and ${student.journalMethod} a comment about it.`;
          } else if (activity.name === "Displayed appropriate pragmatic language skills while" && actData.pragmaticSkills && actData.pragmaticSkills.length > 0) {
            const skillsList = actData.pragmaticSkills.map(skill => {
              if (skill === "other" && actData.pragmaticSkillsOther) {
                return actData.pragmaticSkillsOther;
              }
              return skill === "other" ? "" : skill;
            }).filter(Boolean).join(', ');
            activityDescription = `Displayed appropriate pragmatic language skills (${skillsList}) while`;
          }

          return {
            activity: activityDescription,
            additionalInfo: activity.additionalInfo,
            domains: domains.join(', '),
            goals: selectedGoals.join(', '),
            promptingLevel: formatPromptingLevel(promptingLevels),
            promptingType: promptingTypes.join(', '),
            redirection: redirections.join(', '),
            response: responses.join(', '),
            additionalNotes: actData.additionalNotes
          };
        }).filter(a => a.activity);

        const pronoun = student.gender === 'he' ? 'he/him' : 'she/her';

        const draftPrompt = `Turn the session data below into a flowing paragraph. Include only the information that is provided. Do not add anything that isn't in the data.

CRITICAL: If a field is empty or shows no value, do NOT mention that category at all. For example, if Redirection is empty, do not mention redirection. Only include categories that have actual data.

IMPORTANT: The activity description may have two parts - the main activity and additional details. These describe the SAME activity, not two different activities. Combine them into one description of what the student did.

CRITICAL: If a specific activity/event is named in the data, identify it BEFORE using general terms like "the game" or "the activity"
- Wrong: "took turns during the game while bowling"
- Right: "took turns while bowling"
- If no specific activity is named, use general terms throughout

Session data:
${activitySummaries.map(a => 
  `Activity: ${a.activity}. ${a.additionalInfo || ''} 
   Language domains: ${a.domains}
   Goals addressed: ${a.goals}
   Prompting: ${a.promptingLevel} ${a.promptingType}
   Redirection: ${a.redirection}
   Student response: ${a.response}
   Additional notes: ${a.additionalNotes || 'none'}`
).join('\n\n')}

Use ${student.name}'s name at the start, then use pronouns (${pronoun}). Write in past tense. Make it flow as one paragraph.`;

        const draftRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{ role: "user", content: draftPrompt }]
          })
        });

        if (!draftRes.ok) {
          const errorText = await draftRes.text();
          throw new Error(`API Error (${draftRes.status}): ${errorText.substring(0, 150)}`);
        }

        const draftData = await draftRes.json();
        
        if (!draftData.content || !draftData.content[0] || !draftData.content[0].text) {
          throw new Error(`Unexpected API response. Response: ${JSON.stringify(draftData).substring(0, 200)}`);
        }
        
        let draftNote = cleanClaudeResponse(draftData.content[0].text);

        const reviewPrompt = `Turn this into proper clinical language with correct sentence structure.

Original note:
${draftNote}

ABSOLUTELY NO FABRICATING - APPLIES TO EVERYTHING:
- You can ONLY reword information that is explicitly provided in the original note
- Do NOT add any observations, interpretations, details, descriptors, or elaborations that are not in the original
- This applies to: activities, goals, prompting, redirection, responses, behaviors, observations - EVERYTHING
- You can paraphrase into clinical language, but cannot add new information

REQUIRED CHANGES:

${activitySummaries.some(a => a.activity.includes("Displayed appropriate pragmatic language skills")) ? `0. CRITICAL - NON-NEGOTIABLE STRUCTURE FOR PRAGMATIC LANGUAGE ACTIVITY:
   When the activity is "Displayed appropriate pragmatic language skills," you MUST use this exact structure:
   
   [Student name] displayed appropriate pragmatic language skills by [list of skills] while [event/location] given [prompting]. [New sentence about response/engagement].
   
   This is MANDATORY. Do NOT skip "displayed appropriate pragmatic language skills." Do NOT start with just the actions. Do NOT reorganize this structure.
   
   Example: "Romer displayed appropriate pragmatic language skills by effectively interacting with community members, waiting his turn to speak, and using appropriate volume while on a shopping trip given moderate verbal, visual, and tactile prompting and regular redirection. He remained alert throughout."
   
   If you start the note with anything other than "[Student name] displayed appropriate pragmatic language skills," you have FAILED this requirement.

` : ''}1. Do not change articles or possessives on any staff title, role, or person referenced in the session data. If the session data says "the [role]" (e.g., "the hearing teacher"), keep it as "the [role]" — do not change it to "his [role]" or "her [role]."

2. Separate what the student DID from the clinical information:
   - Describe the activity and how the student performed it
   - Then add "This session addressed [domains], targeting [goals]"
   - NEVER mix them together with "while" or combine them in one sentence

2. Fix how goals are described:
   - Goals are things being WORKED ON, not actions the student performed and NOT the activity itself
   - Goals are clinical targets, activities are what the student actually did during the session
   - Wrong: "He participated in asking and answering questions"
   - Right: The activity is what he did (watched news, completed worksheet, etc.), the goal "ask and answer questions in group" goes in the targeting section
   - Wrong: "He offered supportive comments"
   - Right: "targeting his ability to offer supportive comments"
   - CRITICAL: Use the EXACT goals listed in the session data - do not substitute different goals or change which goals are being targeted. You can expand shorthand into full clinical language, but the MEANING must stay the same.
   - NEVER treat the goal as if it's the activity the student did
   - Goals must be woven into the description of what the student actually did — never inserted as a separate standalone clause. THIS IS MANDATORY. A note that states a goal as a separate clause has failed this requirement.
   - CRITICAL MLU: When mentioning MLU (mean length of utterance) goals, write them as actions (e.g., "expanding utterances to 3-5 words" or "increasing spoken utterances to 3-5 words"), NEVER as abbreviations (e.g., "MLU 3-5"). Never use "MLU" followed by a number range as a standalone phrase.

. He demonstrated alert responses with moderate prompting"
   - Right: "He chose the next news segment given moderate verbal and visual prompting. He remained alert throughout"
   - Wrong: "He gave directions with minimal prompting"
   - Right: "He gave directions given minimal verbal and visual prompting"
   - SPECIAL: If "one to one para support" is mentioned, treat it as ADDITIONAL support, not as the source of prompting
   - Wrong: "with significant prompting from his one-to-one paraprofessional"
   - Right: "given significant verbal and visual prompting and one-to-one paraprofessional support"
   - Structure: [Activity description] + [given prompting/support] + [. New sentence about response/engagement]
   - CRITICAL: If the prompting level is a range (e.g., "minimal to moderate" or "moderate to significant"), preserve it exactly as a range. Do NOT split it into two separate levels or rephrase it.

4. Use respectful, humanizing language when discussing people:
   - When students select or research historical figures, people, or individuals, phrase it respectfully
   - Wrong: "chose a woman of color"
   - Right: "selected a woman of color to feature in the segment" or "chose which woman of color to highlight in the segment"
   - Treat people as subjects being researched or featured, not objects being selected

5. Use proper clinical language and pronouns (${pronoun})

6. Past tense throughout

7. CRITICAL GRAMMAR AND MODIFIERS:
   - Every sentence must be grammatically correct and logically coherent
   - Do not attach unrelated clauses together
   - Each sentence must make complete sense on its own
   - Modifiers (especially "given [prompting]") must be placed immediately adjacent to what they modify
   - There should be no ambiguity about what action the prompting applies to
   - Do not create sentences where modifiers could apply to multiple actions

8. Include one sentence explaining the clinical significance of the activity as it relates specifically to this student and their communication or language goals — not a generic statement about the activity type. Place it where it fits naturally in the note, not in a fixed position. THIS IS MANDATORY. A note without this sentence has failed this requirement.

Return only the corrected paragraph.`;

        const reviewRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{ role: "user", content: reviewPrompt }]
          })
        });

        if (!reviewRes.ok) {
          const errorText = await reviewRes.text();
          throw new Error(`Review API Error (${reviewRes.status}): ${errorText.substring(0, 200)}`);
        }

        const reviewData = await reviewRes.json();
        
        if (!reviewData.content || !reviewData.content[0] || !reviewData.content[0].text) {
          throw new Error(`Unexpected API response. Response: ${JSON.stringify(reviewData).substring(0, 200)}`);
        }
        
        let reviewedNote = cleanClaudeResponse(reviewData.content[0].text);

        const streamlinePrompt = `Review this note for redundancy and logic problems. Remove any redundant phrasing but keep ALL clinical information.

Original note:
${reviewedNote}

Check for:
- Redundant phrases that repeat the same information
- Illogical sequences or contradictions
- Unnecessary elaboration
- SPECIFIC: If the activity description already mentions "displayed appropriate pragmatic language skills," remove any separate sentence about "This session addressed the pragmatic language domain" as it is redundant

Keep ALL:
- Activities performed
- Language domains (unless redundant as noted above)
- Goals
- Prompting information
- Redirection details
- Student responses

Do NOT add or remove any clinical facts. Only remove redundant wording.

CRITICAL: Return ONLY the final paragraph. Do NOT include any analysis, commentary, or explanation about what you did or didn't change. Just return the cleaned note itself.`;

        const streamlineRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{ role: "user", content: streamlinePrompt }]
          })
        });

        if (!streamlineRes.ok) {
          const errorText = await streamlineRes.text();
          throw new Error(`Streamline API Error (${streamlineRes.status}): ${errorText.substring(0, 200)}`);
        }

        const streamlineData = await streamlineRes.json();
        
        if (!streamlineData.content || !streamlineData.content[0] || !streamlineData.content[0].text) {
          throw new Error(`Unexpected API response. Response: ${JSON.stringify(streamlineData).substring(0, 200)}`);
        }
        
        let streamlinedNote = cleanClaudeResponse(streamlineData.content[0].text);

        // Automatically add Spanish/English note for students who need it
        if (student.needsSpanish) {
          streamlinedNote += " All interactions occurred in both Spanish and English with teacher or paraprofessional translation support as needed.";
        }

        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: streamlinedNote });
      }

      // Sort notes in the specified order
      const nameOrder = ["Romer", "Leslie Ann", "Arlis", "Wildele", "Marbella", "Fernando", "Aiden", "Dhaneshwar", "Valentina", "Kaily", "Namiyah", "Leudy"];
      notes.sort((a, b) => {
        const indexA = nameOrder.indexOf(a.name);
        const indexB = nameOrder.indexOf(b.name);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });

      // Format date for first note
      if (notes.length > 0 && date) {
        const dateObj = new Date(date + 'T00:00:00');
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = dayNames[dateObj.getDay()];
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const year = String(dateObj.getFullYear()).slice(-2);
        notes[0].formattedDate = `${dayName}, ${month}.${day}.${year}`;
      }

      setGeneratedNotes(notes);
    } catch (err) {
      console.error('Generation error:', err);
      setError(`Error generating notes: ${err.message}. Your data has been saved and you can try again.`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Nina - SESIS Note Generator</h1>
            {!showClearConfirm ? (
              <button onClick={() => setShowClearConfirm(true)} className="px-3 py-1 bg-red-500 text-white rounded text-sm">Clear All</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={clearAllData} className="px-3 py-1 bg-red-600 text-white rounded text-sm font-semibold">Yes, Delete Everything</button>
                <button onClick={() => setShowClearConfirm(false)} className="px-3 py-1 bg-gray-500 text-white rounded text-sm">Cancel</button>
              </div>
            )}
          </div>
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded flex gap-2">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Session Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Activities</h2>
          {activities.map((activity, idx) => (
            <div key={idx} className="mb-4 p-4 border rounded-lg">
              {activities.length > 1 && (
                <button onClick={() => removeActivity(idx)} className="float-right px-2 py-1 bg-red-500 text-white rounded"><X size={16} /></button>
              )}
              <select value={activity.name} onChange={(e) => updateActivity(idx, 'name', e.target.value)} className="w-full px-3 py-2 border rounded-md mb-2">
                <option value="">Select activity...</option>
                {availableActivities.map((name, i) => <option key={i} value={name}>{name}</option>)}
              </select>
              <textarea value={activity.additionalInfo} onChange={(e) => updateActivity(idx, 'additionalInfo', e.target.value)} placeholder="Additional info..." rows="2" className="w-full px-3 py-2 border rounded-md mb-2" />
              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={activity.domains.expressive} onChange={(e) => updateActivity(idx, 'domains.expressive', e.target.checked)} /> Expressive</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={activity.domains.receptive} onChange={(e) => updateActivity(idx, 'domains.receptive', e.target.checked)} /> Receptive</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={activity.domains.pragmatic} onChange={(e) => updateActivity(idx, 'domains.pragmatic', e.target.checked)} /> Pragmatic</label>
              </div>
            </div>
          ))}
          <button onClick={addActivity} className="px-4 py-2 bg-blue-600 text-white rounded-md"><Plus size={16} className="inline mr-1" /> Add Activity</button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Students</h2>
          {students.map((student, sIdx) => (
            <div key={sIdx} className="mb-4 border rounded-lg">
              <div className="bg-gray-50 p-4 flex justify-between cursor-pointer" onClick={() => setExpandedStudents(expandedStudents.includes(sIdx) ? expandedStudents.filter(i => i !== sIdx) : [...expandedStudents, sIdx])}>
                <h3 className="font-semibold">{student.name || `Student ${sIdx + 1}`}</h3>
                {expandedStudents.includes(sIdx) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>

              {expandedStudents.includes(sIdx) && (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Student Name</label>
                      <input type="text" value={student.name} onChange={(e) => updateStudent(sIdx, 'name', e.target.value)} className="w-full px-3 py-2 border rounded-md" list="students-list" />
                      <datalist id="students-list">
                        {savedStudents.map((s, i) => <option key={i} value={s.name} />)}
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
                    <input 
                      type="text" 
                      value={student.sessionTime || ''} 
                      onChange={(e) => updateStudent(sIdx, 'sessionTime', e.target.value)}
                      placeholder="e.g., 8:44-9:14"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>

                  {student.aacDevice && <p className="text-sm text-gray-600 mb-2">AAC: {student.aacDevice}</p>}
                  {student.needsSpanish && <p className="text-sm text-gray-600 mb-2">Spanish support needed</p>}

                  <div className="mb-4">
                    <label className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={student.absent || false} 
                        onChange={(e) => updateStudent(sIdx, 'absent', e.target.checked)} 
                      />
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
                                <input 
                                  type="checkbox" 
                                  checked={student.activitiesData[aIdx].pragmaticSkills.includes(skill)} 
                                  onChange={() => togglePragmaticSkill(sIdx, aIdx, skill)} 
                                />
                                {skill}
                              </label>
                            ))}
                          </div>
                          {student.activitiesData[aIdx].pragmaticSkills.includes("other") && (
                            <input 
                              type="text"
                              value={student.activitiesData[aIdx].pragmaticSkillsOther}
                              onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'pragmaticSkillsOther', e.target.value)}
                              placeholder="Specify other skill..."
                              className="w-full px-2 py-1 border rounded text-xs mt-2"
                            />
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
                              <input type="checkbox" checked={student.activitiesData[aIdx].promptingLevel[level]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, `promptingLevel.${level}`, e.target.checked)} />
                              {level}
                            </label>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Prompting Type</label>
                          {['verbal', 'visual', 'tactile'].map(type => (
                            <label key={type} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={student.activitiesData[aIdx].promptingType[type]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, `promptingType.${type}`, e.target.checked)} />
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
                              <input type="checkbox" checked={student.activitiesData[aIdx].redirection[level]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, `redirection.${level}`, e.target.checked)} />
                              {level === 'no' ? 'no' : `${level} redirection to task`}
                            </label>
                          ))}
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Response</label>
                          {['enthusiastic', 'engaged', 'alert', 'disregulated', 'unengaged', 'tired', 'distracted'].map(resp => (
                            <label key={resp} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={student.activitiesData[aIdx].response[resp]} onChange={(e) => updateStudentActivityData(sIdx, aIdx, `response.${resp}`, e.target.checked)} />
                              {resp}
                            </label>
                          ))}
                        </div>
                      </div>

                      <textarea value={student.activitiesData[aIdx].additionalNotes} onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'additionalNotes', e.target.value)} placeholder="Additional notes..." rows="2" className="w-full px-2 py-1 border rounded text-xs" />
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
          {isGenerating && (
            <button onClick={() => setIsGenerating(false)} className="w-full mt-2 px-4 py-2 bg-red-500 text-white rounded-md text-sm">
              Cancel / Reset
            </button>
          )}
        </div>

        {generatedNotes.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-semibold">Generated Notes</h2>
              <button onClick={() => copyToClipboard(generatedNotes.map(n => `${n.formattedDate ? n.formattedDate + '\n\n' : ''}${n.sessionTime ? n.sessionTime + '\n' : ''}${n.name}:\n${n.finalNote}\n`).join('\n'))} className="px-3 py-1 bg-green-600 text-white rounded text-sm"><Copy size={14} className="inline mr-1" /> Copy All Notes</button>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}