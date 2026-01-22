# План реализации виджетов (интерактивных элементов)

**Версия**: 1.0  
**Дата**: 22.01.2026  
**Статус**: Design Document  

---

## 1. СПОСОБ ДОБАВЛЕНИЯ ВИДЖЕТОВ

### Выбранный вариант: Выпадающее меню в toolbar

```
Toolbar
├── [Файл] [Вид] [Помощь]
├── [+ Добавить] ▼
│   ├── Изображение
│   ├── Виджет ▼
│   │   ├── Переключатель (toggle)
│   │   ├── Кнопка (button)
│   │   ├── Индикатор (led)
│   │   ├── Числовой дисплей (number-display)
│   │   ├── Текстовый дисплей (text-display)
│   │   ├── Ползунок (slider)
│   │   └── Линейный индикатор (gauge)
│   └── Точка соединения
```

**Преимущества:**
- Логично расположено с остальными действиями
- Не занимает место на интерфейсе
- Интуитивно понятно
- Единое место для всех добавлений

**Workflow:**
1. Клик на "Виджет" → выбрать тип
2. Система просит выбрать изображение: "На каком изображении создать?"
3. Виджет появляется в центре выбранного изображения
4. Виджет автоматически выбран → панель свойств открыта
5. Пользователь может сразу менять позицию, размер, привязку

**Реализация:**

```javascript
// ui-controller.js
setupToolbar() {
  const addMenu = document.getElementById('add-menu');
  
  addMenu.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'add-widget') {
      const widgetType = e.target.dataset.widgetType;
      this.promptSelectImage(widgetType);  // диалог выбора изображения
    }
  });
}

prompSelectImage(widgetType) {
  // Диалог: выбери изображение для виджета
  // После выбора → createWidgetOnImage(image, widgetType)
}

createWidgetOnImage(image, widgetType) {
  // 1. Создать виджет в центре изображения
  const widget = widgetManager.create({
    type: widgetType,
    imageId: image.id,
    x: image.x + image.width / 2,
    y: image.y + image.height / 2,
    width: 80,
    height: 30
  });
  
  // 2. Виджет автоматически выбран
  selectionManager.select(widget);
  
  // 3. Панель свойств показывает его
  propertiesPanel.show(widget);
}
```

---

## 2. ДРАГИРОВАНИЕ ВИДЖЕТОВ В ПРЕДЕЛАХ ИЗОБРАЖЕНИЯ

**СТАТУС: УТВЕРЖДЕНО ✓**

Виджеты можно перемещать только внутри границ изображения, на котором они размещены.

### Реализация ограничения

```javascript
// widget-manager.js - при тяге виджета
onWidgetDragMove(widget, deltaX, deltaY) {
  const image = imageManager.getImageById(widget.imageId);
  
  // Новая позиция
  let newX = widget.x + deltaX;
  let newY = widget.y + deltaY;
  
  // Граница снизу
  if (newY + widget.height > image.y + image.height) {
    newY = image.y + image.height - widget.height;
  }
  
  // Граница сверху
  if (newY < image.y) {
    newY = image.y;
  }
  
  // Граница справа
  if (newX + widget.width > image.x + image.width) {
    newX = image.x + image.width - widget.width;
  }
  
  // Граница слева
  if (newX < image.x) {
    newX = image.x;
  }
  
  widget.x = newX;
  widget.y = newY;
  widget.konvaShape.x(newX);
  widget.konvaShape.y(newY);
  layer.draw();
}
```

### При перемещении изображения

Все виджеты этого изображения двигаются вместе с ним:

```javascript
// При перемещении изображения
onImageMove(image, deltaX, deltaY) {
  // ... обновить изображение ...
  
  // Обновить все виджеты этого изображения
  widgetManager.getWidgetsByImageId(image.id).forEach(widget => {
    widget.x += deltaX;
    widget.y += deltaY;
    widget.konvaShape.x(widget.x);
    widget.konvaShape.y(widget.y);
  });
}
```

---

## 3. СВОЙСТВА ВИДЖЕТОВ - ПРИВЯЗКА К УСТРОЙСТВАМ

**СТАТУС: УТВЕРЖДЕНО ✓**

Привязка осуществляется в панели свойств через выпадающий список.

### Макет панели свойств

