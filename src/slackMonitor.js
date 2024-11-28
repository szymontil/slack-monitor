const { createEventAdapter } = require('@slack/events-api');
const { WebClient } = require('@slack/web-api');
const { analyzeContextWithOpenAI } = require('./openAI');
const { addTaskToTodoist } = require('./todoist');
const { CONTEXT_TIMEOUT } = require('./config');

const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);

let contexts = {};

// Funkcja do pobierania uczestników rozmowy
async function getConversationParticipants(event) {
    try {
        const senderInfo = await slackClient.users.info({ user: event.user });
        const senderName = senderInfo.user.real_name || senderInfo.user.name;

        const botInfo = await slackClient.auth.test();
        const botName = 'Szymon Til';

        if (event.user === botInfo.user_id) {
            const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
            const recipientId = conversationInfo.channel.user;
            const recipientInfo = await slackClient.users.info({ user: recipientId });
            return { senderName: botName, recipientName: recipientInfo.user.real_name || recipientInfo.user.name };
        } else {
            return { senderName, recipientName: botName };
        }
    } catch (error) {
        console.error('❌ Błąd podczas pobierania uczestników rozmowy:', error.message);
        return { senderName: 'Nieznany', recipientName: 'Nieznany' };
    }
}

// Obsługa wiadomości
slackEvents.on('message', async event => {
    if (event.bot_id || !event.channel.startsWith('D')) return;

    try {
        const { senderName, recipientName } = await getConversationParticipants(event);

        const channelId = event.channel;
        const timestamp = Date.now();

        if (!contexts[channelId]) {
            console.log(`📢 Rozpoczęto nowy kontekst: Rozmowa między: ${senderName} i ${recipientName}`);
            contexts[channelId] = { messages: [], lastActivity: timestamp, senderName, recipientName };
        }

        contexts[channelId].messages.push(`${senderName}: ${event.text}`);
        contexts[channelId].lastActivity = timestamp;

        console.log(`📩 Nowa wiadomość od: ${senderName}\nTreść: ${event.text}`);
    } catch (error) {
        console.error('❌ Błąd obsługi wiadomości:', error.message);
    }
});

// Sprawdzanie zamkniętych kontekstów
async function checkClosedContexts() {
    console.log('🕒 Rozpoczynanie sprawdzania zamkniętych kontekstów...');
    const now = Date.now();

    for (const [channelId, context] of Object.entries(contexts)) {
        if (now - context.lastActivity >= CONTEXT_TIMEOUT) {
            console.log(`📢 Kontekst dla ${context.senderName} i ${context.recipientName} został zamknięty.`);
            console.log('Pełny kontekst:\n' + context.messages.join('\n'));

            const fullContext = context.messages.join('\n');
            const analysis = await analyzeContextWithOpenAI(fullContext);
            console.log(`📜 Analiza OpenAI:\n${analysis}`);

            if (/Brak zadań do wykonania/i.test(analysis)) {
                console.log('ℹ️ Nie znaleziono zadań w tej rozmowie.');
            } else {
                console.log(`✅ Znaleziono zadanie: ${analysis}`);
                await addTaskToTodoist(analysis);
            }

            delete contexts[channelId];
        }
    }
}

module.exports = slackEvents;
module.exports.checkClosedContexts = checkClosedContexts;
