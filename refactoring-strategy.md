# Стратегия рефакторинга: Переход на модульную архитектуру

## 📋 Обзор

Переход от монолитного UIController (~51KB) к модульной архитектуре с отдельным файлом для каждого класса для:
- Снижения контекста при разработке
- Улучшения читаемости и поддерживаемости
- Облегчения локализации ошибок
- Независимого тестирования компонентов

## 🎯 Обязательные классы (из conventions.md)

```
CanvasManager      - управление Konva canvas ✓ (существует)
ImageManager       - работа с изображениями
ConnectionPointManager - точки соединения
ConnectionManager  - линии соединений
FileManager        - сохранение/загрузка JSON
UIController       - координатор (главный класс)
DiagramElement     - базовый интерфейс для элементов
```

## 📁 Структура файлов (до/после)

### До (монолитная)
```
public/
├── index.html
├── main.js
├── canvas-manager.js     ✓
├── ui-controller.js      (всё везде!)
├── styles.css
└── uploads/
```

### После (модульная)
```
public/
├── index.html
├── main.js
├── canvas-manager.js              ✓
├── diagram-element.js             (базовый класс)
├── image-manager.js               (выделить из UIController)
├── connection-point-manager.js    (выделить из UIController)
├── connection-manager.js          (выделить из UIController)
├── selection-manager.js           (выделить из UIController)
├── properties-panel.js            (выделить из UIController)
├── file-manager.js                (выделить из UIController)
├── ui-controller.js               (координатор + toolbar)
├── styles.css
└── uploads/
```

## 🔄 Разделение UIController

### 1. DiagramElement (базовый класс)
**Файл:** `diagram-element.js`

Интерфейс для всех элементов на canvas:
```javascript
class DiagramElement {
  constructor(id, type) {
    this.id = id;
    this.type = type; // 'image', 'connectionPoint', 'connection'
  }
  
  toJSON() { /* для сохранения */ }
  fromJSON(data) { /* для загрузки */ }
}
```

### 2. ImageManager
**Файл:** `image-manager.js`

Методы из UIController (образцы):
- `addImageFromBase64(base64Data)` → создает Image элемент
- `createSelectionFrame(image)` → рамка с рукавчиками
- `handleImageDrag(image, event)` → перемещение
- `handleImageResize(image, corner, deltaX, deltaY)` → изменение размера
- `deleteImage(imageId)` → удаление
- Свойство: `this.images = new Map()` - хранение всех изображений

### 3. ConnectionPointManager
**Файл:** `connection-point-manager.js`

Методы:
- `addConnectionPoint(imageId, position, side)` → создание точки
- `removeConnectionPoint(pointId)` → удаление
- `updatePointPosition(pointId, newPosition)` → движение вдоль грани
- `getPointColor(pointId)` → красный (свободна) или зеленый (занята)
- `getPointsByImage(imageId)` → получить все точки изображения
- Свойство: `this.points = new Map()` - хранение точек

### 4. ConnectionManager
**Файл:** `connection-manager.js`

Методы:
- `startConnectionPreview(fromPointId)` → начало рисования линии
- `updateConnectionPreview(mousePos)` → update линии при движении мыши
- `finishConnection(toPointId)` → завершение соединения
- `cancelConnectionPreview()` → отмена
- `deleteConnection(connectionId)` → удаление линии
- `toggleCreateLineMode()` → включить/отключить режим
- Свойство: `this.connections = []` - все линии

### 5. SelectionManager
**Файл:** `selection-manager.js`

Методы:
- `selectElement(elementId)` → выделить элемент кликом
- `deselectAll()` → снять выделение
- `highlightElement(element)` → визуальная подсветка
- `deleteSelected()` → удалить выбранный элемент
- Свойство: `this.selectedElement = null` - текущий выбор

### 6. PropertiesPanel
**Файл:** `properties-panel.js`

Методы:
- `showImageProperties(image)` → отобразить свойства изображения
- `showPointProperties(point)` → свойства точки соединения
- `showConnectionProperties(connection)` → свойства линии
- `updateProperty(propertyName, value)` → обновить поле
- `clearProperties()` → очистить панель
- DOM-работа: манипулирует `#properties-panel`