```
┌─────────────────────────────────────┐
│     СВОЙСТВА ВИДЖЕТА                │
├─────────────────────────────────────┤
│ ▼ Общие                             │
│   ID: widget_temp_1                 │
│   Тип: Числовой дисплей             │
│   На изображении: Насос (img_pump_1)│
│                                     │
│ ▼ Позиция и размер                  │
│   X: [150]  Y: [50]                │
│   Ширина: [80]  Высота: [30]       │
│                                     │
│ ▼ Оформление                        │
│   Размер шрифта: [14] px           │
│   Цвет текста: [#000000]           │
│   Выравнивание: [центр ▼]          │
│                                     │
│ ▼ Привязка устройства               │
│   ┌──────────────────────────────┐ │
│   │ greenhouse_01.sensors.temp ▼│ │
│   └──────────────────────────────┘ │
│   ├─ (не привязано)                 │
│   ├─ greenhouse_01.sensors.temp     │
│   ├─ greenhouse_01.sensors.humidity │
│   ├─ greenhouse_01.devices.pump     │
│   └─ greenhouse_02.sensors.temp     │
│                                     │
│   Метаданные устройства:            │
│   (отображаются read-only)          │
│   ├─ Единица: °C                    │
│   ├─ Диапазон: -10 до 50°C         │
│   ├─ Описание: Датчик в теплице №1  │
│   └─ Последнее значение: 23.5       │
│                                     │
│ ▼ Дополнительно                     │
│   Обновление: [500ms ▼]            │
│   Формат: [0.0 ▼]                  │
│                                     │
└─────────────────────────────────────┘
```

### Реализация выпадающего списка

```javascript
// properties-panel.js
showBindingSection(widget) {
  // Получить список всех доступных устройств
  const devices = this.getAvailableDevices();
  
  const bindingDropdown = `
    <div class="binding-section">
      <label>Привязка устройства:</label>
      <select id="device-binding" onchange="onDeviceSelected(event)">
        <option value="">-- не привязано --</option>
        ${devices.map(device => `
          <option value="${device.id}" 
                  ${widget.bindingId === device.id ? 'selected' : ''}>
            ${device.name}
          </option>
        `).join('')}
      </select>
      
      ${widget.bindingId ? `
        <div class="metadata-display">
          <h6>Метаданные:</h6>
          <p>Единица: <strong>${getDeviceMetadata(widget.bindingId).unit}</strong></p>
          <p>Диапазон: <strong>${getDeviceMetadata(widget.bindingId).min} - ${getDeviceMetadata(widget.bindingId).max}</strong></p>
          <p>Описание: <strong>${getDeviceMetadata(widget.bindingId).description}</strong></p>
        </div>
      ` : ''}
    </div>
  `;
  
  return bindingDropdown;
}

onDeviceSelected(event) {
  const widget = selectionManager.getSelectedWidget();
  const deviceId = event.target.value;
  
  widget.bindingId = deviceId || null;
  
  // Сохранить изменение в bindings.json
  fileManager.updateWidgetBinding(widget.id, deviceId);
  
  // Обновить панель (показать метаданные)
  this.refresh();
}
```

### Структура метаданных в памяти

```javascript
// При загрузке devices-registry.json
const deviceMetadataCache = {
  "greenhouse_01.sensors.temperature": {
    name: "Теплица №1 - Температура",
    unit: "°C",
    min: -10,
    max: 50,
    description: "Датчик в теплице №1",
    type: "sensor"
  },
  "greenhouse_01.devices.pump": {
    name: "Теплица №1 - Помпа",
    unit: "",
    values: [0, 1],
    description: "Циркуляционный насос",
    type: "switch"
  }
};
```

---

## 4. КАК ФОРМИРОВАТЬ СПИСОК ДОСТУПНЫХ ID УСТРОЙСТВ

### Выбранный подход: Единый devices-registry.json

**Файл:** `backend/config/devices-registry.json`

Это единственный источник всех доступных устройств проекта. Содержит полную информацию об каждом устройстве.

