const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Wczytaj zmienne środowiskowe
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Połączenie z MongoDB
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch((err) => console.error('❌ Błąd połączenia z MongoDB:', err));

// Middleware do parsowania JSON
app.use(express.json());

// Model danych dla kontekstów
const contextSchema = new mongoose.Schema({
    sender: String,
    recipient: String,
    messages: [String],
    createdAt: { type: Date, default: Date.now },
});

const Context = mongoose.model('Context', contextSchema);

// Endpoint API do pobierania danych kontekstów
app.get('/api/contexts', async (req, res) => {
    try {
        const contexts = await Context.find();
        if (contexts.length === 0) {
            return res.status(404).json({ message: 'Brak dostępnych kontekstów.' });
        }
        res.json(contexts);
    } catch (err) {
        console.error('❌ Błąd podczas pobierania kontekstów:', err);
        res.status(500).send('Błąd serwera');
    }
});

// Endpoint testowy
app.get('/', (req, res) => {
    res.send('API is running...');
});

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
