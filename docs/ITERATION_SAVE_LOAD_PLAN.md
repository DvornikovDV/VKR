# Итерация: Сохранение и загрузка схем с разделением структуры и привязок

**Версия**: 2.0  
**Дата обновления**: 02.02.2026  
**Статус**: В планировании

---

## Обзор

Реализация функционала сохранения и загрузки схем редактора с **разделением на два файла**:
1. **schema-template.json** - визуальная структура (изображения в Base64, элементы, соединения)
2. **bindings.json** - привязки виджетов к ID устройств (администратор настраивает, оператор видит только свои)

**Цель**: Создать гибкую систему, где одна схема может использоваться с разными наборами привязок для разных машин/объектов.

---

## Архитектура решения

### Механика сохранения/загрузки

#### 1. КОНСТРУКТОР → Экспорт структуры

```javascript
// Сохранить ТОЛЬКО структуру (без привязок тегов)
const schema = {
    schemaId: "boiler-system",          // ← Уникальный ID
    version: "1.0",                     // ← Версия схемы
    timestamp: "2026-02-02T12:03:00Z",
    name: "Boiler System",
    
    // Все изображения в Base64 (координаты, размеры, масштаб)
    images: [
        {
            id: "img1",
            name: "boiler.png",
            data: "data:image/png;base64,iVBORw0KGgo...",  // ← Base64!
            x: 100, y: 50,
            width: 800, height: 600,
            scaleX: 1, scaleY: 1
        }
    ],
    
    // Структура элементов (без тегов - это будут в bindings!)
    elements: [
        {
            id: "el1",
            type: "indicator",
            parentImageId: "img1",
            x: 150, y: 30  // ← координаты относительно изображения
        }
    ],
    
    connectionPoints: [...],
    connections: [...]
};

// Скачать schema-boiler-system-v1.0.json
```

#### 2. АДМИНИСТРАТОР → Создание привязок

```javascript
// Для каждой машины создает отдельные привязки
const bindingsForMachineA = {
    schemaId: "boiler-system",      // ← ССЫЛКА на схему!
    schemaVersion: "1.0",            // ← ССЫЛКА на версию!
    machineId: "machine-A",
    timestamp: "2026-02-02T12:05:00Z",
    
    bindings: [
        {elementId: "el1", tag: "tempSensor_A_main"},
        {elementId: "el2", tag: "pump_A_control"},
        {elementId: "el3", tag: "pressure_A_valve"}
    ]
};

const bindingsForMachineB = {
    schemaId: "boiler-system",      // ← ТА ЖЕ схема!
    schemaVersion: "1.0",
    machineId: "machine-B",
    timestamp: "2026-02-02T12:06:00Z",
    
    bindings: [
        {elementId: "el1", tag: "tempSensor_B_backup"},    // ← РАЗНЫЕ теги
        {elementId: "el2", tag: "pump_B_secondary"},
        {elementId: "el3", tag: "pressure_B_valve"}
    ]
};

// Загружает на сервер (в будущем)
```

#### 3. ДАШБОРД → Загрузка схемы + привязок для оператора

```javascript
// Оператор видит только свою машину
const machineId = user.assignedMachines[0];  // machine-A

// Загружает схему один раз
const schema = await fetch(`/api/schemas/boiler-system`)
    .then(r => r.json());

// Загружает привязки для его машины
const bindings = await fetch(`/api/schemas/boiler-system/bindings/${machineId}`)
    .then(r => r.json());

// Проверка связи
if (bindings.schemaId === schema.schemaId &&
    bindings.schemaVersion === schema.version) {
    // ✅ Привязки подходят к схеме
    displayDashboard(schema, bindings);
} else {
    console.error('Несовместимые версии');
}
```

### Связь через schemaId + версия

```
schema-boiler-system-v1.0.json
├─ schemaId: "boiler-system"
└─ version: "1.0"

blank: bindings-machine-A.json
├─ schemaId: "boiler-system"  ← ССЫЛКА
└─ schemaVersion: "1.0"        ← ССЫЛКА

bindings-machine-B.json
├─ schemaId: "boiler-system"  ← ТА ЖЕ ССЫЛКА
└─ schemaVersion: "1.0"
```

---

## Основные фазы

### Фаза 1: Проверка текущей реализации (~ 1 час)

**Цель**: Убедиться, что текущие кнопки и функции работают

1. **Анализ `public/file-manager.js`**
   - [ ] Найти методы `saveScheme()` и `loadScheme()`
   - [ ] Понять текущую структуру JSON экспорта
   - [ ] Проверить как работает экспорт/импорт изображений
   - [ ] Есть ли сейчас привязки тегов? (должны быть отдельно!)

2. **Проверка UI кнопок**
   - [ ] В `public/index.html` найти кнопку "Сохранить"
   - [ ] Проверить, что она вызывает `saveScheme()`
   - [ ] Найти кнопку "Загрузить"
   - [ ] Проверить, что она вызывает `loadScheme()`
   - [ ] Обе кнопки работают на панели инструментов?