```json
{
  "devices": [
    {
      "id": "greenhouse_01.sensors.temperature",
      "name": "Теплица №1 - Датчик температуры",
      "system": "greenhouse_01",
      "category": "sensors",
      "type": "temperature",
      "unit": "°C",
      "min": -10,
      "max": 50,
      "description": "Датчик в теплице №1",
      "mqttTopic": "greenhouse_01/sensors/temperature",
      "readOnly": true
    },
    {
      "id": "greenhouse_01.devices.pump",
      "name": "Теплица №1 - Помпа",
      "system": "greenhouse_01",
      "category": "devices",
      "type": "switch",
      "unit": "",
      "description": "Циркуляционный насос",
      "mqttTopic": "greenhouse_01/devices/pump",
      "readOnly": false,
      "onValue": 1,
      "offValue": 0
    },
    {
      "id": "greenhouse_02.sensors.temperature",
      "name": "Теплица №2 - Датчик температуры",
      "system": "greenhouse_02",
      "category": "sensors",
      "type": "temperature",
      "unit": "°C",
      "min": -10,
      "max": 50,
      "description": "Датчик в теплице №2",
      "mqttTopic": "greenhouse_02/sensors/temperature",
      "readOnly": true
    }
  ]
}
```

### Как это работает в редакторе

```javascript
// ui-controller.js - при загрузке редактора
async loadAvailableDevices() {
  // Загрузить с backend'а
  const response = await fetch('/api/devices-registry');
  const registry = await response.json();
  
  this.deviceRegistry = registry.devices;
  
  // Сохранить локально для работы
  localStorage.setItem('device-registry', JSON.stringify(registry));
}

// properties-panel.js
getAvailableDevices() {
  // Вернуть из глобального реестра
  return this.deviceRegistry || JSON.parse(localStorage.getItem('device-registry'));
}
```

### Преимущества этого подхода

1. **Единый источник истины** - все устройства в одном месте
2. **Переносимость** - одна схема на разных системах с разными привязками
3. **Версионирование** - devices-registry.json в git
4. **Легко обновлять** - добавил новое устройство → все схемы его видят
5. **Независимость от схем** - реестр не зависит от конкретной схемы

---

## 5. АРХИТЕКТУРА БЭКЭНДА - ГДЕ ЧТО ХРАНИТЬ

### Структура папок

```
backend/
├── config/
│   └── devices-registry.json
│       └── Все доступные устройства проекта (единый источник)
│
├── schemas/
│   ├── greenhouse.json
│   ├── water_supply.json
│   └── power_distribution.json
│       └── Структуры схем (переносимые, в git)
│
└── installations/
    ├── farm_alpha/
    │   ├── greenhouse_01_bindings.json
    │   ├── greenhouse_02_bindings.json
    │   ├── water_supply_bindings.json
    │   └── mqtt_config.json
    │
    ├── farm_beta/
    │   ├── greenhouse_01_bindings.json
    │   ├── water_supply_bindings.json
    │   └── mqtt_config.json
    │
    └── test_bench/
        ├── greenhouse_01_bindings.json
        └── mqtt_config.json
```

### Что где хранится

| Файл | Где | Что | Кто создаёт | Git |
|------|-----|-----|-------------|-----|
| **devices-registry.json** | backend/config/ | Все доступные устройства проекта (метаданные) | Admin/Интегратор | ✅ ДА |
| **schema.json** | backend/schemas/ | Структура схемы (виджеты, изображения, соединения) | Инженер в редакторе | ✅ ДА |
| **bindings.json** | backend/installations/{farm}/ | Привязка элементов к конкретным MQTT топикам | Инженер в редакторе (экспорт) | ❌ НЕТ |
| **mqtt_config.json** | backend/installations/{farm}/ | MQTT адреса конкретной фермы, пароли, пользователи | Admin | ❌ НЕТ |

### Пример workflow'а

**День 1: Инженер в редакторе**

```
1. Создаёт schema_greenhouse.json (структура)
2. Выбирает виджеты из devices-registry.json (который дал admin)
3. Привязывает виджеты к ID устройств
4. Экспортирует:
   - schema_greenhouse.json (в git)
   - bindings_farm_alpha.json (отправляет на конкретную ферму)
```

**День 2: Admin развёртывает**

```
1. Копирует schema_greenhouse.json в backend/schemas/
2. Копирует bindings_farm_alpha.json в backend/installations/farm_alpha/
3. Создаёт mqtt_config.json для farm_alpha с адресом брокера
4. Backend загружает всё и подписывается на MQTT топики
```

**День 3: Другая ферма**

```
1. Копирует ТУ ЖЕ schema_greenhouse.json
2. Но создаёт НОВЫЙ bindings_farm_beta.json с другими MQTT топиками
3. Создаёт mqtt_config.json для farm_beta
4. Backend одновременно работает с обеими фермами
```

### Backend API endpoints

