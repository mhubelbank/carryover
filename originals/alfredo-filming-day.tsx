import React, { useState, useEffect } from 'react';
import { Copy, Plus, X, ChevronDown, ChevronUp, Loader2, FileText } from 'lucide-react';

const AlfredoFilmingDayGenerator = () => {
  const studentGoalsData = {
    "Eduardo": [
      { shortName: "identify main topic" },
      { shortName: "answer who questions" },
      { shortName: "answer what questions" },
      { shortName: "answer where questions" },
      { shortName: "sequence picture cards 2-step" },
      { shortName: "sequence picture cards 3-step" },
      { shortName: "retell 3-step narrative" }
    ],
    "Lemir": [
      { shortName: "answer WH questions with text evidence" },
      { shortName: "identify and communicate feelings" },
      { shortName: "justify emotion" },
      { shortName: "use positive affirming words" },
      { shortName: "demonstrate coping strategy" },
      { shortName: "identify supporting details" },
      { shortName: "identify main idea" }
    ],
    "Ty'Heem": [
      { shortName: "respond to how/why questions" },
      { shortName: "respond to where/when questions" },
      { shortName: "select and initiate topic" },
      { shortName: "offer supportive comments" },
      { shortName: "bridge topic to expand" },
      { shortName: "brainstorm 3 ideas" },
      { shortName: "elaborate on topic" },
      { shortName: "use transitional words" },
      { shortName: "craft introduction/conclusion" }
    ],
    "Alisia": [
      { shortName: "respond to who/what questions" },
      { shortName: "respond to where/when questions" },
      { shortName: "respond to how/why questions" },
      { shortName: "initiate social interaction" },
      { shortName: "request desired items" },
      { shortName: "respond to peer questions" },
      { shortName: "understand sentence structure" },
      { shortName: "write 3-5 word sentence" },
      { shortName: "write two 3-5 word sentences" }
    ],
    "Joel": [
      { shortName: "identify feelings" },
      { shortName: "identify coping strategies" },
      { shortName: "use coping skill with prompt" },
      { shortName: "use coping skill independently" },
      { shortName: "recall explicit text details" },
      { shortName: "write sentences with supports" },
      { shortName: "initiate comment (3-4 words)" },
      { shortName: "initiate question (3-5 words)" },
      { shortName: "answer WH questions 2-3 words" }
    ],
    "Payton": [],
    "Fabian": [
      { shortName: "identify key details" },
      { shortName: "compare and contrast" },
      { shortName: "answer inference questions" },
      { shortName: "make inferences about characters" },
      { shortName: "answer when questions" },
      { shortName: "answer how questions" },
      { shortName: "answer why questions" }
    ]
  };

  const savedStudents = [
    { name: "Eduardo", gender: "he" },
    { name: "Lemir", gender: "he" },
    { name: "Ty'Heem", gender: "he" },
    { name: "Alisia", gender: "she" },
    { name: "Joel", gender: "he" },
    { name: "Payton", gender: "she" },
    { name: "Fabian", gender: "he" }
  ];

  const scheduleData = {
    "Monday": {
      "12:04-12:34": ["Fabian"]
    },
    "Tuesday": {
      "8:44-9:14": ["Eduardo", "Lemir", "Justin"],
      "9:15-9:45": ["Ty'Heem", "Alisia", "Joel"]
    },
    "Wednesday": {
      "8:44-9:14": ["Eduardo", "Lemir", "Justin"],
      "9:15-9:45": ["Fabian"]
    },
    "Friday": {
      "8:44-9:14": ["Fabian"],
      "9:15-9:45": ["Ty'Heem", "Alisia", "Joel"]
    }
  };

  const getSessionTime = (studentName, dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T12:00:00');
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

  const [date, setDate] = useState('');
  const [students, setStudents] = useState([]);
  const [generatedNotes, setGeneratedNotes] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState([0]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const dateResult = await window.storage.get('alfredo-filming-date');
        if (dateResult) setDate(dateResult.value);
        
        const studentsResult = await window.storage.get('alfredo-filming-students');
        if (studentsResult) setStudents(JSON.parse(studentsResult.value));
        
        const expandedResult = await window.storage.get('alfredo-filming-expanded');
        if (expandedResult) setExpandedStudents(JSON.parse(expandedResult.value));
      } catch (error) {
        console.log('No saved data found');
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (date && students.length > 0) {
      const updatedStudents = students.map(student => ({
        ...student,
        sessionTime: student.name ? getSessionTime(student.name, date) || '' : ''
      }));
      setStudents(updatedStudents);
    }
  }, [date]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await window.storage.set('alfredo-filming-date', date);
        await window.storage.set('alfredo-filming-students', JSON.stringify(students));
        await window.storage.set('alfredo-filming-expanded', JSON.stringify(expandedStudents));
      } catch (error) {
        console.error('Save failed:', error);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [date, students, expandedStudents]);

  const addStudent = () => {
    const newStudent = {
      name: '', gender: '', role: '', sessionTime: '', goals: [], absent: false,
      cuesPercentage: '', cuesPrompting: '', cuesTarget: '',
      facialPercentage: '', facialPrompting: '',
      decodingPercentage: '',
      pragmaticSkills: {
        maintainedAttention: { enabled: false, promptLevel: '', qualityLevel: '' },
        waitedToSpeak: { enabled: false, promptLevel: '', qualityLevel: '' },
        appropriateBehavior: { enabled: false, promptLevel: '', qualityLevel: '' }
      },
      gaveCompliments: false, complimentsPrompting: '',
      rehearsalToBroadcast: '', additionalNotes: '',
      otherRoleDescription: '', affect: []
    };
    setStudents([...students, newStudent]);
    setExpandedStudents([...expandedStudents, students.length]);
  };

  const removeStudent = (index) => {
    setStudents(students.filter((_, i) => i !== index));
    setExpandedStudents(expandedStudents.filter(i => i !== index).map(i => i > index ? i - 1 : i));
  };

  const updateStudent = (index, field, value) => {
    const newStudents = [...students];
    newStudents[index][field] = value;
    if (field === 'name' && value) {
      const saved = savedStudents.find(s => s.name === value);
      if (saved) {
        newStudents[index].gender = saved.gender;
        newStudents[index].sessionTime = getSessionTime(value, date) || '';
      }
    }
    setStudents(newStudents);
  };

  const toggleGoal = (studentIndex, goalIndex) => {
    const newStudents = [...students];
    const currentGoals = newStudents[studentIndex].goals;
    if (currentGoals.includes(goalIndex)) {
      newStudents[studentIndex].goals = currentGoals.filter(g => g !== goalIndex);
    } else {
      newStudents[studentIndex].goals = [...currentGoals, goalIndex];
    }
    setStudents(newStudents);
  };

  const toggleAffect = (studentIndex, affectValue) => {
    const newStudents = [...students];
    const currentAffect = newStudents[studentIndex].affect || [];
    if (currentAffect.includes(affectValue)) {
      newStudents[studentIndex].affect = currentAffect.filter(a => a !== affectValue);
    } else {
      newStudents[studentIndex].affect = [...currentAffect, affectValue];
    }
    setStudents(newStudents);
  };

  const toggleExpanded = (index) => {
    if (expandedStudents.includes(index)) {
      setExpandedStudents(expandedStudents.filter(i => i !== index));
    } else {
      setExpandedStudents([...expandedStudents, index]);
    }
  };

  const generateNotes = async () => {
    if (students.length === 0) {
      alert('Please add at least one student before generating notes.');
      return;
    }

    setIsGenerating(true);
    const notes = [];

    try {
      for (const student of students) {
        if (!student.name) continue;

        const formattedDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: '2-digit', day: '2-digit', year: '2-digit'
        }).replace(/(\d+)\/(\d+)\/(\d+)/, '$1.$2.$3') : '';

        if (student.absent) {
          notes.push({
            name: student.name,
            sessionTime: student.sessionTime,
            finalNote: `${student.name} was absent.`,
            formattedDate: notes.length === 0 ? formattedDate : null
          });
          continue;
        }

        const pronoun = student.gender === 'he' ? 'he/him' : 'she/her';
        const pronounSubject = student.gender === 'he' ? 'he' : 'she';
        const pronounObject = student.gender === 'he' ? 'him' : 'her';
        const selectedGoals = student.goals.map(gIdx => (studentGoalsData[student.name] || [])[gIdx]?.shortName).filter(Boolean);

        let rolePhrase;
        if (student.role === 'Studio Audience') rolePhrase = 'a member of the studio audience';
        else if (student.role === 'Anchor') rolePhrase = 'an anchor';
        else if (student.role === 'Lunch Anchor') rolePhrase = 'the lunch anchor';
        else if (student.role === 'Reporter') rolePhrase = 'a reporter';
        else if (student.role === 'Sports') rolePhrase = 'the sports reporter';
        else if (student.role === 'Weather') rolePhrase = 'the weather reporter';
        else if (student.role === 'Other') rolePhrase = student.otherRoleDescription || 'other role';
        else rolePhrase = student.role.toLowerCase();

        let roleData = '';
        if (student.role === 'Anchor' || student.role === 'Lunch Anchor') {
          if (student.cuesPercentage && student.cuesPrompting) {
            if (student.cuesTarget && student.cuesTarget !== 'other') {
              roleData += `\nResponded to visual cues to increase ${student.cuesTarget} in approximately ${student.cuesPercentage}% of opportunities`;
            } else {
              roleData += `\nResponded to visual cues in approximately ${student.cuesPercentage}% of opportunities`;
            }
          }
          if (student.facialPercentage && student.facialPrompting) {
            roleData += `\nFacial expressions: ${student.facialPercentage}% given ${student.facialPrompting} visual prompting`;
          }
          if (student.decodingPercentage) {
            roleData += `\nDecoding carryover: ${student.decodingPercentage}% without prompting`;
          }
        } else if (student.role === 'Studio Audience') {
          const pragSkills = [];
          if (student.pragmaticSkills?.maintainedAttention?.enabled) {
            let skill = 'maintained attention to anchors';
            if (student.pragmaticSkills.maintainedAttention.qualityLevel) {
              skill += ` ${student.pragmaticSkills.maintainedAttention.qualityLevel.toLowerCase()}`;
            }
            if (student.pragmaticSkills.maintainedAttention.promptLevel) {
              skill += ` with ${student.pragmaticSkills.maintainedAttention.promptLevel} prompting`;
            }
            pragSkills.push(skill);
          }
          if (student.pragmaticSkills?.waitedToSpeak?.enabled) {
            let skill = 'waited for appropriate times to speak';
            if (student.pragmaticSkills.waitedToSpeak.qualityLevel) {
              skill += ` ${student.pragmaticSkills.waitedToSpeak.qualityLevel.toLowerCase()}`;
            }
            if (student.pragmaticSkills.waitedToSpeak.promptLevel) {
              skill += ` with ${student.pragmaticSkills.waitedToSpeak.promptLevel} prompting`;
            }
            pragSkills.push(skill);
          }
          if (student.pragmaticSkills?.appropriateBehavior?.enabled) {
            let skill = 'demonstrated appropriate audience behavior';
            if (student.pragmaticSkills.appropriateBehavior.qualityLevel) {
              skill += ` ${student.pragmaticSkills.appropriateBehavior.qualityLevel.toLowerCase()}`;
            }
            if (student.pragmaticSkills.appropriateBehavior.promptLevel) {
              skill += ` with ${student.pragmaticSkills.appropriateBehavior.promptLevel} prompting`;
            }
            pragSkills.push(skill);
          }
          if (pragSkills.length > 0) {
            roleData += `\nPragmatic skills addressed: ${pragSkills.join(', ')}`;
          }
          if (student.gaveCompliments && student.complimentsPrompting) {
            roleData += `\nGave compliments: ${student.complimentsPrompting}`;
          }
        }

        if (student.rehearsalToBroadcast) roleData += `\nRehearsal carryover: ${student.rehearsalToBroadcast}`;
        if (student.additionalNotes) roleData += `\nAdditional notes: ${student.additionalNotes}`;

        const draftPrompt = `You are writing a professional SLP session note for ${student.name} (${pronoun}).

Activity: Collaborated with classmates to produce a live episode of the 811X Dragon News
Role: ${student.role}
Goals addressed: ${selectedGoals.join(', ')}
${roleData}

Write ONE cohesive paragraph that:
- MUST START WITH THIS EXACT SENTENCE: "${student.name} collaborated with classmates to produce an episode of the 811X Dragon News, serving as ${rolePhrase}." Do NOT change any words in this opening sentence.
- ${selectedGoals.length > 0 ? `States which goals were addressed: ${selectedGoals.join(', ')}` : 'Do NOT mention goals at all — none were provided. Do not invent, infer, or reference any goals.'}
- For each performance data point above, state it with natural connecting language but PRESERVE the exact structure:
  * For "Increased [skill] in approximately X% of opportunities given [level] visual cues" → keep this exact format, just add connecting words
  * For "Decoding carryover: X% without prompting" → say "carried over correct pronunciation of words ${pronounSubject} struggled to decode in rehearsal in approximately X% of opportunities without prompting"
  * For "Facial expressions: X% given [level] visual prompting" → keep this structure
  * For quality levels: "[skill] [quality level]" or "in approximately [X]% of opportunities"
  * For prompting: "[skill] with [prompting level]"
- CRITICAL ORDERING: Group related information together. If additional notes relate to a specific performance metric (e.g., behavioral support needed for audience behavior), place that information immediately after the performance metric it relates to.
- CRITICAL: Always place information about giving compliments at the END of the paragraph, as this happens last in the session
- Add brief professional phrases like "throughout the session," "during the broadcast," "while working on" to create flow
- DO NOT invent specific behavioral details not provided in the data (like "frequent redirection," "quiet listening posture," "appropriate facial expressions," "sustained focus," "responsive engagement")
- DO NOT elaborate on what the quality levels or percentages mean
- DO NOT add phrases like "during the collaborative news production activity" or "participated in the broadcast activity" or "while working on [skill name] skills"
- Additional notes may take any form — a comment, a narrative, a behavioral observation, or something else. Read the content and integrate it into the note as cohesive clinical prose in a way that fits its nature. Do not transcribe it verbatim or append it as a separate sequence of events.
- If the additional notes use the word "para," use "para" in the note. Do not change it.
- Every Studio Audience skill provided in the data must appear in the note. Do not omit any.
- When multiple Studio Audience skills share the same quality descriptor and prompting level, write them as a series with the quality descriptor as an adverb before the first verb and "given [prompting level] prompting" at the close. Example: "he occasionally maintained attention to anchors, waited for appropriate times to speak, and demonstrated appropriate audience behavior, given significant prompting." When skills have different quality descriptors or prompting levels, write each as its own clause.
- Behavioral observations must be framed as clinical prose — describe what was observed using professional clinical language, not as a chronological incident account.
- Sentences must connect to each other with clinical logic and flow. Do not write a series of short disconnected statements.
- The note must be written in professional clinical language throughout. Every sentence must reflect clinical observation and documentation standards.
- Uses ${student.name}'s name AND pronouns (${pronoun}) naturally
- Written in past tense with professional SLP language

CRITICAL: State ONLY the data provided. Add connecting phrases for flow, but do NOT add behavioral descriptions or interpretations.

Do NOT include: date, "Activity:", "Role:", "Goals:", or any labels.`;

        const draftResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: draftPrompt }]
          })
        });

        const draftData = await draftResponse.json();
        const draftNote = cleanClaudeResponse(draftData.content[0].text);

        const reviewPrompt = `Review this SLP session note. Fix problems but keep professional flow.

Original note:
${draftNote}

CRITICAL: The opening sentence MUST remain exactly: "${student.name} collaborated with classmates to produce an episode of the 811X Dragon News, serving as ${rolePhrase}." Do NOT change this sentence.

FIX these if present:
1. INVENTED BEHAVIORAL DETAILS - Delete any specific behaviors not in the original data
   - Examples to DELETE: "frequent redirection," "sustain focus on speakers," "quiet listening posture," "appropriate facial expressions," "responsive engagement," "sustained focus," "attentive posture"
   - Keep ONLY: the skill name + quality level or percentage

2. Grammar errors, confusing sentences, run-ons
3. Using "the student" instead of name/pronouns
4. Not in past tense
5. Labels or headers

KEEP:
- Professional connecting phrases like "throughout the session," "during the broadcast," "while working on"
- Natural sentence flow
- All data (quality levels, percentages, goals)

Return only the corrected paragraph.`;

        const reviewResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: reviewPrompt }]
          })
        });

        const reviewData = await reviewResponse.json();
        const reviewedNote = cleanClaudeResponse(reviewData.content[0].text);

        const streamlinePrompt = `Streamline this SLP session note by removing ONLY true redundancy AND check for logical errors. Keep professional flow.

Original note:
${reviewedNote}

CRITICAL: The opening sentence MUST remain exactly: "${student.name} collaborated with classmates to produce an episode of the 811X Dragon News, serving as ${rolePhrase}." Do NOT change, shorten, or rewrite this sentence.

DELETE (these are redundant):
1. When the same information is stated twice in different words
   - Example: "maintained attention consistently and demonstrated strong focus throughout"
   - Keep: "maintained attention consistently"
   - Delete: "and demonstrated strong focus throughout" (says the same thing)

2. Invented behavioral elaborations
   - Example: "appropriate behavior frequently, including quiet listening posture and facial expressions"
   - Keep: "appropriate behavior frequently"  
   - Delete: "including quiet listening posture and facial expressions" (invented details)

3. Interpretive conclusions
   - Example: "benefited from the structured format" or "showing good understanding"
   - Delete these - they interpret rather than state data

FIX LOGIC ERRORS:
1. Check that pronouns are consistent (all he/him or all she/her throughout)
2. Check that the role mentioned matches ${student.role}
3. Check that quality levels make sense (don't say "consistently" in one place and "not observed" in another for the same skill)
4. Check that sentences are coherent and don't contradict each other

KEEP (these add professional flow):
- Connecting phrases: "throughout the session," "during the broadcast," "while working on"
- Natural sentence structure
- All data (quality levels, percentages, goals)

CRITICAL: Return ONLY the final streamlined paragraph. Do NOT include any explanations, "Changes made:" lists, or meta-commentary. Just return the note itself.`;

        const streamlineResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': '', 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: streamlinePrompt }]
          })
        });

        const streamlineData = await streamlineResponse.json();
        const finalNote = cleanClaudeResponse(streamlineData.content[0].text);

        notes.push({
          name: student.name,
          sessionTime: student.sessionTime,
          finalNote,
          formattedDate: notes.length === 0 ? formattedDate : null
        });
      }

      const nameOrder = ["Eduardo", "Lemir", "Justin", "Ty'Heem", "Alisia", "Joel", "Fabian"];
      notes.sort((a, b) => nameOrder.indexOf(a.name) - nameOrder.indexOf(b.name));
      setGeneratedNotes(notes);
    } catch (error) {
      console.error('Error generating notes:', error);
      alert('Error generating notes. Check console.');
    } finally {
      setIsGenerating(false);
    }
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const clearAll = async () => {
    setDate('');
    setStudents([]);
    setGeneratedNotes([]);
    setExpandedStudents([0]);
    setShowClearConfirm(false);
    try {
      await window.storage.set('alfredo-filming-date', '');
      await window.storage.set('alfredo-filming-students', JSON.stringify([]));
      await window.storage.set('alfredo-filming-expanded', JSON.stringify([0]));
    } catch (e) { console.error('Clear failed:', e); }
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

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Alfredo's Filming Day Note Generator</h1>
          {!showClearConfirm ? (
            <button onClick={() => setShowClearConfirm(true)} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Clear All</button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-700 font-medium">Clear everything?</span>
              <button onClick={clearAll} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Yes, clear</button>
              <button onClick={() => setShowClearConfirm(false)} className="px-3 py-1 bg-gray-400 text-white rounded text-sm">Cancel</button>
            </div>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Session Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Students</h2>

          {students.map((student, sIdx) => (
            <div key={sIdx} className="border rounded p-4 mb-4">
              <div className="flex justify-between items-center mb-2">
                <button onClick={() => toggleExpanded(sIdx)} className="flex items-center">
                  {expandedStudents.includes(sIdx) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  <span className="ml-2 font-medium">
                    {student.name || `Student ${sIdx + 1}`}
                    {student.sessionTime && ` (${student.sessionTime})`}
                  </span>
                </button>
                <button onClick={() => removeStudent(sIdx)} className="text-red-600">
                  <X size={20} />
                </button>
              </div>

              {expandedStudents.includes(sIdx) && (
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Student Name</label>
                      <select
                        value={student.name}
                        onChange={(e) => updateStudent(sIdx, 'name', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="">Select student...</option>
                        {savedStudents.map(s => (
                          <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Role</label>
                      <select
                        value={student.role}
                        onChange={(e) => updateStudent(sIdx, 'role', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="">Select role...</option>
                        <option value="Anchor">Anchor</option>
                        <option value="Lunch Anchor">Lunch Anchor</option>
                        <option value="Reporter">Reporter</option>
                        <option value="Sports">Sports</option>
                        <option value="Weather">Weather</option>
                        <option value="Studio Audience">Studio Audience</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
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

                  {student.role === 'Other' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Describe Role</label>
                      <textarea
                        value={student.otherRoleDescription}
                        onChange={(e) => updateStudent(sIdx, 'otherRoleDescription', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                  )}

                  {(student.role === 'Anchor' || student.role === 'Lunch Anchor') && (
                    <div className="space-y-3 bg-blue-50 p-3 rounded">
                      <div>
                        <label className="block text-sm font-medium mb-1">Responded to Cues</label>
                        <div className="flex gap-2 items-center text-sm">
                          <span>Responded to approximately</span>
                          <select
                            value={student.cuesPercentage}
                            onChange={(e) => updateStudent(sIdx, 'cuesPercentage', e.target.value)}
                            className="w-16 px-2 py-1 border rounded"
                          >
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
                          <span>% of</span>
                          <select
                            value={student.cuesPrompting}
                            onChange={(e) => updateStudent(sIdx, 'cuesPrompting', e.target.value)}
                            className="px-2 py-1 border rounded"
                          >
                            <option value="">Select...</option>
                            <option value="minimal">minimal</option>
                            <option value="moderate">moderate</option>
                            <option value="significant">significant</option>
                          </select>
                          <span>visual cues to increase</span>
                          <select
                            value={student.cuesTarget}
                            onChange={(e) => updateStudent(sIdx, 'cuesTarget', e.target.value)}
                            className="flex-1 px-2 py-1 border rounded"
                          >
                            <option value="">Select...</option>
                            <option value="prosodic variation">prosodic variation</option>
                            <option value="energy">energy</option>
                            <option value="speed">speed</option>
                            <option value="focus">focus</option>
                            <option value="other">other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Facial Expressions</label>
                        <div className="flex gap-2 items-center text-sm">
                          <span>Displayed facial expressions appropriate to the line {student.gender === 'he' ? 'he' : 'she'} was reading in</span>
                          <select
                            value={student.facialPercentage}
                            onChange={(e) => updateStudent(sIdx, 'facialPercentage', e.target.value)}
                            className="w-16 px-2 py-1 border rounded"
                          >
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
                          <select
                            value={student.facialPrompting}
                            onChange={(e) => updateStudent(sIdx, 'facialPrompting', e.target.value)}
                            className="px-2 py-1 border rounded"
                          >
                            <option value="">Select...</option>
                            <option value="occasional">occasional</option>
                            <option value="regular">regular</option>
                            <option value="frequent">frequent</option>
                          </select>
                          <span>visual prompting</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Decoding</label>
                        <div className="flex gap-2 items-center text-sm">
                          <span>Carried over the correct pronunciation of words {student.gender === 'he' ? 'he' : 'she'} struggled to decode in the rehearsal in approximately</span>
                          <select
                            value={student.decodingPercentage}
                            onChange={(e) => updateStudent(sIdx, 'decodingPercentage', e.target.value)}
                            className="w-16 px-2 py-1 border rounded"
                          >
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
                          <span>% of opportunities without prompting</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {student.role === 'Studio Audience' && (
                    <div className="space-y-3 bg-green-50 p-3 rounded">
                      <div>
                        <label className="block text-sm font-medium mb-2">Pragmatic skills worked on by student in this session:</label>
                        
                        <div className="mb-3">
                          <label className="flex items-center mb-1">
                            <input
                              type="checkbox"
                              checked={student.pragmaticSkills?.maintainedAttention?.enabled || false}
                              onChange={(e) => {
                                const newStudents = [...students];
                                if (!newStudents[sIdx].pragmaticSkills) newStudents[sIdx].pragmaticSkills = {};
                                if (!newStudents[sIdx].pragmaticSkills.maintainedAttention) newStudents[sIdx].pragmaticSkills.maintainedAttention = { enabled: false, promptLevel: '', qualityLevel: '' };
                                newStudents[sIdx].pragmaticSkills.maintainedAttention.enabled = e.target.checked;
                                setStudents(newStudents);
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm">Maintained attention to anchors</span>
                          </label>
                          {student.pragmaticSkills?.maintainedAttention?.enabled && (
                            <div className="ml-6 space-y-2">
                              <div className="flex gap-4">
                                <span className="text-xs font-medium">Prompting:</span>
                                {['minimal', 'moderate', 'significant'].map(level => (
                                  <label key={level} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={student.pragmaticSkills?.maintainedAttention?.promptLevel === level}
                                      onChange={(e) => {
                                        const newStudents = [...students];
                                        newStudents[sIdx].pragmaticSkills.maintainedAttention.promptLevel = e.target.checked ? level : '';
                                        setStudents(newStudents);
                                      }}
                                      className="mr-1"
                                    />
                                    <span className="text-xs">{level}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex gap-4">
                                <span className="text-xs font-medium">Quality:</span>
                                {['Consistently', 'Frequently', 'Occasionally', 'Not observed'].map(level => (
                                  <label key={level} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={student.pragmaticSkills?.maintainedAttention?.qualityLevel === level}
                                      onChange={(e) => {
                                        const newStudents = [...students];
                                        newStudents[sIdx].pragmaticSkills.maintainedAttention.qualityLevel = e.target.checked ? level : '';
                                        setStudents(newStudents);
                                      }}
                                      className="mr-1"
                                    />
                                    <span className="text-xs">{level}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="flex items-center mb-1">
                            <input
                              type="checkbox"
                              checked={student.pragmaticSkills?.waitedToSpeak?.enabled || false}
                              onChange={(e) => {
                                const newStudents = [...students];
                                if (!newStudents[sIdx].pragmaticSkills) newStudents[sIdx].pragmaticSkills = {};
                                if (!newStudents[sIdx].pragmaticSkills.waitedToSpeak) newStudents[sIdx].pragmaticSkills.waitedToSpeak = { enabled: false, promptLevel: '', qualityLevel: '' };
                                newStudents[sIdx].pragmaticSkills.waitedToSpeak.enabled = e.target.checked;
                                setStudents(newStudents);
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm">Waited for appropriate times to speak</span>
                          </label>
                          {student.pragmaticSkills?.waitedToSpeak?.enabled && (
                            <div className="ml-6 space-y-2">
                              <div className="flex gap-4">
                                <span className="text-xs font-medium">Prompting:</span>
                                {['minimal', 'moderate', 'significant'].map(level => (
                                  <label key={level} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={student.pragmaticSkills?.waitedToSpeak?.promptLevel === level}
                                      onChange={(e) => {
                                        const newStudents = [...students];
                                        newStudents[sIdx].pragmaticSkills.waitedToSpeak.promptLevel = e.target.checked ? level : '';
                                        setStudents(newStudents);
                                      }}
                                      className="mr-1"
                                    />
                                    <span className="text-xs">{level}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex gap-4">
                                <span className="text-xs font-medium">Quality:</span>
                                {['Consistently', 'Frequently', 'Occasionally', 'Not observed'].map(level => (
                                  <label key={level} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={student.pragmaticSkills?.waitedToSpeak?.qualityLevel === level}
                                      onChange={(e) => {
                                        const newStudents = [...students];
                                        newStudents[sIdx].pragmaticSkills.waitedToSpeak.qualityLevel = e.target.checked ? level : '';
                                        setStudents(newStudents);
                                      }}
                                      className="mr-1"
                                    />
                                    <span className="text-xs">{level}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mb-3">
                          <label className="flex items-center mb-1">
                            <input
                              type="checkbox"
                              checked={student.pragmaticSkills?.appropriateBehavior?.enabled || false}
                              onChange={(e) => {
                                const newStudents = [...students];
                                if (!newStudents[sIdx].pragmaticSkills) newStudents[sIdx].pragmaticSkills = {};
                                if (!newStudents[sIdx].pragmaticSkills.appropriateBehavior) newStudents[sIdx].pragmaticSkills.appropriateBehavior = { enabled: false, promptLevel: '', qualityLevel: '' };
                                newStudents[sIdx].pragmaticSkills.appropriateBehavior.enabled = e.target.checked;
                                setStudents(newStudents);
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm">Appropriate audience behavior (when to clap, react, stay quiet)</span>
                          </label>
                          {student.pragmaticSkills?.appropriateBehavior?.enabled && (
                            <div className="ml-6 space-y-2">
                              <div className="flex gap-4">
                                <span className="text-xs font-medium">Prompting:</span>
                                {['minimal', 'moderate', 'significant'].map(level => (
                                  <label key={level} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={student.pragmaticSkills?.appropriateBehavior?.promptLevel === level}
                                      onChange={(e) => {
                                        const newStudents = [...students];
                                        newStudents[sIdx].pragmaticSkills.appropriateBehavior.promptLevel = e.target.checked ? level : '';
                                        setStudents(newStudents);
                                      }}
                                      className="mr-1"
                                    />
                                    <span className="text-xs">{level}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex gap-4">
                                <span className="text-xs font-medium">Quality:</span>
                                {['Consistently', 'Frequently', 'Occasionally', 'Not observed'].map(level => (
                                  <label key={level} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={student.pragmaticSkills?.appropriateBehavior?.qualityLevel === level}
                                      onChange={(e) => {
                                        const newStudents = [...students];
                                        newStudents[sIdx].pragmaticSkills.appropriateBehavior.qualityLevel = e.target.checked ? level : '';
                                        setStudents(newStudents);
                                      }}
                                      className="mr-1"
                                    />
                                    <span className="text-xs">{level}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="flex items-center mb-2">
                          <input
                            type="checkbox"
                            checked={student.gaveCompliments}
                            onChange={(e) => updateStudent(sIdx, 'gaveCompliments', e.target.checked)}
                            className="mr-2"
                          />
                          <span className="text-sm font-medium">Gave Compliments</span>
                        </label>
                        {student.gaveCompliments && (
                          <select
                            value={student.complimentsPrompting}
                            onChange={(e) => updateStudent(sIdx, 'complimentsPrompting', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                          >
                            <option value="">Select independence level...</option>
                            <option value="independent">independent</option>
                            <option value="minimal prompting">minimal prompting</option>
                            <option value="moderate prompting">moderate prompting</option>
                            <option value="significant prompting">significant prompting</option>
                          </select>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1">Goals Addressed</label>
                    {(studentGoalsData[student.name] || []).map((goal, gIdx) => (
                      <label key={gIdx} className="flex items-center mb-1">
                        <input
                          type="checkbox"
                          checked={student.goals.includes(gIdx)}
                          onChange={() => toggleGoal(sIdx, gIdx)}
                          className="mr-2"
                        />
                        <span className="text-sm">{goal.shortName}</span>
                      </label>
                    ))}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Rehearsal → Broadcast</label>
                    <textarea
                      value={student.rehearsalToBroadcast}
                      onChange={(e) => updateStudent(sIdx, 'rehearsalToBroadcast', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="How did rehearsal carry over?"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Additional Notes</label>
                    <textarea
                      value={student.additionalNotes}
                      onChange={(e) => updateStudent(sIdx, 'additionalNotes', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          <button onClick={addStudent} className="w-full px-3 py-2 bg-blue-600 text-white rounded mt-2">
            <Plus size={16} className="inline mr-1" /> Add Student
          </button>
        </div>

        <button
          onClick={generateNotes}
          disabled={isGenerating}
          className="w-full py-2 bg-green-600 text-white rounded font-medium disabled:bg-gray-400"
        >
          {isGenerating ? (
            <><Loader2 size={20} className="inline animate-spin mr-2" /> Generating...</>
          ) : (
            <><FileText size={20} className="inline mr-2" /> Generate Notes</>
          )}
        </button>

        {generatedNotes.length > 0 && (
          <div className="mt-6">
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-semibold">Generated Notes</h2>
              <button
                onClick={() => copyToClipboard(generatedNotes.map(n => 
                  `${n.formattedDate ? n.formattedDate + '\n\n' : ''}${n.sessionTime ? n.sessionTime + '\n' : ''}${n.name}:\n${n.finalNote}\n`
                ).join('\n'))}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm"
              >
                <Copy size={14} className="inline mr-1" /> Copy All
              </button>
            </div>
            {generatedNotes.map((note, idx) => (
              <div key={idx} className="mb-6 border-t pt-4">
                {note.formattedDate && <p className="text-sm font-semibold text-blue-600 mb-1">{note.formattedDate}</p>}
                {note.sessionTime && <p className="text-sm font-semibold text-blue-600 mb-1">{note.sessionTime}</p>}
                <h3 className="font-semibold mb-2">{note.name}</h3>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Final Note</span>
                    <button
                      onClick={() => copyToClipboard(`${note.formattedDate ? note.formattedDate + '\n\n' : ''}${note.sessionTime ? note.sessionTime + '\n' : ''}${note.name}:\n${note.finalNote}`)}
                      className="px-2 py-1 bg-gray-500 text-white rounded text-xs"
                    >
                      <Copy size={12} />
                    </button>
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
};

export default AlfredoFilmingDayGenerator;