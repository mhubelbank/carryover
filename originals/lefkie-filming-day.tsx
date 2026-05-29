import React, { useState } from 'react';
import { Plus, X, FileText, Loader2, Copy, ChevronDown, ChevronUp } from 'lucide-react';

// Lefkie's Students Data
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

// Student Goals Data
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

// Schedule data
const scheduleData = {
  "Monday": {
    "8:44-9:14": ["Deandre", "Delyla", "Janaya", "Brianna"],
    "9:15-9:45": ["Aaron", "Jamie", "Ethan", "Cherish"]
  }
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
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s+/g, '');
  return cleaned.trim();
};

export default function LefkieFilmingDayGenerator() {
  const [date, setDate] = useState('');
  const [students, setStudents] = useState([]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState([0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  // Load saved data on mount
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const notesResult = await window.storage.get('lefkie-filming-notes');
        if (notesResult && notesResult.value) {
          setGeneratedNotes(JSON.parse(notesResult.value));
        }
      } catch (error) {
        console.log('No saved notes');
      }

      try {
        const inputResult = await window.storage.get('lefkie-filming-input');
        if (inputResult && inputResult.value) {
          const saved = JSON.parse(inputResult.value);
          if (saved.date) setDate(saved.date);
          if (saved.students) setStudents(saved.students);
        }
      } catch (error) {
        console.log('No saved input');
      }
    };
    loadData();
  }, []);

  // Save data with 5 second debounce
  React.useEffect(() => {
    const timeoutId = setTimeout(async () => {
      try {
        if (generatedNotes.length > 0) {
          await window.storage.set('lefkie-filming-notes', JSON.stringify(generatedNotes));
        }
        if (date || students.length > 0) {
          await window.storage.set('lefkie-filming-input', JSON.stringify({ date, students }));
        }
      } catch (error) {
        console.error('Failed to save:', error);
      }
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, [date, students, generatedNotes]);



  React.useEffect(() => {
    if (date && students.length > 0) {
      const updatedStudents = students.map(student => ({
        ...student,
        sessionTime: student.name ? getSessionTime(student.name, date) : ''
      }));
      setStudents(updatedStudents);
    }
  }, [date]);

  const addStudent = () => {
    setStudents([...students, {
      name: '', gender: 'he', sessionTime: '', role: '', otherRoleDescription: '', absent: false,
      facialExpressions: { enabled: false, percentage: '', cueLevel: '' },
      prosody: { enabled: false, percentage: '', cueLevel: '' },
      respondedToVisualCues: { enabled: false, percentage: '' },
      decoding: { enabled: false, percentage: '' },
      maintainedAttention: { enabled: false, percentage: '', promptingLevel: '' },
      waitedToSpeak: { enabled: false, percentage: '', promptingLevel: '' },
      appropriateBehavior: { enabled: false, percentage: '', promptingLevel: '' },
      gaveCompliments: '', rehearsalCarryover: '', additionalNotes: '', goals: []
    }]);
    setExpandedStudents([...expandedStudents, students.length]);
  };

  const updateStudent = (index, field, value) => {
    const newStudents = [...students];
    if (field.includes('.')) {
      const parts = field.split('.');
      if (parts.length === 2) newStudents[index][parts[0]][parts[1]] = value;
    } else {
      newStudents[index][field] = value;
      if (field === 'name' && value) {
        const saved = savedStudents.find(s => s.name === value);
        if (saved) {
          newStudents[index].gender = saved.gender;
          newStudents[index].sessionTime = getSessionTime(value, date) || '';
        }
      }
    }
    setStudents(newStudents);
  };

  const toggleGoal = (sIdx, goalIdx) => {
    const newStudents = [...students];
    const goals = newStudents[sIdx].goals;
    newStudents[sIdx].goals = goals.includes(goalIdx) ? goals.filter(g => g !== goalIdx) : [...goals, goalIdx];
    setStudents(newStudents);
  };

  const removeStudent = (index) => setStudents(students.filter((_, i) => i !== index));
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
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const clearAll = async () => {
    setDate('');
    setStudents([]);
    setGeneratedNotes([]);
    setExpandedStudents([0]);
    try {
      await window.storage.delete('lefkie-filming-notes');
      await window.storage.delete('lefkie-filming-input');
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  };

  const generateNotes = async () => {
    setIsGenerating(true);
    const notes = [];

    for (const student of students) {
      if (!student.name) continue;
      
      if (student.absent) {
        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: 'absent' });
        continue;
      }
      
      if (!student.role) {
        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: 'Error: No role selected for this student' });
        continue;
      }

      const pronoun = student.gender === 'he' ? 'he/him' : 'she/her';
      const pronounSubject = student.gender === 'he' ? 'he' : 'she';
      const selectedGoals = student.goals.map(gIdx => (studentGoalsData[student.name] || [])[gIdx]?.shortName).filter(Boolean);

      let roleSpecificData = '';
      
      if (student.role === 'Anchor' || student.role === 'Lunch Anchor') {
        if (student.facialExpressions.enabled) {
          roleSpecificData += `\nFacial expressions: Demonstrated appropriate facial expressions for scripted lines in approximately ${student.facialExpressions.percentage}% of opportunities given ${student.facialExpressions.cueLevel} visual cues`;
        }
        if (student.prosody.enabled) {
          roleSpecificData += `\nProsody: Demonstrated appropriate prosodic variation (pitch, rate, volume) for scripted lines in approximately ${student.prosody.percentage}% of opportunities given ${student.prosody.cueLevel} visual cues`;
        }
        if (student.respondedToVisualCues.enabled) {
          roleSpecificData += `\nVisual cues: Appropriately responded to visual cues from the provider in approximately ${student.respondedToVisualCues.percentage}% of opportunities during the live broadcast`;
        }
        if (student.decoding.enabled) {
          roleSpecificData += `\nDecoding: carried over correct pronunciation of challenging words to read from rehearsal to broadcast in ~${student.decoding.percentage}% of opportunities without additional prompting`;
        }
      }
      
      if (student.role === 'Studio Audience') {
        if (student.maintainedAttention.enabled) {
          roleSpecificData += `\nMaintained attention to anchors: in approximately ${student.maintainedAttention.percentage}% of opportunities given ${student.maintainedAttention.promptingLevel} prompting`;
        }
        if (student.waitedToSpeak.enabled) {
          roleSpecificData += `\nWaited for appropriate times to speak: in approximately ${student.waitedToSpeak.percentage}% of opportunities given ${student.waitedToSpeak.promptingLevel} prompting`;
        }
        if (student.appropriateBehavior.enabled) {
          roleSpecificData += `\nDisplayed appropriate audience behavior: in approximately ${student.appropriateBehavior.percentage}% of opportunities given ${student.appropriateBehavior.promptingLevel} prompting`;
        }
        if (student.gaveCompliments) {
          roleSpecificData += `\nGave compliments: ${student.gaveCompliments}`;
        }
      }

      if (student.rehearsalCarryover) roleSpecificData += `\nRehearsal carryover: ${student.rehearsalCarryover}`;
      if (student.additionalNotes) roleSpecificData += `\nAdditional notes: ${student.additionalNotes}`;

      // Determine the correct article/phrasing for the role
      let rolePhrase = '';
      if (student.role === 'Anchor') rolePhrase = 'an anchor';
      else if (student.role === 'Lunch Anchor') rolePhrase = 'the lunch anchor';
      else if (student.role === 'Sports') rolePhrase = 'the sports reporter';
      else if (student.role === 'Weather') rolePhrase = 'the weather reporter';
      else if (student.role === 'Studio Audience') rolePhrase = 'a member of the studio audience';
      else if (student.role === 'Other' && student.otherRoleDescription) rolePhrase = student.otherRoleDescription.toLowerCase();
      else rolePhrase = student.role.toLowerCase();

      try {
        const draftPrompt = `You are writing a professional SLP session note for ${student.name} (${pronoun}).

Activity: Collaborated with classmates to produce a live episode of the 811X Dragon News
Role: ${student.role}
Goals addressed: ${selectedGoals.join(', ')}
${roleSpecificData}

Write ONE cohesive paragraph that:
- Starts with: "${student.name} collaborated with ${student.gender === 'he' ? 'his' : 'her'} peers to produce a live episode of the 811X Dragon News, serving as ${rolePhrase}."
- Uses ${student.name}'s name AND pronouns (${pronoun}) naturally throughout the rest of the paragraph
- MUST explicitly state which goals were targeted. CRITICAL: First look at the performance data and additional notes provided. Check if any documented behaviors match the selected goals. If a documented behavior demonstrates a goal, connect them directly using "by" (e.g., "She worked on asking for help by looking at the provider when she needed assistance"). If a goal was selected but no matching behavior is documented, state the goal was addressed without inventing details
- For each performance data point above, state it with natural connecting language but PRESERVE the exact structure:
  * For "Maintained attention... in approximately X% of opportunities given [level] prompting" → keep this format
  * For "Waited for appropriate times... in approximately X% of opportunities given [level] prompting" → keep this format
  * For "Displayed appropriate audience behavior... in approximately X% of opportunities given [level] prompting" → keep this format
  * For "Decoding: carried over..." → say "carried over correct pronunciation of challenging words ${pronounSubject} struggled to decode in rehearsal in approximately X% of opportunities without additional prompting"
  * For facial expressions and prosody → keep the structure with percentages and cue levels
- CRITICAL ORDERING: Group related information together. If additional notes relate to a specific performance metric (e.g., behavioral support needed for audience behavior), place that information immediately after the performance metric it relates to.
- CRITICAL: Always place information about giving compliments at the END of the paragraph, as this happens last in the session
- DO NOT invent specific behavioral details not provided in the data (like "frequent redirection," "quiet listening posture," "appropriate facial expressions," "sustained focus," "responsive engagement")
- DO NOT add phrases like "during the collaborative news production activity" or "participated in the broadcast activity" or "while working on [skill name] skills"
- Is written in past tense
- Uses professional SLP clinical language
- Flows naturally as ONE paragraph with NO labels, headers, or sections

CRITICAL: State ONLY the data provided. Add connecting phrases for flow, but do NOT add behavioral descriptions or interpretations.

Do NOT include: date, "Speech-Language Pathology Session Note", "Activity:", "Role:", "Goals:", or any other labels.
Just write the flowing paragraph.`;

        const draftRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{ role: "user", content: draftPrompt }]
          })
        });

        if (!draftRes.ok) throw new Error(`Draft API failed: ${draftRes.status}`);
        const draftData = await draftRes.json();
        let draftNote = cleanClaudeResponse(draftData.content[0].text);

        await delay(2000);

        const reviewPrompt = `Review this SLP session note. Fix any problems with logic, clarity, grammar, or clinical language. Do NOT add new information.

Original note:
${draftNote}

Fix these if present:
- Confusing sentences or timeline (simplify)
- Run-on sentences (break them up)
- Grammar errors
- Uses "the student" instead of name/pronouns
- Not in past tense
- Has labels or headers (remove them)
- Missing mention of which goals were targeted (make sure goals are stated)

CRITICAL: Do NOT add phrases like "while working on [skill name] skills" or other redundant filler.

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

        if (!reviewRes.ok) throw new Error(`Review API failed: ${reviewRes.status}`);
        const reviewData = await reviewRes.json();
        let reviewedNote = cleanClaudeResponse(reviewData.content[0].text);

        await delay(2000);

        const streamlinePrompt = `Check this SLP session note for logic and remove redundant phrasing while keeping ALL clinical information.

