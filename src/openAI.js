const axios = require('axios');

async function sendToOpenAI(fullContext) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Wykonaj podsumowanie rozmowy.' },
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
        console.error('❌ Błąd podczas wysyłania kontekstu do OpenAI:', error.message);
        return '❌ Nie udało się wygenerować podsumowania.';
    }
}

module.exports = { sendToOpenAI };
