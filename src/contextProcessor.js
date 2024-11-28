const { analyzeContextWithOpenAI } = require('./openAI');
const { addTaskToTodoist } = require('./todoist');
const { createEmailDraft } = require('./createEmailDraft');

// Przetwarzanie zamkniętego kontekstu
async function processContext(context) {
    const fullContext = context.messages.join('\n');
    console.log('🔄 Przetwarzanie zamkniętego kontekstu...');

    let analysis;
    try {
        // Analiza za pomocą OpenAI
        analysis = await analyzeContextWithOpenAI(fullContext);
        console.log('📋 Wynik analizy OpenAI:', JSON.stringify(analysis, null, 2));
    } catch (error) {
        console.error('❌ Błąd podczas analizy OpenAI:', error.message);
        return; // Przerwij działanie w przypadku błędu analizy
    }

    // Obsługa sytuacji, gdy nie znaleziono żadnych zadań
    if (analysis.is_task === "no" || (Array.isArray(analysis) && analysis.length === 0)) {
        console.log('ℹ️ Wynik analizy OpenAI: Brak zadań przypisanych do Szymona Tila.');
        return;
    }

    // Obsługa wyników analizy jako tablicy z zadaniami
    if (Array.isArray(analysis)) {
        console.log(`✅ Znaleziono ${analysis.length} zadanie(-a/-ń):`);
        for (const task of analysis) {
            console.log(`📋 Zadanie: ${task.task_title} (${task.task_type})`);
            
            if (task.task_type === "e-mail") {
                console.log('✉️ Tworzenie szkicu e-maila...');
                try {
                    await createEmailDraft(
                        "odbiorca@example.com", // Zmień na odpowiedni adres odbiorcy
                        task.task_title,
                        `Szczegóły zadania:\n\n${fullContext}`
                    );
                    console.log(`✅ Szkic e-maila utworzony: ${task.task_title}`);
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
        console.error('❌ Nieoczekiwany format analizy:', JSON.stringify(analysis, null, 2));
    }
}

module.exports = { processContext };
