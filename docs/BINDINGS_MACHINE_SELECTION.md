# Механика Привязки к Машине

**Версия**: 1.0  
**Дата**: 02.02.2026  
**Статус**: Планирование

---

## Суть Механики

### Принцип

**Одна схема = Одна машина одновременно**

Каждый оператор/админ выбирает машину В НАЧАЛЕ сессии, а затем:
- Видит НОВЫЕ элементы только этой машины
- Назначает тэги ОНЛИ из этой машины
- Сохраняет привязки в bindings-schema-machine-X.json

### Почему это нужно

1. **Обезопасность**: Оператор A не может случайно управлять машиной B
2. **UX**: Нет лишних тэгов других машин
3. **Простота**: Не нужно в каждй привязке лавтия акакое устройство

### Файлы

```
schema-boiler-system-v1.0.json
├─ schemaId: "boiler-system"
├─ version: "1.0"
├─ images: [...]
└─ elements: [...]

ЦЕН
blank: bindings-boiler-system-machine-A.json
├─ schemaId: "boiler-system"
├─ machineId: "machine-A"          ← ВЫБРАНО!
├─ bindings: [{elementId: "el1", tag: "tempSensor_A"}]
└─ timestamp

bindings-boiler-system-machine-B.json
├─ schemaId: "boiler-system"       (та же схема!)
├─ machineId: "machine-B"          ← ВЫБРАНО!
├─ bindings: [{elementId: "el1", tag: "tempSensor_B"}]  ← другие теги
└─ timestamp
```

---

## Настройка Обвязки: Запрос Элементов

```
Цикл:

1. Adminl/Operator открывает редактор
   |
2. Нагружена schema-boiler-system.json
   |
3. Dropdown для выбора машины
   |
4. "Выберите машину: [machine-A ]"
   |
5. API запрос: GET /api/machines/machine-A/devices
   Вернет: ["tempSensor_A_main", "pump_A_control", "pressure_A_valve"]
   |
6. Программа показывает авайлабль дивайсы в UI
   |
7. Admin настраивает привязки ОНЛИ для machine-A
   |
8. Сохраняет bindings-boiler-system-machine-A.json
   |
9. Оператор машины A загружает этот файл
   видит свои тэги (температура, насос т.d.)
```

### Валидация на 4 уровнях

| Уровень | Основание | Код |
|----------|-----------|------|
| **1** | Машина выбрана? | `if (!selectedMachineId) alert(...)` |
| **2** | Тэг из этой машины? | `if (!availableDevices.includes(tag)) alert(...)` |
| **3** | Смена машины - сбросить ли? | `confirm("Привязки сбросятся")` |
| **4** | При загрузке: bindings.machineId == selectedMachineId? | `if (mismatch) switchMachine()` |

---

## ФАЗЫ РЕАЛИЗАЦИИ

### Фаза A: UI - дропдаун выбора машины (1ч)

**Цель**: добавить на панель инструментов выбор машины

```html
<!-- В index.html -->
<div id="machine-selector">
    <label>Машина:</label>
    <select id="machine-select">
        <option value="">Выберите машину...</option>
        <option value="machine-A">Котел A</option>
        <option value="machine-B">Котел B</option>
    </select>
    <button id="confirm-machine-btn">Подтвердить</button>
</div>

<!-- Показывать после выбора -->
<div id="devices-panel" style="display:none">
    <h3>Устройства: <span id="current-machine"></span></h3>
    <ul id="devices-list"></ul>
</div>
```

- [ ] Дропдаун в UI
- [ ] Button "Confirm" выводит выборнное значение
- [ ] Попанел девайсес скрыта вначале

### Фаза B: BindingsManager - свойства и методы (1.5ч)

**Цель**: добавить в `public/bindings-manager.js` (?новый класс)

```javascript
class BindingsManager {
    constructor() {
        this.selectedMachineId = null;
        this.availableDevices = [];  // тяги выбранной машины
        this.bindings = [];           // контент {elementId, deviceTag}
    }
    
    selectMachine(machineId) {
        if (this.bindings.length > 0 && machineId !== this.selectedMachineId) {
            if (!confirm("Привязки сбросятся!")) return false;
            this.bindings = [];  // Очистить
        }
        
        this.selectedMachineId = machineId;
        this.availableDevices = await this.fetchDevices(machineId);  // API запрос
        return true;
    }
    
    async fetchDevices(machineId) {
        // GET /api/machines/{machineId}/devices
        // Вернет: ["tag1", "tag2", ...]
    }
    
    canAssignDevice(deviceTag) {
        if (!this.selectedMachineId) return false;  // Машина не выбрана
        return this.availableDevices.includes(deviceTag);  // Тэг истами
    }
    
    assignDeviceToElement(elementId, deviceTag) {
        if (!this.canAssignDevice(deviceTag)) {
            alert(`"${deviceTag}" не к машине ${this.selectedMachineId}!`);
            return false;
        }
        this.bindings.push({elementId, deviceTag});
        return true;
    }
}
```

