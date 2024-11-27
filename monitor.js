const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const dotenv = require('dotenv');
const { WebClient } = require('@slack/web-api');

dotenv.config();

const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const app = express();
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// Middleware do obsługi zdarzeń
app.use('/slack/events', slackEvents.expressMiddleware());

// Obsługa weryfikacji URL Slacka
app.post('/slack/events', express.json(), (req, res) => {
    if (req.body.type === 'url_verification') {
        console.log('🔑 Weryfikacja URL:', req.body.challenge);
        res.status(200).send(req.body.challenge); // Zwróć wartość challenge
    } else {
        res.status(404).send('Not found');
    }
});

// Obsługa zdarzeń `message.im` (DM do Ciebie)
slackEvents.on('message', async (event) => {
    console.log('🔍 ID użytkownika wiadomości:', event.user);
    console.log('🔍 ID kanału (event.channel):', event.channel);

    try {
        // Jeśli to wiadomość DM, pobierz szczegóły konwersacji
        if (event.channel && event.channel.startsWith('D')) { // Wiadomość DM
            const channelInfo = await slackClient.conversations.info({ channel: event.channel });

            // Sprawdzenie, czy kanał istnieje
            if (channelInfo.ok) {
                const userInfo = await slackClient.users.info({ user: event.user });
                const userName = userInfo.user.real_name;

                console.log(`Konwersacja prywatna z: ${userName}`);
                console.log(`Wiadomość od: ${userName}`);
                console.log('Treść:', event.text);
            } else {
                console.error('❌ Błąd: Nie znaleziono kanału DM');
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
