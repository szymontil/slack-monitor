const axios = require('axios');

async function analyzeContextWithOpenAI(fullContext) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Analizuj rozmowę i wskaż zadania. Jeśli istnieją, sformułuj jedno zdanie określające zadanie.' },
                { role: 'user', content: `Pełny kontekst rozmowy:\n\n${fullContext}` }
            ],
            max_tokens: 150,
            temperature: 0.5,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('❌ Błąd podczas analizy OpenAI:', error.message);
        return 'Brak zadań do wykonania.';
    }
}

module.exports = { analyzeContextWithOpenAI };
