import React, { useState, useRef } from 'react';
import { Plus, X, FileText, Loader2, Copy, ChevronDown, ChevronUp } from 'lucide-react';

// Lefkie's Class - Student Goals Data
const studentGoalsData = {
  "Deandre": [
    { shortName: "initiate conversations" },
    { shortName: "maintain topic 3 turns" },
    { shortName: "appropriate social behaviors" },
    { shortName: "internet search keywords" },
    { shortName: "navigate web browser" },
    { shortName: "select relevant sources" },
    { shortName: "access webpages" },
    { shortName: "extract information" },
    { shortName: "impulse control" }
  ],
  "Delyla": [
    { shortName: "internet search keywords" },
    { shortName: "navigate web browser" },
    { shortName: "identify search results" },
    { shortName: "access webpages" },
    { shortName: "extract information" },
    { shortName: "job interview self-intro" },
    { shortName: "job interview experience/skills" },
    { shortName: "job interview work ethic" },
    { shortName: "answer questions voluntarily" },
    { shortName: "self-advocacy" },
    { shortName: "ask clarifying questions" },
    { shortName: "ask for repetition" }
  ],
  "Janaya": [
    { shortName: "ask for help" },
    { shortName: "ask clarifying questions" },
    { shortName: "pose topic-related questions" },
    { shortName: "internet search keywords" },
    { shortName: "navigate web browser" },
    { shortName: "select relevant sources" },
    { shortName: "access webpages" },
    { shortName: "extract information" }
  ],
  "Brianna": [
    { shortName: "internet search keywords" },
    { shortName: "navigate web browser" },
    { shortName: "select relevant sources" },
    { shortName: "access webpages" },
    { shortName: "extract information" },
    { shortName: "join conversations on-topic" },
    { shortName: "interject appropriately" },
    { shortName: "interpret social cues" }
  ],
  "Aaron": [
    { shortName: "identify functional text type" },
    { shortName: "explain text purpose" },
    { shortName: "determine info needed" },
    { shortName: "answer multiple choice" },
    { shortName: "use visual schedule" },
    { shortName: "refrain from non-instructional sites" },
    { shortName: "use self-regulation tools" },
    { shortName: "PBIS point reminders" },
    { shortName: "identify feelings" },
    { shortName: "utilize calming strategy" },
    { shortName: "adapt to unplanned adjustments" },
    { shortName: "respond to directed comments" },
    { shortName: "allow peers to respond" },
    { shortName: "provide visual feedback" }
  ],
  "Jamie": [
    { shortName: "identify functional text type" },
    { shortName: "explain text purpose" },
    { shortName: "determine info needed" },
    { shortName: "answer multiple choice" },
    { shortName: "identify problems" },
    { shortName: "identify appropriate action" },
    { shortName: "role-play problem solving" },
    { shortName: "explain appropriate action" },
    { shortName: "non-verbal feedback" },
    { shortName: "identify triggers" },
    { shortName: "verbalize feelings" },
    { shortName: "use coping strategy" }
  ],
  "Ethan": [
    { shortName: "identify info with visual guidance" },
    { shortName: "match info to category" },
    { shortName: "respond to categorization prompt" },
    { shortName: "locate correct info" },
    { shortName: "sort information" },
    { shortName: "dictate 2-word phrase/sentence" },
    { shortName: "identify impulsive behavior" },
    { shortName: "apply relaxation strategy" },
    { shortName: "explain strategy effectiveness" },
    { shortName: "identify conversation topic" },
    { shortName: "respond to visual cue" },
    { shortName: "state original topic" }
  ],
  "Cherish": [
    { shortName: "identify functional text type" },
    { shortName: "explain text purpose" },
    { shortName: "determine info needed" },
    { shortName: "locate key details" },
    { shortName: "differentiate compliments" },
    { shortName: "identify specific actions" },
    { shortName: "give specific compliments" }
  ]
};

const savedStudents = [
  { name: "Deandre", gender: "he" },
  { name: "Delyla", gender: "she" },
  { name: "Janaya", gender: "she" },
  { name: "Brianna", gender: "she" },
  { name: "Aaron", gender: "he" },
  { name: "Jamie", gender: "he" },
  { name: "Ethan", gender: "he" },
  { name: "Cherish", gender: "she" }
];

