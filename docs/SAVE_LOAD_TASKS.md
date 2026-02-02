# Лист задач: Разделение схемы на структуру и привязки + Base64

**Версия**: 2.0  
**Дата**: 02.02.2026  
**Статус**: Не начато

---

## ФАЗА 1: Проверка текущей реализации

### Время: 1 час

#### ЗАДАЧА 1.1: Анализ `public/file-manager.js`

- [ ] **Открыть файл**
  - [ ] Найти метод `saveScheme()`
  - [ ] Найти метод `loadScheme()`
  - [ ] Понять текущую структуру JSON экспорта

- [ ] **Найти методы экспорта изображений**
  - [ ] Есть ли `imageManager.exportImages()`?
  - [ ] Что он возвращает? (только URL или Base64?)
  - [ ] Есть ли `imageManager.importImages()`?

- [ ] **Проверить привязки (ВАЖНО!)**
  - [ ] Есть ли в JSON теги, bindings, machineId?
  - [ ] Если  да - перенести отдельно (они должны быть отдельно!)

#### ЗАДАЧА 1.2: Проверка UI кнопок в `public/index.html`

- [ ] **Найти кнопки сохранения/загружки**
  - [ ] Кнопка "Сохранить" - на каких элементах?
  - [ ] Кнопка "Загрузить" - какой id/class?
  - [ ] Работают ли на панели инструментов?

- [ ] **Клик на кнопки**
  - [ ] "Сохранить" → вызывает `saveScheme()`?
  - [ ] "Загрузить" → вызывает `loadScheme()`?
  - [ ] Диалогы выбора файлов работают?

#### ЗАДАЧА 1.3: Тестирование текущей функциональности

- [ ] **Току и набоскав**
  - [ ] Нарисовать схему с 2-3 изображениями
  - [ ] Нажать "Сохранить" → скачивается JSON?
  - [ ] Очистить canvas
  - [ ] Нажать "Загрузить" → выбрать JSON
  - [ ] Восстановились ли все изображения?
  - [ ] На верных позициях?
  - [ ] Без знака о ниятии?

- [ ] **Проверка console**
  - [ ] Нет ошибок при сохранении?
  - [ ] Нет ошибок при загружке?

---

## ФАЗА 2: Обновление UI - две отдельные кнопки

### Время: 1 час

#### ЗАДАЧА 2.1: Добавить кнопки в `public/index.html`

- [ ] **Заменить одну кнопку "Сохранить" на две**

```html
<!-- ВМЕСТО этого: -->
<button id="save-btn">Сохранить</button>

<!-- ДОЛЖНО быть: -->
<button id="save-schema-btn">Сохранить структуру</button>
<button id="save-bindings-btn">Сохранить привязки</button>
<button id="load-btn">Загрузить</button>
```

- [ ] **Обновить CSS** (если нужно)
  - [ ] Кнопки на панели выполнены
  - [ ] интервал между кнопками нормальный
  - [ ] Кнопки легко нажимаются

#### ЗАДАЧА 2.2: Обновить повесим обработчиков (в `public/script.js` или другом)

- [ ] **Новые обработчики**

```javascript
// ВМЕСТО этого:
document.getElementById('save-btn').addEventListener('click', () => {
    fileManager.saveScheme();
});

// ДОЛЖНо быть:
document.getElementById('save-schema-btn').addEventListener('click', () => {
    fileManager.saveScheme();
});

document.getElementById('save-bindings-btn').addEventListener('click', () => {
    const machineId = prompt('Введите ID машины (напр. machine-A):');
    if (machineId) {
        fileManager.saveBindings(machineId);
    }
});

document.getElementById('load-btn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file.name.includes('bindings')) {
            fileManager.loadBindings(file);
        } else {
            fileManager.loadScheme(file);
        }
    });
    input.click();
});
```

- [ ] **Проверить вызывы**
  - [ ] все кнопки работают?
  - [ ] Промпт появляется при нажатии "Сохранить привязки"?
  - [ ] Нет ошибок в console?

---

## ФАЗА 3: Обновление FileManager

### Время: 1.5 часа

