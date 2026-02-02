# Лист задач: Просмотр гиа схемы и привязок + валидация

**Версия**: 2.2  
**Дата**: 02.02.2026

---

## ФАЗА 1: Проверка (1ч)

### 1.1 Анализ `file-manager.js`

- [ ] Найти `saveScheme()` и `loadScheme()`
- [ ] Понять текущую JSON структуру
- [ ] Проверить export/import изображений
- [ ] Есть ли теги в одном файле? (должны быть отдельно!)

### 1.2 Проверка UI

- [ ] Кнопки "Сохранить" и "Загрузить" работают
- [ ] Работают на панели инструментов

### 1.3 Тестирование

- [ ] Нарисовать схему с изображениями
- [ ] Сохранить → скачивается JSON
- [ ] Очистить canvas
- [ ] Загружить → восстановились все

---

## ФАЗА 2: UI + Автозапоминание (1.5ч)

### 2.1 Обновить UI в `index.html`

```html
<!-- Новые 4 кнопки -->
<button id="save-schema-btn">Сохранить структуру</button>
<button id="save-bindings-btn">Сохранить привязки</button>
<button id="load-schema-btn">Загрузить структуру</button>
<button id="load-bindings-btn">Загрузить привязки</button>
```

- [ ] Заменить одну есть одну кнопку гна 2
- [ ] Обе кнопки load таж юповнят юровые input

### 2.2 Обновить FileManager - свойства

- [ ] Конструктор: добавить
  ```javascript
  this.currentSchemaId = null;
  this.currentSchemaVersion = null;
  this.currentMachineId = null;
  ```

### 2.3 Обновить `saveScheme()` - запоминание

- [ ] После сохранения:
  ```javascript
  this.currentSchemaId = schema.schemaId;
  this.currentSchemaVersion = schema.version;
  ```
- [ ] Проверить в консоли: отображаются значения

### 2.4 Обновить `loadScheme()` - запоминание

- [ ] После загрузки:
  ```javascript
  this.currentSchemaId = schema.schemaId;
  this.currentSchemaVersion = schema.version;
  ```

### 2.5 Обновить `saveBindings()` - валидация 1 уровень

```javascript
if (!this.currentSchemaId) {
    alert("Сначала сохраните или загрузите структуру!");
    return;
}
```

- [ ] Код использует запомненные реквизиты:
  ```javascript
  const bindings = {
      schemaId: this.currentSchemaId,         // ← ИЗ ПАМЯТИ!
      schemaVersion: this.currentSchemaVersion,
      machineId: machineId,
      bindings: this.exportBindings()
  };
  ```

### 2.6 Новый метод `loadBindings()` - валидация 2 уровень

```javascript
loadBindings(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const bindings = JSON.parse(e.target.result);
        
        // ✅ Проверка совместимости
        if (bindings.schemaId !== this.currentSchemaId ||
            bindings.schemaVersion !== this.currentSchemaVersion) {
            alert("Привязки не совместимы с текущей схемой!");
            return;
        }
        
        this.currentMachineId = bindings.machineId;  // ← Запомнить
        this.applyBindings(bindings.bindings);
    };
    reader.readAsText(file);
}
```

- [ ] Нанстроить добавление метода в FileManager

---

## ФАЗА 3: ImageManager Base64 (1.5ч)

### 3.1 Новый метод `imageToBase64()`

```javascript
imageToBase64(konvaImage) {
    try {
        return konvaImage.toDataURL();
    } catch(e) {
        console.error('Ошибка Base64:', e);
        return null;
    }
}
```

- [ ] Добавить в ImageManager

### 3.2 Обновить `exportImages()` - асинхронный

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

- [ ] Обновить в ImageManager
- [ ] Тест: при сохранении в JSON есть data: "data:image/png..."

### 3.3 Обновить `importImages()` - использует Base64

```javascript
importImages(imagesData) {
    imagesData.forEach(data => {
        const img = new Image();
        img.onload = () => {
            this.addImage(img, data.x, data.y, data.id);
        };
        img.onerror = () => console.error(`Ошибка загружки ${data.id}`);
        img.src = data.data;  // ← Base64!
    });
}
```

- [ ] Обновить в ImageManager
- [ ] Тест: сохранить → загружить → восстановились

---

## ФАЗА 4: Обработчики (1ч)

### 4.1 Навюать обработчики кнопок

```javascript
// Сохранение
document.getElementById('save-schema-btn').addEventListener('click', () => {
    fileManager.saveScheme();
});

document.getElementById('save-bindings-btn').addEventListener('click', () => {
    fileManager.saveBindings();
});

// Загружка
document.getElementById('load-schema-btn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', (e) => fileManager.loadScheme(e.target.files[0]));
    input.click();
});

document.getElementById('load-bindings-btn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', (e) => fileManager.loadBindings(e.target.files[0]));
    input.click();
});
```

- [ ] Все 4 обработчика работают
- [ ] Нет console errors

---

## ФАЗА 5: Тестирование (2ч)

### 5.1 Сценарий: Одна схема + несколько машин

- [ ] Нарисовать схему с 2-3 элементами
- [ ] Сохранить структура (принять schemaId)
- [ ] Сохранить привязки machine-A
- [ ] Файл bindings содержит тот же schemaId
- [ ] Сохранить привязки machine-B для ТОЙ ЖЕ схемы
- [ ] Очистить canvas
- [ ] Загрузить структура → восстановились
- [ ] Загрузить machine-A bindings → работают
- [ ] Загрузить machine-B bindings → другие теги → работают

### 5.2 Валидация уровня 1: Блокировка

- [ ] Новый редактор (currentSchemaId = null)
- [ ] Нажать "Сохранить привязки" → alert: "Сначала сохраните..."
- [ ] Ничего не скачивается

### 5.3 Валидация уровня 2: Несовместимые bindings

- [ ] Загружить schema-X.json
- [ ] Попытаться загрузить bindings-Y-machine.json (другой schemaId)
- [ ] alert: "Привязки не совместимы"
- [ ] Ничего не загружается

### 5.4 Консоль чистота

- [ ] DevTools > Console: нет errors
- [ ] Нет warnings

---

## ПОЛНАЯ ПОЛВЕРКА

### Обязательно

- [ ] currentSchemaId запоминается
- [ ] Нельзя сохранить bindings без схемы
- [ ] Нельзя загружить несовместимые bindings
- [ ] 4 кнопки работают
- [ ] ImageManager сохраняет Base64
- [ ] Одна схема + несколько bindings
- [ ] Нет console errors

### Желательно

- [ ] Показывать текущие schemaId и machineId в UI
- [ ] Нажим, инфо messages
