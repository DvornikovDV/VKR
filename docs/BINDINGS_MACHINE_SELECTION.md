# Механика Привязки к Определённой Машине

**Версия**: 1.0  
**Дата**: 02.02.2026  
**Статус**: Планирование

---

## Суть Механики

### Принцип

**Одна схема = Одна машина одновременно**

Каждый оператор/администратор выбирает машину В НАЧАЛЕ сессии, а затем:
- Видит ОПОЛЬКО гетами этой машины
- Назначает МАРКЕРОВ ТОЛЬКО из этой машины
- Хранит привязки в bindings-schema-machine-X.json

### Почему это нужно

1. **Безопасность**: Оператор A не может случайно управлять машиной B
2. **Освяй: Нет лишних маркеров других машин
3. **Простота**: Не нужно в каждой привязке указывать навание устройства

### Файлы

```
schema-boiler-system-v1.0.json
├─ schemaId: "boiler-system"
├─ version: "1.0"
├─ images: [...]
└─ elements: [...]

Все:
  bindings-boiler-system-machine-A.json
  ├─ schemaId: "boiler-system"
  ├─ machineId: "machine-A"          ← ВЫБРАНО!
  ├─ bindings: [{elementId: "el1", tag: "tempSensor_A"}]
  └─ timestamp
  
  bindings-boiler-system-machine-B.json
  ├─ schemaId: "boiler-system"       (та же схема!)
  ├─ machineId: "machine-B"          ← ВЫБРАНО!
  ├─ bindings: [{elementId: "el1", tag: "tempSensor_B"}]  ← другие маркеры
  └─ timestamp
```

---

## Настройка Привязки: Запрос Устройств

```
Цикл:

1. Admin/Operator открывает редактор
   |
2. Загружена schema-boiler-system.json
   |
3. Кнопка для выбора машины
   |
4. "Выберите машину: [machine-A ]"
   |
5. API запрос: GET /api/machines/machine-A/devices
   Возвращает: ["tempSensor_A_main", "pump_A_control", "pressure_A_valve"]
   |
6. Программа показывает доступные устройства в интерфейсе
   |
7. Admin настраивает привязки ТОЛЬКО для machine-A
   |
8. Хранит bindings-boiler-system-machine-A.json
   |
9. Operator machine-A загружает этот файл
   видит свои маркеры (температура, насос т.д.)
```

### Валидация на 4 Уровнях

| Уровень | Основание | Код |
|----------|-----------|------|
| **1** | Машина выбрана? | `if (!selectedMachineId) alert(...)` |
| **2** | Маркер из этой машины? | `if (!availableDevices.includes(tag)) alert(...)` |
| **3** | Смена машины - сбросить ли? | `confirm("Привязки сбросятся")` |
| **4** | При загружке: bindings.machineId == selectedMachineId? | `if (mismatch) switchMachine()` |

---

## ФАЗЫ РЕАЛИЗАЦИИ

### Фаза A: UI - допдаун выбора машины (1ч)

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

- [ ] Кнопка в интерфейсе
- [ ] Button "Confirm" выводит выбранное значение
- [ ] Панель устройств скрыта в начале

### Фаза B: BindingsManager - свойства и методы (1.5ч)

**Цель**: добавить в `public/bindings-manager.js` (новый класс)

```javascript
class BindingsManager {
    constructor() {
        this.selectedMachineId = null;
        this.availableDevices = [];  // маркеры выбранной машины
        this.bindings = [];           // содержимое {elementId, deviceTag}
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
        // Возвращает: ["tag1", "tag2", ...]
    }
    
    canAssignDevice(deviceTag) {
        if (!this.selectedMachineId) return false;  // Машина не выбрана
        return this.availableDevices.includes(deviceTag);  // Маркер совпадает
    }
    
    assignDeviceToElement(elementId, deviceTag) {
        if (!this.canAssignDevice(deviceTag)) {
            alert(`"${deviceTag}" не то машины ${this.selectedMachineId}!`);
            return false;
        }
        this.bindings.push({elementId, deviceTag});
        return true;
    }
}
```

