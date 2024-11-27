const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

console.log('🔍 TARGET_USER_ID ustawione na:', process.env.TARGET_USER_ID);  // Logowanie TARGET_USER_ID

const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const app = express();
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
    // Logowanie ID użytkownika, aby upewnić się, że poprawnie rozpoznajemy wiadomości
    console.log('🔍 ID użytkownika wiadomości:', event.user);

    // Filtruj wiadomości wysyłane przez Ciebie
    if (event.channel_type === 'im' && event.user !== process.env.TARGET_USER_ID) {
        console.log('📩 Otrzymano wiadomość DM do Twojego użytkownika:');
        console.log('🆔 Użytkownik:', event.user);
        console.log('💬 Treść:', event.text);
    } else if (event.user === process.env.TARGET_USER_ID) {
        console.log('⏭️ Pomijam własną wiadomość (od TARGET_USER_ID)');
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
