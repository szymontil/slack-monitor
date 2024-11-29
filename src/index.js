const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Wczytaj zmienne środowiskowe
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Połączenie z MongoDB
mongoose.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Połączono z MongoDB'))
    .catch((err) => console.error('❌ Błąd połączenia z MongoDB:', err));

// Middleware do parsowania JSON
app.use(express.json());

// Model danych dla kontekstów (przykładowa struktura)
const contextSchema = new mongoose.Schema({
    id: String,
    messages: [String],
    createdAt: { type: Date, default: Date.now },
});

const Context = mongoose.model('Context', contextSchema);

// Endpoint API do pobierania danych kontekstów
app.get('/api/contexts', async (req, res) => {
    try {
        const contexts = await Context.find(); // Pobiera wszystkie konteksty z bazy
        res.json(contexts);
    } catch (err) {
        console.error('❌ Błąd podczas pobierania kontekstów:', err);
        res.status(500).send('Błąd serwera');
    }
});

// Obsługa plików statycznych frontendu React
const frontendPath = path.join(__dirname, '../frontend/build');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 Serwer działa na porcie ${PORT}`);
});
