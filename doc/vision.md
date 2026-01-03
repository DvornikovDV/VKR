# Техническое видение: Веб-конструктор мнемосхем

## 1. Технологии

**Frontend:**
- HTML5 + CSS3 + Vanilla JavaScript (ES6+ модули)
- Konva.js - для 2D графики и drag&drop
- Bootstrap 5 - для UI
- Модульная архитектура: каждый класс в отдельном файле

**Backend:**
- Node.js + Express.js (минимальный)
- JSON для сторажения схем
- Stateless API

## 2. Принципы

- **KISS** - максимальная простота
- **Модульная** - каждый класс в своем файле
- **Итеративная** - пошаговая разработка

## 3. Обязательные классы

- `CanvasManager` - рендеринг Konva ✓
- `ImageManager` - изображения
- `ConnectionPointManager` - точки
- `ConnectionManager` - линии
- `SelectionManager` - выделение
- `PropertiesPanel` - панель свойств
- `FileManager` - сохранение/загрузка
- `UIController` - координатор

## 4. Модель данных

**Схема (JSON):**
```json
{
  "id": "string",
  "name": "string",
  "created": "ISO 8601",
  "images": [{ "id", "src" (base64), "x", "y", "width", "height", "name", "connectionPoints" }],
  "connections": [{ "id", "from": {"imageId", "pointId"}, "to": {...} }]
}
```

## 5. Основные сценарии

1. Загружа изображения
2. Добавление точек соединения
3. Перемещение и изменение размера
4. Создание линий (ртогональные)
5. Сохранение/лоад JSON

## 6. Удалия данных

- Только локальные квай (бюжетных ограничений нет)
- Нет аутентификации
- Доступно всем
