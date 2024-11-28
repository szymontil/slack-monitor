const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
const dayjs = require('dayjs');
require('dotenv').config();

// Konfiguracja
const PORT = process.env.PORT || 8080;
const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minut

// Sprawdzanie zmiennych środowiskowych
const requiredEnvVars = ['SLACK_SIGNING_SECRET', 'SLACK_USER_TOKEN', 'MONGO_URL'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
    console.error('Brak wymaganych zmiennych środowiskowych:', missingVars.join(', '));
    process.exit(1);
}

// Połączenie z MongoDB
mongoose
    .connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch((err) => {
        console.error('❌ Błąd połączenia z MongoDB:', err);
        process.exit(1);
    });

// Definicje schematów MongoDB
const messageSchema = new mongoose.Schema({
    sender: String,
    text: String,
    timestamp: Date,
});

const contextSchema = new mongoose.Schema({
    participants: [String],
    lastActivity: Date,
    messages: [messageSchema],
});

const Context = mongoose.model('Context', contextSchema);

// Inicjalizacja Slack Events API i klienta Slack
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);

// Inicjalizacja Express
const app = express();
app.use('/slack/events', slackEvents.expressMiddleware());

// Obsługa wiadomości
slackEvents.on('message', async (event) => {
    try {
        if (!event.channel.startsWith('D')) {
            console.log(`ℹ️ Wiadomość zignorowana, nie jest to wiadomość prywatna. Kanał: ${event.channel}`);
            return;
        }

        if (!event.user) {
            console.log(`⚠️ Wiadomość zignorowana. Brak identyfikatora użytkownika w zdarzeniu: ${JSON.stringify(event)}`);
            return;
        }

        // Pobranie informacji o nadawcy
        const senderInfo = await slackClient.users.info({ user: event.user });
        if (!senderInfo.ok) throw new Error(`Nie można pobrać informacji o użytkowniku. User ID: ${event.user}`);
        const senderName = senderInfo.user.real_name || senderInfo.user.name;

        // Pobranie informacji o odbiorcy
        const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
        if (!conversationInfo.ok) throw new Error(`Nie można pobrać informacji o kanale: ${event.channel}`);
        const recipientId = conversationInfo.channel.user;
        const recipientInfo = await slackClient.users.info({ user: recipientId });
        if (!recipientInfo.ok) throw new Error(`Nie można pobrać informacji o odbiorcy. User ID: ${recipientId}`);
        const recipientName = recipientInfo.user.real_name || recipientInfo.user.name;

        console.log(`📩 Nowa wiadomość od: ${senderName}`);
        console.log(`Treść: ${event.text}`);
        console.log(`📢 Rozpoczęto nowy kontekst: Rozmowa między: ${senderName} i ${recipientName}`);

        // Obsługa kontekstu
        let context = await Context.findOne({ participants: { $all: [senderName, recipientName] } });
        if (!context) {
            context = new Context({
                participants: [senderName, recipientName],
                lastActivity: new Date(),
                messages: [],
            });
        }

        // Dodanie wiadomości do kontekstu
        context.messages.push({
            sender: senderName,
            text: event.text || '',
            timestamp: new Date(parseFloat(event.ts) * 1000),
        });

        context.lastActivity = new Date();
        await context.save();
    } catch (error) {
        console.error('❌ Błąd obsługi wiadomości:', error.message);
    }
});

// Harmonogram sprawdzania nieaktywnych kontekstów
setInterval(async () => {
    const now = dayjs();
    try {
        const inactiveContexts = await Context.find({
            lastActivity: { $lt: now.subtract(CONTEXT_TIMEOUT, 'millisecond').toDate() },
        });

        for (const context of inactiveContexts) {
            console.log(`🔄 Przetwarzanie zakończonego kontekstu dla: ${context.participants.join(' i ')}`);

            // Kompilowanie pełnego kontekstu rozmowy
            const compiledContext = context.messages
                .map((msg) => `${msg.sender}: ${msg.text}`)
                .join('\n');

            console.log(`📢 Kontekst dla ${context.participants.join(' i ')} został zamknięty.`);
            console.log(`Pełny kontekst:\n${compiledContext}`);

            // Usuwanie zamkniętego kontekstu
            await context.deleteOne();
        }
    } catch (error) {
        console.error('❌ Błąd podczas przetwarzania zakończonych kontekstów:', error.message);
    }
}, CONTEXT_TIMEOUT);

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 Aplikacja działa na porcie ${PORT}`);
});
