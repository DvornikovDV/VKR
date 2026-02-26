// main.js
// Точка входа: инициализация клиентского приложения.

import { UIController } from './ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Конструктор мнемосхем инициализирован');
    new UIController();
});