#### ЗАДАЧА 3.1: Обновить `saveScheme()` только структура

- [ ] **Метод `saveScheme()`**

```javascript
async saveScheme() {
    try {
        const schema = {
            schemaId: "my-schema",          // Пользователь может редактировать
            version: "1.0",
            timestamp: new Date().toISOString(),
            images: await this.imageManager.exportImages(),  // ← Base64!
            elements: this.exportElements(),
            connectionPoints: this.connectionPointManager.exportPoints(),
            connections: this.connectionManager.exportConnections()
        };
        
        this.downloadJSON(schema, `schema-${schema.schemaId}-v${schema.version}.json`);
        alert('Структура сохранена!');
    } catch(e) {
        console.error('Ошибка:', e);
        alert('Ошибка при сохранении структуры');
    }
}
```

- [ ] **Тестирование**
  - [ ] Нарисуём схему с изображениями
  - [ ] Нажимаем "Сохранить структуру"
  - [ ] Скачался JSON
  - [ ] Открываем в редакторе
  - [ ] Видны Base64 строки в `images[].data`?
  - [ ] НЕТ привязок/bindings/machineId?

#### ЗАДАЧА 3.2: Новый метод `saveBindings(machineId)`

- [ ] **Метод экспорта привязок**

```javascript
saveBindings(machineId) {
    try {
        const bindings = {
            schemaId: this.currentSchemaId,          // Поняли из loadScheme()
            schemaVersion: this.currentSchemaVersion, // Поняли из loadScheme()
            machineId: machineId || "default",
            timestamp: new Date().toISOString(),
            bindings: this.exportBindings()  // Из виджетов
        };
        
        this.downloadJSON(bindings, `bindings-${bindings.schemaId}-${machineId}.json`);
        alert(`Привязки для ${machineId} сохранены!`);
    } catch(e) {
        console.error('Ошибка:', e);
        alert('Ошибка при сохранении привязок');
    }
}
```

- [ ] **Тестирование**
  - [ ] Загружена структура
  - [ ] Нажимаем "Сохранить привязки"
  - [ ] Выскакивает диалог промпта повторения ID машины
  - [ ] Вводим "machine-A"
  - [ ] Скачался JSON
  - [ ] В JSON есть schemaId, schemaVersion, machineId, bindings?

#### ЗАДАЧА 3.3: Обновить `loadScheme()` – только структура

- [ ] **Метод**

```javascript
loadScheme(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const schema = JSON.parse(e.target.result);
            
            // Запомнить ID и версию для привязок
            this.currentSchemaId = schema.schemaId;
            this.currentSchemaVersion = schema.version;
            
            this.clearAll();
            this.imageManager.importImages(schema.images);  // ← Base64!
            // Элементы, соединения БЕЗ тегов!
            
            alert('Структура загружена!');
        } catch(e) {
            console.error('Ошибка:', e);
            alert('Ошибка при загружке структуры: ' + e.message);
        }
    };
    reader.readAsText(file);
}
```

- [ ] **Тестирование**
  - [ ] Очистим canvas
  - [ ] Загружаем сохраненный schema.json
  - [ ] Восстановились изображения?
  - [ ] На тех же позициях?
  - [ ] НЕ требуется редактирование bindings

#### ЗАДАЧА 3.4: Новый метод `loadBindings()`

- [ ] **Метод**

```javascript
loadBindings(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const bindings = JSON.parse(e.target.result);
            
            // Проверка совместимости!
            if (bindings.schemaId !== this.currentSchemaId ||
                bindings.schemaVersion !== this.currentSchemaVersion) {
                alert('Привязки не совместимы с текущей структурой!');
                return;
            }
            
            this.applyBindings(bindings.bindings);
            alert(`Привязки для ${bindings.machineId} загружены!`);
        } catch(e) {
            console.error('Ошибка:', e);
            alert('Ошибка при загружке привязок: ' + e.message);
        }
    };
    reader.readAsText(file);
}
```

- [ ] **Тестирование**
  - [ ] Сначала загружаем schema
  - [ ] Потом загружаем bindings-machine-A.json
  - [ ] Отображаются поле bindings?
  - [ ] Попытаемся загружить bindings несовместимого schema → ошибка?

