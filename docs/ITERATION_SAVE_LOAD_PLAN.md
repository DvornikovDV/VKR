
# Итерация: Сохранение и загрузка схем с разделением структуры и привязок

**Версия**: 2.1  
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
```

#### 3. Автозапоминание в FileManager

```javascript
class FileManager {
    constructor() {
        this.currentSchemaId = null;        // ✅ Запоминаем загруженную схему
        this.currentSchemaVersion = null;   // ✅ Версию
        this.currentBindings = null;        // ✅ Текущие привязки
        this.currentMachineId = null;       // ✅ Текущую машину
    }
    
    // При сохранении новой схемы
    async saveScheme() {
        const schemaId = prompt("Имя схемы:", "my-schema");
        const schema = { schemaId, version: "1.0", ... };
        
        // ✅ Запомнить для следующего сохранения привязок
        this.currentSchemaId = schema.schemaId;
        this.currentSchemaVersion = schema.version;
    }
    
    // При загрузке существующей схемы
    loadScheme(file) {
        const schema = JSON.parse(fileContent);
        
        // ✅ Запомнить для следующего сохранения привязок
        this.currentSchemaId = schema.schemaId;
        this.currentSchemaVersion = schema.version;
    }
    
    // При сохранении привязок
    saveBindings() {
        // ✅ ВАЛИДАЦИЯ: есть ли загруженная схема?
        if (!this.currentSchemaId) {
            alert("Сначала сохраните/загрузите структуру!");
            return;
        }
        
        const machineId = prompt("ID машины:", "machine-A");
        const bindings = {
            schemaId: this.currentSchemaId,      // ✅ Берем из памяти!
            schemaVersion: this.currentSchemaVersion,
            machineId: machineId,
            bindings: this.exportBindings()
        };
    }
    
    // При загрузке привязок
    loadBindings(file) {
        const bindings = JSON.parse(fileContent);
        
        // ✅ ВАЛИДАЦИЯ: совместимы ли привязки с текущей схемой?
        if (bindings.schemaId !== this.currentSchemaId ||
            bindings.schemaVersion !== this.currentSchemaVersion) {
            alert("Привязки не совместимы с загруженной схемой!");
            return;
        }
        
        // ✅ Запомнить текущие привязки
        this.currentBindings = bindings;
        this.currentMachineId = bindings.machineId;
    }
}
```

### Система валидации

**3 уровня защиты**:

1. **При сохранении привязок** → проверить, что схема загружена
2. **При загрузке привязок** → проверить совместимость (schemaId + версия)
3. **При загрузке новой схемы** → сбросить старые привязки (если менялась)

```javascript
// Уровень 1: Сохранение привязок
if (!this.currentSchemaId) {
    alert("❌ Сьрачала загрузите или сохраните структуру!");
    return;  // Блокировать сохранение
}

// Уровень 2: Загрузка привязок
if (bindings.schemaId !== this.currentSchemaId) {
    alert("❌ Привязки для другой схемы!");
    return;  // Блокировать загрузку
}

// Уровень 3: Смена схемы
if (this.currentBindings && schema.schemaId !== this.currentSchemaId) {
    if (!confirm("Текущие привязки будут сброшены. Продолжить?")) {
        return;  // Дать пользователю выбор
    }
    this.currentBindings = null;  // Очистить
}
```

### Загрузка привязок: 2 подхода

#### ✅ Опция 1: Отдельная кнопка (РЕКОМЕНДУЕТСЯ)

```html
<!-- UI -->
<button id="load-schema-btn">Загрузить структуру</button>
<button id="load-bindings-btn">Загрузить привязки</button>  <!-- ← отдельно -->

<!-- Рабочий процесс -->
1. Нажать "Загрузить структуру" → выбрать schema-X.json
2. FileManager запомнит schemaId и version
3. Нажать "Загрузить привязки" → выбрать bindings-X-machine-A.json
4. Валидация пройдёт, привязки применятся
```

**Плюсы**: Простая реализация, удобная UX  
**Минусы**: Два клика вместо одного

---

#### ⚠️ Опция 2: Выпадающий список привязок (будущее)

```html
<!-- UI -->
<button id="load-schema-btn">Загрузить структуру</button>

<!-- На панели инструментов -->
<select id="bindings-selector">
    <option value="">Выберите набор привязок...</option>
    <option value="machine-A">machine-A</option>
    <option value="machine-B">machine-B</option>
    <option value="machine-C">machine-C</option>
</select>

