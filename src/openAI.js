const axios = require('axios');
const { createEmailDraft } = require('./createEmailDraft');
const { addTaskToTodoist } = require('./todoist');

async function analyzeContextWithOpenAI(fullContext) {
    const prompt = `
[Summarize and Categorize Task]

<prompt_objective>
The purpose of this prompt is to summarize a conversation to identify and categorize a task assigned to Szymon Til.
</prompt_objective>

<prompt_rules>
- The AI MUST read the provided conversation and identify all tasks assigned to Szymon Til.
- For each task, the AI MUST assign one of the labels: "Write an e-mail" or "Take action".
- Tasks where the speaker uses first-person phrases (e.g., "muszę," "zrobię," "napiszę," "pojadę") SHOULD be identified as tasks for Szymon Til.
- Tasks should be categorized and listed using a JSON or JSON array.
- UNDER NO CIRCUMSTANCES should the AI include tasks not directly assigned to Szymon Til.
- Tasks assigned to others by Szymon Til (e.g., "Daniel, napisz e-mail") MUST NOT be included as tasks for Szymon Til.
- If no tasks are found, the AI MUST return a single JSON object: { "is_task": "no" }.
- The AI MUST NOT create new labels beyond "Write an e-mail" and "Take action".
- The AI MUST ignore any other information not directly related to identifying and categorizing the task.
- Conversation may be in Polish or English, but the AI MUST provide answers in English.
</prompt_rules>

<prompt_examples>

USER: 
"""
Daniel Dąbrowski: Szymon, musisz napisać e-mail do klienta o opóźnieniu dostawy.
Szymon Til: Jasne, zajmę się tym.
"""
AI: [
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform client about delivery delay" }
]

USER: 
"""
Szymon Til: Daniel, napisz proszę e-mail do Creme Bar.
Daniel Dąbrowski: Jasne, zrobię to dziś.
"""
AI: { "is_task": "no" }

USER: 
"""
Szymon Til: Muszę napisać e-mail do zespołu marketingowego o nadchodzącej kampanii.
"""
AI: [
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform marketing team about the upcoming campaign" }
]

USER: 
"""
Szymon Til: Dziś muszę zamówić więcej materiałów na przyszły tydzień. Daniel, przygotuj proszę raport do spotkania.
"""
AI: [
  { "is_task": "yes", "task_type": "action", "task_title": "Order materials for next week" }
]

USER: 
"""
Szymon Til: Przygotuję strategię na spotkanie. Muszę jeszcze wysłać e-mail do klienta o budżecie.
"""
AI: [
  { "is_task": "yes", "task_type": "action", "task_title": "Prepare strategy for the meeting" },
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform client about budget" }
]

USER: 
"""
Kasia: Szymon, co sądzisz o dodaniu nowej opcji?
Szymon Til: Myślę, że to dobry pomysł. Kasia, zajmij się proszę tym zadaniem.
"""
AI: { "is_task": "no" }

USER: 
"""
Martyna: Musisz przygotować raport. Szymon, czy możesz wysłać e-mail do zespołu o zmianach w projekcie?
Szymon Til: Tak, mogę się tym zająć.
"""
AI: [
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform team about project changes" }
]

USER: 
"""
Szymon Til: Muszę dziś zaplanować budżet oraz przygotować prezentację na konferencję.
"""
AI: [
  { "is_task": "yes", "task_type": "action", "task_title": "Plan the budget" },
  { "is_task": "yes", "task_type": "action", "task_title": "Prepare presentation for the conference" }
]

USER: 
"""
Daniel Dąbrowski: Przygotuj proszę strategię na spotkanie z klientem.
Szymon Til: Jasne, zajmę się tym. Muszę też wysłać e-mail z ofertą.
"""
AI: [
  { "is_task": "yes", "task_type": "action", "task_title": "Prepare strategy for client meeting" },
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Send email with the offer" }
]

</prompt_examples>

<prompt_input>
${fullContext}
</prompt_input>
`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'Analyze the conversation to identify and categorize tasks as per the given rules and examples.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.2,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        const result = response.data.choices[0].message.content.trim();
        console.log(`📜 OpenAI Analysis Result:\n${JSON.stringify(parsedResult, null, 2)}`);

        const parsedResult = JSON.parse(result);

        // Działanie w zależności od wyniku analizy
        if (parsedResult.is_task === "no") {
            console.log('ℹ️ Nie znaleziono żadnych zadań w rozmowie.');
        } else if (Array.isArray(parsedResult)) {
            parsedResult.forEach(async task => {
                if (task.task_type === "e-mail") {
                    console.log(`✉️ Tworzenie szkicu e-maila: ${task.task_title}`);
                    await createEmailDraft(
                        "recipient@example.com", 
                        task.task_title,
                        `Context of the conversation:\n\n${fullContext}`
                    );
                } else if (task.task_type === "action") {
                    console.log(`🚀 Tworzenie zadania w Todoist: ${task.task_title}`);
                    await addTaskToTodoist(task.task_title);
                }
            });
        }

        return parsedResult;
    } catch (error) {
        console.error('❌ Błąd podczas analizy OpenAI:', error.message);
        return { "is_task": "no" };
    }
}

module.exports = { analyzeContextWithOpenAI };
