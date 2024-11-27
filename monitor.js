const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const dotenv = require('dotenv');
const { WebClient } = require('@slack/web-api');

dotenv.config();

const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const app = express();
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// Globalne middleware do parsowania JSON
app.use(express.json());

// Middleware do obsługi zdarzeń
app.use('/slack/events', slackEvents.expressMiddleware());

// Obsługa zdarzeń `message` (DM do bota)
slackEvents.on('message', async (event) => {
    // Ignoruj wiadomości od botów
    if (event.bot_id) {
        return;
    }

    console.log('🔍 ID użytkownika wiadomości:', event.user);
    console.log('🔍 ID kanału (event.channel):', event.channel);

    try {
        // Sprawdzamy, czy to wiadomość DM
        if (event.channel && event.channel.startsWith('D')) { // Wiadomość DM
            const userInfo = await slackClient.users.info({ user: event.user });
            const userName = userInfo.user.real_name;

            // Pobieramy członków kanału DM
            const membersResponse = await slackClient.conversations.members({ channel: event.channel });

            // Jeśli udało się pobrać członków
            if (membersResponse.ok) {
                // Filtrujemy użytkownika, który wysłał wiadomość
                const conversationPartnerId = membersResponse.members.find(id => id !== event.user); // ID drugiej osoby w rozmowie
                if (conversationPartnerId) {
                    const conversationPartnerInfo = await slackClient.users.info({ user: conversationPartnerId });
                    const conversationPartnerName = conversationPartnerInfo.user.real_name;

                    console.log(`Konwersacja prywatna z: ${conversationPartnerName}`);
                } else {
                    console.log('❌ Nie znaleziono partnera rozmowy.');
                }

                console.log(`Wiadomość od: ${userName}`);
                console.log('Treść:', event.text);
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
