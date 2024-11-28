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

// Ładowanie zmiennych środowiskowych
dotenv.config();

// Konfiguracja limitów dla plików
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB w bajtach

// Na początku pliku po importach
dotenv.config();

// Sprawdzenie wymaganych zmiennych środowiskowych
const requiredEnvVars = [
    'SLACK_SIGNING_SECRET',
    'SLACK_USER_TOKEN',
    'TARGET_USER_ID',
    'OPENAI_API_KEY',
    'TODOIST_API_KEY',
    'MONGO_URL',
    'REDIS_URL',  // Zamiast REDISHOST i REDISPORT używamy REDIS_URL
];

// Sprawdzenie zmiennych środowiskowych
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Brak wymaganych zmiennych środowiskowych:');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    process.exit(1);
} else {
    console.log('✅ Wszystkie wymagane zmienne środowiskowe są ustawione');
}

// Połączenie z MongoDB
mongoose.connect(process.env.MONGO_URL)
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
    timestamp: { type: Date, required: true, index: true },
    files: [{
        id: String,
        title: String,
        filetype: String,
        url_private: String,
        permalink: String,
        thumb_360: String,
        original_w: Number,
        original_h: Number,
        mimetype: String,
        content: Buffer,
        size: Number,
        tooLarge: { type: Boolean, default: false }
    }]
});

// Schemat kontekstu
const contextSchema = new Schema({
    channelId: { type: String, required: true, unique: true },
    messages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
    lastActivity: { type: Date, required: true, index: true }
});

// Dodanie indeksów
messageSchema.index({ timestamp: 1 });
contextSchema.index({ lastActivity: 1 });

const Message = mongoose.model('Message', messageSchema);
const Context = mongoose.model('Context', contextSchema);

// Inicjalizacja Express i Slack
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET);
const app = express();
const slackClient = new WebClient(process.env.SLACK_USER_TOKEN);

// Konfiguracja kolejki Redis dla Railway
const contextQueue = new Queue('contextQueue', {
    redis: process.env.REDIS_URL, // Używamy pełnego URL zamiast osobnych host/port
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000
        },
        removeOnComplete: true,
        removeOnFail: false
    },
    limiter: {
        max: 1000,
        duration: 5000
    }
});

// Konfiguracja obsługi błędów i monitorowania
contextQueue.on('error', (error) => {
    console.error('❌ Błąd kolejki Redis:', error);
    // Nie kończymy procesu przy błędzie Redis - aplikacja może działać dalej
});

contextQueue.on('failed', (job, error) => {
    console.error(`❌ Zadanie ${job.id} nie powiodło się:`, error);
});

// Funkcja do sprawdzania czy Redis jest wymagany dla danej operacji
function isRedisRequired(operation) {
    return ['processContext', 'addToQueue'].includes(operation);
}

// Funkcja do bezpiecznego dodawania zadań do kolejki
async function safelyAddToQueue(data) {
    try {
        return await contextQueue.add(data);
    } catch (error) {
        console.error('❌ Nie można dodać zadania do kolejki Redis:', error);
        // Tutaj możemy dodać alternatywną logikę, np. zapis do bazy
        return null;
    }
}

// Funkcja do sprawdzania stanu Redis
async function checkRedisConnection() {
    try {
        const client = contextQueue.client;
        await client.ping();
        console.log('✅ Połączenie z Redis działa prawidłowo');
        return true;
    } catch (error) {
        console.error('❌ Problem z połączeniem Redis:', error);
        return false;
    }
}

// Okresowe sprawdzanie stanu Redis
setInterval(async () => {
    await checkRedisConnection();
}, 60000); // co minutę

// Sprawdź połączenie przy starcie
checkRedisConnection();

// Middleware
app.use('/slack/events', slackEvents.expressMiddleware());
app.use(express.json());

// Funkcje pomocnicze
function isFileTooLarge(fileInfo) {
    return fileInfo.size > FILE_SIZE_LIMIT;
}

