// Importy
const axios = require('axios');
const { WebClient } = require('@slack/web-api');
const express = require('express');
const { createEventAdapter } = require('@slack/events-api');
const mongoose = require('mongoose');
const cron = require('node-cron');
const dotenv = require('dotenv');

// Konfiguracja środowiska
dotenv.config();

const {
  SLACK_SIGNING_SECRET,
  SLACK_USER_TOKEN,
  OPENAI_API_KEY,
  TODOIST_API_KEY,
  MONGO_URL,
  REDIS_URL,
} = process.env;

// Sprawdzenie wymaganych zmiennych środowiskowych
const requiredEnvVars = [
  'SLACK_SIGNING_SECRET',
  'SLACK_USER_TOKEN',
  'OPENAI_API_KEY',
  'TODOIST_API_KEY',
  'MONGO_URL',
  'REDIS_URL',
];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`❌ Brak wymaganych zmiennych środowiskowych: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Połączenie z MongoDB
mongoose.connect(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.once('open', () => console.log('✅ Połączono z MongoDB'));

// Modele danych
const contextSchema = new mongoose.Schema({
  participants: [String],
  lastActivity: Date,
  messages: [
    {
      sender: String,
      text: String,
      timestamp: Date,
    },
  ],
});
const Context = mongoose.model('Context', contextSchema);

// Inicjalizacja aplikacji Slack i serwera
const slackEvents = createEventAdapter(SLACK_SIGNING_SECRET);
const slackClient = new WebClient(SLACK_USER_TOKEN);
const app = express();
app.use('/slack/events', slackEvents.expressMiddleware());

// Zmienne czasu
const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minut
const CHECK_INTERVAL = 1 * 60 * 1000; // Sprawdzanie co minutę

// Funkcja przetwarzania kontekstu
async function processContext(context) {
  if (!context.messages || context.messages.length === 0) {
    console.log(`⚠️ Kontekst dla ${context.participants.join(' i ')} jest pusty. Pomijanie przetwarzania.`);
    return;
  }

  const compiledMessages = context.messages
    .map((msg) => `${msg.sender}: ${msg.text}`)
    .join('\n');

  console.log(`🔍 Analiza kontekstu:\n${compiledMessages}`);

  // Wywołanie OpenAI
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Jesteś asystentem analizującym rozmowy i identyfikującym zadania.' },
          { role: 'user', content: `Oto rozmowa:\n${compiledMessages}\nCzy zawiera jakieś zadania?` },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const analysis = response.data.choices[0].message.content;
    console.log(`📝 Analiza OpenAI:\n${analysis}`);

    if (/zadanie|task/i.test(analysis)) {
      await axios.post(
        'https://api.todoist.com/rest/v2/tasks',
        {
          content: analysis,
          due_string: 'today',
        },
        {
          headers: {
            Authorization: `Bearer ${TODOIST_API_KEY}`,
          },
        }
      );
      console.log('✅ Zadanie zostało dodane do Todoist.');
    } else {
      console.log('ℹ️ Brak zadań do dodania.');
    }
  } catch (error) {
    console.error('❌ Błąd podczas analizy OpenAI:', error.response?.data || error.message);
  }
}

// Obsługa wiadomości
slackEvents.on('message', async (event) => {
  if (event.bot_id || !event.channel.startsWith('D')) return;

  try {
    const userInfo = await slackClient.users.info({ user: event.user });
    const recipientInfo = await slackClient.users.info({ user: event.channel_user });

    const senderName = userInfo.user.real_name || 'Nieznany użytkownik';
    const recipientName = recipientInfo.user.real_name || 'Nieznany odbiorca';

    console.log(`📩 Nowa wiadomość od: ${senderName}\nTreść: ${event.text}`);

    let context = await Context.findOne({ participants: { $all: [senderName, recipientName] } });

    if (!context) {
      console.log(`📢 Rozpoczęto nowy kontekst: Rozmowa między: ${senderName} i ${recipientName}`);
      context = new Context({
        participants: [senderName, recipientName],
        lastActivity: new Date(),
        messages: [],
      });
    }

    context.lastActivity = new Date();
    context.messages.push({
      sender: senderName,
      text: event.text || '',
      timestamp: new Date(parseFloat(event.ts) * 1000),
    });

    await context.save();
  } catch (error) {
    console.error('❌ Błąd obsługi wiadomości:', error);
  }
});

// Harmonogram sprawdzania kontekstów
setInterval(async () => {
  const now = Date.now();
  const expiredContexts = await Context.find({
    lastActivity: { $lte: new Date(now - CONTEXT_TIMEOUT) },
  });

  for (const context of expiredContexts) {
    console.log(`⏳ Przetwarzanie zakończonego kontekstu dla: ${context.participants.join(' i ')}`);
    await processContext(context);
    await Context.deleteOne({ _id: context._id });
    console.log(`🗑️ Kontekst dla ${context.participants.join(' i ')} został usunięty.`);
  }
}, CHECK_INTERVAL);

// Start serwera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Aplikacja działa na porcie ${PORT}`));