---

## ФАЗА 4: Обновление ImageManager для Base64

### Время: 1.5 часа

#### ЗАДАЧА 4.1: Новый метод `imageToBase64()`

- [ ] **Новый метод конвертации**

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

- [ ] **Тестирование**
  - [ ] Открыть console
  - [ ] Вызвать `imageManager.imageToBase64(img)`
  - [ ] Наличествуются Base64 строки?

#### ЗАДАЧА 4.2: Обновить `exportImages()`

- [ ] **Асинхронный метод**

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

- [ ] **Тестирование**
  - [ ] Удалить 2-3 изображения
  - [ ] `await imageManager.exportImages()`
  - [ ] Каждый объект имеет `data` с Base64?

#### ЗАДАЧА 4.3: Обновить `importImages()`

- [ ] **Декодируем Base64**

```javascript
importImages(imagesData) {
    imagesData.forEach(data => {
        const img = new Image();
        img.onload = () => {
            this.addImage(img, data.x, data.y, data.id);
        };
        img.onerror = () => {
            console.error(`Ошибка загрузки Base64 для ${data.id}`);
        };
        img.src = data.data;  // ← Base64!
    });
}
```

- [ ] **Тестирование**
  - [ ] Сохранить схему с изображениями
  - [ ] Очистим canvas
  - [ ] Загружаем JSON
  - [ ] Восстановились все изображения?
  - [ ] На тех же координатах?
  - [ ] С тем же масштабом?

---

## ФАЗА 5: Общее тестирование

### Время: 2 часа

#### ЗАДАЧА 5.1: Функциональные тесты

- [ ] **Сценарий 1: Одна схема + несколько привязок**
  - [ ] Нрисовать схему с 3 элементами
  - [ ] Сохранить структуру (schema-X.json)
  - [ ] Сохранить привязки для machine-A (bindings-X-machine-A.json)
  - [ ] Сохранить привязки для machine-B (bindings-X-machine-B.json)
  - [ ] Очистить canvas
  - [ ] Загружить schema-X.json
  - [ ] Файлы bindings имеют те же schemaId и version?
  - [ ] Можно работать с любыми bindings для этой схемы?

- [ ] **Сценарий 2: Несовместимые привязки**
  - [ ] Загружить schema-A.json
  - [ ] Попытаться загрузить bindings-B-machine-1.json
  - [ ] Отображается ошибка?

- [ ] **Сценарий 3: Много изображений**
  - [ ] Добавить 10+ изображений
  - [ ] Сохранить - выполняются < 2 сек?
  - [ ] На панели данные алерт?
  - [ ] При загружке - выполняются < 2 сек?

#### ЗАДАЧА 5.2: Граничные случаи

- [ ] **Пустая схема**
  - [ ] Не добавлять изображения
  - [ ] Сохранить структуру - нормально?
  - [ ] Загружить - нормально?

- [ ] **Поврежденный JSON**
  - [ ] Открыть JSON в редакторе
  - [ ] Удалить строки
  - [ ] Гружить - ошибка?

#### ЗАДАЧА 5.3: Консоль очистка

- [ ] **DevTools > Console**
  - [ ] Нет ошибок при сохранении?
  - [ ] Нет ошибок при загружке?
  - [ ] Нет Warning'ов?

---

## ПОЛНАЯ ПОЛВЕРКА ОКОНЧАНИЯ

### Обязательные критерии

- [ ] `fileManager.saveScheme()` экспортирует только структуру без привязок
- [ ] `fileManager.saveBindings()` экспортирует привязки с ссылкой на schema
- [ ] Бази совместимости (schemaId + версия) работают
- [ ] ImageManager полностью поддерживает Base64
- [ ] Кнопки делиться на две группы
- [ ] Три дискетки не смешаны в однем JSON
- [ ] Нет ошибок в console

### Оптимальные критерии

- [ ] Алерты при выполнении операций
- [ ] Нормальные названия файлов (с schemaId и machineId)
- [ ] Валидация совместимости при загружке

---

**НОТА**: Отмечай ✅ каждую завершенную таску!