```javascript
// server.js
app.get('/api/devices-registry', (req, res) => {
  // Вернуть devices-registry.json
  res.json(require('./config/devices-registry.json'));
});

app.get('/api/schemas/:schemaId', (req, res) => {
  // Вернуть структуру схемы
  const schema = require(`./schemas/${req.params.schemaId}.json`);
  res.json(schema);
});

app.get('/api/installations/:installationId/bindings', (req, res) => {
  // Вернуть привязки для конкретной установки
  const bindings = require(`./installations/${req.params.installationId}/bindings.json`);
  res.json(bindings);
});

app.get('/api/installations/:installationId/mqtt-config', (req, res) => {
  // Вернуть MQTT конфиг (только admin может запрашивать)
  const config = require(`./installations/${req.params.installationId}/mqtt_config.json`);
  res.json(config);
});
```

### Инициализация backend'а при запуске

```javascript
// backend/server.js
class BackendServer {
  constructor() {
    this.deviceRegistry = this.loadDeviceRegistry();
    this.installedSystems = this.loadInstalledSystems();
  }
  
  loadDeviceRegistry() {
    return require('./config/devices-registry.json');
  }
  
  loadInstalledSystems() {
    // Для каждой папки в installations/
    // загрузить schema, bindings, mqtt_config
    const systems = {};
    
    fs.readdirSync('./installations').forEach(farmDir => {
      const bindings = require(`./installations/${farmDir}/bindings.json`);
      const mqttConfig = require(`./installations/${farmDir}/mqtt_config.json`);
      
      systems[farmDir] = {
        bindings,
        mqttConfig,
        mqttClient: this.createMqttClient(mqttConfig, farmDir)
      };
    });
    
    return systems;
  }
  
  createMqttClient(config, farmId) {
    const client = mqtt.connect(config.brokerUrl, {
      username: config.username,
      password: config.password
    });
    
    // Подписаться на все теги из bindings
    const tags = this.installedSystems[farmId].bindings
      .map(b => b.mqttTopic);
    
    tags.forEach(topic => client.subscribe(topic));
    
    return client;
  }
}
```

---

## 6. ВАЖНЫЕ МОМЕНТЫ, КОТОРЫЕ ЛЕГКО ЗАБЫТЬ

### 1. ⚠️ МАСШТАБИРОВАНИЕ ВИДЖЕТОВ ПРИ РЕСАЙЗЕ ИЗОБРАЖЕНИЯ

Если пользователь изменит размер изображения, виджеты должны масштабироваться вместе с ним.

**Проблема:**
```
Было:
  Изображение: 100x100
  Виджет: x=50, y=50 (центр)

Пользователь ресайзил до 200x200:
  Виджет всё ещё в (50, 50) - теперь в углу!
```

**Решение: Сохранять относительные позиции**

```javascript
// При создании виджета
widget.relativeX = (widget.x - image.x) / image.width;
widget.relativeY = (widget.y - image.y) / image.height;

// При ресайзе изображения
onImageResize(image, newWidth, newHeight) {
  // Обновить позиции всех виджетов
  widgetManager.getWidgetsByImageId(image.id).forEach(widget => {
    widget.x = image.x + widget.relativeX * newWidth;
    widget.y = image.y + widget.relativeY * newHeight;
    widget.konvaShape.x(widget.x);
    widget.konvaShape.y(widget.y);
  });
}
```

### 2. ⚠️ ВИДИМОСТЬ ВИДЖЕТОВ

Виджеты могут оказаться "за" изображением если оно имеет прозрачность.

**Решение: Слой виджетов всегда выше слоя изображений**

```javascript
// canvas-manager.js - порядок слоев
setupLayers() {
  this.layerImages = new Konva.Layer();
  this.layerConnections = new Konva.Layer();
  this.layerWidgets = new Konva.Layer();        // выше
  this.layerHandles = new Konva.Layer();
  
  // Добавить в правом порядке
  this.stage.add(this.layerImages);
  this.stage.add(this.layerConnections);
  this.stage.add(this.layerWidgets);           // ВЫШЕ
  this.stage.add(this.layerHandles);
}
```

### 3. ⚠️ СИНХРОНИЗАЦИЯ МЕЖДУ schema.json И bindings.json

Если инженер добавил виджет, но забыл привязать - получится ошибка на backend'е.

**Решение: Валидация при сохранении**

