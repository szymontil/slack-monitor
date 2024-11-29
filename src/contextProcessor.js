const { analyzeContextWithOpenAI } = require('./openAI');
const { addTaskToTodoist, verifyTodoistConnection } = require('./todoist');
const { createEmailDraft } = require('./createEmailDraft');

async function processContext(context) {
    const fullContext = context.messages.join('\n');
    console.log('\n🔄 Rozpoczynam przetwarzanie kontekstu...');
    console.log('📜 Pełny kontekst:', fullContext);

    try {
        const todoistConnected = await verifyTodoistConnection();
        if (!todoistConnected) {
            throw new Error('Nie można połączyć się z Todoist');
        }

        console.log('\n🤖 Wysyłam kontekst do analizy...');
        const analysis = await analyzeContextWithOpenAI(fullContext);
        console.log('\n📊 Otrzymana analiza:', JSON.stringify(analysis, null, 2));

        if (analysis && analysis.is_task === "no") {
            console.log('ℹ️ Brak zadań do wykonania');
            return;
        }

        if (Array.isArray(analysis)) {
            if (analysis.length === 0) {
                console.log('ℹ️ Otrzymano pustą listę zadań');
                return;
            }

            console.log(`\n✅ Znaleziono ${analysis.length} zadanie(-a/-ń)`);
            
            for (const task of analysis) {
                console.log('\n📌 Przetwarzam zadanie:');
                console.log('   Typ:', task.task_type);
                console.log('   Tytuł:', task.task_title);
                console.log('   Pełne dane zadania:', JSON.stringify(task, null, 2));

                try {
                    if (task.task_type === "action") {
                        console.log('\n🚀 Wysyłam zadanie do Todoist...');
                        const result = await addTaskToTodoist(task.task_title);
                        console.log('✅ Odpowiedź z Todoist:', JSON.stringify(result, null, 2));
                    } else if (task.task_type === "e-mail") {
                        console.log('\n✉️ Tworzę szkic e-maila...');
                        // Logika e-mail pozostaje bez zmian
                    } else {
                        console.log(`⚠️ Nieznany typ zadania: ${task.task_type}`);
                    }
                } catch (error) {
                    console.error(`\n❌ Błąd podczas przetwarzania zadania:`, {
                        taskType: task.task_type,
                        taskTitle: task.task_title,
                        error: error.message,
                        fullError: error
                    });
                    throw error;
                }
            }
        } else {
            console.log('\n⚠️ Nieoczekiwany format analizy:', typeof analysis);
            console.log(JSON.stringify(analysis, null, 2));
        }
    } catch (error) {
        console.error('\n❌ Błąd główny:', error);
        throw error;
    }
}

module.exports = processContext;