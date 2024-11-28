const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const axios = require('axios');
const dotenv = require('dotenv');

// Konfiguracja środowiska
dotenv.config();

// Zmienne środowiskowe
const {
    SLACK_SIGNING_SECRET,
    SLACK_USER_TOKEN,
    MONGO_URL,
    OPENAI_API_KEY,
    PORT = 8080,
} = process.env;

// Sprawdzenie wymaganych zmiennych środowiskowych
if (!SLACK_SIGNING_SECRET || !SLACK_USER_TOKEN || !MONGO_URL || !OPENAI_API_KEY) {
    console.error('❌ Brak wymaganych zmiennych środowiskowych.');
    process.exit(1);
}

// Inicjalizacja
const slackEvents = createEventAdapter(SLACK_SIGNING_SECRET);
const app = express();
const slackClient = new WebClient(SLACK_USER_TOKEN);

// Połączenie z MongoDB
mongoose
    .connect(MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch((error) => {
        console.error('❌ Błąd połączenia z MongoDB:', error);
        process.exit(1);
    });

// Schemat i model dla kontekstów
const contextSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true },
    messages: [{ sender: String, text: String, timestamp: Date }],
    lastActivity: { type: Date, required: true },
    participants: [String], // Lista uczestników rozmowy
});
const Context = mongoose.model('Context', contextSchema);

// Konfiguracja timeoutu kontekstu
const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minut

// Funkcja pobierania uczestników rozmowy
async function getConversationParticipants(event) {
    try {
        const senderInfo = await slackClient.users.info({ user: event.user });
        const senderName = senderInfo.user.real_name || senderInfo.user.name;

        const botInfo = await slackClient.auth.test();
        const botId = botInfo.user_id;
        const botName = botInfo.user;

        if (event.user === botId) {
            // Jeśli bot jest nadawcą
            return { senderName: botName, recipientName: senderName };
        }

        const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
        const recipientId = conversationInfo.channel.user;

        if (recipientId === botId) {
            return { senderName, recipientName: botName };
        } else {
            const recipientInfo = await slackClient.users.info({ user: recipientId });
            const recipientName = recipientInfo.user.real_name || recipientInfo.user.name;
            return { senderName, recipientName };
        }
    } catch (error) {
        console.error('❌ Błąd podczas pobierania uczestników rozmowy:', error.message);
        return { senderName: 'Nieznany', recipientName: 'Nieznany' };
    }
}

// Funkcja obsługi wiadomości
slackEvents.on('message', async (event) => {
    try {
        if (!event.channel.startsWith('D')) return;

        const participants = await getConversationParticipants(event);
        if (!participants) return;

        const { senderName, recipientName } = participants;

        const existingContext = await Context.findOne({ channelId: event.channel });
        const now = new Date();

        if (existingContext) {
            existingContext.messages.push({
                sender: senderName,
                text: event.text || '[brak treści]',
                timestamp: now,
            });
            existingContext.lastActivity = now;
            await existingContext.save();
        } else {
            const newContext = new Context({
                channelId: event.channel,
                messages: [
                    {
                        sender: senderName,
                        text: event.text || '[brak treści]',
                        timestamp: now,
                    },
                ],
                lastActivity: now,
                participants: [senderName, recipientName],
            });
            await newContext.save();
            console.log(`📢 Rozpoczęto nowy kontekst: Rozmowa między: ${senderName} i ${recipientName}`);
        }

        console.log(`📩 Nowa wiadomość od: ${senderName}\nTreść: ${event.text}`);
    } catch (error) {
        console.error('❌ Błąd obsługi wiadomości:', error.message);
    }
});

// Funkcja wysyłająca kontekst do OpenAI
async function sendToOpenAI(context) {
    const compiledMessages = context.messages
        .map((msg) => `${msg.sender}: ${msg.text}`)
        .join('\n');

    console.log(`📝 Wysyłanie kontekstu do OpenAI:\n${compiledMessages}`);

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'Jesteś asystentem generującym podsumowanie rozmowy.' },
                    { role: 'user', content: `Wykonaj podsumowanie rozmowy:\n\n${compiledMessages}` },
                ],
                max_tokens: 300,
                temperature: 0.7,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                },
            }
        );

        const summary = response.data.choices[0].message.content.trim();
        console.log(`📜 Podsumowanie rozmowy:\n${summary}`);
    } catch (error) {
        console.error('❌ Błąd podczas wysyłania do OpenAI:', error.message);
    }
}

// Funkcja sprawdzająca zamknięte konteksty
async function checkInactiveContexts() {
    console.log('🕒 Rozpoczynanie sprawdzania zamkniętych kontekstów...');
    const now = dayjs();
    const inactiveContexts = await Context.find({
        lastActivity: { $lte: now.subtract(CONTEXT_TIMEOUT, 'millisecond').toDate() },
    });

    if (inactiveContexts.length === 0) {
        console.log('ℹ️ Brak zamkniętych kontekstów do przetworzenia.');
    }

    for (const context of inactiveContexts) {
        const participants = context.participants.join(' i ');
        console.log(`📢 Kontekst dla ${participants} został zamknięty.`);
        await sendToOpenAI(context);
        await context.deleteOne();
    }
}

// Harmonogram sprawdzania kontekstów
setInterval(() => {
    checkInactiveContexts().catch((error) =>
        console.error('❌ Błąd podczas sprawdzania zamkniętych kontekstów:', error.message)
    );
}, 60 * 1000); // Sprawdzanie co 1 minutę

// Middleware i serwer
app.use('/slack/events', slackEvents.expressMiddleware());
app.listen(PORT, () => console.log(`🚀 Aplikacja działa na porcie ${PORT}`));
