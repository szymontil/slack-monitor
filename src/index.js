const express = require('express');
const path = require('path');
const slackEvents = require('./slackMonitor');
const mongoose = require('mongoose');
const { checkClosedContexts } = require('./slackMonitor');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Połączenie z MongoDB
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => console.error('❌ Błąd połączenia z MongoDB:', err));

// Middleware Slack
app.use('/slack/events', slackEvents.expressMiddleware());

// Serwowanie frontendu
app.use(express.static(path.join(__dirname, '../frontend')));

// API do podglądu kontekstów
app.get('/api/contexts', (req, res) => {
    // W przykładzie zwracamy przykładowe dane, możesz to podłączyć do bazy MongoDB
    res.json([
        { senderName: 'Szymon Til', recipientName: 'Daniel Dąbrowski', lastMessage: 'Muszę wysłać maila.' },
        { senderName: 'Szymon Til', recipientName: 'Martyna Kowalska', lastMessage: 'Pamiętaj o raporcie.' }
    ]);
});

// Serwowanie głównej strony frontendowej
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Interwał sprawdzania zamkniętych kontekstów
const { CHECK_INTERVAL } = require('./config');
setInterval(checkClosedContexts, CHECK_INTERVAL);

// Start aplikacji
app.listen(PORT, () => console.log(`🚀 Aplikacja działa na porcie ${PORT}`));
