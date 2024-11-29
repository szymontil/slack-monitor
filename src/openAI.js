const axios = require('axios');
const { createEmailDraft } = require('./createEmailDraft');
const { addTaskToTodoist } = require('./todoist');

async function analyzeContextWithOpenAI(fullContext) {
    const prompt = `

[Summarize and Categorize Task]

<prompt_objective>
The purpose of this prompt is to summarize a conversation to identify and categorize tasks assigned to Szymon Til.
</prompt_objective>

<prompt_rules>
- The process MUST consist of two steps:
  - **Step 1:** Provide a summary of the conversation, including actions or responsibilities declared by each participant.
  - **Step 2:** Based on the summary, extract tasks assigned to Szymon Til in a structured JSON format.
- The AI MUST identify all tasks assigned to Szymon Til and categorize them as "Write an e-mail" or "Take action."
- Tasks where Szymon Til uses first-person phrases (e.g., "muszę," "zrobię," "napiszę," "pojadę") MUST be identified as tasks for Szymon Til.
- Tasks assigned to others by Szymon Til (e.g., "Daniel, napisz e-mail") MUST NOT be included in the task list for Szymon Til.
- If no tasks are found, the AI MUST return a single JSON object: { "is_task": "no" }.
- AI MUST follow a calm, patient reasoning process, explaining its steps before providing final results.
- The AI MUST ignore any other information not directly related to identifying and categorizing the task.
- Conversation may be in Polish or English, but the AI MUST provide answers in English.
</prompt_rules>

<prompt_examples>

USER: 
Daniel Dąbrowski: Szymon, musisz napisać e-mail do klienta o opóźnieniu dostawy.
Szymon Til: Jasne, zajmę się tym.
AI: 
**Summary:**
Daniel asks Szymon to write an email to inform a client about a delivery delay. Szymon confirms he will take care of it.
**Tasks:**
[
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform client about delivery delay" }
]

USER: 
Szymon Til: Daniel, napisz proszę e-mail do Creme Bar.
Daniel Dąbrowski: Jasne, zrobię to dziś.
AI: 
**Summary:**
Szymon asks Daniel to write an email to Creme Bar. Daniel agrees to handle it.
**Tasks:**
{ "is_task": "no" }

USER: 
Szymon Til: Muszę napisać e-mail do zespołu marketingowego o nadchodzącej kampanii.
AI: 
**Summary:**
Szymon declares that he needs to write an email to the marketing team about an upcoming campaign.
**Tasks:**
[
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform marketing team about the upcoming campaign" }
]

USER: 
Szymon Til: Dziś muszę zamówić więcej materiałów na przyszły tydzień. Daniel, przygotuj proszę raport do spotkania.
AI: 
**Summary:**
Szymon declares he needs to order materials for next week. He also asks Daniel to prepare a report for a meeting.
**Tasks:**
[
  { "is_task": "yes", "task_type": "action", "task_title": "Order materials for next week" }
]

USER: 
Szymon Til: Przygotuję strategię na spotkanie. Muszę jeszcze wysłać e-mail do klienta o budżecie.
AI: 
**Summary:**
Szymon declares he will prepare a strategy for a meeting and send an email to a client about the budget.
**Tasks:**
[
  { "is_task": "yes", "task_type": "action", "task_title": "Prepare strategy for the meeting" },
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform client about budget" }
]

USER: 
Kasia: Szymon, co sądzisz o dodaniu nowej opcji?
Szymon Til: Myślę, że to dobry pomysł. Kasia, zajmij się proszę tym zadaniem.
AI: 
**Summary:**
Kasia suggests adding a new option. Szymon agrees and assigns the task to Kasia.
**Tasks:**
{ "is_task": "no" }

USER: 
Martyna: Musisz przygotować raport. Szymon, czy możesz wysłać e-mail do zespołu o zmianach w projekcie?
Szymon Til: Tak, mogę się tym zająć.
AI: 
**Summary:**
Martyna informs Szymon that he needs to prepare a report and asks him to email the team about project changes. Szymon agrees to handle the email.
**Tasks:**
[
  { "is_task": "yes", "task_type": "e-mail", "task_title": "Inform team about project changes" }
]

USER: 
Szymon Til: Muszę dziś zaplanować budżet oraz przygotować prezentację na konferencję.
AI: 
**Summary:**
Szymon declares he needs to plan the budget and prepare a presentation for a conference.
**Tasks:**
[
  { "is_task": "yes", "task_type": "action", "task_title": "Plan the budget" },
  { "is_task": "yes", "task_type": "action", "task_title": "Prepare presentation for the conference" }
]

USER: 
Daniel Dąbrowski: Przygotuj proszę strategię na spotkanie z klientem.
Szymon Til: Jasne, zajmę się tym. Muszę też wysłać e-mail z ofertą.
AI: 
**Summary:**
Daniel asks Szymon to prepare a strategy for a client meeting. Szymon agrees and also declares he needs to send an email with an offer.
**Tasks:**
[
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
          model: 'gpt-4-turbo',
          messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: fullContext }
          ],
          max_tokens: 500,
          temperature: 0.2,
      }, {
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
      });
  
      console.log(`🔍 Pełna odpowiedź OpenAI:\n${JSON.stringify(response.data, null, 2)}`);
      const parsedResult = JSON.parse(response.data.choices[0].message.content.trim());
  
      if (Array.isArray(parsedResult) && parsedResult.length === 0) {
          console.log('ℹ️ Wynik analizy OpenAI: Brak zadań w tej rozmowie.');
          return;
      }
  
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
  
      return parsedResult;
  } catch (error) {
      console.error('❌ Błąd podczas analizy OpenAI:', error.message);
      return { "is_task": "no" };
  }
}  

module.exports = { analyzeContextWithOpenAI };