- [ ] Объявлены свойства
- [ ] Написан `selectMachine()`
- [ ] Написан `canAssignDevice()`
- [ ] Написан `assignDeviceToElement()` с валидацией

### Фаза C: Обработчики UI (1ч)

**Цель**: связать кнопка и панель с BindingsManager

```javascript
// При выборе машины
document.getElementById('confirm-machine-btn').addEventListener('click', async () => {
    const machineId = document.getElementById('machine-select').value;
    if (bindingsManager.selectMachine(machineId)) {
        // Показать устройства
        updateDevicesList(bindingsManager.availableDevices);
        document.getElementById('devices-panel').style.display = 'block';
        document.getElementById('current-machine').textContent = machineId;
    }
});
```

- [ ] Обработчик на кнопку
- [ ] При нажатии Confirm: вызвать `selectMachine()`
- [ ] Показывать/скрывать панель устройств

### Фаза D: Привязка элементов - валидация (1.5ч)

**Цель**: когда админ назначает маркер элементу - проверять

```javascript
// При попытке назначить маркер элементу
function assignTag(elementId, deviceTag) {
    // Валидация Уровень 1: машина выбрана?
    if (!bindingsManager.selectedMachineId) {
        alert('Сначала выберите машину!');
        return;
    }
    
    // Валидация Уровень 2: маркер для этой машины?
    if (!bindingsManager.canAssignDevice(deviceTag)) {
        alert(`Предупреждение: "${deviceTag}" не для ${bindingsManager.selectedMachineId}`);
        return;
    }
    
    bindingsManager.assignDeviceToElement(elementId, deviceTag);
}
```

- [ ] Проверить выбор машины (Уровень 1)
- [ ] Проверить принадлежность маркера (Уровень 2)
- [ ] Останавливать присвоение если валидация не пройдена

### Фаза E: Хранение - машина авто (0.5ч)

**Цель**: machineId автоматически добавляется в bindings.json

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

- [ ] machineId берется из BindingsManager
- [ ] Не нужно пытаться вводить оператором

### Фаза F: Загружка - проверка машины (1ч)

**Цель**: Когда загружаем bindings - убедиться что машина совпадает

```javascript
// В FileManager.loadBindings()
if (bindings.machineId !== bindingsManager.selectedMachineId) {
    const msg = `bindings для "${bindings.machineId}", ` +
                `а выбрана "${bindingsManager.selectedMachineId}". Переключить?`;
    if (!confirm(msg)) return;
    
    // Переключить
    bindingsManager.selectMachine(bindings.machineId);
}

// Показать
bindingsManager.bindings = bindings.bindings;
```

- [ ] Проверить machineId из файла vs выбранная
- [ ] Если разные - спросить
- [ ] Переключить машину если оператор согласен

---

## ТЕСТИРОВАНИЕ всех фаз (1.5ч)

### Сценарий 1: Основной

- [ ] Загружена schema-boiler-system.json
- [ ] Кнопка: выбрать "machine-A"
- [ ] Confirm - показалась панель для machine-A
- [ ] Настроить привязки только для A
- [ ] Хранить - машина = machine-A в файле
- [ ] Очистить панель
- [ ] Кнопка: выбрать "machine-B"
- [ ] Настроить привязки для B в той же схеме
- [ ] Хранить - машина = machine-B

### Сценарий 2: Валидация

- [ ] Настройка machine-A
- [ ] Попытка назначить маркер от machine-B - ошибка?
- [ ] Попытка сменить машину с несохранёнными привязками - confirm?
- [ ] Попытка загрузить bindings несовместимой машины - confirm и переключение?

---

## КОНТЕКСТ

**Связь с другими доками**:
- Фазы A-B-C-D-E-F работают ПАРАЛЛЕЛЬНО с Фазами 1-5 из ITERATION_SAVE_LOAD_PLAN.md
- Основные валидации остаются те же (Фаза 2 из ITERATION_SAVE_LOAD_PLAN)

**Точка выполнения**: При работе над Фазой 2 документа ITERATION_SAVE_LOAD_PLAN.md одновременно реализовать Фазы A-E.
