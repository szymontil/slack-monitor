const { analyzeContextWithOpenAI } = require('./openAI');
const { addTaskToTodoist } = require('./todoist');

// Przetwarzanie zamkniętego kontekstu
async function processContext(context) {
    const fullContext = context.messages.join('\n');
    console.log('🔄 Przetwarzanie zamkniętego kontekstu...');

    // Analiza za pomocą OpenAI
    const analysis = await analyzeContextWithOpenAI(fullContext);
    console.log(`📜 Analiza OpenAI:\n${analysis}`);

    // Dodawanie zadania do Todoist, jeśli znaleziono
    if (/Brak zadań do wykonania/i.test(analysis)) {
        console.log('ℹ️ Nie znaleziono zadań w tej rozmowie.');
    } else {
        console.log(`✅ Znaleziono zadanie: ${analysis}`);
        await addTaskToTodoist(analysis);
    }
}

module.exports = { processContext };
