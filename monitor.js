// monitor.js

const { createEventAdapter } = require('@slack/events-api');
const express = require('express');
const { WebClient } = require('@slack/web-api');
const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');
const Queue = require('bull');
const dotenv = require('dotenv');
const dayjs = require('dayjs');

// Ładowanie zmiennych środowiskowych z pliku .env (tylko lokalnie)
dotenv.config();

// Sprawdzenie, czy wszystkie wymagane zmienne środowiskowe są ustawione
const requiredEnvVars = [
    'SLACK_SIGNING_SECRET',
    'SLACK_USER_TOKEN',
    'TARGET_USER_ID',
    'OPENAI_API_KEY',
    'TODOIST_API_KEY',
    'MONGO_URL',       
    'REDISHOST',       
    'REDISPORT',
    'REDIS_PASSWORD', 
];

requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        console.error(`❌ Brak wymaganej zmiennej środowiskowej: ${varName}`);
        process.exit(1);
    }
});

// Połączenie z MongoDB
mongoose.connect(process.env.MONGO_URL, { // Użycie MONGO_URL
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Połączono z MongoDB'))
.catch(err => {
    console.error('❌ Błąd połączenia z MongoDB:', err);
    process.exit(1);
});

// Definicja Schematów
const { Schema } = mongoose;

// Schemat wiadomości
const messageSchema = new Schema({
    channelId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, required: true },
});

// Schemat kontekstu
const contextSchema = new Schema({
    channelId: { type: String, required: true, unique: true },
    messages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
    lastActivity: { type: Date, required: true },
});

const Message = mongoose.model('Message', messageSchema);
const Context = mongoose.model('Context', contextSchema);

// Inicjalizacja Slack Events Adapter
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);

// Inicjalizacja Express
const app = express();

// Inicjalizacja Slack WebClient z User Token
const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);

// Konfiguracja kolejki z Bull z użyciem poprawionych zmiennych środowiskowych Redis
const contextQueue = new Queue('contextQueue', {
    redis: {
        host: process.env.REDISHOST,      // Poprawiona nazwa zmiennej
        port: process.env.REDISPORT,      // Poprawiona nazwa zmiennej
        password: process.env.REDIS_PASSWORD || '', // Dodaj, jeśli Redis wymaga hasła
    },
});

// Middleware dla Slack Events Adapter - musi być przed innymi middleware parsującymi ciało żądania
app.use('/slack/events', slackEvents.expressMiddleware());

// Middleware globalny do parsowania JSON dla wszystkich innych tras
app.use(express.json());

// Funkcja do dodawania wiadomości do kontekstu
const addMessageToContext = async (channelId, message) => {
    const now = dayjs();
    let context = await Context.findOne({ channelId });

    if (context) {
        context.messages.push(message._id);
        context.lastActivity = now.toDate();
    } else {
        context = new Context({
            channelId,
            messages: [message._id],
            lastActivity: now.toDate(),
        });
    }

    await context.save();
};

