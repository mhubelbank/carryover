import React, { useState } from 'react';
import { Plus, X, FileText, Loader2, Copy, ChevronDown, ChevronUp } from 'lucide-react';

// José's Class - Student Goals Data
const studentGoalsData = {
  "Jayden": [
    { longTerm: "Jayden will sequence 5 steps during an ADL activity by placing 5 picture cards in the correct order over 5 consecutive trials, given one verbal prompt.", shortName: "sequencing" },
    { longTerm: "Jayden will appropriately answer a yes/no question using his preferred mode of communication (PMC) in social, academic, and self-advocacy situations.", shortName: "yes/no questions" }
  ],
  "Angel": [
    { longTerm: "Angel will use his speech generating device for functional communicative functions (e.g., initiating interactions, directing staff, requesting a break when needed) independently.", shortName: "Device for functional phrases" },
    { longTerm: "Angel will sequence 5 steps during an ADL activity by placing 5 picture cards in the correct order over 5 consecutive trials, given one verbal prompt.", shortName: "sequencing" },
    { longTerm: "Angel will express his wants and needs appropriately, in order to decrease frustration and maintain baseline mood, using his SGD given verbal and visual support.", shortName: "wants and needs" }
  ],
  "Yaneurys": [
    { longTerm: "Yaneurys will appropriately express when he wants to eat, drink, or use the bathroom using PMC 3 times a day given 1 verbal prompt.", shortName: "wants and needs" },
    { longTerm: "Yaneurys will identify 5 items used for personal care such as, toothbrush, tooth paste, soap, deodorant, hairbrush, by pointing to the right item when given two choices over 5 consecutive days with one verbal prompt.", shortName: "identify items" }
  ],
  "Imane": [
    { longTerm: "Imane will sequence 5 steps during an ADL activity by placing 5 picture cards in the correct order over 5 consecutive trials, given one verbal prompt.", shortName: "sequencing" },
    { longTerm: "Imane will identify 5 items used for personal care such as, toothbrush, tooth paste, soap, deodorant, hairbrush, by pointing to the right item when given two choices over 5 consecutive days with one verbal prompt.", shortName: "identify items" },
    { longTerm: "Imane will improve attention and focus by remaining on a task during an activity.", shortName: "remain on task" },
    { longTerm: "Imane will use a single-cell communication device (e.g., Big Mac) with errorless selection (one choice presented) to communicate a request or preference, to comment, or to gain attention, in 80% of opportunities across 4 out of 5 sessions.", shortName: "use a single cell device: communicate, preference, comment, gain attention" }
  ],
  "Melanie": [
    { longTerm: "Melanie will ask and answer Wh-questions by producing 3-4 word utterances across multiple environments with varying communication partners.", shortName: "WH questions" },
    { longTerm: "Melanie will improve self-regulation by completing a non-preferred task without maladaptive reactions (screaming/crying).", shortName: "self-regulation" },
    { longTerm: "Melanie will write a 2-sentence story, she will draw pictures to tell about 2 characters and 3 events from a story read to her using a graphic organizer.", shortName: "Story retell" }
  ],
  "Bessy": [
    { longTerm: "Bessy will match symbols/pictures to 5 different activities (e.g., book to reading, a pencil to writing, a spoon to eating, a toilet to bathroom, a swing to recess, a calculator to math) over 5 consecutive trials with one prompt.", shortName: "Matching" },
    { longTerm: "Bessy will improve attention and focus while doing a table top activity.", shortName: "focus" },
    { longTerm: "Bessy will use functional communication strategies (e.g., 1-2-word verbal phrases, pointing to symbols/pictures, or gestures) to request preferred items or activities, express basic needs, and engage with peers or adults during classroom activities in 4 out of 5 opportunities across structured and unstructured settings, given verbal, visual, and gestural prompts, as measured by clinician and teacher data collection.", shortName: "functional communication" }
  ]
};

const savedStudents = [
  { name: "Jayden", gender: "he", aacDevice: "Single cell devices for activities with choices, not used for every activity" },
  { name: "Angel", gender: "he", aacDevice: "Dynamic display speech generating device (SGD)" },
  { name: "Yaneurys", gender: "he", aacDevice: "Single cell devices for activities with choices, not used for every activity" },
  { name: "Imane", gender: "she", aacDevice: "Single cell devices for activities with choices, not used for every activity" },
  { name: "Melanie", gender: "she", aacDevice: "" },
  { name: "Bessy", gender: "she", aacDevice: "Single cell devices for activities with choices, not used for every activity" }
];

