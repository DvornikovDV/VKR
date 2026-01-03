// Express сервер для конструктора мнемосхем
// Следует принципам из conventions.md

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Базовые маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API для схем (базовые заглушки)
app.get('/api/schemas', (req, res) => {
    res.json([]);
});

app.get('/api/schemas/:id', (req, res) => {
    res.status(404).json({ error: 'Схема не найдена' });
});

app.post('/api/schemas', (req, res) => {
    res.json({ message: 'Схема сохранена', id: Date.now() });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log('Конструктор мнемосхем готов к работе!');
});
