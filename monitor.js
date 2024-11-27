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
    // Logowanie ID użytkownika dla debugowania
    console.log('🔍 ID użytkownika wiadomości:', event.user);

    // Pobierz nazwę użytkownika wysyłającego wiadomość
    const userInfo = await slackClient.users.info({ user: event.user });
    const userName = userInfo.user.real_name;

    // Pobierz nazwę użytkownika rozpoczynającego konwersację
    const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
    const conversationUser = conversationInfo.channel.created_by;

    // Pobierz nazwę użytkownika rozpoczynającego konwersację
    const conversationUserInfo = await slackClient.users.info({ user: conversationUser });
    const conversationUserName = conversationUserInfo.user.real_name;

    // Logowanie konwersacji i wiadomości
    console.log(`Konwersacja z: ${conversationUserName}`);
    console.log(`Wiadomość od: ${userName}`);
    console.log('Treść:', event.text);
});

// Obsługa błędów
slackEvents.on('error', (error) => {
    console.error('❌ Błąd Slack Events API:', error);
});

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 Slack Events API działa na porcie ${PORT}`);
});