- [ ] Объявлены свойства
- [ ] Реализован `selectMachine()`
- [ ] Реализован `canAssignDevice()`
- [ ] Реализован `assignDeviceToElement()` с валидацией

### Фаза C: Обработчики UI (1ч)

**Цель**: связать dropdown и девайс панель с BindingsManager

```javascript
// При выборе машины
document.getElementById('confirm-machine-btn').addEventListener('click', async () => {
    const machineId = document.getElementById('machine-select').value;
    if (bindingsManager.selectMachine(machineId)) {
        // Показать девайсы
        updateDevicesList(bindingsManager.availableDevices);
        document.getElementById('devices-panel').style.display = 'block';
        document.getElementById('current-machine').textContent = machineId;
    }
});
```

- [ ] Обработчик dropdown
- [ ] При нажатии Confirm: вызвать `selectMachine()`
- [ ] Показать/скрыть панель девайсес

### Фаза D: Привязка элементов - валидация (1.5ч)

**Цель**: когда админ назначает тэг элементу - проверять

```javascript
// При попытке назначить тэг элементу
function assignTag(elementId, deviceTag) {
    // Валидация Уровень 1: машина выбрана?
    if (!bindingsManager.selectedMachineId) {
        alert('Сначала выберите машину!');
        return;
    }
    
    // Валидация Уровень 2: тэг для этой машины?
    if (!bindingsManager.canAssignDevice(deviceTag)) {
        alert(`Острѕвка: "${deviceTag}" не для ${bindingsManager.selectedMachineId}`);
        return;
    }
    
    bindingsManager.assignDeviceToElement(elementId, deviceTag);
}
```

- [ ] Проверить выбор машины (Уровень 1)
- [ ] Проверить раличность тэга (Уровень 2)
- [ ] Останавливать ассайнмент если не прщла валидация

### Фаза E: Сохранение - машина авто (0.5ч)

**Цель**: machineId автоматически добавлятся в bindings.json

```javascript
// В FileManager.saveBindings()
if (!bindingsManager.selectedMachineId) {
    alert('Машина не выбрана!');
    return;
}

const bindings = {
    schemaId: this.currentSchemaId,
    schemaVersion: this.currentSchemaVersion,
    machineId: bindingsManager.selectedMachineId,  // ← АВТО!
    bindings: bindingsManager.bindings
};
```

- [ ] machineId параметр берётся из BindingsManager
- [ ] Не нужно попытся вводить оператором

### Фаза F: Загружка - проверка машины (1ч)

**Цель**: Когда загружаем bindings - убедиться что машина соответствует

```javascript
// В FileManager.loadBindings()
if (bindings.machineId !== bindingsManager.selectedMachineId) {
    const msg = `bindings для "${bindings.machineId}", ` +
                `а выбрана "${bindingsManager.selectedMachineId}". Переключить?`;
    if (!confirm(msg)) return;
    
    // Переключить
    bindingsManager.selectMachine(bindings.machineId);
}

// Применять
bindingsManager.bindings = bindings.bindings;
```

- [ ] Проверять machineId ис файла vs выбранная
- [ ] Если разные - спросить
- [ ] Переключить машину если оператор согласен

---

## Тестирование всех фаз (1.5ч)

### Сценарий 1: Основной

- [ ] Нагружена schema-boiler-system.json
- [ ] Dropdown: выбрать "machine-A"
- [ ] Confirm - показалась панель девайсес для machine-A
- [ ] Настроить привязки только для A
- [ ] Сохранить - машина = machine-A в файле
- [ ] Очистить панель
- [ ] Dropdown: выбрать "machine-B"
- [ ] Настроить привязки для B в той же схеме
- [ ] Сохранить - машина = machine-B

### Сценарий 2: Валидация

- [ ] Настройка machine-A
- [ ] Попытка назначить тэг от machine-B - ошибка?
- [ ] Попытка сменить машину с несохранёнными привязками - confirm?
- [ ] Попытка загружить bindings несовместимой машины - confirm и переключение?

---

## КОНТЭКСТ

**Связь с другими доками**:
- Фазы A-B-C-D-E-F работают ПАРАЛЛЕЛНО с Фазами 1-5 из ITERATION_SAVE_LOAD_PLAN.md
- Основные валидации остаемотся те же (Фаза 2 з ITERATION_SAVE_LOAD_PLAN)

**Точка выполнения**: Работая над Фазой 2 документа ITERATION_SAVE_LOAD_PLAN.md, одновременно реализовать Фазы A-E.