// Schedule data: day of week -> time slot -> students
const scheduleData = {
  "Monday": {
    "8:44-9:14": ["Deandre", "Delyla", "Janaya", "Brianna"],
    "9:15-9:45": ["Aaron", "Jamie", "Ethan", "Cherish"]
  },
  "Tuesday": {
    "12:27-12:57": ["Ethan"]
  },
  "Thursday": {
    "8:44-9:14": ["Deandre", "Delyla", "Janaya", "Brianna"],
    "9:15-9:45": ["Aaron", "Jamie", "Ethan", "Cherish"]
  }
};

// Helper function to get session time for a student on a given date
const getSessionTime = (studentName, dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString + 'T00:00:00');
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = dayNames[date.getDay()];
  
  if (!scheduleData[dayOfWeek]) return '';
  
  for (const [timeSlot, students] of Object.entries(scheduleData[dayOfWeek])) {
    if (students.includes(studentName)) {
      return timeSlot;
    }
  }
  
  return '';
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

export default function LefkieSESISNoteGenerator() {
  const [date, setDate] = useState('');
  const [activities, setActivities] = useState([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
  const [students, setStudents] = useState([]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState([0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // Refs for debounced saving
  const dateTimerRef = useRef(null);
  const activitiesTimerRef = useRef(null);
  const studentsTimerRef = useRef(null);

  // Load data from storage on mount
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const dateResult = await window.storage.get('lefkie-date');
        if (dateResult) setDate(dateResult.value);
      } catch (error) {
        console.log('No saved date');
      }

      try {
        const activitiesResult = await window.storage.get('lefkie-activities');
        if (activitiesResult) {
          const loadedActivities = JSON.parse(activitiesResult.value);
          if (loadedActivities && loadedActivities.length > 0) {
            setActivities(loadedActivities);
          }
        }
      } catch (error) {
        console.log('No saved activities');
      }

      try {
        const studentsResult = await window.storage.get('lefkie-students');
        if (studentsResult) setStudents(JSON.parse(studentsResult.value));
      } catch (error) {
        console.log('No saved students');
      }
      
      setHasLoaded(true);
    };
    loadData();
  }, []);

  // Update all student session times when date changes
  React.useEffect(() => {
    if (date && students.length > 0) {
      const updatedStudents = students.map(student => ({
        ...student,
        sessionTime: student.name ? getSessionTime(student.name, date) : ''
      }));
      setStudents(updatedStudents);
    }
  }, [date]);

  // Auto-save date with debouncing (5 second delay)
  React.useEffect(() => {
    if (hasLoaded && date) {
      if (dateTimerRef.current) clearTimeout(dateTimerRef.current);
      dateTimerRef.current = setTimeout(() => {
        window.storage.set('lefkie-date', date).catch(err => console.error('Save error:', err));
      }, 5000);
    }
    return () => {
      if (dateTimerRef.current) clearTimeout(dateTimerRef.current);
    };
  }, [date, hasLoaded]);

  // Auto-save activities with debouncing (5 second delay)
  React.useEffect(() => {
    if (hasLoaded) {
      if (activitiesTimerRef.current) clearTimeout(activitiesTimerRef.current);
      activitiesTimerRef.current = setTimeout(() => {
        window.storage.set('lefkie-activities', JSON.stringify(activities)).catch(err => console.error('Save error:', err));
      }, 5000);
    }
    return () => {
      if (activitiesTimerRef.current) clearTimeout(activitiesTimerRef.current);
    };
  }, [activities, hasLoaded]);

  // Auto-save students with debouncing (5 second delay)
  React.useEffect(() => {
    if (hasLoaded && students.length > 0) {
      if (studentsTimerRef.current) clearTimeout(studentsTimerRef.current);
      studentsTimerRef.current = setTimeout(() => {
        window.storage.set('lefkie-students', JSON.stringify(students)).catch(err => console.error('Save error:', err));
      }, 5000);
    }
    return () => {
      if (studentsTimerRef.current) clearTimeout(studentsTimerRef.current);
    };
  }, [students, hasLoaded]);

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
    "Researched/created visuals for upcoming news segments",
    "Worked together as a class to choose the next news segment they plan to create",
    "Filmed for a news segment: gave directions (i.e., quiet on set, roll tape, action, cut)",
    "Filmed for a news segment: responded to directions given by staff and peers (i.e., quiet on set, roll tape, action, cut)",
    "Wrote the script for an upcoming segment",
    "Completed journal entries for collaborative teacher. Glued in a picture illustrating today's National Day and wrote or traced a self-generated comment about it.",
    "Displayed appropriate pragmatic language skills while",
    "Other"
  ];

  const addActivity = () => {
    setActivities([...activities, { name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
    
    // Update all existing students to add data for the new activity
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
    
    // Update all existing students to remove data for the deleted activity
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
      name: '', gender: 'he', sessionTime: '', absent: false,
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
    textarea.style.position = 'absolute';
    textarea.style.left = '0';
    textarea.style.top = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Copy failed:', err);
    }
    document.body.removeChild(textarea);
  };

  const clearGenerator = async () => {
    setDate('');
    setActivities([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
    setStudents([]);
    setGeneratedNotes([]);
    setExpandedStudents([0]);
    
    try {
      await window.storage.delete('lefkie-date');
      await window.storage.delete('lefkie-activities');
      await window.storage.delete('lefkie-students');
    } catch (error) {
      console.log('Clear storage error:', error);
    }
    
    setShowClearConfirm(false);
  };

  const generateNotes = async () => {
    setIsGenerating(true);
    const notes = [];

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
        const levelOrder = ['no', 'minimal', 'moderate', 'significant'];
        let promptingLevelText = '';
        if (promptingLevels.length === 1) {
          promptingLevelText = promptingLevels[0];
        } else if (promptingLevels.length > 1) {
          const sortedLevels = promptingLevels.sort((a, b) => levelOrder.indexOf(a) - levelOrder.indexOf(b));
          promptingLevelText = `${sortedLevels[0]} to ${sortedLevels[sortedLevels.length - 1]}`;
        }
        
        const promptingTypes = Object.entries(actData.promptingType).filter(([k, v]) => v).map(([k]) => k);
        const redirections = Object.entries(actData.redirection).filter(([k, v]) => v).map(([k]) => k);
        const responses = Object.entries(actData.response).filter(([k, v]) => v).map(([k]) => k);

        // Build activity description with pragmatic skills if applicable
        let activityDescription = activity.name;
        if (activity.name === "Displayed appropriate pragmatic language skills while" && actData.pragmaticSkills && actData.pragmaticSkills.length > 0) {
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
          domains: domains.length > 0 ? domains.join(', ') : null,
          goals: selectedGoals.join(', '),
          promptingLevel: promptingLevelText,
          promptingType: promptingTypes.join(', '),
          redirection: redirections.join(', '),
          response: responses.join(', '),
          additionalNotes: actData.additionalNotes
        };
      }).filter(a => a.activity);

      const pronoun = student.gender === 'he' ? 'he/him' : student.gender === 'she' ? 'she/her' : 'they/them';

      try {
        const draftPrompt = `Write a clinical session note documenting this speech therapy session for SESIS.

Session data:
${activitySummaries.map(a => 
  `Activity: ${a.activity}. ${a.additionalInfo || ''}${a.domains ? `
   Language domains addressed: ${a.domains}` : ''}
   IEP goals targeted: ${a.goals}
   Cueing provided: ${a.promptingLevel} ${a.promptingType}
   Redirection required: ${a.redirection}
   Student engagement: ${a.response}
   Clinical notes: ${a.additionalNotes || 'none'}`
).join('\n\n')}

DOCUMENTATION PRIORITY:
Document the actual sequence of student actions exactly as described in the session data. Do not summarize, generalize, or abstract what happened. If the student made a decision, document the decision. If they completed multiple steps, document each step. Preserve all concrete details about what the student actually did.

PROMPTING ATTRIBUTION:
- Passive activities do NOT get prompting attribution: watching, listening, viewing
- Active tasks DO get prompting attribution: selecting, writing, answering, creating, researching, building
- Cognitive processes do NOT get prompting attribution: deciding, choosing, thinking, discussing, considering options
- If activity has both passive and active parts, state prompting only for the active part
- State prompting ONCE for the overall active work, not repeated for each substep
- Example: "He watched X. He then selected Y with moderate cues."
- Example: "After discussing options, he decided to focus on MarioKart. He then researched and wrote his script, requiring minimal cues." NOT "he decided requiring cues... he researched requiring cues..."

CRITICAL RULES:

1. DESCRIBE EACH ACTIVITY SEPARATELY:
   - Each activity in the session data has its OWN support information (prompting, redirection, response)
   - You MUST describe each activity separately with its own specific support
   - NEVER combine activities into one sentence
   - NEVER blend support from different activities together
   - Structure: Activity 1 with Activity 1's support. Activity 2 with Activity 2's support.
   - Wrong: "He did X and Y given cues"
   - Right: "He did X given [Activity 1's cues]. He did Y given [Activity 2's cues]."

2. GOAL-ACTIVITY-SUPPORT INTEGRATION:
   - ${student.name} worked on [goal(s)] while [activity with its specific support integrated]
   - Each activity has its own goals and support - do NOT mix them
   - Support is for completing the activity, NOT for achieving goals/domains
   - NEVER "given support to support [goals]" or "to help with [skills]"
   - Place support information immediately after describing the complete activity
   - Only mention language domains if they are provided in the session data
   - Keep activities separate - if there are 2 activities, write 2 separate descriptions

3. LOGICAL ORDER:
   - Activity description with support comes first
   - Then domain information
   - Then response/engagement (if provided)
   - Response cannot come before support information

4. ATTRIBUTION AND STRUCTURE:
   - Student behaviors/responses → attributed to student
   - Domains → attributed to activity/activities, only if domains are provided in session data
   - NEVER infer or add domains that are not in the session data
   - CRITICAL: "given [support]" must connect directly to what the student DID
   - Correct structure: "She did X given Y. This addressed Z."
   - WRONG: "This activity addressed Z, given Y."
   - WRONG: "She did X given Y, addressing Z."
   - Domains MUST be a separate sentence, never added with a comma after support
   - Support connects to student actions, NOT to domains

5. CLINICAL PRECISION:
   - Use exact goals from session data BUT convert shorthand to grammatically complete phrases
   - Add articles (a, the), prepositions (to, for, of), and other words as needed for proper grammar
   - Examples: "maintain topic 3 turns" → "maintaining a topic for three conversational turns"
   - Examples: "internet search keywords" → "using internet search keywords" or "generating internet search keywords"
   - Examples: "ask clarifying questions" → "asking clarifying questions"
   - Convert prompting ranges to clinical phrases: "no to minimal" → "requiring little to no prompting"
   - For other ranges, use natural phrasing like "with minimal to moderate cues"
   - Specify cueing type (e.g., "requiring little to no prompting with verbal and visual cues")
   - ALWAYS add "to task" with redirection (e.g., "occasional redirection to task")
   - Include EVERY step of each activity

6. INTELLIGENT STRUCTURE:
   - Keep activities separate if they have different support information
   - Each activity should be described with its own goals, support, and domains
   - Do NOT combine activities with different prompting levels or types
   - Vary sentence structure - don't use same pattern every time
   - Avoid formulaic phrases

Write in past tense. Use ${student.name}'s name initially, then ${pronoun} pronouns. Write as one clinical paragraph.`;

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
          if (draftRes.status === 429) {
            throw new Error(`Rate limit exceeded. You've made too many API requests. Please wait a few minutes and try again.`);
          }
          throw new Error(`API Error (${draftRes.status}): ${errorText.substring(0, 150)}`);
        }

        const draftData = await draftRes.json();
        
        if (!draftData.content || !draftData.content[0] || !draftData.content[0].text) {
          throw new Error(`Unexpected API response structure. Response: ${JSON.stringify(draftData).substring(0, 200)}`);
        }
        
        let draftNote = cleanClaudeResponse(draftData.content[0].text);

        const reviewPrompt = `Review this note for clinical accuracy and SLP documentation standards:

${draftNote}

REQUIRED CORRECTIONS:

0. SUBJECT-VERB LOGIC (CRITICAL):
   - Activities address domains. Students demonstrate responses.
   - Wrong: "This activity addressed language and demonstrated engagement"
   - Right: "This activity addressed language. He demonstrated engagement."
   - Never attribute student behaviors to the activity
   - CRITICAL: "given [support]" must connect to STUDENT ACTIONS, not domains
   - Wrong: "This activity addressed language, given cues"
   - Right: "She did the activity given cues. This addressed language."
   - FORBIDDEN: "She did X given Y, addressing Z" - domains cannot be added with comma after support

1. CORRECT LOGICAL FLOW (CRITICAL):
   - Goal work happens IN THE CONTEXT OF the activity
   - Support enables completing the activity, NOT the therapeutic targets
   - NEVER phrase support as "to support [goals/skills]" or "to help with [domains]"
   - Wrong: "given cues to support his language skills"
   - Right: "given cues. This activity addressed language skills."

2. AVOID RUN-ON SENTENCES:
   - Don't cram everything into one endless sentence
   - Use periods to create clear, readable sentences
   - But allow natural variation - don't force rigid templates

3. GRAMMAR AND MECHANICS (CRITICAL):
   - Check for correct grammar, punctuation, and formatting
   - Goal shorthand MUST be converted to grammatically complete phrases
   - Add articles (a, the), prepositions, and other words needed for proper grammar
   - Wrong: "worked on maintaining topic for three turns"
   - Right: "worked on maintaining a topic for three conversational turns"
   - Wrong: "worked on internet search keywords"
   - Right: "worked on using internet search keywords"
   - Proper title formatting (quotes for speech/article titles, etc.)
   - Correct pronoun usage and agreement

4. PROMPTING PLACEMENT (CRITICAL):
   - Each activity has its own prompting/support information
   - Prompting/support must come AFTER describing ALL steps of THAT activity
   - Do NOT combine support from multiple activities
   - Wrong: "Ethan watched the news given cues. He identified MLK's dream."
   - Right: "Ethan watched the news and identified MLK's dream given cues."
   - If there are 2 activities with different support, keep them completely separate

5. NO PROMPTING DUPLICATION:
   - Mention activity prompting once only
   - Only repeat if different prompting specified for different parts

6. Goals integration:
   - Use EXACT goals from session data
   - Convert goal shorthand to grammatically complete phrases with articles and prepositions
   - Integrate naturally: "worked on [goal] while [activity]"

7. Redirection:
   - ALWAYS add "to task"

8. Respectful language when appropriate

9. Use clinical language and ${pronoun} pronouns

10. Past tense throughout

Return only the corrected clinical paragraph.`;

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
          if (reviewRes.status === 429) {
            throw new Error(`Rate limit exceeded. You've made too many API requests. Please wait a few minutes and try again.`);
          }
          throw new Error(`Review API request failed with status ${reviewRes.status}. Response: ${errorText.substring(0, 200)}`);
        }

        const reviewData = await reviewRes.json();
        
        if (!reviewData.content || !reviewData.content[0] || !reviewData.content[0].text) {
          throw new Error(`Unexpected API response structure. Response: ${JSON.stringify(reviewData).substring(0, 200)}`);
        }
        
        let reviewedNote = cleanClaudeResponse(reviewData.content[0].text);

        // Step 3: Streamline the reviewed note
        const streamlinePrompt = `Review for redundancy and logic problems. Remove redundant phrasing but keep ALL clinical information.

${reviewedNote}

Check for:
- Redundant phrases repeating same information
- Illogical sequences or contradictions
- Unnecessary elaboration

Keep ALL activities SEPARATE with their own support information.
Keep ALL activities, domains, goals, prompting, redirection, and responses.

Do NOT add or remove clinical facts. Only remove redundant wording.
Do NOT combine activities that have separate support information.

CRITICAL: Return ONLY the final clinical paragraph. Do not include any analysis, commentary, or meta-text like "Analysis:" or "No redundancy found." Output the corrected paragraph text only.`;

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
          if (streamlineRes.status === 429) {
            throw new Error(`Rate limit exceeded. You've made too many API requests. Please wait a few minutes and try again.`);
          }
          throw new Error(`Streamline API request failed with status ${streamlineRes.status}. Response: ${errorText.substring(0, 200)}`);
        }

        const streamlineData = await streamlineRes.json();
        
        if (!streamlineData.content || !streamlineData.content[0] || !streamlineData.content[0].text) {
          throw new Error(`Unexpected API response structure. Response: ${JSON.stringify(streamlineData).substring(0, 200)}`);
        }
        
        let streamlinedNote = cleanClaudeResponse(streamlineData.content[0].text);

        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: streamlinedNote });
      } catch (error) {
        const errorMessage = `Error generating note: ${error.message}`;
        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: errorMessage });
      }
    }

    // Sort notes in the specified order
    const nameOrder = ["Deandre", "Delyla", "Janaya", "Brianna", "Aaron", "Jamie", "Ethan", "Cherish"];
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
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Lefkie - SESIS Note Generator</h1>
            <button onClick={() => setShowClearConfirm(true)} className="px-4 py-2 bg-red-600 text-white rounded-md font-semibold">
              Clear Generator
            </button>
          </div>
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
              <textarea value={activity.additionalInfo} onChange={(e) => updateActivity(idx, 'additionalInfo', e.target.value)} placeholder="Additional info..." rows="2" className="w-full px-3 py-2 border rounded-md mb-2" disabled={!activity.name} />
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
                        {Object.keys(studentGoalsData).map((name, i) => <option key={i} value={name} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Pronouns</label>
                      <select value={student.gender} onChange={(e) => updateStudent(sIdx, 'gender', e.target.value)} className="w-full px-3 py-2 border rounded-md">
                        <option value="he">He/Him</option>
                        <option value="she">She/Her</option>
                        <option value="they">They/Them</option>
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
                              {level}
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
      
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Clear All Data?</h3>
            <p className="text-gray-600 mb-6">This will delete all activities, students, and generated notes. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={clearGenerator} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md font-semibold">
                Clear Everything
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-md font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}