// Funkcja pomocnicza do pobrania informacji o użytkowniku
const getUserInfo = async (userId) => {
    try {
        const response = await slackClient.users.info({ user: userId });
        if (response.ok) {
            return response.user;
        } else {
            console.error(`❌ Nie udało się pobrać informacji o użytkowniku: ${userId}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Błąd podczas pobierania informacji o użytkowniku: ${error}`);
        return null;
    }
};

// Obsługa zdarzeń `message`
slackEvents.on('message', async (event) => {
    try {
        // Ignoruj wiadomości od botów
        if (event.bot_id) {
            return;
        }

        // Sprawdzenie, czy to wiadomość DM
        if (event.channel && event.channel.startsWith('D')) {
            console.log(`Received DM message in channel: ${event.channel} from user: ${event.user}`);

            // Pobranie informacji o nadawcy
            const senderInfo = await getUserInfo(event.user);
            if (!senderInfo) {
                console.log('❌ Nie udało się pobrać informacji o nadawcy.');
                return;
            }

            const senderName = senderInfo.real_name;

            // Pobranie informacji o kanale DM
            console.log(`Attempting to fetch info for channel: ${event.channel}`);
            const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
            if (!conversationInfo.ok) {
                console.log(`❌ Nie udało się pobrać informacji o kanale: ${event.channel}`);
                return;
            }

            // Pobranie ID drugiej osoby w DM
            const conversationUserId = conversationInfo.channel.user;
            if (!conversationUserId) {
                console.log(`❌ Nie udało się pobrać ID drugiego użytkownika w kanale: ${event.channel}`);
                return;
            }

            const conversationUserInfo = await getUserInfo(conversationUserId);
            if (!conversationUserInfo) {
                console.log('❌ Nie udało się pobrać informacji o drugiej osobie w rozmowie.');
                return;
            }

            const conversationUserName = conversationUserInfo.real_name;

            // Określenie, kto wysłał wiadomość
            const messageFrom = (event.user === process.env.TARGET_USER_ID) ? 'Szymon Til' : conversationUserName;

            // Określenie, z kim prowadzona jest rozmowa
            const conversationWith = (event.user === process.env.TARGET_USER_ID) ? conversationUserName : 'Szymon Til';

            // Logowanie w żądanym formacie
            console.log(`Konwersacja prywatna z: ${conversationWith}`);
            console.log(`Wiadomość od: ${messageFrom}`);
            console.log(`Treść: ${event.text}\n`);

            // Zapisz wiadomość do bazy danych
            const message = new Message({
                channelId: event.channel,
                senderId: event.user,
                senderName: senderName,
                text: event.text,
                timestamp: new Date(parseFloat(event.ts) * 1000), // Slack timestamp jest w sekundach
            });

            await message.save();

            // Dodaj wiadomość do kontekstu
            await addMessageToContext(event.channel, message);
        }
    } catch (error) {
        console.error('❌ Błąd Slack Events API:', error);
    }
});

// Harmonogram sprawdzania nieaktywnych kontekstów co 10 minut
cron.schedule('*/10 * * * *', async () => {
    console.log('🕒 Sprawdzanie nieaktywnych kontekstów...');
    const now = dayjs();

    try {
        const inactiveContexts = await Context.find({ lastActivity: { $lte: now.subtract(60, 'minute').toDate() } });

        for (const context of inactiveContexts) {
            console.log(`Dodawanie kontekstu do kolejki dla kanału: ${context.channelId}`);
            // Dodaj zadanie do kolejki
            await contextQueue.add({ channelId: context.channelId, contextId: context._id });
        }
    } catch (error) {
        console.error('❌ Błąd podczas sprawdzania kontekstów:', error);
    }
});

// Procesor kolejki
contextQueue.process(async (job) => {
    const { channelId, contextId } = job.data;
    console.log(`🔄 Przetwarzanie kontekstu z kanału: ${channelId}`);

    try {
        const context = await Context.findById(contextId);
        if (!context) {
            console.log(`❌ Kontekst o ID ${contextId} nie został znaleziony.`);
            return;
        }

        await processContext(channelId, context);
    } catch (error) {
        console.error(`❌ Błąd podczas przetwarzania kontekstu dla kanału ${channelId}:`, error);
        throw error; // Bull będzie wiedział, że zadanie nie powiodło się
    }
});

// Obsługa zdarzeń kolejki
contextQueue.on('completed', (job, result) => {
    console.log(`✅ Zadanie ${job.id} zakończone sukcesem.`);
});

contextQueue.on('failed', (job, err) => {
    console.error(`❌ Zadanie ${job.id} zakończyło się błędem:`, err);
});

// Funkcja do przetwarzania kontekstu i wysyłania go do OpenAI
const processContext = async (channelId, context) => {
    try {
        // Pobierz wiadomości z bazy danych
        const messages = await Message.find({ _id: { $in: context.messages } }).sort({ timestamp: 1 });

        // Kompilacja wiadomości w kontekście
        const compiledContext = messages.map(msg => `${msg.senderName}: ${msg.text}`).join('\n');

        console.log(`📝 Przesyłanie kontekstu do OpenAI dla kanału: ${channelId}`);
        console.log(compiledContext);

        // Wysyłanie do OpenAI (użyj modelu GPT-4)
        const openAIResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4', // Użyj odpowiedniego modelu, np. 'gpt-4' lub 'gpt-4-0613'
            messages: [
                { role: 'system', content: 'Jesteś asystentem pomagającym identyfikować zadania z rozmów.' },
                { role: 'user', content: `Przeanalizuj poniższą rozmowę i określ, czy zawiera ona jakieś zadania do wykonania. Jeśli tak, podaj szczegóły zadania.\n\n${compiledContext}` },
            ],
            max_tokens: 150,
            temperature: 0.5,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
        });

        const analysis = openAIResponse.data.choices[0].message.content.trim();
        console.log(`🔍 Analiza OpenAI:\n${analysis}`);

        // Sprawdzenie, czy OpenAI wykryło zadanie
        if (/zadanie|task/i.test(analysis)) {
            // Wyodrębnij treść zadania
            const task = extractTask(analysis);
            if (task) {
                // Przeanalizuj, czy zadanie jest dla Ciebie
                if (isTaskForMe(task)) {
                    // Dodaj zadanie do Todoist
                    await addTaskToTodoist(task);
                    console.log('✅ Zadanie zostało dodane do Todoist.');
                }
            }
        } else {
            console.log('ℹ️ Brak zadań do dodania.');
        }
    } catch (error) {
        console.error('❌ Błąd podczas przetwarzania kontekstu przez OpenAI:', error.response ? error.response.data : error.message);
    }
};

// Funkcja do wyodrębniania zadania z odpowiedzi OpenAI
const extractTask = (analysis) => {
    // Prosta implementacja: zakładamy, że zadanie jest po słowie "Zadanie:" lub "Task:"
    const taskPrefixes = ['Zadanie:', 'Task:'];
    for (const prefix of taskPrefixes) {
        const index = analysis.indexOf(prefix);
        if (index !== -1) {
            return analysis.substring(index + prefix.length).trim();
        }
    }
    return null;
};

// Funkcja do określenia, czy zadanie jest dla Ciebie
const isTaskForMe = (task) => {
    // Możesz dodać bardziej zaawansowane kryteria
    // Na przykład, sprawdzenie, czy zadanie zawiera Twoje imię lub inne identyfikatory
    return true; // Zakładamy, że wszystkie zadania są dla Ciebie
};

// Funkcja do dodawania zadania do Todoist
const addTaskToTodoist = async (taskContent) => {
    try {
        const todoistResponse = await axios.post('https://api.todoist.com/rest/v2/tasks', {
            content: taskContent,
            due_string: 'today', // Możesz dostosować termin wykonania
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TODOIST_API_KEY}`,
            },
        });

        console.log('✅ Zadanie dodane do Todoist:', todoistResponse.data);
    } catch (error) {
        console.error('❌ Błąd podczas dodawania zadania do Todoist:', error.response ? error.response.data : error.message);
    }
};

// Obsługa błędów Slack Events API
slackEvents.on('error', (error) => {
    console.error('❌ Błąd Slack Events API:', error);
});

// Start serwera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Slack Events API działa na porcie ${PORT}`);
});