### 7. FileManager
**Файл:** `file-manager.js`

Методы:
- `saveToJSON(fileName)` → экспорт в JSON файл
- `loadFromJSON(file)` → импорт из JSON
- `validateSchema(data)` → проверка корректности
- `exportToApi(schemaData)` → POST на сервер
- `importFromApi(schemaId)` → GET со сервера
- Взаимодействие со всеми менеджерами

### 8. UIController (координатор + Toolbar)
**Файл:** `ui-controller.js`

Остаётся как главный класс:
- Инициализирует все менеджеры
- Обрабатывает события toolbar (File, Edit, UI меню)
- Передаёт зависимости между менеджерами
- Синхронизирует обновления между компонентами

```javascript
class UIController {
  constructor(canvasManager) {
    this.canvas = canvasManager;
    this.imageManager = new ImageManager(canvasManager);
    this.connectionPointManager = new ConnectionPointManager(canvasManager);
    this.connectionManager = new ConnectionManager(canvasManager);
    this.selectionManager = new SelectionManager();
    this.propertiesPanel = new PropertiesPanel();
    this.fileManager = new FileManager(/* all managers */);
    
    this.initToolbarEvents();
    this.initCanvasEvents();
  }
}
```

## 🔗 Коммуникация между классами

**Вариант 1: Через UIController (рекомендуется)**
```
Event → UIController → вызывает методы других менеджеров
```

**Пример потока:**
1. Двойной клик на рамке
2. UIController ловит событие
3. UIController → ConnectionPointManager.addConnectionPoint()
4. ConnectionPointManager → обновляет canvas (через CanvasManager)
5. UIController → PropertiesPanel.showPointProperties()

## 📝 Порядок реализации

1. **Этап 1** - Создание базовых классов:
   - Создать `diagram-element.js`
   - Создать пустые `*-manager.js` файлы с конструкторами

2. **Этап 2** - Миграция кода:
   - Выделить логику ImageManager из UIController
   - Выделить логику ConnectionPointManager
   - Выделить логику ConnectionManager
   - Выделить логику SelectionManager
   - Выделить логику PropertiesPanel
   - Выделить логику FileManager

3. **Этап 3** - Тестирование:
   - Проверить каждый менеджер отдельно
   - Проверить интеграцию через UIController
   - Полный функциональный тест

4. **Этап 4** - Оптимизация:
   - Убрать дублирование кода
   - Документировать публичный API
   - Коммит

## 🎁 Преимущества модульной архитектуры

- ✅ **Меньше контекста** - одновременно работаешь с 1 менеджером
- ✅ **Проще тестировать** - каждый менеджер независим
- ✅ **Легче масштабировать** - добавлять новые менеджеры просто
- ✅ **Быстрее находить ошибки** - сразу видно, где они
- ✅ **Переиспользование** - одни менеджеры независимы от других

## ⚠️ Важные моменты

- **Зависимости**: ImageManager → CanvasManager (инжект через конструктор)
- **События**: Использовать простой паттерн callback-ов через UIController
- **Глобальное состояние**: Минимизировать, использовать инжект
- **HTML**: Не менять index.html, добавить импорты в main.js

## 📦 Коммит в Git

```bash
git add public/*.js doc/*.md refactoring-strategy.md
git commit -m "refactor: modularize UIController into separate manager classes

- Split monolithic UIController (51KB) into 7 focused managers
- Each manager in separate file for reduced context
- Introduced DiagramElement base class
- Updated documentation: modular instead of monolithic
- Created refactoring-strategy.md with implementation plan

Managers:
- ImageManager: image loading, resizing, deletion
- ConnectionPointManager: pin management on frames  
- ConnectionManager: orthogonal connection lines
- SelectionManager: element selection and highlighting
- PropertiesPanel: properties sidebar
- FileManager: schema save/load
- UIController: coordinator and toolbar events

Architecture: Modular with ES6 classes, each manager as separate file"
```
