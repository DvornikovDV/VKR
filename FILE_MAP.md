# КАРТА ФАЙЛОВ ПРОЕКТА

**Версия**: 1.4  
**Дата обновления**: 28.01.2026  
**Статус**: Актуальная - синхронизирована с main + widgets phase 1 (PR #7)

---

## СТРУКТУРА ПРОЕКТА

```
VKR/
├── public/                           ОСНОВНОЙ КОД
│   ├── index.html                    точка входа браузера
│   ├── main.js                       инициализация UIController
│   ├── canvas-manager.js             управление Konva.js (7 KB)
│   ├── ui-controller.js              КООРДИНАТОР менеджеров (14 KB) [UPDATED]
│   ├── diagram-element.js            базовый класс элементов (1.4 KB)
│   ├── image-manager.js              работа с изображениями (10 KB) [UPDATED]
│   ├── connection-point-manager.js   точки соединения на сторонах (7 KB)
│   ├── connection-manager.js         линии с ортогональностью (7 KB)
│   ├── connection-router.js          маршрутизация соединений (9 KB)
│   ├── connection-updater.js         обновление при движении (8 KB)
│   ├── connection-editor.js          редактирование разрывов (22 KB)
│   ├── selection-manager.js          выделение элементов (4 KB) [UPDATED]
│   ├── properties-panel.js           панель свойств (4.6 KB) [UPDATED]
│   ├── file-manager.js               сохранение/загрузка JSON (1.6 KB)
│   ├── widget-manager.js             управление виджетами (~400 строк) [NEW]
│   ├── widget-types.js               определение типов виджетов [NEW]
│   ├── context-menu.js               переиспользуемое контекстное меню [NEW]
│   ├── styles.css                    все стили в одном файле (4.5 KB)
│   └── note.md                       локальные заметки разработчика
│
├── doc/                              ДОКУМЕНТАЦИЯ
│   ├── vision.md                     техническое видение (1.9 KB)
│   ├── conventions.md                правила кодирования (9 KB)
│   ├── workflow.md                   процесс разработки (1.9 KB)
│   ├── connections-implementation-plan.md  план итерации 1 (26 KB)
│   ├── status-system.md              план итерации 2 (12 KB)
│   ├── widgets-dev-guide.md          руководство по виджетам (38 KB)
│   ├── widgets-implementation-plan.md план реализации виджетов (31 KB)
│   ├── widgets-iterations-plan.md    план по итерациям с выполн. (15 KB) [NEW]
│   ├── iteration-2-widgets.md        план итерации 2 (8 KB) [NEW]
│   └── scada-architecture.md         полная архитектура системы (20 KB)
│
├── АРХИТЕКТУРА_ПРОЕКТА.md            актуальная архитектура (19 KB)
├── REFACTORING_COMPLETE.md           сводка рефакторинга (19 KB)
├── refactoring-strategy.md           стратегия разработки (10 KB)
├── README.md                         краткое описание (172 B)
├── FILE_MAP.md                       ЭТА КАРТА (актуальная)
│
└── server/                           BACKEND (БУДУЩЕЕ)
    └── (not implemented yet)
```

---

## БЫСТРАЯ НАВИГАЦИЯ

### ЕСЛИ НУЖНО ДОБАВИТЬ НОВЫЙ ФУНКЦИОНАЛ

**Шаг 1**: Создать новый менеджер в `public/<name>-manager.js`
**Шаг 2**: Импортировать в `ui-controller.js`
**Шаг 3**: Инициализировать в конструкторе UIController
**Шаг 4**: Настроить коллбэки в `setupManagerCallbacks()`

---

### ЕСЛИ НУЖНО ИЗМЕНИТЬ...

**логику добавления изображений**
→ `image-manager.js` / `addImageFromBase64()`, `attachSelectionFrame()`

**цвета и стили подсветки**
→ `selection-manager.js` / `selectElement()`, `selectConnection()`

**создание точек соединения**
→ `connection-point-manager.js` / `createConnectionPointOnSide()`

**рисование линий**
→ `connection-manager.js` / `createConnection()`, `createSimpleLine()`

**маршрутизация линий (расчет пути)**
→ `connection-router.js` / `calculateRoute()`, `enforceOrthogonal()`

**обновление линий при движении**
→ `connection-updater.js` / `updateConnectionsForPin()` и `connection-manager.js`

**разрывы соединений (break points)**
→ `connection-editor.js` / `addBreakPointAtHandle()`, `removeBreakPointAtHandle()`

**ручки редактирования для линий**
→ `connection-editor.js` / `addLineEditHandles()`, `onHandleDragMove()`

**панель свойств (отображение параметров)**
→ `properties-panel.js` / `showPropertiesForImage()`, `showPropertiesForConnection()`, `showPropertiesForWidget()`

**UI кнопки toolbar**
→ `ui-controller.js` / `setupEventListeners()`

**режим создания линий**
→ `ui-controller.js` / `setupManagerCallbacks()` / `imageManager.onPointSelected`

**режим редактирования соединений**
→ `connection-editor.js` / управляется через `SelectionManager`

**связь между менеджерами**
→ `ui-controller.js` / `setupManagerCallbacks()`

**HTML разметку и стили**
→ `index.html` и `styles.css`

**сохранение/загрузку схем**
→ `file-manager.js` / `saveScheme()`, `loadScheme()`

**виджеты (интерактивные элементы на схеме)**
→ `widget-manager.js`, `context-menu.js`, `doc/widgets-iterations-plan.md`

**создание виджетов**
→ `widget-manager.js` / `create()`, `delete()`, `updatePosition()`

**типы виджетов и их свойства**
→ `widget-types.js` / `WIDGET_DEFAULTS`, `WIDGET_CATEGORIES`

**контекстное меню для изображений**
→ `context-menu.js` / меню на ПКМ для быстрого доступа

---

## АРХИТЕКТУРНЫЕ СЛОИ

### 1. БАЗА: Canvas
```
CanvasManager (управляет Konva.js)
└─ Все остальные менеджеры используют его
```

### 2. ДАННЫЕ: Менеджеры сущностей
```
ImageManager ─ управляет изображениями
ConnectionPointManager ─ управляет точками
ConnectionManager ─ управляет линиями
WidgetManager ─ управляет виджетами [NEW]
```

### 3. СПЕЦИАЛИЗИРОВАННАЯ ЛОГИКА: Маршрутизация и обновление
```
ConnectionRouter ─ расчет оптимальных маршрутов
ConnectionUpdater ─ синхронизация при движении элементов
ConnectionEditor ─ редактирование разрывов
ContextMenu ─ переиспользуемое меню [NEW]
```

### 4. ИНТЕГРАЦИЯ: Выделение и UI
```
SelectionManager ─ выделение элементов (включая виджеты) [UPDATED]
PropertiesPanel ─ отображение свойств (включая виджеты) [UPDATED]
```

### 5. ФРЕЙМВОРК: Координатор и персистентность
```
UIController ─ связывает всех и обрабатывает toolbar [UPDATED]
FileManager ─ сохранение/загрузка
```

---

## ПОТОК ДАННЫХ: ТИПИЧНЫЕ СЦЕНАРИИ

### Сценарий 1: Пользователь дважды кликает на рамку изображения
```
Пользователь ─ double click
   ↓
ImageManager.onFrameDoubleClick()
   ↓
UIController (callback)
   ↓
ConnectionPointManager.createConnectionPointOnSide()
   ↓
ConnectionPointManager.onPointCreated()
   ↓
UIController
   ↓
PropertiesPanel.showPropertiesForPoint()
```

### Сценарий 2: Пользователь переводит от точки к точке
```
Пользователь ─ drag от Point A к Point B
   ↓
ConnectionManager.createConnection(pinA, pinB)
   ↓
ConnectionRouter.calculateRoute()
   ↓
ConnectionManager.enforceOrthogonal()
   ↓
ConnectionManager.onConnectionCreated()
   ↓
UIController
   ↓
SelectionManager.selectConnection()
ConnectionEditor.addLineEditHandles()
PropertiesPanel.showPropertiesForConnection()
```

### Сценарий 3: Пользователь перемещает изображение
```
Пользователь ─ drag изображение
   ↓
ImageManager.onImageMoved(deltaX, deltaY)
   ↓
UIController
   ↓
ConnectionUpdater.updateConnectionsForPin()
WidgetManager.onImageMove() [NEW]
   ↓
ConnectionManager (перересовка линий)
WidgetManager (перемещение виджетов) [NEW]
   ↓
ConnectionEditor (обновление ручек редактирования)
```

### Сценарий 4: Пользователь создает виджет
```
Пользователь ─ ПКМ на изображение
   ↓
ImageManager (context menu)
ContextMenu.show() [NEW]
   ↓
Выбрать "Добавить виджет" → тип
   ↓
WidgetManager.create(type, imageId) [NEW]
   ↓
Создать Konva.Group с элементами
   ↓
WidgetManager.onWidgetCreated() [NEW]
   ↓
SelectionManager.selectElement(widget) [UPDATED]
PropertiesPanel.showPropertiesForWidget(widget) [UPDATED]
```

### Сценарий 5: Пользователь редактирует линию
```
Пользователь ─ double click на линию (режим редактирования)
   ↓
ConnectionEditor.addBreakPointAtHandle()
   ↓
ConnectionEditor (пересчёт сегментов)
   ↓
ConnectionRouter (перерасчет маршрута)
   ↓
ConnectionEditor.redrawConnection()
```

---

## МОДУЛЬНОСТЬ: КАК ДОБАВИТЬ НОВЫЙ ФУНКЦИОНАЛ

### Пример: Добавить режим удаления элементов

**Файл 1**: Создать `delete-manager.js`
```javascript
class DeleteManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
    }
    
    deleteImage(image) { /* логика */ }
    deleteConnection(connection) { /* логика */ }
    deleteWidget(widget) { /* логика */ }
}
```

**Файл 2**: Обновить `ui-controller.js`
```javascript
import DeleteManager from './delete-manager.js';

class UIController {
    constructor() {
        // ... все остальные менеджеры ...
        this.deleteManager = new DeleteManager(this.canvasManager);
        this.setupManagerCallbacks();
    }
    
    setupManagerCallbacks() {
        this.selectionManager.onElementSelected = (element) => {
            document.getElementById('delete-btn').disabled = false;
        };
    }
    
    setupEventListeners() {
        document.getElementById('delete-btn').addEventListener('click', () => {
            const selected = this.selectionManager.getSelected();
            if (selected.image) this.deleteManager.deleteImage(selected.image);
            if (selected.connection) this.deleteManager.deleteConnection(selected.connection);
            if (selected.widget) this.deleteManager.deleteWidget(selected.widget);
        });
    }
}
```

**Готово!** Новая функция добавлена модульно.

---

## ДОКУМЕНТАЦИЯ ПО ИТЕРАЦИЯМ

### Итерация 1: ЗАВЕРШЕНА (Display Widgets)
**Файлы**: `doc/widgets-iterations-plan.md` (главный план)
**Статус**: ✅ ЗАВЕРШЕНА
**Дата**: 27-28.01.2026
**Ветка**: `feature/widgets-phase1-display` → PR #7
**Реализовано**:
- LED, Number Display, Text Display, Gauge виджеты
- WidgetManager класс
- Context menu интеграция (LED, Number Display, Text Display)
- Properties panel обновлена
- Selection manager обновлен

### Итерация 2: ТЕКУЩАЯ (Selection & Properties)
**Файл**: `doc/iteration-2-widgets.md`
**Статус**: ПЛАНИРУЕТСЯ
**Дата начала**: 28.01.2026
**Ветка**: `feature/widgets-phase2-selection`
**Содержит**: Позиция, размер, выделение, drag-and-drop

### Итерации 3-7: ПЛАНИРУЮТСЯ
**Статус**: ОЖИДАЮТ
**План**: см. `doc/widgets-iterations-plan.md`

---

## КЛЮЧЕВЫЕ МЕТРИКИ

| Метрика | Значение |
|---------|----------|
| Менеджеров в public/ | 14 (+3 для виджетов) |
| Документов в doc/ | 10 (+2 для плана итераций) |
| Общее количество строк кода | ~2500+ |
| Строк UIController | 14 KB |
| Строк ConnectionEditor | 22 KB |
| Строк WidgetManager | ~400 строк [NEW] |
| Средний размер менеджера | 7-9 KB |
| Архитектурный уровень модульности | ✓ Высокий |
| SOLID-готовность | ✓ S, O, L, D |
| Поддержка виджетов | ✓ Полная (фаза 1) |

---

## ИЗМЕНЕНИЯ В v1.4 (28.01.2026)

- ✓ Добавлены файлы виджетов: widget-manager.js, widget-types.js, context-menu.js
- ✓ Добавлены планы по итерациям: widgets-iterations-plan.md, iteration-2-widgets.md
- ✓ Обновлен selection-manager.js (поддержка виджетов)
- ✓ Обновлен properties-panel.js (поддержка виджетов)
- ✓ Обновлен image-manager.js (context menu интеграция)
- ✓ Обновлен ui-controller.js (WidgetManager инициализация)
- ✓ Создана PR #7 для phase 1
- ✓ Синхронизирована архитектура с новыми менеджерами

---

## ВЕТКИ РАЗРАБОТКИ

```
main (stable)
├── feature/widgets-phase1-display ✅ (PR #7)
├── feature/widgets-phase2-selection (active development)
├── feature/widgets-phase3-input (planned)
├── feature/widgets-phase4-control (planned)
├── feature/widgets-phase5-sync (planned)
├── feature/widgets-phase6-binding (planned)
└── feature/widgets-phase7-integration (planned)
```

---

**Пользуйся этой картой при разработке!**
**Вопросы? Смотри АРХИТЕКТУРА_ПРОЕКТА.md или doc/conventions.md**
**План виджетов? Смотри doc/widgets-iterations-plan.md**