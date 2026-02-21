// Express сервер для конструктора мнемосхем
// Следует принципам из conventions.md

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
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