```javascript
// file-manager.js
async saveScheme() {
  const schema = this.gatherSchemaData();
  const bindings = this.gatherBindingsData();
  
  // Валидация: привязка указывает на существующее устройство?
  bindings.bindings.forEach(binding => {
    const deviceExists = deviceRegistry.devices.find(d => d.id === binding.tagId);
    
    if (!deviceExists) {
      throw new Error(`❌ Устройство ${binding.tagId} не найдено в реестре`);
    }
  });
  
  // Сохранить оба файла
  await this.saveFile('schema.json', schema);
  await this.saveFile('bindings.json', bindings);
}
```

### 4. ⚠️ УДАЛЕНИЕ ВИДЖЕТА - МЕРТВЫЕ ПРИВЯЗКИ

Если пользователь удалил виджет, привязка остаётся в bindings.json.

**Решение: Очистить мертвые привязки при сохранении**

```javascript
// file-manager.js
cleanupDeadBindings() {
  const schema = this.gatherSchemaData();
  const bindings = this.gatherBindingsData();
  
  // Найти привязки на несуществующие виджеты
  bindings.bindings = bindings.bindings.filter(binding => {
    const widgetExists = schema.widgets.find(w => w.id === binding.elementId);
    
    if (!widgetExists) {
      console.warn(`🗑️ Удаляю мертвую привязку ${binding.elementId}`);
      return false;
    }
    return true;
  });
  
  return bindings;
}
```

### 5. ⚠️ ТИП ВИДЖЕТА ВЛИЯЕТ НА ПРИВЯЗКУ

Датчик (sensor) - read-only, кнопка (button) - write-only.

**Решение: Валидация типов совместимости**

```javascript
// Датчик не может быть кнопкой
const widget = { type: 'number-display', bindingId: 'pump.status' };
const device = deviceRegistry.find(d => d.id === 'pump.status');

const typesCompatible = {
  'number-display': ['sensor'],
  'text-display': ['sensor'],
  'led': ['sensor'],
  'toggle': ['switch'],
  'button': ['switch', 'command']
};

if (!typesCompatible[widget.type].includes(device.type)) {
  throw new Error(`❌ Виджет ${widget.type} несовместим с ${device.type}`);
}
```

### 6. ⚠️ СОХРАНЕНИЕ КООРДИНАТ ОТНОСИТЕЛЬНО ИЗОБРАЖЕНИЯ

Координаты виджета должны быть относительно изображения, не абсолютные.

```javascript
// schema.json
{
  "widgets": [
    {
      "id": "widget_temp_1",
      "imageId": "img_pump_1",
      "relativeX": 0.5,           // 50% от ширины изображения
      "relativeY": 0.8,           // 80% от высоты
      "width": 80,
      "height": 30,
      "type": "number-display"
    }
  ]
}

// При загрузке:
const image = imageManager.getImage(widget.imageId);
widget.x = image.x + widget.relativeX * image.width;
widget.y = image.y + widget.relativeY * image.height;
```

### 7. ⚠️ ДУБЛИРОВАНИЕ СХЕМ - ПЕРЕИМАГОВКА ID

Если скопировать схему, ID виджетов будут одинаковые!

**Решение: Переимаговка ID при дублировании**

```javascript
duplicateSchema(schemaId) {
  const original = loadSchema(schemaId);
  const copy = JSON.parse(JSON.stringify(original));
  
  // Переимаговать все ID
  const idMap = {};
  
  copy.widgets.forEach(widget => {
    const oldId = widget.id;
    widget.id = 'widget_' + generateUniqueId();
    idMap[oldId] = widget.id;
  });
  
  // Обновить привязки на новые ID
  const copyBindings = loadBindings(schemaId);
  copyBindings.bindings.forEach(binding => {
    binding.elementId = idMap[binding.elementId];
  });
  
  saveSchema(copy);
  saveBindings(copyBindings);
}
```

### 8. ⚠️ МОЖЕТ ЛИ ВИДЖЕТ НЕ ИМЕТЬ ПРИВЯЗКИ

Например, статический текстовый лейбл без данных?

**Решение: Опциональная привязка**

```javascript
// bindingId может быть null
widget.bindingId = null;  // OK, это просто статический лейбл

// При сохранении в bindings.json
// Пропускаем виджеты без привязки
bindings.bindings = bindings.bindings.filter(b => b.tagId);
```

### 9. ⚠️ ВЕРСИОНИРОВАНИЕ ФАЙЛОВ

Что если старый bindings.json не совместим с новой schema.json?

**Решение: Добавить версионирование**

