const { analyzeContextWithOpenAI } = require('./openAI');
const { addTaskToTodoist } = require('./todoist');
const { createEmailDraft } = require('./createEmailDraft');

async function processContext(context) {
    const fullContext = context.messages.join('\n');
    console.log('🔄 Przetwarzanie zamkniętego kontekstu...');

    try {
        const analysis = await analyzeContextWithOpenAI(fullContext);

        // Pierwsza weryfikacja - czy mamy obiekt z is_task: "no"
        if (analysis && analysis.is_task === "no") {
            console.log('ℹ️ Wynik analizy OpenAI: Brak zadań przypisanych do Szymona Tila.');
            return;
        }

        // Druga weryfikacja - czy mamy pustą tablicę
        if (Array.isArray(analysis) && analysis.length === 0) {
            console.log('ℹ️ Wynik analizy OpenAI: Brak zadań w tej konwersacji.');
            return;
        }

        // Jeśli mamy tablicę z zadaniami
        if (Array.isArray(analysis)) {
            console.log(`✅ Znaleziono ${analysis.length} zadanie(-a/-ń):`);
            for (const task of analysis) {
                console.log(`📋 Zadanie: ${task.task_title} (${task.task_type})`);

                if (task.task_type === "e-mail") {
                    console.log('✉️ Tworzenie szkicu e-maila...');
                    try {
                        const recipient = task.recipient || "odbiorca@example.com";
                        const subject = task.subject || task.task_title;
                        const body = task.body || `Szczegóły zadania:\n\n${fullContext}`;
                        
                        await createEmailDraft(recipient, subject, body);
                        console.log(`✅ Szkic e-maila utworzony: ${subject}`);
                    } catch (error) {
                        console.error('❌ Błąd podczas tworzenia szkicu e-maila:', error.message);
                    }
                } else if (task.task_type === "action") {
                    console.log('🚀 Tworzenie zadania w Todoist...');
                    try {
                        await addTaskToTodoist(task.task_title);
                        console.log(`✅ Zadanie dodane do Todoist: ${task.task_title}`);
                    } catch (error) {
                        console.error('❌ Błąd podczas dodawania zadania do Todoist:', error.message);
                    }
                }
            }
        } else {
            console.log('ℹ️ Otrzymano nieoczekiwany format analizy:', JSON.stringify(analysis, null, 2));
        }
    } catch (error) {
        console.error('❌ Błąd podczas przetwarzania kontekstu:', error.message);
    }
}

module.exports = processContext;