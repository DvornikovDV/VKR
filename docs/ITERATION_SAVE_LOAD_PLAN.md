# Итерация: Сохранение и загружка схем с разделением структуры и привязок

**Версия**: 2.2  
**Дата обновления**: 02.02.2026  
**Статус**: В планировании

---

## Обзор

Реализация функционала сохранения и загружки схем редактора с **разделением на два файла**:
1. **schema-template.json** - визуальная структура (изображения в Base64, элементы, соединения)
2. **bindings.json** - привязки виджетов к ID устройств (администратор настраивает, оператор видит только свои)

**Ключевые улучшения**: 
- Автозапоминание загруженной схемы (schemaId + версия)
- 3-уровневая валидация при сохранении/загружке привязок
- 2 опции загрузки привязок (отдельная кнопка vs выпадающий список)

---

## Архитектура решения

### 1. Автозапоминание в FileManager

```javascript
class FileManager {
    constructor() {
        this.currentSchemaId = null;        // ✅ Запоминаем ID загруженной схемы
        this.currentSchemaVersion = null;   // ✅ Версию схемы
        this.currentMachineId = null;       // ✅ Текущую машину
    }
    
    // При сохранении новой схемы
    async saveScheme() {
        const schemaId = prompt("Имя схемы:", "my-schema");
        const schema = { schemaId, version: "1.0", ... };
        
        this.currentSchemaId = schema.schemaId;          // ← Запомнить!
        this.currentSchemaVersion = schema.version;
    }
    
    // При загружке существующей схемы
    loadScheme(file) {
        const schema = JSON.parse(fileContent);
        
        this.currentSchemaId = schema.schemaId;          // ← Запомнить!
        this.currentSchemaVersion = schema.version;
    }
}
```

### 2. Валидация на 3 уровнях

**Уровень 1: Сохранение привязок** - есть ли загруженная схема
```javascript
if (!this.currentSchemaId) {
    alert("Сначала загрузите или сохраните структуру!");
    return;
}
```

**Уровень 2: Загружка привязок** - совместима ли schemaId + версия
```javascript
if (bindings.schemaId !== this.currentSchemaId || 
    bindings.schemaVersion !== this.currentSchemaVersion) {
    alert("Привязки не совместимы!");
    return;
}
```

**Уровень 3: Загружка новой схемы** - предупредить о смене привязок
```javascript
if (this.currentSchemaId && schema.schemaId !== this.currentSchemaId) {
    if (!confirm("Привязки будут сброшены. Продолжить?")) return;
}
```

### 3. Использование запомненного ID для bindings

```javascript
saveBindings() {
    if (!this.currentSchemaId) return;  // ✅ Блокировка
    
    const machineId = prompt("ID машины:", "machine-A");
    const bindings = {
        schemaId: this.currentSchemaId,         // ← БЕРЕМ ИЗ ПАМЯТИ!
        schemaVersion: this.currentSchemaVersion,
        machineId: machineId,
        bindings: this.exportBindings()
    };
}
```

### 4. Загружка привязок - 2 опции

#### ✅ Опция 1: Отдельная кнопка (ТЕКУЩАЯ ИТЕРАЦИЯ)

```html
<!-- UI -->
<button id="load-schema-btn">Загрузить структуру</button>
<button id="load-bindings-btn">Загрузить привязки</button>  <!-- ← отдельно -->
```

**Workflow**: 
1. Нажать "Загрузить структуру" → выбрать schema-X.json → FileManager запомнит ID
2. Нажать "Загрузить привязки" → выбрать bindings-X-machine-A.json → валидация + работают

**Плюсы**: Простая реализация  
**Минусы**: В текущей итерации выбрана

---

#### ⚠️ Опция 2: Выпадающий список (будущая версия)

```html
<!-- На панели инструментов -->
<select id="bindings-selector">
    <option>Загрузить привязки...</option>
    <option value="machine-A">machine-A</option>
    <option value="machine-B">machine-B</option>
</select>
```

**Workflow**:
1. Загружается schema-X.json
2. Приложение сканирует bindings-X-*.json для этого schemaId
3. Пользователь выбирает из списка → загружаются авто

**Плюсы**: Удобнее  
**Минусы**: Требует сканирования

---

## Основные фазы

### Фаза 1: Проверка текущей реализации (1ч)

1. **Анализ `file-manager.js`**: методы save/load, структура JSON, экспорт изображений
2. **Проверка UI**: есть ли кнопки, работают ли
3. **Тестирование**: сохранить → загрузить → восстановлилось

### Фаза 2: UI + Автозапоминание + Валидация (1.5ч)

1. **UI**: 4 кнопки (save-schema, save-bindings, load-schema, load-bindings)
2. **FileManager**: свойства currentSchemaId, currentSchemaVersion, currentMachineId
3. **saveScheme()**: запомнить ID и версию
4. **loadScheme()**: запомнить ID и версию
5. **saveBindings()**: проверить currentSchemaId, использовать запомненные реквизиты
6. **loadBindings()**: проверить совместимость

### Фаза 3: ImageManager Base64 (1.5ч)

1. **imageToBase64()**: `konvaImage.toDataURL()`
2. **exportImages()**: асинхронный, ретурнют Base64 данные
3. **importImages()**: используют `data.data` (Base64)

### Фаза 4: Обработчики кнопок (1ч)

- save-schema → fileManager.saveScheme()
- save-bindings → fileManager.saveBindings()
- load-schema → file input → fileManager.loadScheme(file)
- load-bindings → file input → fileManager.loadBindings(file) с валидацией

### Фаза 5: Тестирование (2ч)

- Сценарий 1: Одна схема + несколько машин → отдельные bindings работают
- Сценарий 2: Несовместимые bindings → ошибка валидации
- Сценарий 3: Попытка сохранить bindings без схемы → блокировка

---

## Структура JSON

**schema-boiler-system-v1.0.json**:
```json
{"schemaId": "boiler-system", "version": "1.0", "images": [{"id": "img1", "data": "data:image/png;base64,...", "x": 100, "y": 50}], "elements": [...], "connections": [...]}
```

**bindings-boiler-system-machine-A.json**:
```json
{"schemaId": "boiler-system", "schemaVersion": "1.0", "machineId": "machine-A", "bindings": [{"elementId": "el1", "tag": "tempSensor_A_main"}]}
```

---

## Критерии завершения

### ✅ Обязательно

- [ ] currentSchemaId запоминается при save/load структуры
- [ ] Нельзя сохранить bindings без схемы (блокировка уровня 1)
- [ ] Нельзя загрузить несовместимые bindings (блокировка уровня 2)
- [ ] 4 кнопки работают
- [ ] ImageManager поддерживает Base64 для ВСЕХ изображений
- [ ] Одна схема работает с разными наборами bindings
- [ ] Нет ошибок в console

### ⚠️ Желательно

- [ ] Показывать текущие schemaId и machineId в UI
- [ ] Полезные error messages

---

**История**: v2.2 (автозапоминание + валидация) • v2.0 (разделение) • v1.0 (начальный)
