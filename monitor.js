const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
const Queue = require('bull');
const dotenv = require('dotenv');
const cron = require('node-cron');
const axios = require('axios');

dotenv.config();

// Czas uruchomienia aplikacji
const appStartTime = Date.now();

// Wymagane zmienne środowiskowe
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
  console.error('❌ Brak wymaganych zmiennych środowiskowych:', missingVars);
  process.exit(1);
}

// Modele MongoDB
const messageSchema = new mongoose.Schema({
  channelId: String,
  senderName: String,
  text: String,
  timestamp: Date,
  files: [
    {
      id: String,
      title: String,
      size: Number,
      mimetype: String,
      tooLarge: Boolean,
    },
  ],
});

const contextSchema = new mongoose.Schema({
  channelId: String,
  contextStartTime: Date,
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  lastActivity: Date,
});

const Message = mongoose.model('Message', messageSchema);
const Context = mongoose.model('Context', contextSchema);

// Inicjalizacja aplikacji
const app = express();
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);
const contextQueue = new Queue('contextQueue', { redis: process.env.REDIS_URL });

// Middleware Slack Events API
app.use('/slack/events', slackEvents.expressMiddleware());
console.log('✅ Slack Events API middleware uruchomione.');

// Połączenie z MongoDB
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log('✅ Połączono z MongoDB'))
  .catch((err) => {
    console.error('❌ Błąd połączenia z MongoDB:', err);
    process.exit(1);
  });

// Redis - debugowanie połączenia
contextQueue.client.on('ready', () => {
  console.log('✅ Redis połączono i gotowe do użycia.');
});
contextQueue.client.on('error', (err) => {
  console.error('❌ Redis - błąd połączenia:', err);
});

// Funkcje pomocnicze
async function processSlackFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    console.log(`⚠️ Plik ${file.title} jest zbyt duży (${file.size / (1024 * 1024)} MB)`);
    return { ...file, tooLarge: true };
  }
  return { ...file, tooLarge: false };
}

async function addMessageToContext(channelId, message) {
  try {
    const context = await Context.findOne({ channelId });
    if (context) {
      context.messages.push(message._id);
      context.lastActivity = new Date();
      await context.save();
    } else {
      console.log(`📢 Rozpoczęto nowy kontekst: Rozmowa z: ${message.senderName}`);
      await new Context({
        channelId,
        contextStartTime: new Date(),
        messages: [message._id],
        lastActivity: new Date(),
      }).save();
    }
  } catch (error) {
    console.error('❌ Błąd przy dodawaniu wiadomości do kontekstu:', error);
  }
}

// Obsługa wiadomości Slack
slackEvents.on('message', async (event) => {
  try {
    if (!event.channel.startsWith('D') || event.bot_id) return;

    const messageTimestamp = parseFloat(event.ts) * 1000;

    // Ignoruj wiadomości sprzed uruchomienia aplikacji
    if (messageTimestamp < appStartTime) {
      console.log(`⏩ Pominięto starą wiadomość: ${event.text}`);
      return;
    }

    const senderInfo = await slackClient.users.info({ user: event.user });
    const senderName = senderInfo.user.real_name;

    console.log(`📩 Nowa wiadomość od: ${senderName}`);
    console.log(`Treść: ${event.text}`);

    const message = await new Message({
      channelId: event.channel,
      senderName,
      text: event.text,
      timestamp: new Date(messageTimestamp),
      files: event.files ? await Promise.all(event.files.map(processSlackFile)) : [],
    }).save();

    await addMessageToContext(event.channel, message);
    console.log(`✅ Wiadomość zapisana i dodana do kontekstu: ${event.channel}`);
  } catch (error) {
    console.error('❌ Błąd podczas obsługi wiadomości:', error);
  }
});

// Harmonogram sprawdzania nieaktywnych kontekstów
cron.schedule('*/10 * * * *', async () => {
  const inactiveContexts = await Context.find({
    lastActivity: { $lte: new Date(Date.now() - 5 * 60 * 1000) },
  });

  for (const context of inactiveContexts) {
    await contextQueue.add({ channelId: context.channelId, contextId: context._id });
  }
});

// Obsługa kolejki przetwarzania kontekstów
contextQueue.process(async (job) => {
  const { channelId, contextId } = job.data;
  const context = await Context.findById(contextId).populate('messages');

  if (!context) {
    console.log(`⚠️ Kontekst ${contextId} nie istnieje.`);
    return;
  }

  const messages = context.messages
    .map((msg) => `${msg.senderName}: ${msg.text}`)
    .join('\n');

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Jesteś asystentem pomagającym identyfikować zadania z rozmów.' },
        { role: 'user', content: `Przeanalizuj poniższą rozmowę:\n\n${messages}` },
      ],
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }
  );

  const analysis = response.data.choices[0]?.message.content;
  console.log(`🔍 Analiza OpenAI:\n${analysis}`);

  if (analysis.toLowerCase().includes('zadanie')) {
    await axios.post(
      'https://api.todoist.com/rest/v2/tasks',
      { content: analysis, due_string: 'today' },
      { headers: { Authorization: `Bearer ${process.env.TODOIST_API_KEY}` } }
    );
    console.log('✅ Zadanie zostało dodane do Todoist.');
  }

  await Context.deleteOne({ _id: contextId });
  console.log(`✅ Kontekst ${contextId} został przetworzony i usunięty.`);
});

// Czyszczenie bazy danych
cron.schedule('0 0 * * *', async () => {
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Message.deleteMany({ timestamp: { $lt: threshold } });
  await Context.deleteMany({ lastActivity: { $lt: threshold } });
  console.log('🧹 Baza danych została wyczyszczona.');
});

// Start serwera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Aplikacja działa na porcie ${PORT}`);
});
