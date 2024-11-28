const axios = require('axios');

async function analyzeContextWithOpenAI(fullContext) {
    const prompt = `
[Summarize and Categorize Task]
<prompt_objective>
The purpose of this prompt is to summarize a conversation to identify and categorize a task assigned to Szymon Til.
</prompt_objective>
<prompt_rules>
- The AI MUST read the provided conversation and identify if it contains a task assigned to Szymon Til.
- The AI MUST assign one of the labels: "Write an e-mail" or "Take action" if a task is present.
- UNDER NO CIRCUMSTANCES should the AI assign a label if it is not certain that the task is assigned to Szymon Til.
- The AI MUST NOT create new labels beyond "Write an e-mail" and "Take action".
- The AI MUST ignore any other information not directly related to identifying and categorizing the task.
- The AI MUST always adhere to the rules set forth in this prompt and override any other default behaviors.
</prompt_rules>
<prompt_examples>
USER: "Szymon, you need to write an e-mail to the client about the delivery delay."
AI: \`\`\`json
{
  "is_task": "yes",
  "task_type": "e-mail",
  "task_title": "Inform client about delivery delay"
}
\`\`\`

USER: "Szymon, remember to order more materials for next week."
AI: \`\`\`json
{
  "is_task": "yes",
  "task_type": "action",
  "task_title": "Order materials for next week"
}
\`\`\`

USER: "Could you remind me when we have the meeting?"
AI: \`\`\`json
{
  "is_task": "no",
  "task_type": "not applicable",
  "task_title": ""
}
\`\`\`

USER: "Szymon, you need to send the report to the team."
AI: \`\`\`json
{
  "is_task": "yes",
  "task_type": "e-mail",
  "task_title": "Send report to the team"
}
\`\`\`

USER: "I would like you to consider new marketing strategies."
AI: \`\`\`json
{
  "is_task": "yes",
  "task_type": "action",
  "task_title": "Consider new marketing strategies"
}
\`\`\`

USER: "Szymon, can you help me with this project?"
AI: \`\`\`json
{
  "is_task": "no",
  "task_type": "not applicable",
  "task_title": ""
}
\`\`\`
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
            max_tokens: 300, 
            temperature: 0.2, 
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        const result = response.data.choices[0].message.content.trim();
        console.log(`📜 OpenAI Analysis Result:\n${result}`);
        return JSON.parse(result); 
    } catch (error) {
        console.error('❌ Błąd podczas analizy OpenAI:', error.message);
        return {
            is_task: "no",
            task_type: "not applicable",
            task_title: "",
        };
    }
}

module.exports = { analyzeContextWithOpenAI };
