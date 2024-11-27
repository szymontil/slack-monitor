const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');

// Inicjalizacja Slack Events Adapter
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);

// Inicjalizacja Express
const app = express();

// Inicjalizacja Slack WebClient z User Token
const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);

// Port aplikacji
const PORT = process.env.PORT || 3000;

// Middleware dla Slack Events Adapter - musi być przed innymi middleware parsującymi ciało żądania
app.use('/slack/events', slackEvents.expressMiddleware());

// Middleware globalny do parsowania JSON dla wszystkich innych tras
app.use(express.json());

// Funkcja pomocnicza do pobrania informacji o użytkowniku
const getUserInfo = async (userId) => {
    try {
        const response = await slackClient.users.info({ user: userId });
        if (response.ok) {
            return response.user;
        } else {
            console.error(`❌ Nie udało się pobrać informacji o użytkowniku: ${userId}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Błąd podczas pobierania informacji o użytkowniku: ${error}`);
        return null;
    }
};

// Obsługa zdarzeń `message`
slackEvents.on('message', async (event) => {
    try {
        // Ignoruj wiadomości od botów
        if (event.bot_id) {
            return;
        }

        // Sprawdzenie, czy to wiadomość DM
        if (event.channel && event.channel.startsWith('D')) {
            console.log(`Received DM message in channel: ${event.channel} from user: ${event.user}`);

            // Pobranie informacji o nadawcy
            const senderInfo = await getUserInfo(event.user);
            if (!senderInfo) {
                console.log('❌ Nie udało się pobrać informacji o nadawcy.');
                return;
            }

            const senderName = senderInfo.real_name;

            // Pobranie informacji o kanale DM
            const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
            if (!conversationInfo.ok) {
                console.log(`❌ Nie udało się pobrać informacji o kanale: ${event.channel}`);
                return;
            }

            // Pobranie ID drugiej osoby w DM
            const conversationUserId = conversationInfo.channel.user;
            if (!conversationUserId) {
                console.log(`❌ Nie udało się pobrać ID drugiego użytkownika w kanale: ${event.channel}`);
                return;
            }

            const conversationUserInfo = await getUserInfo(conversationUserId);
            if (!conversationUserInfo) {
                console.log('❌ Nie udało się pobrać informacji o drugiej osobie w rozmowie.');
                return;
            }

            const conversationUserName = conversationUserInfo.real_name;

            // Określenie, kto wysłał wiadomość
            const messageFrom = (event.user === process.env.TARGET_USER_ID) ? 'Szymon Til' : conversationUserName;

            // Określenie, z kim prowadzona jest rozmowa
            const conversationWith = (event.user === process.env.TARGET_USER_ID) ? conversationUserName : 'Szymon Til';

            // Logowanie w żądanym formacie
            console.log(`Konwersacja prywatna z: ${conversationWith}`);
            console.log(`Wiadomość od: ${messageFrom}`);
            console.log(`Treść: ${event.text}\n`);
        }
    } catch (error) {
        console.error('❌ Błąd Slack Events API:', error);
    }
});

// Obsługa błędów
slackEvents.on('error', (error) => {
    console.error('❌ Błąd Slack Events API:', error);
});

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 Slack Events API działa na porcie ${PORT}`);
});
