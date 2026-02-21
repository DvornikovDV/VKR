// main.js
// Точка входа: инициализация приложения

import { UIController } from './ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Конструктор мнемосхем инициализирован');
    new UIController();
});