async function processSlackFile(fileInfo) {
    try {
        if (isFileTooLarge(fileInfo)) {
            console.log(`⚠️ Plik ${fileInfo.title} jest zbyt duży (${(fileInfo.size / 1024 / 1024).toFixed(2)}MB > ${FILE_SIZE_LIMIT / 1024 / 1024}MB)`);
            return {
                id: fileInfo.id,
                title: fileInfo.title,
                filetype: fileInfo.filetype,
                url_private: fileInfo.url_private,
                permalink: fileInfo.permalink,
                thumb_360: fileInfo.thumb_360,
                original_w: fileInfo.original_w,
                original_h: fileInfo.original_h,
                mimetype: fileInfo.mimetype,
                size: fileInfo.size,
                tooLarge: true
            };
        }

        const response = await axios({
            method: 'GET',
            url: fileInfo.url_private,
            headers: {
                'Authorization': `Bearer ${process.env.SLACK_USER_TOKEN}`
            },
            responseType: 'arraybuffer'
        });

        return {
            id: fileInfo.id,
            title: fileInfo.title,
            filetype: fileInfo.filetype,
            url_private: fileInfo.url_private,
            permalink: fileInfo.permalink,
            thumb_360: fileInfo.thumb_360,
            original_w: fileInfo.original_w,
            original_h: fileInfo.original_h,
            mimetype: fileInfo.mimetype,
            content: response.data,
            size: response.data.length,
            tooLarge: false
        };
    } catch (error) {
        console.error(`❌ Błąd podczas pobierania pliku ${fileInfo.title}:`, error);
        return {
            id: fileInfo.id,
            title: fileInfo.title,
            filetype: fileInfo.filetype,
            url_private: fileInfo.url_private,
            permalink: fileInfo.permalink,
            thumb_360: fileInfo.thumb_360,
            original_w: fileInfo.original_w,
            original_h: fileInfo.original_h,
            mimetype: fileInfo.mimetype,
            size: fileInfo.size,
            tooLarge: false
        };
    }
}

async function addMessageToContext(channelId, message) {
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
}

async function getUserInfo(userId) {
    try {
        const response = await slackClient.users.info({ user: userId });
        return response.ok ? response.user : null;
    } catch (error) {
        console.error(`❌ Błąd podczas pobierania informacji o użytkowniku: ${error}`);
        return null;
    }
}

