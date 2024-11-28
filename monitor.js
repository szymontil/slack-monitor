const express = require('express');
const { WebClient } = require('@slack/web-api');
const { createEventAdapter } = require('@slack/events-api');
const Redis = require('ioredis');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

// Inicjalizacja
const app = express();
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);
const redis = new Redis(process.env.REDIS_URL);

// Stałe
const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minut
const appStartTime = Date.now();

console.log('✅ Aplikacja uruchomiona.');

// Middleware Slack Events API
app.use('/slack/events', slackEvents.expressMiddleware());

// Funkcje pomocnicze
async function processSlackFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    console.log(`⚠️ Plik ${file.title} jest zbyt duży (${file.size / (1024 * 1024)} MB)`);
    return { ...file, tooLarge: true };
  }
  return { ...file, tooLarge: false };
}

async function addTaskToTodoist(content) {
  try {
    const response = await axios.post(
      'https://api.todoist.com/rest/v2/tasks',
      { content, due_string: 'today' },
      {
        headers: {
          Authorization: `Bearer ${process.env.TODOIST_API_KEY}`,
        },
      }
    );
    console.log('✅ Zadanie zostało dodane do Todoist:', response.data);
  } catch (error) {
    console.error('❌ Błąd przy dodawaniu zadania do Todoist:', error.response?.data || error.message);
  }
}

async function analyzeContext(context) {
  const messages = context.messages.map((msg) => `${msg.sender}: ${msg.text}`).join('\n');
  console.log(`📝 Analiza kontekstu:\n${messages}`);

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Jesteś asystentem pomagającym identyfikować zadania z rozmów.' },
          { role: 'user', content: `Przeanalizuj poniższą rozmowę i wskaż zadania:\n\n${messages}` },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const analysis = response.data.choices[0]?.message.content.trim();
    console.log(`🔍 Analiza OpenAI:\n${analysis}`);

    if (analysis.toLowerCase().includes('zadanie')) {
      await addTaskToTodoist(analysis);
    } else {
      console.log('ℹ️ Brak zadań do dodania.');
    }
  } catch (error) {
    console.error('❌ Błąd podczas analizy OpenAI:', error.response?.data || error.message);
  }
}

// Obsługa wiadomości Slack
slackEvents.on('message', async (event) => {
  try {
    if (!event.channel.startsWith('D') || event.bot_id) return;

    const messageTimestamp = parseFloat(event.ts) * 1000;
    if (messageTimestamp < appStartTime) {
      console.log(`⏩ Pominięto starą wiadomość: ${event.text}`);
      return;
    }

    const senderInfo = await slackClient.users.info({ user: event.user });
    const senderName = senderInfo.user.real_name;

    console.log(`📩 Nowa wiadomość od: ${senderName}`);
    console.log(`Treść: ${event.text}`);

    const key = `context:${event.channel}`;
    const contextExists = await redis.exists(key);

    if (!contextExists) {
      console.log(`📢 Rozpoczęto nowy kontekst dla: ${senderName}`);
      await redis.set(key, JSON.stringify({ messages: [], user: senderName }), 'PX', CONTEXT_TIMEOUT);
    }

    const context = JSON.parse(await redis.get(key));
    context.messages.push({ sender: senderName, text: event.text });
    await redis.set(key, JSON.stringify(context), 'PX', CONTEXT_TIMEOUT);
  } catch (error) {
    console.error('❌ Błąd podczas obsługi wiadomości:', error);
  }
});

// Sprawdzanie zakończonych kontekstów
setInterval(async () => {
  const keys = await redis.keys('context:*');
  for (const key of keys) {
    const context = JSON.parse(await redis.get(key));
    if (!context) continue;

    console.log(`🔄 Przetwarzanie zakończonego kontekstu dla: ${context.user}`);
    await analyzeContext(context);
    await redis.del(key);
    console.log(`✅ Kontekst dla ${context.user} został usunięty.`);
  }
}, 60 * 1000); // Sprawdzanie co minutę

// Start serwera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Aplikacja działa na porcie ${PORT}`));
