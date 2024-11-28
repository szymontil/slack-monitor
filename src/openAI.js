const axios = require('axios');

async function analyzeContextWithOpenAI(fullContext) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Jesteś asystentem pomagającym w identyfikacji zadań z kontekstu rozmowy. Jeśli znajdziesz zadanie, sprecyzuj je w jednym zdaniu. Jeśli nie ma zadań, napisz "Brak zadań do wykonania".' },
                { role: 'user', content: `Pełny kontekst rozmowy:\n\n${fullContext}` }
            ],
            max_tokens: 50, // Ustawiamy limit na precyzyjne odpowiedzi
            temperature: 0.5,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        const analysis = response.data.choices[0].message.content.trim();
        return analysis;
    } catch (error) {
        console.error('❌ Błąd podczas analizy kontekstu przez OpenAI:', error.message);
        return '❌ Nie udało się przeanalizować kontekstu.';
    }
}

module.exports = { analyzeContextWithOpenAI };
