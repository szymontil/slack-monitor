const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');
const Queue = require('bull');
const dotenv = require('dotenv');
const dayjs = require('dayjs');

dotenv.config();

// Znacznik czasu uruchomienia aplikacji
const appStartTime = new Date();
console.log(`🕒 Aplikacja uruchomiona: ${appStartTime}`);

// Sprawdzanie wymaganych zmiennych środowiskowych
const requiredEnvVars = [
    'SLACK_SIGNING_SECRET',
    'SLACK_USER_TOKEN',
    'TARGET_USER_ID',
    'OPENAI_API_KEY',
    'TODOIST_API_KEY',
    'MONGO_URL',
    'REDIS_URL',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Brak wymaganych zmiennych środowiskowych:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    process.exit(1);
} else {
    console.log('✅ Wszystkie wymagane zmienne środowiskowe są ustawione');
}

// MongoDB
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch(err => {
        console.error('❌ Błąd połączenia z MongoDB:', err);
        process.exit(1);
    });

// Schematy MongoDB
const { Schema } = mongoose;

const messageSchema = new Schema({
    channelId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, required: true },
    files: [Object],
});

const contextSchema = new Schema({
    channelId: { type: String, required: true, unique: true },
    messages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
    lastActivity: { type: Date, required: true },
    processed: { type: Boolean, default: false }, // Flaga przetworzenia
});

const Message = mongoose.model('Message', messageSchema);
const Context = mongoose.model('Context', contextSchema);

// Inicjalizacja Express i Slack
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const app = express();
const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);

// Kolejka Redis
const contextQueue = new Queue('contextQueue', {
    redis: process.env.REDIS_URL,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

// Test połączenia Redis
async function checkRedisConnection() {
    try {
        const client = contextQueue.client;
        await client.ping();
        console.log('✅ Połączenie z Redis działa prawidłowo (sprawdzone raz na starcie aplikacji)');
    } catch (error) {
        console.error('❌ Problem z połączeniem Redis:', error);
    }
}

checkRedisConnection();

// Middleware
app.use('/slack/events', slackEvents.expressMiddleware());
app.use(express.json());

// Obsługa wiadomości
slackEvents.on('message', async (event) => {
    try {
        // Ignoruj boty i wiadomości starsze niż czas uruchomienia aplikacji
        if (event.bot_id || !event.text || new Date(parseFloat(event.ts) * 1000) < appStartTime) {
            console.log('📤 Ignorowanie starej wiadomości lub wiadomości od bota.');
            return;
        }

        const senderInfo = await slackClient.users.info({ user: event.user });
        const senderName = senderInfo.user.real_name;

        const message = new Message({
            channelId: event.channel,
            senderId: event.user,
            senderName,
            text: event.text,
            timestamp: new Date(parseFloat(event.ts) * 1000),
        });

        await message.save();

        const context = await Context.findOneAndUpdate(
            { channelId: event.channel },
            { $set: { lastActivity: new Date() }, $push: { messages: message._id } },
            { new: true, upsert: true }
        );

        console.log(`📩 Nowa wiadomość od: ${senderName}`);
        console.log(`Treść: ${event.text}`);
    } catch (error) {
        console.error('❌ Błąd Slack Events API:', error);
    }
});

// Przetwarzanie kontekstów w Redis
contextQueue.process(async (job) => {
    const { channelId, contextId } = job.data;
    console.log(`🔄 Przetwarzanie kontekstu z kanału: ${channelId}`);

    const context = await Context.findById(contextId).populate('messages');
    if (!context || context.messages.length === 0) {
        console.error(`❌ Kontekst o ID ${contextId} nie istnieje lub jest pusty`);
        return;
    }

    // Budowanie kontekstu i ograniczanie długości wiadomości
    const messagesText = context.messages.map(msg => `${msg.senderName}: ${msg.text}`).join('\n');
    const maxTokenLength = 3000; // Maksymalna długość wiadomości w znakach
    const trimmedMessagesText = messagesText.length > maxTokenLength
        ? messagesText.slice(-maxTokenLength) // Przytnij do ostatnich znaków
        : messagesText;

    try {
        console.log(`📝 Przesyłanie kontekstu do OpenAI dla kanału: ${channelId}`);
        console.log('📤 Przesyłane dane:', trimmedMessagesText);

        const openAIResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Jesteś asystentem pomagającym identyfikować zadania.' },
                { role: 'user', content: `Oto zapis rozmowy:\n\n${trimmedMessagesText}\n\nCzy istnieją jakieś zadania do wykonania? Jeśli tak, opisz je.` },
            ],
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        const task = extractTask(openAIResponse.data.choices[0].message.content);

        if (task) {
            console.log(`📌 Wykryto zadanie: ${task}`);
            await addTaskToTodoist(task);
        } else {
            console.log('ℹ️ Brak zadań do dodania.');
        }

        // Oznaczamy kontekst jako przetworzony
        await Context.findByIdAndUpdate(context._id, { processed: true });
    } catch (error) {
        console.error('❌ Błąd w przetwarzaniu OpenAI:', error.response?.data || error.message);
    }
});

// Wyodrębnianie zadania z odpowiedzi OpenAI
function extractTask(response) {
    console.log('🔍 Odpowiedź OpenAI:', response);

    const match = response.match(/zadanie: (.+)/i);
    const task = match ? match[1].trim() : null;

    console.log('📌 Wykryte zadanie:', task);
    return task;
}

// Dodawanie zadania do Todoist
async function addTaskToTodoist(task) {
    try {
        console.log('📤 Przesyłanie zadania do Todoist:', task);

        const todoistData = {
            content: task,
            due_string: 'today',
        };

        console.log('📤 Dane przesyłane do Todoist:', todoistData);

        const response = await axios.post('https://api.todoist.com/rest/v2/tasks', todoistData, {
            headers: {
                'Authorization': `Bearer ${process.env.TODOIST_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        console.log(`✅ Zadanie dodane do Todoist: ${response.data.id}`);
    } catch (error) {
        console.error('❌ Błąd podczas dodawania zadania do Todoist:', error.response?.data || error.message);
    }
}

// Czyszczenie starych danych
cron.schedule('*/1 * * * *', async () => {
    console.log('🕒 Sprawdzanie nieaktywnych kontekstów...');
    const now = dayjs();

    const inactiveContexts = await Context.find({
        lastActivity: { $lte: now.subtract(5, 'minute').toDate() }, // Nieaktywny od 5 minut
        processed: false, // Jeszcze nieprzetworzony
    });

    for (const context of inactiveContexts) {
        console.log(`Dodawanie nieaktywnego kontekstu do kolejki: ${context.channelId}`);
        await contextQueue.add({
            channelId: context.channelId,
            contextId: context._id,
        });

        await Context.findByIdAndUpdate(context._id, { processed: true });
    }
});

// Start serwera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Slack Events API działa na porcie ${PORT}`);
});