Original note:
${reviewedNote}

Tasks:
1. Check if the note is logically organized and makes sense
2. Remove redundant phrases that repeat the same information (like "carried over pronunciation... while working on decoding skills")
3. Remove unnecessary elaboration
4. Make wordy explanations more concise

Keep ALL:
- Specific performance data (percentages, prompting levels)
- All goals mentioned
- All activities described
- All clinical observations

CRITICAL ANTI-FABRICATION RULES:
- Do NOT add ANY information that is not in the original note
- Do NOT create causal connections that were not stated
- Do NOT interpret or explain beyond what was documented
- Do NOT add descriptions of why things happened
- DO NOT elaborate on any information
- ONLY reorganize and remove redundancy from what is explicitly stated
- Make sure the goals targeted are still mentioned

CRITICAL: Return ONLY the final streamlined paragraph. Do NOT include any explanations, "Changes made:" lists, or meta-commentary. Just return the note itself.`;

        const streamlineRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{ role: "user", content: streamlinePrompt }]
          })
        });

        if (!streamlineRes.ok) throw new Error(`Streamline API failed: ${streamlineRes.status}`);
        const streamlineData = await streamlineRes.json();
        let finalNote = cleanClaudeResponse(streamlineData.content[0].text);

        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote });
        await delay(2000);
      } catch (error) {
        notes.push({ name: student.name, sessionTime: student.sessionTime, finalNote: `Error: ${error.message}` });
      }
    }

    const nameOrder = ["Deandre", "Delyla", "Janaya", "Brianna", "Aaron", "Jamie", "Ethan", "Cherish"];
    notes.sort((a, b) => {
      if (a.sessionTime && b.sessionTime && a.sessionTime !== b.sessionTime) return a.sessionTime.localeCompare(b.sessionTime);
      if (a.sessionTime && !b.sessionTime) return -1;
      if (!a.sessionTime && b.sessionTime) return 1;
      const indexA = nameOrder.indexOf(a.name);
      const indexB = nameOrder.indexOf(b.name);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    if (notes.length > 0 && date) {
      const dateObj = new Date(date + 'T00:00:00');
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      notes[0].formattedDate = `${dayNames[dateObj.getDay()]}, ${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')}.${String(dateObj.getFullYear()).slice(-2)}`;
    }

    setGeneratedNotes(notes);
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Lefkie's Filming Day Note Generator</h1>
            <button onClick={clearAll} className="px-4 py-2 bg-red-600 text-white rounded-md">
              <X size={16} className="inline mr-1" /> Clear All
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Session Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
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
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={student.absent}
                        onChange={(e) => updateStudent(sIdx, 'absent', e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium">Student was absent</span>
                    </label>
                  </div>

                  {student.sessionTime && <p className="text-sm font-semibold text-blue-600 mb-2">Session Time: {student.sessionTime}</p>}

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Role</label>
                    <select value={student.role} onChange={(e) => updateStudent(sIdx, 'role', e.target.value)} className="w-full px-3 py-2 border rounded-md">
                      <option value="">Select role...</option>
                      <option value="Anchor">Anchor</option>
                      <option value="Lunch Anchor">Lunch Anchor</option>
                      <option value="Sports">Sports</option>
                      <option value="Weather">Weather</option>
                      <option value="Studio Audience">Studio Audience</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {student.role === 'Other' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-1">Describe Role</label>
                      <textarea value={student.otherRoleDescription || ''} onChange={(e) => updateStudent(sIdx, 'otherRoleDescription', e.target.value)} placeholder="What did the student do?" rows="2" className="w-full px-3 py-2 border rounded-md text-sm" />
                    </div>
                  )}

                  {(student.role === 'Anchor' || student.role === 'Lunch Anchor') && (
                    <div className="mb-4 p-3 bg-blue-50 rounded border">
                      <h4 className="font-semibold text-sm mb-2">Anchor-Specific Data</h4>
                      
                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.facialExpressions.enabled} onChange={(e) => updateStudent(sIdx, 'facialExpressions.enabled', e.target.checked)} />
                        <span className="text-xs">Demonstrated appropriate facial expressions for scripted lines in approximately</span>
                      </label>
                      {student.facialExpressions.enabled && (
                        <div className="ml-6 flex items-center gap-2 mb-3 text-xs">
                          <select value={student.facialExpressions.percentage} onChange={(e) => updateStudent(sIdx, 'facialExpressions.percentage', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">%</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30">30</option>
                            <option value="40">40</option>
                            <option value="50">50</option>
                            <option value="60">60</option>
                            <option value="70">70</option>
                            <option value="80">80</option>
                            <option value="90">90</option>
                            <option value="100">100</option>
                          </select>
                          <span>% of opportunities given</span>
                          <select value={student.facialExpressions.cueLevel} onChange={(e) => updateStudent(sIdx, 'facialExpressions.cueLevel', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">level</option>
                            <option value="no">no</option>
                            <option value="minimal">minimal</option>
                            <option value="moderate">moderate</option>
                            <option value="significant">significant</option>
                          </select>
                          <span>visual cues.</span>
                        </div>
                      )}

                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.prosody.enabled} onChange={(e) => updateStudent(sIdx, 'prosody.enabled', e.target.checked)} />
                        <span className="text-xs">Demonstrated appropriate prosodic variation (pitch, rate, volume) for scripted lines in approximately</span>
                      </label>
                      {student.prosody.enabled && (
                        <div className="ml-6 flex items-center gap-2 mb-3 text-xs">
                          <select value={student.prosody.percentage} onChange={(e) => updateStudent(sIdx, 'prosody.percentage', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">%</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30">30</option>
                            <option value="40">40</option>
                            <option value="50">50</option>
                            <option value="60">60</option>
                            <option value="70">70</option>
                            <option value="80">80</option>
                            <option value="90">90</option>
                            <option value="100">100</option>
                          </select>
                          <span>% of opportunities given</span>
                          <select value={student.prosody.cueLevel} onChange={(e) => updateStudent(sIdx, 'prosody.cueLevel', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">level</option>
                            <option value="no">no</option>
                            <option value="minimal">minimal</option>
                            <option value="moderate">moderate</option>
                            <option value="significant">significant</option>
                          </select>
                          <span>visual cues.</span>
                        </div>
                      )}

                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.respondedToVisualCues.enabled} onChange={(e) => updateStudent(sIdx, 'respondedToVisualCues.enabled', e.target.checked)} />
                        <span className="text-xs">Appropriately responded to visual cues from the provider in approximately</span>
                      </label>
                      {student.respondedToVisualCues.enabled && (
                        <div className="ml-6 flex items-center gap-2 mb-3 text-xs">
                          <select value={student.respondedToVisualCues.percentage} onChange={(e) => updateStudent(sIdx, 'respondedToVisualCues.percentage', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">%</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30">30</option>
                            <option value="40">40</option>
                            <option value="50">50</option>
                            <option value="60">60</option>
                            <option value="70">70</option>
                            <option value="80">80</option>
                            <option value="90">90</option>
                            <option value="100">100</option>
                          </select>
                          <span>% of opportunities during the live broadcast.</span>
                        </div>
                      )}

                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.decoding.enabled} onChange={(e) => updateStudent(sIdx, 'decoding.enabled', e.target.checked)} />
                        <span className="text-xs">Decoding: carried over correct pronunciation of challenging words to read from rehearsal to broadcast in ~</span>
                      </label>
                      {student.decoding.enabled && (
                        <div className="ml-6 flex items-center gap-2 mb-3 text-xs">
                          <select value={student.decoding.percentage} onChange={(e) => updateStudent(sIdx, 'decoding.percentage', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">%</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30">30</option>
                            <option value="40">40</option>
                            <option value="50">50</option>
                            <option value="60">60</option>
                            <option value="70">70</option>
                            <option value="80">80</option>
                            <option value="90">90</option>
                            <option value="100">100</option>
                          </select>
                          <span>% of opportunities without additional prompting</span>
                        </div>
                      )}
                    </div>
                  )}

                  {student.role === 'Studio Audience' && (
                    <div className="mb-4 p-3 bg-green-50 rounded border">
                      <h4 className="font-semibold text-sm mb-2">Studio Audience Data</h4>
                      
                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.maintainedAttention.enabled} onChange={(e) => updateStudent(sIdx, 'maintainedAttention.enabled', e.target.checked)} />
                        <span className="text-xs">Maintained attention to anchors in</span>
                      </label>
                      {student.maintainedAttention.enabled && (
                        <div className="ml-6 flex items-center gap-2 mb-3 text-xs">
                          <select value={student.maintainedAttention.percentage} onChange={(e) => updateStudent(sIdx, 'maintainedAttention.percentage', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">%</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30">30</option>
                            <option value="40">40</option>
                            <option value="50">50</option>
                            <option value="60">60</option>
                            <option value="70">70</option>
                            <option value="80">80</option>
                            <option value="90">90</option>
                            <option value="100">100</option>
                          </select>
                          <span>% of opportunities given</span>
                          <select value={student.maintainedAttention.promptingLevel} onChange={(e) => updateStudent(sIdx, 'maintainedAttention.promptingLevel', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">level</option>
                            <option value="no">no</option>
                            <option value="minimal">minimal</option>
                            <option value="moderate">moderate</option>
                            <option value="significant">significant</option>
                            <option value="one to one para support">one to one para support</option>
                          </select>
                          <span>prompting.</span>
                        </div>
                      )}

                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.waitedToSpeak.enabled} onChange={(e) => updateStudent(sIdx, 'waitedToSpeak.enabled', e.target.checked)} />
                        <span className="text-xs">Waited for appropriate times to speak in</span>
                      </label>
                      {student.waitedToSpeak.enabled && (
                        <div className="ml-6 flex items-center gap-2 mb-3 text-xs">
                          <select value={student.waitedToSpeak.percentage} onChange={(e) => updateStudent(sIdx, 'waitedToSpeak.percentage', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">%</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30">30</option>
                            <option value="40">40</option>
                            <option value="50">50</option>
                            <option value="60">60</option>
                            <option value="70">70</option>
                            <option value="80">80</option>
                            <option value="90">90</option>
                            <option value="100">100</option>
                          </select>
                          <span>% of opportunities given</span>
                          <select value={student.waitedToSpeak.promptingLevel} onChange={(e) => updateStudent(sIdx, 'waitedToSpeak.promptingLevel', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">level</option>
                            <option value="no">no</option>
                            <option value="minimal">minimal</option>
                            <option value="moderate">moderate</option>
                            <option value="significant">significant</option>
                            <option value="one to one para support">one to one para support</option>
                          </select>
                          <span>prompting.</span>
                        </div>
                      )}

                      <label className="flex items-center gap-2 mb-2">
                        <input type="checkbox" checked={student.appropriateBehavior.enabled} onChange={(e) => updateStudent(sIdx, 'appropriateBehavior.enabled', e.target.checked)} />
                        <span className="text-xs">Displayed appropriate audience behavior in</span>
                      </label>
                      {student.appropriateBehavior.enabled && (
                        <div className="ml-6 flex items-center gap-2 mb-3 text-xs">
                          <select value={student.appropriateBehavior.percentage} onChange={(e) => updateStudent(sIdx, 'appropriateBehavior.percentage', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">%</option>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="30">30</option>
                            <option value="40">40</option>
                            <option value="50">50</option>
                            <option value="60">60</option>
                            <option value="70">70</option>
                            <option value="80">80</option>
                            <option value="90">90</option>
                            <option value="100">100</option>
                          </select>
                          <span>% of opportunities given</span>
                          <select value={student.appropriateBehavior.promptingLevel} onChange={(e) => updateStudent(sIdx, 'appropriateBehavior.promptingLevel', e.target.value)} className="px-2 py-1 border rounded">
                            <option value="">level</option>
                            <option value="no">no</option>
                            <option value="minimal">minimal</option>
                            <option value="moderate">moderate</option>
                            <option value="significant">significant</option>
                            <option value="one to one para support">one to one para support</option>
                          </select>
                          <span>prompting.</span>
                        </div>
                      )}

                      <div className="mb-2">
                        <label className="block text-xs font-medium mb-1">Gave Compliments</label>
                        <select value={student.gaveCompliments} onChange={(e) => updateStudent(sIdx, 'gaveCompliments', e.target.value)} className="w-full px-2 py-1 border rounded text-sm">
                          <option value="">Select...</option>
                          <option value="independent">independent</option>
                          <option value="minimal prompting">minimal prompting</option>
                          <option value="moderate prompting">moderate prompting</option>
                          <option value="significant prompting">significant prompting</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Goals</label>
                    {(studentGoalsData[student.name] || []).map((goal, gIdx) => (
                      <label key={gIdx} className="flex items-start gap-2 text-xs mb-1">
                        <input type="checkbox" checked={student.goals.includes(gIdx)} onChange={() => toggleGoal(sIdx, gIdx)} className="mt-1" />
                        <span>{goal.shortName}</span>
                      </label>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Rehearsal → Broadcast</label>
                    <textarea value={student.rehearsalCarryover} onChange={(e) => updateStudent(sIdx, 'rehearsalCarryover', e.target.value)} placeholder="How did rehearsal carry over?" rows="2" className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Additional Notes</label>
                    <textarea value={student.additionalNotes} onChange={(e) => updateStudent(sIdx, 'additionalNotes', e.target.value)} placeholder="Any other observations..." rows="2" className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>

                  <button onClick={() => removeStudent(sIdx)} className="px-4 py-2 bg-red-600 text-white rounded-md mt-2">Remove Student</button>
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
              <button onClick={() => copyToClipboard(generatedNotes.map(n => 
                `${n.formattedDate ? n.formattedDate + '\n\n' : ''}${n.sessionTime ? n.sessionTime + '\n' : ''}${n.finalNote === 'absent' ? `${n.name}: absent` : `${n.name}:\n${n.finalNote}`}\n`
              ).join('\n'))} className="px-3 py-1 bg-green-600 text-white rounded text-sm"><Copy size={14} className="inline mr-1" /> Copy All Notes</button>
            </div>
            {generatedNotes.map((note, idx) => (
              <div key={idx} className="mb-6 border-t pt-4">
                {note.formattedDate && <p className="text-sm font-semibold text-blue-600 mb-1">{note.formattedDate}</p>}
                {note.sessionTime && <p className="text-sm font-semibold text-blue-600 mb-1">{note.sessionTime}</p>}
                <h3 className="font-semibold mb-2">{note.name}</h3>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Final Note</span>
                    <button onClick={() => copyToClipboard(`${note.formattedDate ? note.formattedDate + '\n\n' : ''}${note.sessionTime ? note.sessionTime + '\n' : ''}${note.finalNote === 'absent' ? `${note.name}: absent` : `${note.name}:\n${note.finalNote}`}`)} className="px-2 py-1 bg-gray-500 text-white rounded text-xs"><Copy size={12} /></button>
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