<!-- Рабочий процесс -->
1. Загружается schema-X.json
2. Приложение сканирует локальные bindings-X-*.json файлы
3. Заполняет выпадающий список найденными наборами
4. Пользователь выбирает из списка
5. Соответствующие привязки загружаются автоматически
```

**Плюсы**: Удобнее, одна кнопка  
**Минусы**: Сложнее реализация (нужно сканировать файлы)

**→ ДЛЯ ТЕКУЩЕЙ ИТЕРАЦИИ**: Реализуем Опцию 1. Опция 2 - в следующей версии.

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

**Цель**: Добавить две отдельные кнопки, автозапоминание и валидацию

1. **Обновить UI в `public/index.html`**
   - [ ] Заменить одну кнопку "Сохранить" на две:
     ```html
     <button id="save-schema-btn">Сохранить структуру</button>
     <button id="save-bindings-btn">Сохранить привязки</button>
     <button id="load-schema-btn">Загрузить структуру</button>
     <button id="load-bindings-btn">Загрузить привязки</button>  <!-- ← НОВОЕ -->
     ```

2. **Добавить в FileManager автозапоминание**
   - [ ] Конструктор:
     ```javascript
     this.currentSchemaId = null;
     this.currentSchemaVersion = null;
     this.currentMachineId = null;
     ```
   - [ ] В `saveScheme()`: `this.currentSchemaId = schema.schemaId`
   - [ ] В `loadScheme()`: `this.currentSchemaId = schema.schemaId`
   - [ ] В `loadBindings()`: `this.currentMachineId = bindings.machineId`

3. **Добавить валидацию в `saveBindings()`**
   - [ ] Проверить `if (!this.currentSchemaId)` → alert + return
   - [ ] Использовать запомненный schemaId и version:
     ```javascript
     saveBindings() {
         if (!this.currentSchemaId) {
             alert("Сначала загрузите или сохраните структуру!");
             return;
         }
         const bindings = {
             schemaId: this.currentSchemaId,      // ← из памяти
             schemaVersion: this.currentSchemaVersion,
             ...
         };
     }
     ```

4. **Добавить валидацию в `loadBindings()`**
   - [ ] Проверить совместимость:
     ```javascript
     if (bindings.schemaId !== this.currentSchemaId ||
         bindings.schemaVersion !== this.currentSchemaVersion) {
         alert("Привязки не совместимы!");
         return;
     }
     ```
   - [ ] Запомнить машину: `this.currentMachineId = bindings.machineId`

### Фаза 3: Обновление ImageManager для Base64 (~ 1.5 часа)

**Цель**: Убедиться, что все изображения сохраняются и загружаются с Base64

1. **Добавить метод конвертации**
   - [ ] `imageToBase64(konvaImage)` → возвращает data URL
   - [ ] Использует `konvaImage.toDataURL()`

2. **Обновить `exportImages()` асинхронный**
   - [ ] Для каждого изображения вызвать `imageToBase64()`
   - [ ] Вернуть массив с `data`, `x`, `y`, `width`, `height`, etc.

3. **Обновить `importImages()` для Base64**
   - [ ] Для каждого объекта создать `new Image()`
   - [ ] Установить `img.src = data.data` (это Base64)
   - [ ] Когда загрузится → вызвать `addImage()`

### Фаза 4: Обработчики событий (~ 1 час)

**Цель**: Связать UI кнопки с методами FileManager

1. **Обновить обработчики в `public/script.js`**
   - [ ] "Сохранить структуру" → `fileManager.saveScheme()`
   - [ ] "Сохранить привязки" → `fileManager.saveBindings()`
   - [ ] "Загрузить структуру" → выбрать файл → `fileManager.loadScheme(file)`
   - [ ] "Загрузить привязки" → выбрать файл → `fileManager.loadBindings(file)`

### Фаза 5: Комплексное тестирование (~ 2 часа)

1. **Сценарий 1: Новая схема + одна машина**
   - [ ] Сохранить структуру → schema.json
   - [ ] Сохранить привязки → bindings-A.json
   - [ ] Очистить canvas
   - [ ] Загрузить структуру
   - [ ] Загрузить привязки → работают?

2. **Сценарий 2: Одна схема + несколько машин**
   - [ ] Загрузить schema.json
   - [ ] Загрузить bindings-machine-A.json
   - [ ] Загрузить bindings-machine-B.json
   - [ ] Проверить, что каждый набор работает для одной схемы

3. **Сценарий 3: Несовместимые привязки (валидация)**
   - [ ] Загрузить schema-X.json
   - [ ] Попробовать загрузить bindings-Y-machine-A.json
   - [ ] Ошибка валидации?

4. **Граничные случаи**
   - [ ] Попытка сохранить привязки без загруженной схемы → ошибка?
   - [ ] Пустая схема
   - [ ] Множество изображений

---

## Структура JSON файлов

### schema-boiler-system-v1.0.json

```json
{
  "schemaId": "boiler-system",
  "version": "1.0",
  "timestamp": "2026-02-02T12:03:00Z",
  
  "images": [
    {
      "id": "img1",
      "name": "boiler_main.png",
      "data": "data:image/png;base64,iVBORw0KGgoAAAA...",
      "width": 800,
      "height": 600,
      "x": 100,
      "y": 50
    }
  ],
  
  "elements": [
    {"id": "el1", "type": "indicator", "parentImageId": "img1", "x": 150, "y": 30}
  ],
  
  "connectionPoints": [...],
  "connections": [...]
}
```

### bindings-boiler-system-machine-A.json

```json
{
  "schemaId": "boiler-system",
  "schemaVersion": "1.0",
  "machineId": "machine-A",
  "timestamp": "2026-02-02T12:05:00Z",
  
  "bindings": [
    {"elementId": "el1", "tag": "tempSensor_A_main"},
    {"elementId": "el2", "tag": "pump_A_control"}
  ]
}
```

---

## Критерии завершения

### ✅ Обязательно

- [ ] Автозапоминание: `currentSchemaId` сохраняется при save/load
- [ ] Валидация: нельзя сохранить привязки без схемы
- [ ] Валидация: нельзя загрузить несовместимые привязки
- [ ] 4 кнопки в UI работают корректно
- [ ] ImageManager полностью поддерживает Base64
- [ ] Одна схема работает с разными наборами привязок
- [ ] Нет ошибок в консоли

### ⚠️ Желательно

- [ ] Информативные сообщения об ошибках
- [ ] Показывать текущую загруженную схему в заголовке
- [ ] Показывать текущий набор привязок (machineId)

---

## История версий

- **v2.1** (02.02.2026) - Автозапоминание + валидация + 2 опции загрузки
- **v2.0** (02.02.2026) - Разделение на schema + bindings
- **v1.0** (30.01.2026) - Начальный план