3. **Тестирование текущей функциональности**
   - [ ] Нарисовать схему с несколькими изображениями
   - [ ] Нажать "Сохранить" → скачивается JSON
   - [ ] Очистить canvas
   - [ ] Нажать "Загрузить" → выбрать сохраненный JSON
   - [ ] Восстановились ли изображения? Сохранились ли позиции?

### Фаза 2: Обновление FileManager для разделения файлов (~ 1.5 часа)

**Цель**: Добавить две отдельные кнопки и методы

1. **Обновить UI в `public/index.html`**
   - [ ] Заменить одну кнопку "Сохранить" на две:
     ```html
     <button id="save-schema-btn">Сохранить структуру</button>
     <button id="save-bindings-btn">Сохранить привязки</button>
     <button id="load-schema-btn">Загрузить</button>
     ```

2. **Обновить методы в `public/file-manager.js`**
   - [ ] Новый метод `saveScheme()` - экспортирует ТОЛЬКО структуру
     ```javascript
     async saveScheme() {
         const schema = {
             schemaId: "my-schema",     // Пользователь вводит?
             version: "1.0",
             images: await this.imageManager.exportImages(),  // Base64!
             elements: this.exportElements(),
             connections: this.connectionManager.exportConnections(),
             timestamp: new Date().toISOString()
         };
         this.downloadJSON(schema, `schema-${schema.schemaId}-v${schema.version}.json`);
     }
     ```
   
   - [ ] Новый метод `saveBindings()` - экспортирует привязки
     ```javascript
     saveBindings(machineId) {
         const bindings = {
             schemaId: "my-schema",      // Должно совпадать с загруженной схемой!
             schemaVersion: "1.0",
             machineId: machineId || "default",
             bindings: this.exportBindings(),  // Из виджетов
             timestamp: new Date().toISOString()
         };
         this.downloadJSON(bindings, `bindings-${bindings.schemaId}-${machineId}.json`);
     }
     ```
   
   - [ ] Обновить метод `loadScheme()` - загружает ТОЛЬКО структуру
     ```javascript
     loadScheme(file) {
         const reader = new FileReader();
         reader.onload = (e) => {
             const schema = JSON.parse(e.target.result);
             this.currentSchemaId = schema.schemaId;   // Запомнить для привязок
             this.currentSchemaVersion = schema.version;
             this.clearAll();
             this.imageManager.importImages(schema.images);
             // элементы, соединения БЕЗ тегов/привязок!
         };
         reader.readAsText(file);
     }
     ```

3. **Добавить метод для загрузки привязок**
   - [ ] Новый метод `loadBindings(file)`
     ```javascript
     loadBindings(file) {
         const reader = new FileReader();
         reader.onload = (e) => {
             const bindings = JSON.parse(e.target.result);
             
             // Проверка совместимости
             if (bindings.schemaId !== this.currentSchemaId ||
                 bindings.schemaVersion !== this.currentSchemaVersion) {
                 alert('Привязки не совместимы с загруженной схемой!');
                 return;
             }
             
             this.applyBindings(bindings.bindings);
         };
         reader.readAsText(file);
     }
     ```

### Фаза 3: Обновление ImageManager для Base64 (~ 1.5 часа)

**Цель**: Убедиться, что все изображения сохраняются и загружаются с Base64

1. **Проверить текущую реализацию `public/image-manager.js`**
   - [ ] Есть ли метод `exportImages()`? Что он возвращает?
   - [ ] Есть ли метод `importImages()`? Как он работает?
   - [ ] Используются ли сейчас только URL? Нужно изменить на Base64

2. **Добавить метод конвертации в Base64**
   - [ ] Новый метод `imageToBase64(konvaImage)`
     ```javascript
     imageToBase64(konvaImage) {
         try {
             return konvaImage.toDataURL();  // PNG по умолчанию
         } catch(e) {
             console.error('Ошибка Base64:', e);
             return null;
         }
     }
     ```

3. **Обновить `exportImages()` для Base64**
   - [ ] Сделать метод асинхронным
   - [ ] Для каждого изображения: вызвать `imageToBase64()`
   - [ ] Вернуть array с полными данными:
     ```javascript
     async exportImages() {
         return Promise.all(this.images.map(img => ({
             id: img.id,
             name: img.imageName || 'image.png',
             data: this.imageToBase64(img.image),  // ← Base64!
             width: img.width(),
             height: img.height(),
             x: img.x(),
             y: img.y(),
             scaleX: img.scaleX(),
             scaleY: img.scaleY()
         })));
     }
     ```

4. **Обновить `importImages()` для Base64**
   - [ ] Для каждого объекта в массиве
   - [ ] Создать `new Image()`
   - [ ] Установить `img.src = data.data` (Base64 строка!)
   - [ ] Когда `img.onload` → вызвать `addImage()`
     ```javascript
     importImages(imagesData) {
         imagesData.forEach(data => {
             const img = new Image();
             img.onload = () => {
                 this.addImage(img, data.x, data.y, data.id);
             };
             img.onerror = () => console.error('Ошибка загрузки Base64');
             img.src = data.data;  // ← Base64!
         });
     }
     ```

### Фаза 4: Интеграция и обработка ошибок (~ 1 час)

