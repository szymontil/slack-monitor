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
- The AI MUST use a JSON object or JSON array to list all tasks found in the conversation.
- UNDER NO CIRCUMSTANCES should the AI include tasks that Szymon Til assigns to someone else.
- UNDER NO CIRCUMSTANCES should the AI include tasks that are not clearly and explicitly assigned to Szymon Til.
- The AI MUST NOT create new labels beyond "Write an e-mail" and "Take action".
- If no tasks are found, the AI MUST return a single JSON object: { "is_task": "no" }.
- Conversation may be in Polish or English but AI MUST provide responses in English.
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
Szymon Til: Daniel, mógłbyś pomóc z raportem? 
Daniel Dąbrowski: Jasne, ale musisz też napisać e-mail do zespołu z podsumowaniem postępów.
Szymon Til: Zrozumiałem, zajmę się tym.
"""
AI: [
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Summarize progress for the team" }
]

USER: 
"""
Szymon Til: Daniel, musisz przygotować raport o stanie projektu do jutra.
Daniel Dąbrowski: Okej, zrobię to.
"""
AI: { "is_task": "no" }

USER: 
"""
Szymon Til: Pamiętaj, żeby przypomnieć mi, że muszę zamówić więcej materiałów na przyszły tydzień. Poza tym, musimy sfinalizować budżet przed piątkiem.
"""
AI: [
  { "is_task": "yes", "task_type": "action", "task_title": "Order materials for next week" },
  { "is_task": "yes", "task_type": "action", "task_title": "Finalize the budget plan before Friday" }
]

USER: 
"""
Szymon Til: Daniel, musisz zamówić materiały na przyszły tydzień.
Daniel Dąbrowski: Okej, zrobię to. 
A przy okazji, Szymon, musisz przygotować podsumowanie dla zespołu.
Szymon Til: Zrozumiałem.
"""
AI: [
  { "is_task": "yes", "task_type": "action", "task_title": "Prepare summary for the team" }
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
        cconsole.log(`📜 OpenAI Analysis Result:\n${JSON.stringify(parsedResult, null, 2)}`);

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