```json
{
  "schemaId": "schema_greenhouse",
  "schemaVersion": "1.0",          // версия схемы
  "bindingsVersion": "1.0",         // версия формата привязок
  "createdAt": "2026-01-22T13:00:00Z"
}
```

### 10. ⚠️ ТАБЛИЦА СОВМЕСТИМОСТИ ВИДЖЕТОВ

Нужна документация какие виджеты к каким устройствам привязывать.

| Виджет | Тип устройства | Read/Write | Примеры |
|--------|----------------|-----------|----------|
| number-display | sensor | R | Температура, влажность |
| text-display | sensor | R | Статус, имя устройства |
| led | sensor (boolean) | R | Включен/выключен |
| toggle | switch | RW | Насос, клапан |
| button | command | W | Перезагрузка, сброс |
| gauge | sensor (numeric) | R | Давление, уровень |
| slider | control (numeric) | RW | Регулировка мощности |

---

## 7. ИТОГОВАЯ АРХИТЕКТУРА

### Редактор

```
Toolbar: [+ Добавить] → Выбрать тип виджета → Выбрать изображение
             ↓
         Создан виджет на изображении (стартовая позиция)
             ↓
       Виджет автоматически выбран
             ↓
    Панель свойств (справа) показывает:
    - Позиция/размер
    - Оформление
    - Привязка к устройству (dropdown из devices-registry.json)
    - Метаданные устройства (read-only)
             ↓
    Пользователь может:
    - Драгить виджет в пределах изображения
    - Менять размер
    - Выбрать устройство из dropdown
             ↓
         При сохранении:
         - schema.json (структура)
         - bindings.json (привязки)
```

### Backend

```
config/devices-registry.json
    ↑
    ├── Загружается при старте
    ├── Раздается редактору через API
    └── Используется для валидации привязок

schemas/{schema_name}.json
    ├── Загружается при старте
    └── Используется Dashboard'ом

installations/{farm_name}/
    ├── bindings.json (какие виджеты к каким тегам)
    ├── mqtt_config.json (адреса MQTT брокера, пароли)
    └── MQTT подписка на все теги из bindings

WebSocket
    └── Отправляет live данные в Dashboard
```

### Файловая система (git-friendly)

```
backend/
├── config/
│   └── devices-registry.json    ✅ В git (переносимая)
├── schemas/
│   ├── greenhouse.json          ✅ В git (переносимая)
│   └── water_supply.json        ✅ В git (переносимая)
└── installations/
    ├── farm_alpha/
    │   ├── bindings.json        ❌ НЕ в git (специфично для фермы)
    │   └── mqtt_config.json     ❌ НЕ в git (пароли!)
    └── farm_beta/
        ├── bindings.json        ❌ НЕ в git
        └── mqtt_config.json     ❌ НЕ в git
```

---

## 8. ПЛАН РЕАЛИЗАЦИИ ПО НЕДЕЛЯМ

### Неделя 1: Основы виджетов
- [ ] WidgetManager класс (создание, удаление, редактирование)
- [ ] Интеграция в UIController (toolbar + диалог выбора изображения)
- [ ] Панель свойств для виджетов
- [ ] Ограничение драга в пределах изображения
- [ ] Синхронизация с перемещением изображения

### Неделя 2: Привязка к устройствам
- [ ] Backend: devices-registry.json
- [ ] API endpoint для получения реестра
- [ ] Выпадающий список в панели свойств
- [ ] Загрузка метаданных при выборе
- [ ] Отображение метаданных read-only

### Неделя 3: Сохранение
- [ ] Сохранение schema.json + bindings.json
- [ ] Валидация при сохранении
- [ ] Загрузка обоих файлов при открытии
- [ ] Очистка мертвых привязок

### Неделя 4: Финализация
- [ ] Экспорт/импорт
- [ ] Интеграция с существующей FileManager
- [ ] Тестирование всех сценариев
- [ ] Документирование

---

## SUMMARY

✅ Toolbar для добавления виджетов (выбор типа + изображения)  
✅ Драг в пределах изображения (с граничными проверками)  
✅ Привязка в панели свойств (dropdown из devices-registry.json)  
✅ Метаданные read-only в свойствах  
✅ Раздельное хранение schema.json + bindings.json  
✅ Backend хранит devices-registry.json, schemas/, installations/  

**Не забыть:**
- Относительные координаты при ресайзе изображения
- Слой виджетов выше слоя изображений
- Очистка мертвых привязок при удалении
- Валидация типов совместимости
- Версионирование файлов
- Масштабирование при ресайзе
