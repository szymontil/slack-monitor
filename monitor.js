const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const dotenv = require('dotenv');

// Konfiguracja środowiska
dotenv.config();

// Zmienne środowiskowe
const {
    SLACK_SIGNING_SECRET,
    SLACK_USER_TOKEN,
    MONGO_URL,
    PORT = 8080,
} = process.env;

// Sprawdzenie wymaganych zmiennych środowiskowych
if (!SLACK_SIGNING_SECRET || !SLACK_USER_TOKEN || !MONGO_URL) {
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
});
const Context = mongoose.model('Context', contextSchema);

// Konfiguracja timeoutu kontekstu
const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minut

// Funkcja pobierania uczestników rozmowy
async function getConversationParticipants(event) {
    try {
        const senderInfo = await slackClient.users.info({ user: event.user });
        const senderName = senderInfo.user.real_name || senderInfo.user.name;

        const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
        const recipientId = conversationInfo.channel.user;

        const botInfo = await slackClient.auth.test();
        const botId = botInfo.user_id;
        const botName = botInfo.user;

        if (recipientId === botId) {
            return { senderName, recipientName: botName };
        } else if (event.user === botId) {
            const recipientInfo = await slackClient.users.info({ user: recipientId });
            const recipientName = recipientInfo.user.real_name || recipientInfo.user.name;
            return { senderName: botName, recipientName };
        } else {
            const recipientInfo = await slackClient.users.info({ user: recipientId });
            const recipientName = recipientInfo.user.real_name || recipientInfo.user.name;
            return { senderName, recipientName };
        }
    } catch (error) {
        console.error('❌ Błąd podczas pobierania uczestników rozmowy:', error.message);
        return null;
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
            });
            await newContext.save();
            console.log(`📢 Rozpoczęto nowy kontekst: Rozmowa między: ${senderName} i ${recipientName}`);
        }

        console.log(`📩 Nowa wiadomość od: ${senderName}\nTreść: ${event.text}`);
    } catch (error) {
        console.error('❌ Błąd obsługi wiadomości:', error.message);
    }
});

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
        const compiledMessages = context.messages
            .map((msg) => `${msg.sender}: ${msg.text}`)
            .join('\n');
        console.log(`📢 Kontekst dla ${context.messages[0].sender} i ${context.messages[1]?.sender || 'Nieznany'} został zamknięty.\nPełny kontekst:\n${compiledMessages}`);
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
