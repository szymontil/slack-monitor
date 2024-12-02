const axios = require('axios');

async function analyzeContextWithOpenAI(fullContext) {
    const prompt = `
    [Summarize and Categorize Task]
    
    <prompt_objective>
    The purpose of this prompt is to summarize a conversation to identify and categorize a task assigned to Szymon Til. If the task involves writing an e-mail, additional details such as the recipient, subject, and body must be generated.
    </prompt_objective>
    
    <prompt_rules>
    - The AI MUST read the provided conversation and identify all tasks assigned to Szymon Til.
    - For each task, the AI MUST assign one of the labels: "Write an e-mail" or "Take action."
    - Tasks where Szymon Til uses first-person phrases (e.g., "muszę," "zrobię," "napiszę," "pojadę") SHOULD be identified as tasks for Szymon Til.
    - Tasks assigned to others by Szymon Til (e.g., "Daniel, napisz e-mail") MUST NOT be included as tasks for Szymon Til.
    - If no tasks are found, the AI MUST return a single JSON object: {"is_task": "no"}.
    - If a task involves writing an e-mail, the AI MUST return the following fields:
      - **recipient**: The recipient of the e-mail, if identified. If not, use the fallback "default@example.com."
      - **subject**: A concise subject line IN POLISH summarizing the purpose of the e-mail.
      - **body**: A polite, professional, and concise body IN POLISH for the e-mail, including necessary details derived from the context.
    - Tasks should be categorized and listed using a JSON or JSON array.
    - Conversation may be in Polish or English, but the AI MUST provide answers in English.
    </prompt_rules>
    
    <prompt_examples>
    
    USER: Daniel Dąbrowski: Szymon, musisz napisać e-mail do klienta o opóźnieniu dostawy. Szymon Til: Jasne, zajmę się tym. AI: **Summary:** Daniel asks Szymon to write an email to inform a client about a delivery delay. Szymon confirms he will take care of it. **Tasks:** [{"is_task": "yes", "task_type": "e-mail", "task_title": "Inform client about delivery delay", "recipient": "client@example.com", "subject": "Opóźnienie dostawy", "body": "Szanowny Kliencie,\n\nInformujemy, że dostawa Państwa zamówienia została opóźniona. Przepraszamy za niedogodności i dokładamy wszelkich starań, aby zrealizować dostawę jak najszybciej.\n\nPozdrawiamy,\nSzymon Til"}]

    USER: Szymon Til: Daniel, napisz proszę e-mail do Creme Bar. Daniel Dąbrowski: Jasne, zrobię to dziś. AI: **Summary:** Szymon asks Daniel to write an email to Creme Bar. Daniel agrees to handle it. **Tasks:** {"is_task": "no"}

    USER: Szymon Til: Muszę napisać e-mail do zespołu marketingowego o nadchodzącej kampanii. AI: **Summary:** Szymon declares that he needs to write an email to the marketing team about an upcoming campaign. **Tasks:** [{"is_task": "yes", "task_type": "e-mail", "task_title": "Inform marketing team about the upcoming campaign", "recipient": "marketing_team@example.com", "subject": "Nadchodząca kampania", "body": "Dzień dobry Zespole Marketingu,\n\nChciałem poinformować, że rozpoczynamy przygotowania do nadchodzącej kampanii. Proszę o zgłaszanie pomysłów i potrzebnych materiałów.\n\nPozdrawiam,\nSzymon Til"}]

    USER: Szymon Til: Dziś muszę zamówić więcej materiałów na przyszły tydzień. Daniel, przygotuj proszę raport do spotkania. AI: **Summary:** Szymon declares he needs to order materials for next week. He also asks Daniel to prepare a report for a meeting. **Tasks:** [{"is_task": "yes", "task_type": "action", "task_title": "Order materials for next week"}]

    USER: Szymon Til: Przygotuję strategię na spotkanie. Muszę jeszcze wysłać e-mail do klienta o budżecie. AI: **Summary:** Szymon declares he will prepare a strategy for a meeting and send an email to a client about the budget. **Tasks:** [{"is_task": "yes", "task_type": "action", "task_title": "Prepare strategy for the meeting"}, {"is_task": "yes", "task_type": "e-mail", "task_title": "Inform client about budget", "recipient": "client@example.com", "subject": "Budżet projektu", "body": "Szanowny Kliencie,\n\nPrzesyłam informacje dotyczące budżetu projektu. Proszę o informację zwrotną, jeśli potrzebne będą zmiany lub dodatkowe szczegóły.\n\nPozdrawiam,\nSzymon Til"}]

    USER: Kasia: Szymon, co sądzisz o dodaniu nowej opcji? Szymon Til: Myślę, że to dobry pomysł. Kasia, zajmij się proszę tym zadaniem. AI: **Summary:** Kasia suggests adding a new option. Szymon agrees and assigns the task to Kasia. **Tasks:** {"is_task": "no"}

    USER: Martyna: Musisz przygotować raport. Szymon, czy możesz wysłać e-mail do zespołu o zmianach w projekcie? Szymon Til: Tak, mogę się tym zająć. AI: **Summary:** Martyna informs Szymon that he needs to prepare a report and asks him to email the team about project changes. Szymon agrees to handle the email. **Tasks:** [{"is_task": "yes", "task_type": "e-mail", "task_title": "Inform team about project changes", "recipient": "team@example.com", "subject": "Zmiany w projekcie", "body": "Dzień dobry Zespole,\n\nChciałem poinformować o następujących zmianach w projekcie. Proszę o sprawdzenie szczegółów i zgłoszenie uwag do końca tygodnia.\n\nPozdrawiam,\nSzymon Til"}]

    USER: Szymon Til: Muszę dziś zaplanować budżet oraz przygotować prezentację na konferencję. AI: **Summary:** Szymon declares he needs to plan the budget and prepare a presentation for a conference. **Tasks:** [{"is_task": "yes", "task_type": "action", "task_title": "Plan the budget"}, {"is_task": "yes", "task_type": "action", "task_title": "Prepare presentation for the conference"}]

    USER: Daniel Dąbrowski: Przygotuj proszę strategię na spotkanie z klientem. Szymon Til: Jasne, zajmę się tym. Muszę też wysłać e-mail z ofertą. AI: **Summary:** Daniel asks Szymon to prepare a strategy for a client meeting. Szymon agrees and also declares he needs to send an email with an offer. **Tasks:** [{"is_task": "yes", "task_type": "action", "task_title": "Prepare strategy for client meeting"}, {"is_task": "yes", "task_type": "e-mail", "task_title": "Send email with the offer", "recipient": "client@example.com", "subject": "Oferta współpracy", "body": "Szanowny Kliencie,\n\nW załączniku przesyłam ofertę współpracy. Proszę o kontakt, jeśli będą potrzebne dodatkowe informacje.\n\nPozdrawiam,\nSzymon Til"}]


    </prompt_examples>
    
    <prompt_input>
    ${fullContext}
    </prompt_input>
    `;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            messages: [
                {
                    role: 'system',
                    content: `${prompt}\nIMPORTANT: Always return tasks in valid JSON format as shown in examples. Never return markdown-style lists.`
                },
                { role: 'user', content: fullContext }
            ],
            model: 'gpt-4-turbo',
            max_tokens: 500,
            temperature: 0.2,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        const content = response.data.choices[0].message.content.trim();
        const tasksMatch = content.match(/\*\*Tasks:\*\*(.*)/s);

        if (!tasksMatch) {
            return { "is_task": "no" };
        }

        let tasksText = tasksMatch[1].trim();

        // Próba konwersji markdown na format JSON
        if (tasksText.startsWith('-')) {
            const taskDetails = tasksText.match(/Task Type:\s*(.*?)\n.*?Task Title:\s*(.*?)(\n|$)/s);
            if (taskDetails) {
                const [, type, title] = taskDetails;
                tasksText = JSON.stringify([{
                    "is_task": "yes",
                    "task_type": type.toLowerCase().includes('email') ? 'e-mail' : 'action',
                    "task_title": title.trim()
                }]);
            } else {
                return { "is_task": "no" };
            }
        }

        // Próba parsowania JSON
        try {
            const tasks = JSON.parse(tasksText);
            return tasks;
        } catch (parseError) {
            console.error('❌ Błąd parsowania JSON:', {
                message: parseError.message,
                rawData: tasksText
            });
            return { "is_task": "no" };
        }

    } catch (error) {
        console.error('❌ Błąd podczas analizy OpenAI:', error);
        return { "is_task": "no" };
    }
}

module.exports = { analyzeContextWithOpenAI };