1. **Вызовы методов из UI**
   - [ ] Кнопка "Сохранить структуру" → `fileManager.saveScheme()`
   - [ ] Кнопка "Сохранить привязки" → `fileManager.saveBindings(machineId)`
   - [ ] Кнопка "Загрузить схему" → `fileManager.loadScheme(file)`
   - [ ] Кнопка "Загрузить привязки" → `fileManager.loadBindings(file)`

2. **Обработка ошибок**
   - [ ] Try-catch в методах парсинга JSON
   - [ ] Проверка совместимости (schemaId + версия)
   - [ ] Информативные alert'ы для пользователя
   - [ ] console.error для отладки

3. **Валидация данных**
   - [ ] Проверить что JSON содержит требуемые поля
   - [ ] Проверить что Base64 строки корректные
   - [ ] Проверить что изображения загружаются корректно

### Фаза 5: Тестирование (~ 2 часа)

1. **Функциональные тесты**
   - [ ] Сохранить схему с несколькими изображениями
   - [ ] Проверить что файл содержит Base64
   - [ ] Сохранить привязки для машины А
   - [ ] Сохранить привязки для машины Б (ДЛЯ ТОЙ ЖЕ схемы!)
   - [ ] Загрузить схему
   - [ ] Загрузить привязки для машины А → работают ли?
   - [ ] Загрузить привязки для машины Б → работают ли?
   - [ ] Попробовать загрузить несовместимые привязки → ошибка?

2. **Граничные случаи**
   - [ ] Пустая схема (без изображений)
   - [ ] Множество изображений (10+)
   - [ ] Большие изображения (>5MB)
   - [ ] Поврежденный JSON
   - [ ] Привязки от другой версии схемы

3. **Консоль проверка**
   - [ ] Нет ошибок при сохранении
   - [ ] Нет ошибок при загрузке
   - [ ] Нет предупреждений

---

## Структура JSON файлов

### schema-boiler-system-v1.0.json (КОНСТРУКТОР)

```json
{
  "schemaId": "boiler-system",
  "version": "1.0",
  "name": "Boiler System Schema",
  "timestamp": "2026-02-02T12:03:00Z",
  
  "images": [
    {
      "id": "img1",
      "name": "boiler_main.png",
      "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
      "width": 800,
      "height": 600,
      "x": 100,
      "y": 50,
      "scaleX": 1,
      "scaleY": 1
    }
  ],
  
  "elements": [
    {
      "id": "el1",
      "type": "indicator",
      "parentImageId": "img1",
      "x": 150,
      "y": 30
    }
  ],
  
  "connectionPoints": [...],
  "connections": [...]
}
```

### bindings-boiler-system-machine-A.json (АДМИНИСТРАТОР)

```json
{
  "schemaId": "boiler-system",
  "schemaVersion": "1.0",
  "machineId": "machine-A",
  "timestamp": "2026-02-02T12:05:00Z",
  
  "bindings": [
    {"elementId": "el1", "tag": "tempSensor_A_main"},
    {"elementId": "el2", "tag": "pump_A_control"},
    {"elementId": "el3", "tag": "pressure_A_valve"}
  ]
}
```

---

## Критерии завершения

### ✅ Обязательно

- [ ] `fileManager.saveScheme()` экспортирует структуру без привязок
- [ ] `fileManager.saveBindings()` экспортирует привязки с ссылкой на схему
- [ ] ImageManager поддерживает Base64 для ВСЕХ изображений
- [ ] `fileManager.loadScheme()` загружает структуру
- [ ] `fileManager.loadBindings()` загружает привязки
- [ ] Проверка совместимости (schemaId + версия) работает
- [ ] Кнопки в UI работают для обоих операций
- [ ] Нет ошибок в консоли браузера
- [ ] Одна схема работает с разными наборами привязок

### ⚠️ Желательно

- [ ] Валидация JSON структуры
- [ ] Информативные сообщения об ошибках
- [ ] Проверка версии схемы при загрузке привязок
- [ ] Возможность редактировать schemaId при сохранении

---

## Метрики

| Метрика | Значение |
|---------|----------|
| **Время на фазу** | 1-1.5 часа |
| **Общее время** | ~7-8 часов |
| **Размер schema JSON** | исходный × 1.33 (Base64) |
| **Размер bindings JSON** | < 10 KB |
| **Совместимость** | 1 схема + N привязок |

---

## Зависимости

### Текущие файлы

- `public/file-manager.js` - основной класс
- `public/image-manager.js` - управление изображениями (Base64)
- `public/connection-manager.js` - соединения
- `public/connection-point-manager.js` - точки
- `public/index.html` - UI (новые кнопки)

### Внешние

- Konva.js (`toDataURL()` для Base64)
- Browser Image API

---

## Будущие фазы (не в этой итерации)

- **Фаза 6**: Backend API для хранения
- **Фаза 7**: RBAC - админ настраивает привязки
- **Фаза 8**: Версионирование привязок
- **Фаза 9**: IndexedDB кеширование

---

## История версий

- **v2.0** (02.02.2026) - Разделение на schema + bindings
- **v1.0** (30.01.2026) - Начальный план
