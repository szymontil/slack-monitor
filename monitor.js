const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');

// Inicjalizacja Slack Events Adapter
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);

// Inicjalizacja Express
const app = express();

// Inicjalizacja Slack WebClient
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

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
        // Ignoruj wiadomości od botów i samego bota
        if (event.bot_id) {
            return;
        }

        // Sprawdzenie, czy to wiadomość DM
        if (event.channel && event.channel.startsWith('D')) {
            // Pobranie informacji o nadawcy
            const senderInfo = await getUserInfo(event.user);
            if (!senderInfo) {
                return;
            }

            const senderName = senderInfo.real_name;

            // Pobranie członków kanału DM
            const membersResponse = await slackClient.conversations.members({ channel: event.channel });
            if (membersResponse.ok) {
                const members = membersResponse.members;

                // Znalezienie ID drugiej osoby w rozmowie (nie TARGET_USER_ID)
                const conversationPartnerId = members.find(id => id !== process.env.TARGET_USER_ID);

                if (!conversationPartnerId) {
                    console.log('❌ Nie znaleziono partnera rozmowy.');
                    return;
                }

                const partnerInfo = await getUserInfo(conversationPartnerId);
                if (!partnerInfo) {
                    return;
                }

                const partnerName = partnerInfo.real_name;

                // Określenie, kto wysłał wiadomość
                const messageFrom = (event.user === process.env.TARGET_USER_ID) ? 'Szymon Til' : partnerName;

                // Określenie, z kim prowadzona jest rozmowa
                const conversationWith = partnerName;

                // Logowanie w żądanym formacie
                console.log(`Konwersacja prywatna z: ${conversationWith}`);
                console.log(`Wiadomość od: ${messageFrom}`);
                console.log(`Treść: ${event.text}\n`);
            } else {
                console.log('❌ Nie udało się pobrać członków kanału');
            }
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