// Schedule data: day of week -> time slot -> students
const scheduleData = {
  "Monday": {
    "11:02-11:32": ["Angel"]
  },
  "Tuesday": {
    "11:19-11:49": ["Jayden", "Angel", "Yaneurys"],
    "11:56-12:26": ["Imane", "Melanie", "Bessy"]
  },
  "Thursday": {
    "11:19-11:49": ["Jayden", "Angel", "Yaneurys"],
    "11:56-12:26": ["Imane", "Melanie", "Bessy"]
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

export default function JoseSESISNoteGenerator() {
  const [date, setDate] = useState('');
  const [activities, setActivities] = useState([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
  const [students, setStudents] = useState([]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState([0]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load data from storage on mount
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const dateData = await window.storage.get('jose-date');
        if (dateData && dateData.value) setDate(dateData.value);

        const activitiesData = await window.storage.get('jose-activities');
        if (activitiesData && activitiesData.value) setActivities(JSON.parse(activitiesData.value));

        const studentsData = await window.storage.get('jose-students');
        if (studentsData && studentsData.value) setStudents(JSON.parse(studentsData.value));

        const notesData = await window.storage.get('jose-notes');
        if (notesData && notesData.value) setGeneratedNotes(JSON.parse(notesData.value));

        const expandedData = await window.storage.get('jose-expanded');
        if (expandedData && expandedData.value) setExpandedStudents(JSON.parse(expandedData.value));
      } catch (error) {
        console.log('No saved data found');
      }
    };
    loadData();
  }, []);

  // Auto-save all data with debounce
  React.useEffect(() => {
    const timeoutId = setTimeout(async () => {
      try {
        await window.storage.set('jose-date', date);
        await window.storage.set('jose-activities', JSON.stringify(activities));
        await window.storage.set('jose-students', JSON.stringify(students));
        await window.storage.set('jose-notes', JSON.stringify(generatedNotes));
        await window.storage.set('jose-expanded', JSON.stringify(expandedStudents));
      } catch (error) {
        console.error('Save error:', error);
      }
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [date, activities, students, generatedNotes, expandedStudents]);

  const clearAll = async () => {
    setDate('');
    setActivities([{ name: '', additionalInfo: '', domains: { expressive: false, receptive: false, pragmatic: false } }]);
    setStudents([]);
    setGeneratedNotes([]);
    setExpandedStudents([0]);
    try {
      await window.storage.delete('jose-date');
      await window.storage.delete('jose-activities');
      await window.storage.delete('jose-students');
      await window.storage.delete('jose-notes');
      await window.storage.delete('jose-expanded');
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  };

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

  const copyToClipboard = (text) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
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
          deviceUsed: false,
          deviceType: '',
          deviceOther: '',
          usedSGDForActivity: false,
          usedSGDForDiscussion: false,
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
      name: '', gender: 'he', sessionTime: '', aacDevice: '', absent: false,
      activitiesData: activities.map(() => ({
        goals: [],
        promptingLevel: { no: false, minimal: false, moderate: false, significant: false, 'one to one para support': false },
        promptingType: { verbal: false, visual: false, tactile: false },
        redirection: { no: false, regular: false, occasional: false, continuous: false },
        response: { enthusiastic: false, engaged: false, alert: false, disregulated: false, unengaged: false, tired: false, distracted: false },
        pragmaticSkills: [],
        pragmaticSkillsOther: '',
        deviceUsed: false,
        deviceType: '',
        deviceOther: '',
        usedSGDForActivity: false,
        usedSGDForDiscussion: false,
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

  const generateNotes = async () => {
    setIsGenerating(true);
    const notes = [];

    for (const student of students) {
      if (!student.name) continue;

      // Validate data structure
      if (!student.activitiesData || student.activitiesData.length !== activities.length) {
        notes.push({ 
          name: student.name, 
          sessionTime: student.sessionTime, 
          finalNote: "ERROR: Student data structure is corrupted. Please re-enter data for this student." 
        });
        continue;
      }

      // Check each activity's data integrity
      let dataCorrupted = false;
      for (let i = 0; i < student.activitiesData.length; i++) {
        const actData = student.activitiesData[i];
        if (!actData || 
            actData.goals === undefined || 
            actData.promptingLevel === undefined || 
            actData.promptingType === undefined ||
            actData.redirection === undefined ||
            actData.response === undefined) {
          dataCorrupted = true;
          break;
        }
      }

      if (dataCorrupted) {
        notes.push({ 
          name: student.name, 
          sessionTime: student.sessionTime, 
          finalNote: "ERROR: Activity data is corrupted or missing. Please re-enter data for this student." 
        });
        continue;
      }

      // Check if activity name is blank
      const hasBlankActivity = activities.some(act => !act.name || act.name.trim() === '');
      if (hasBlankActivity) {
        notes.push({ 
          name: student.name, 
          sessionTime: student.sessionTime, 
          finalNote: "ERROR: Activity name cannot be blank. Please select an activity." 
        });
        continue;
      }

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
        const redirections = Object.entries(actData.redirection)
          .filter(([k, v]) => v)
          .map(([k]) => k === 'no' ? 'no redirection to task was needed' : `${k} redirection to task`);
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
          domains: domains.join(', '),
          goals: selectedGoals.join(', '),
          promptingLevel: promptingLevelText,
          promptingType: promptingTypes.join(', '),
          redirection: redirections.join(', '),
          response: responses.join(', '),
          deviceUsed: actData.deviceUsed,
          deviceType: actData.deviceType === 'Other' ? actData.deviceOther : actData.deviceType,
          usedSGDForActivity: actData.usedSGDForActivity,
          usedSGDForDiscussion: actData.usedSGDForDiscussion,
          additionalNotes: actData.additionalNotes
        };
      }).filter(a => a.activity);

      const pronoun = student.gender === 'he' ? 'he/him' : student.gender === 'she' ? 'she/her' : 'they/them';

      // Log the data being sent to API
      console.log('=== GENERATING NOTE FOR:', student.name, '===');
      console.log('Activity Summaries:', JSON.stringify(activitySummaries, null, 2));

      try {
        const draftPrompt = `Turn the session data below into a flowing paragraph. Include only the information that is provided. Do not add anything that isn't in the data.

CRITICAL: If a field is empty or shows no value, do NOT mention that category at all. For example, if Redirection is empty, do not mention redirection. Only include categories that have actual data.

IMPORTANT: The activity description may have two parts - the main activity and additional details. These describe the SAME activity, not two different activities. Combine them into one description of what the student did.

CRITICAL: If the activity says "Displayed appropriate pragmatic language skills (...) while" followed by additional info, you MUST keep the complete activity description intact: "Displayed appropriate pragmatic language skills by [skills list] while [event/location from additional info]"

UNDERSTANDING GOALS: Goals are clinical targets being worked on during the session. They are NOT descriptions of what the student did. Do not use goal text as if it describes the activity. Goals will be mentioned separately as "This session addressed [domains], targeting [goals]."

Session data:
${activitySummaries.map(a => 
  `Activity: ${a.activity}. ${a.additionalInfo || ''} 
   Language domains: ${a.domains}
   Goals addressed: ${a.goals}
   Prompting: ${a.promptingLevel} ${a.promptingType}
   Redirection: ${a.redirection}
   Student response: ${a.response}${a.deviceUsed ? `
   Programmatic device used: ${a.deviceType}` : ''}${a.usedSGDForActivity ? `
   Used SGD to complete the activity` : ''}${a.usedSGDForDiscussion ? `
   Used SGD to engage in classroom discussion` : ''}
   Additional notes: ${a.additionalNotes || 'none'}`
).join('\n\n')}

Use ${student.name}'s name at the start, then use pronouns (${pronoun}). Write in past tense. Make it flow as one paragraph. Write one sentence of clinical significance explaining why the skills addressed in this session matter functionally for this student. This sentence is mandatory. It must be written fresh, never boilerplate, and specific to this student and this session's content.`;

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
          throw new Error(`Unexpected API response structure. Response: ${JSON.stringify(draftData).substring(0, 200)}`);
        }
        
        let draftNote = cleanClaudeResponse(draftData.content[0].text);

        const reviewPrompt = `Turn this into proper clinical language with correct sentence structure.

Original note:
${draftNote}

REQUIRED CHANGES:

${activitySummaries.some(a => a.activity.includes("Displayed appropriate pragmatic language skills")) ? `0. CRITICAL STRUCTURE FOR PRAGMATIC LANGUAGE ACTIVITY: When the activity is "Displayed appropriate pragmatic language skills...", the note must start with: [Student name] + [complete activity description including "displayed appropriate pragmatic language skills by [skills] while [event/location]"] + [given prompting] + [. New sentence about response]. Do NOT reorganize this. Do NOT move prompting away from the activity description.
   Example: "Romer displayed appropriate pragmatic language skills while on a shopping trip by effectively interacting with community members given moderate verbal, visual, and tactile prompting and regular redirection to task. He remained alert throughout."

` : ''}1. Separate what the student DID from the clinical information:
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
   - CRITICAL MLU: When mentioning MLU (mean length of utterance) goals, write them as actions (e.g., "expanding utterances to 3-5 words" or "increasing spoken utterances to 3-5 words"), NEVER as abbreviations (e.g., "MLU 3-5"). Never use "MLU" followed by a number range as a standalone phrase.

3. Integrate prompting into the action:
   - Prompting must be placed IMMEDIATELY after describing what the student did (the activity), NOT after describing their response
   - Use "given" not "with" when stating prompting levels
   - Wrong: "He chose the next news segment. He demonstrated alert responses with moderate prompting"
   - Right: "He chose the next news segment given moderate verbal and visual prompting. He remained alert throughout"
   - Wrong: "He gave directions with minimal prompting"
   - Right: "He gave directions given minimal verbal and visual prompting"
   - SPECIAL: If "one to one para support" is mentioned, treat it as ADDITIONAL support, not as the source of prompting
   - Wrong: "with significant prompting from his one-to-one paraprofessional"
   - Right: "given significant verbal and visual prompting and one-to-one paraprofessional support"
   - Structure: [Activity description] + [given prompting/support] + [. New sentence about response/engagement]

4. When a programmatic device or SGD is mentioned:
   - Start with the goal being addressed
   - Then describe what the student did (the activity), including device use as part of how they completed the action
   - Then apply prompting to the entire activity (not just device use)
   - Let the AI determine natural sentence breaks - do not force a rigid structure
   - The device is part of how the student participated, not a separate action
   - Example structure: "In order to work on [goal], [Student] participated in [activity] using [device] given [prompting]." - but the AI should break this into natural sentences

5. Use respectful, humanizing language when discussing people:
   - When students select or research historical figures, people, or individuals, phrase it respectfully
   - Wrong: "chose a woman of color"
   - Right: "selected a woman of color to feature in the segment" or "chose which woman of color to highlight in the segment"
   - Treat people as subjects being researched or featured, not objects being selected

6. Use proper clinical language and pronouns (${pronoun})

7. Past tense throughout

8. Ensure all references, quantities, and descriptors agree grammatically with their antecedents throughout the sentence.
   - Wrong: "Jayden selected an image from a provider-made history timeline and received a summary of each event" (he selected one image, so it should be "the event," not "each event")
   - Right: "Jayden selected an image from a provider-made history timeline and received a summary of the event"
   - Wrong: "She chose a card and matched them to the correct category" ("a card" is singular, so it should be "it," not "them")
   - Right: "She chose a card and matched it to the correct category"

9. Actions paired with clinical data (prompting, redirection, response) must be attributed to the individual student, not the class. The class can be referenced in a general descriptive sense, but any clinically specific information must be written as what the individual student did.
   - Wrong: "The class watched the news and chose their preferred lunch given moderate verbal and visual prompting."
   - Right: "She watched the news and chose her preferred lunch given moderate verbal and visual prompting."

10. The final item in a list must always be preceded by "and."
    - Wrong: "targeting her ability to remain on task, use a single cell device to communicate, express preference, comment, and gain attention."
    - Right: "targeting her ability to remain on task and use a single cell device to communicate, express preference, comment, and gain attention."

11. When prompting applies to an entire activity, it must not appear only in the final sentence where it reads as applying only to the last action described.
    - Wrong: "She answered questions about the event and watched a YouTube video. She chose her preferred lunch given moderate verbal and visual prompting."
    - Right: "She answered questions about the event given moderate verbal and visual prompting. She chose her preferred lunch given moderate verbal and visual prompting."

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
          throw new Error(`Review API request failed with status ${reviewRes.status}. Response: ${errorText.substring(0, 200)}`);
        }

        const reviewData = await reviewRes.json();
        
        if (!reviewData.content || !reviewData.content[0] || !reviewData.content[0].text) {
          throw new Error(`Unexpected API response structure. Response: ${JSON.stringify(reviewData).substring(0, 200)}`);
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
    const nameOrder = ["Jayden", "Angel", "Yaneurys", "Imane", "Melanie", "Bessy"];
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800">José - SESIS Note Generator</h1>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Session Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
            </div>
            <button onClick={clearAll} className="ml-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
              Clear All
            </button>
          </div>
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
                      placeholder="e.g., 10:48-11:18"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>

                  {student.aacDevice && <p className="text-sm text-gray-600 mb-2">AAC: {student.aacDevice}</p>}

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
                      
                      {['Jayden', 'Imane', 'Bessy', 'Yaneurys'].includes(student.name) && (
                        <div className="mb-2 p-2 bg-purple-50 rounded border">
                          <label className="flex items-center gap-2 text-xs font-medium mb-2">
                            <input 
                              type="checkbox" 
                              checked={student.activitiesData[aIdx].deviceUsed || false} 
                              onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'deviceUsed', e.target.checked)} 
                            />
                            Programmatic device used
                          </label>
                          {student.activitiesData[aIdx].deviceUsed && (
                            <div className="ml-4 space-y-1">
                              <label className="flex items-center gap-2 text-xs">
                                <input 
                                  type="radio" 
                                  name={`device-${sIdx}-${aIdx}`}
                                  checked={student.activitiesData[aIdx].deviceType === 'Single cell'} 
                                  onChange={() => updateStudentActivityData(sIdx, aIdx, 'deviceType', 'Single cell')} 
                                />
                                Single cell
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <input 
                                  type="radio" 
                                  name={`device-${sIdx}-${aIdx}`}
                                  checked={student.activitiesData[aIdx].deviceType === 'CoughDrop board made for activity'} 
                                  onChange={() => updateStudentActivityData(sIdx, aIdx, 'deviceType', 'CoughDrop board made for activity')} 
                                />
                                CoughDrop board made for activity
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <input 
                                  type="radio" 
                                  name={`device-${sIdx}-${aIdx}`}
                                  checked={student.activitiesData[aIdx].deviceType === 'Yes/No on CoughDrop'} 
                                  onChange={() => updateStudentActivityData(sIdx, aIdx, 'deviceType', 'Yes/No on CoughDrop')} 
                                />
                                Yes/No on CoughDrop
                              </label>
                              <label className="flex items-center gap-2 text-xs">
                                <input 
                                  type="radio" 
                                  name={`device-${sIdx}-${aIdx}`}
                                  checked={student.activitiesData[aIdx].deviceType === 'Other'} 
                                  onChange={() => updateStudentActivityData(sIdx, aIdx, 'deviceType', 'Other')} 
                                />
                                Other
                              </label>
                              {student.activitiesData[aIdx].deviceType === 'Other' && (
                                <input 
                                  type="text"
                                  value={student.activitiesData[aIdx].deviceOther || ''}
                                  onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'deviceOther', e.target.value)}
                                  placeholder="Specify device type..."
                                  className="w-full px-2 py-1 border rounded text-xs mt-1"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {student.name === 'Angel' && (
                        <div className="mb-2 p-2 bg-green-50 rounded border">
                          <label className="block text-xs font-medium mb-2">Angel's SGD Use:</label>
                          <label className="flex items-center gap-2 text-xs mb-1">
                            <input 
                              type="checkbox" 
                              checked={student.activitiesData[aIdx].usedSGDForActivity || false} 
                              onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'usedSGDForActivity', e.target.checked)} 
                            />
                            Used SGD to complete the activity
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <input 
                              type="checkbox" 
                              checked={student.activitiesData[aIdx].usedSGDForDiscussion || false} 
                              onChange={(e) => updateStudentActivityData(sIdx, aIdx, 'usedSGDForDiscussion', e.target.checked)} 
                            />
                            Used SGD to engage in classroom discussion
                          </label>
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
