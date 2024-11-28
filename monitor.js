const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Konfiguracja aplikacji
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGO_URL = process.env.MONGO_URL;
const TODOIST_API_KEY = process.env.TODOIST_API_KEY;

const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minut
const CHECK_INTERVAL = 60 * 1000; // co minutę

// Inicjalizacja Slack Events API, klienta Slacka i Express
const slackEvents = createEventAdapter(SLACK_SIGNING_SECRET);
const slackClient = new WebClient(SLACK_USER_TOKEN);
const app = express();

app.use('/slack/events', slackEvents.expressMiddleware());

// Połączenie z MongoDB
mongoose
  .connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Połączono z MongoDB'))
  .catch((error) => {
    console.error('❌ Błąd połączenia z MongoDB:', error);
    process.exit(1);
  });

// Schemat kontekstu
const contextSchema = new mongoose.Schema({
  participants: [String], // Nazwy uczestników rozmowy
  channelId: String,
  messages: [
    {
      sender: String,
      text: String,
      timestamp: Date,
    },
  ],
  lastActivity: Date,
});

const Context = mongoose.model('Context', contextSchema);

// Nasłuchiwanie wiadomości na Slacku
slackEvents.on('message', async (event) => {
  if (!event.text || event.bot_id) return;

  const { channel, user, text, ts } = event;

  // Sprawdzanie czy wiadomość pochodzi z DM
  if (channel.startsWith('D')) {
    try {
      const senderInfo = await slackClient.users.info({ user });
      const senderName = senderInfo.user.real_name;

      const conversationInfo = await slackClient.conversations.info({ channel });
      const conversationUserId = conversationInfo.channel.user;
      const conversationUserInfo = await slackClient.users.info({ user: conversationUserId });
      const conversationUserName = conversationUserInfo.user.real_name;

      console.log(`📩 Nowa wiadomość od: ${senderName}`);
      console.log(`Treść: ${text}`);

      // Szukaj istniejącego kontekstu
      let context = await Context.findOne({ channelId: channel });

      if (!context) {
        // Jeśli brak kontekstu, utwórz nowy
        context = new Context({
          participants: [senderName, conversationUserName],
          channelId: channel,
          messages: [],
          lastActivity: new Date(),
        });
        console.log(`📢 Rozpoczęto nowy kontekst: Rozmowa między: ${senderName} i ${conversationUserName}`);
      }

      // Dodaj wiadomość do kontekstu
      context.messages.push({ sender: senderName, text, timestamp: new Date(parseFloat(ts) * 1000) });
      context.lastActivity = new Date();
      await context.save();
    } catch (error) {
      console.error('❌ Błąd podczas przetwarzania wiadomości:', error);
    }
  }
});

// Funkcja przetwarzania kontekstu
async function processContext(context) {
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
      // Dodanie zadania do Todoist
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

// Sprawdzanie nieaktywnych kontekstów
setInterval(async () => {
  const now = Date.now();
  const expiredContexts = await Context.find({
    lastActivity: { $lt: new Date(now - CONTEXT_TIMEOUT) },
  });

  for (const context of expiredContexts) {
    console.log(`🔄 Przetwarzanie zakończonego kontekstu dla: ${context.participants.join(' i ')}`);
    await processContext(context);
    await Context.deleteOne({ _id: context._id });
    console.log(`✅ Kontekst dla ${context.participants.join(' i ')} został usunięty.`);
  }
}, CHECK_INTERVAL);

// Start serwera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Aplikacja działa na porcie ${PORT}`);
});