// Obsługa wiadomości
slackEvents.on('message', async (event) => {
    try {
        if (event.bot_id) {
            return;
        }

        if (event.channel && event.channel.startsWith('D')) {
            console.log(`Received DM message in channel: ${event.channel} from user: ${event.user}`);

            const senderInfo = await getUserInfo(event.user);
            if (!senderInfo) {
                console.log('❌ Nie udało się pobrać informacji o nadawcy.');
                return;
            }

            const senderName = senderInfo.real_name;

            console.log(`Attempting to fetch info for channel: ${event.channel}`);
            const conversationInfo = await slackClient.conversations.info({ channel: event.channel });
            if (!conversationInfo.ok) {
                console.log(`❌ Nie udało się pobrać informacji o kanale: ${event.channel}`);
                return;
            }

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

            const messageFrom = (event.user === process.env.TARGET_USER_ID) ? 'Szymon Til' : conversationUserInfo.real_name;
            const conversationWith = conversationUserInfo.real_name;

            let messageText = event.text || '';
            let files = [];

            if (event.files && event.files.length > 0) {
                console.log(`📎 Przetwarzanie ${event.files.length} plików...`);
                
                files = await Promise.all(event.files.map(file => processSlackFile(file)));

                files.forEach(file => {
                    if (file.tooLarge) {
                        console.log(`⚠️ Plik ${file.title} pominięty (zbyt duży): ${(file.size / 1024 / 1024).toFixed(2)}MB`);
                    } else if (!file.content) {
                        console.log(`⚠️ Plik ${file.title} nie został pobrany (błąd pobierania)`);
                    } else {
                        console.log(`✅ Plik ${file.title} zapisany: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
                    }
                });

                if (!messageText) {
                    messageText = `[Wysłano ${files.length} ${files.length === 1 ? 'plik' : 'pliki'}: ${files.map(f => f.filetype).join(', ')}]`;
                }
            }

            console.log(`Konwersacja prywatna z: ${conversationWith}`);
            console.log(`Wiadomość od: ${messageFrom}`);
            console.log(`Treść: ${messageText}\n`);

            const message = new Message({
                channelId: event.channel,
                senderId: event.user,
                senderName: senderName,
                text: messageText,
                timestamp: new Date(parseFloat(event.ts) * 1000),
                files: files
            });

            await message.save();
            await addMessageToContext(event.channel, message);
        }
    } catch (error) {
        console.error('❌ Błąd Slack Events API:', error);
    }
});

// Harmonogram czyszczenia bazy
async function cleanupDatabase() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    try {
        const result = await Message.deleteMany({
            timestamp: { $lt: yesterday }
        });
        console.log(`🧹 Usunięto ${result.deletedCount} starych wiadomości`);

        const contextResult = await Context.deleteMany({
            lastActivity: { $lt: yesterday }
        });
        console.log(`🧹 Usunięto ${contextResult.deletedCount} starych kontekstów`);

    } catch (error) {
        console.error('❌ Błąd podczas czyszczenia bazy:', error);
    }
}

// Uruchamianie czyszczenia codziennie o północy
cron.schedule('0 0 * * *', async () => {
    console.log('🕐 Rozpoczynanie codziennego czyszczenia bazy...');
    await cleanupDatabase();
});

// Harmonogram sprawdzania nieaktywnych kontekstów co 10 minut
cron.schedule('*/10 * * * *', async () => {
    console.log('🕒 Sprawdzanie nieaktywnych kontekstów...');
    const now = dayjs();

    try {
        // Znajdź konteksty nieaktywne od godziny
        const inactiveContexts = await Context.find({ 
            lastActivity: { $lte: now.subtract(60, 'minute').toDate() } 
        });

        for (const context of inactiveContexts) {
            console.log(`Dodawanie kontekstu do kolejki dla kanału: ${context.channelId}`);
            await safelyAddToQueue({ 
                channelId: context.channelId, 
                contextId: context._id 
            });
        }
    } catch (error) {
        console.error('❌ Błąd podczas sprawdzania kontekstów:', error);
    }
});

// Obsługa kolejki kontekstów
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
        throw error;
    }
});

// Obsługa zdarzeń kolejki
contextQueue.on('completed', (job) => {
    console.log(`✅ Zadanie ${job.id} zakończone sukcesem.`);
});

contextQueue.on('failed', (job, err) => {
    console.error(`❌ Zadanie ${job.id} zakończyło się błędem:`, err);
});

// Funkcja do przetwarzania kontekstu i wysyłania go do OpenAI
const processContext = async (channelId, context) => {
    try {
        const messages = await Message.find({ _id: { $in: context.messages } }).sort({ timestamp: 1 });
        const compiledContext = messages.map(msg => `${msg.senderName}: ${msg.text}`).join('\n');

        console.log(`📝 Przesyłanie kontekstu do OpenAI dla kanału: ${channelId}`);
        console.log(compiledContext);

        const openAIResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4',
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

        if (/zadanie|task/i.test(analysis)) {
            const task = extractTask(analysis);
            if (task && isTaskForMe(task)) {
                await addTaskToTodoist(task);
                console.log('✅ Zadanie zostało dodane do Todoist.');
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
    return true; // Na razie zakładamy, że wszystkie zadania są dla nas
};

// Funkcja do dodawania zadania do Todoist
const addTaskToTodoist = async (taskContent) => {
    try {
        const todoistResponse = await axios.post('https://api.todoist.com/rest/v2/tasks', {
            content: taskContent,
            due_string: 'today',
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