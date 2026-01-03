# Правила разработки кода

## Основные принципы

Следуй принципам из [vision.md](vision.md):
- **KISS** - максимальная простота, никакого оверинжиниринга
- **Модульная архитектура** - каждый класс в отдельном файле для снижения контекста
- **Итеративная разработка** - пошаговое добавление функционала

## Структура кода

### Frontend (public/)
- `index.html` - единственный HTML файл
- `main.js` - точка входа приложения с импортами классов
- `canvas-manager.js` - управление Konva canvas
- Менеджеры (каждый класс в своем файле):
  - `image-manager.js` - управление изображениями
  - `connection-point-manager.js` - точки соединения
  - `connection-manager.js` - линии соединений
  - `selection-manager.js` - выделение элементов
  - `properties-panel.js` - панель свойств
  - `file-manager.js` - сохранение/загрузка
  - `ui-controller.js` - координатор и события toolbar
- `diagram-element.js` - базовый класс для всех элементов
- `styles.css` - все стили в одном файле

### Backend (server/)
- `server.js` - Express сервер с минимальным API
- `data/` - JSON файлы для сторажения схем

## Технологии

- **Konva.js** - для 2D графики и интерактивности
- **Bootstrap 5** - для UI компонентов
- **Vanilla JavaScript** - без фреймворков
- **Node.js + Express** - минимальный backend
- **ES6 модули** - импорт/экспорт между файлами

## Правила кодирования

### JavaScript
- Используй ES6+ синтаксис и классы
- Модульность: один класс = один файл
- Именуй классы в PascalCase: `DiagramElement`, `ImageManager`
- Именуй функции в camelCase: `createImage()`, `addConnectionPoint()`
- Именуй константы в UPPER_CASE: `MAX_ZOOM`, `DEFAULT_CANVAS_SIZE`
- Экспортируй класс в конце файла: `export default ClassName;`
- Импортируй в main.js: `import ClassName from './class-name.js';`

### HTML
- Используй Bootstrap классы для стилизации
- Минимальная разметка, только необходимое
- Семантические теги где возможно

### CSS
- Используй Bootstrap утилиты
- Кастомные стили только для специфичных элементов
- Минималистичный дизайн

## Архитектура компонентов

### Обязательные классы
- `DiagramElement` - базовый интерфейс для всех элементов
- `CanvasManager` - управление Konva canvas ✓ (существует)
- `ImageManager` - работа с изображениями
- `ConnectionPointManager` - точки соединения
- `ConnectionManager` - линии соединений
- `SelectionManager` - выделение элементов
- `PropertiesPanel` - панель свойств
- `FileManager` - сохранение/загрузка JSON
- `UIController` - координатор всех менеджеров

### Зависимости между классами
```
UIController (главный координатор)
├── CanvasManager (инжект через конструктор)
├── ImageManager (использует CanvasManager)
├── ConnectionPointManager (использует CanvasManager)
├── ConnectionManager (использует CanvasManager + точки)
├── SelectionManager (независим)
├── PropertiesPanel (независим, DOM-манипуляции)
└── FileManager (использует все менеджеры)
```

## Модель данных

Следуй JSON структуре из [vision.md](vision.md):
- Схема: `id`, `name`, `created`, `images`, `connections`
- Изображение: `id`, `src` (base64), `x`, `y`, `width`, `height`, `name`, `connectionPoints`
- Соединение: `id`, `from`, `to`

## Функционал

### Обязательные возможности
- Загрузка изображений (base64)
- Добавление точек соединения (двойной клик по рамке)
- Создание соединений (drag от точки к точке)
- Перемещение элементов (drag)
- Изменение размера изображений (drag за углы рамки)
- UI элементы (текст, числа, кнопки, radio-button)
- Сохранение/загрузка JSON

### Валидация
- Проверка корректности соединений
- Валидация обязательных полей

## UI/UX

- Панель инструментов сверху с Bootstrap dropdown
- Панель свойств справа
- Canvas с серой сеткой на белом фоне
- Точки соединения: красные (свободные), зеленые (соединенные)
- Выделение элементов подсветкой
- Масштаб x0.2 - x5 (ползунок)

## Ограничения

- Нет мобильной поддержки
- Нет группировки элементов
- Нет множественного выбора
- Нет горячих клавиш
- Нет сложного логгирования
- UI элементы только в границах изображений

## Что НЕ делать ❌

- Внешние базы данных (PostgreSQL, Redis, MongoDB)
- Микросервисы или сложная архитектура
- Async/await без крайней необходимости
- Сложные конфигурационные файлы (YAML, JSON)
- Избыточные абстракции и классы
- Полное покрытие тестами
- Сложные системы мониторинга
- Фреймворки для фронтенда (React, Vue, Angular)
- Сложные системы сборки (Webpack, Vite)
- TypeScript (пока не нужен)

## Что делать ✅

- Простые функции и минимум классов
- Принцип "один файл - одна ответственность"
- Понятные имена переменных и функций
- Базовое логгирование всех операций
- Обработка основных ошибок
- Документировать только публичный API
- Использовать переменные окружения для конфигурации
- Значения по умолчанию для работы "из коробки"
- Простые try/catch блоки для обработки ошибок

## Качество кода

- Простой, читаемый код
- Минимальные комментарии (только где необходимо)
- Одна ответственность на функцию/класс
- Избегай дублирования кода
- Обрабатывай ошибки базово (console.log)

## Шаблон нового класса

```javascript
/**
 * ClassName - Описание класса (одна строка)
 * 
 * Ответственность:
 * - Что делает класс
 * - Какие методы предоставляет
 */
class ClassName {
  constructor(dependency1, dependency2) {
    this.dependency1 = dependency1;
    this.dependency2 = dependency2;
  }

  /**
   * methodName - Описание метода
   * @param {type} param1 - Описание параметра
   * @returns {type} Описание возврата
   */
  methodName(param1) {
    // Реализация
  }
}

export default ClassName;
```

## Импорт в main.js

```javascript
import CanvasManager from './canvas-manager.js';
import ImageManager from './image-manager.js';
import ConnectionPointManager from './connection-point-manager.js';
import ConnectionManager from './connection-manager.js';
import SelectionManager from './selection-manager.js';
import PropertiesPanel from './properties-panel.js';
import FileManager from './file-manager.js';
import UIController from './ui-controller.js';

// Инициализация
const canvasManager = new CanvasManager('canvas');
const uiController = new UIController(canvasManager);
```
