const express = require('express');
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

// Interwał sprawdzania zamkniętych kontekstów
const { CHECK_INTERVAL } = require('./config');

setInterval(checkClosedContexts, CHECK_INTERVAL); // co 5 minut


app.listen(PORT, () => console.log(`🚀 Aplikacja działa na porcie ${PORT}`));
