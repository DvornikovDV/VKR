# Параллельная разработка: Привязки + Сохранение/Загрузка

**Версия**: 1.0  
**Назначение**: Для контекста нейросети (не для разработчика)

---

## Оптимальные итинерарии

```
Неделя 1:
  Mon ← Фаза 1: Проверка
  Tue-Wed ← Фаза 2 и Фазы A-B-D ПАРАЛЛЕЛЬНО
  Thu ← Фаза 3-4
  Fri ← Фаза 5 и Фазы E-F ПАРАЛЛЕЛЬНО
```

---

## ДОГОВОР: ПАРАЛЛЕЛЬНЫЕ ОСИ

### ОСИ 1: Сохранение/Загрузка (файлы schema + bindings)

**Минимальная структура**:
- Одна схема (schema.json) → несколько bindings-*.json
- JSON: schemaId, version, images (Base64), elements, connections
- bindings: schemaId, version, machineId, tags
- Валидация: schemaId + version должны совпадать

### ОСИ 2: Привязки к машине (выбор + валидация)

**Минимальная структура**:
- Выбор машины в начале сессии
- selectedMachineId запоминается в BindingsManager
- availableDevices = только теги этой машины
- Валидация: машина выбрана? тег из неё?

---

## УПОРЯДОЧЕННЫЕ ФАЗЫ

### ПРЕДУСЛОВИЕ: Фаза 1 (ОСИ 1)

**ФАЗА 1**: Проверка текущей реализации [ITERATION_SAVE_LOAD_PLAN - Фаза 1]
- Анализ file-manager.js
- Проверка UI кнопок
- Тестирование текущей функциональности

---

## ПАРАЛЛЕЛЬНОЕ: УТД 1 + УТД 2

### УТД 1: ОСИ 1 (Сохранение/Загрузка)

**ФАЗА 2.1** [ITERATION - Фаза 2]
- UI: 4 кнопки (save-schema, save-bindings, load-schema, load-bindings)
- FileManager: поля currentSchemaId, currentSchemaVersion
- saveScheme(): запомнить ID и version
- loadScheme(): запомнить ID и version

**ФАЗА 2.2** [ITERATION - Фаза 2]
- saveBindings(): валидация уровень 1 (машина выбрана?)
- loadBindings(): валидация уровень 2 (schemaId + version совпадают?)

**ФАЗА 3** [ITERATION - Фаза 3]
- imageToBase64()
- exportImages() асинхронный
- importImages() использует Base64

**ФАЗА 4** [ITERATION - Фаза 4]
- Event listeners на 4 кнопки

### УТД 2: ОСИ 2 (Привязки к машине)

**ФАЗА A** [BINDINGS_MACHINE_SELECTION - Фаза A]
- UI: dropdown выбора машины + confirm button
- Панель devices: скрыта вначале

**ФАЗА B** [BINDINGS_MACHINE_SELECTION - Фаза B]
- BindingsManager class:
  - selectedMachineId, availableDevices
  - selectMachine(machineId) → проверка уровень 1-3
  - fetchDevices() → API запрос
  - canAssignDevice(tag)
  - assignDeviceToElement()

**ФАЗА D** [BINDINGS_MACHINE_SELECTION - Фаза D]
- Валидация уровень 1: машина выбрана?
- Валидация уровень 2: тег из этой машины?
- Проверка в assignDeviceToElement()

---

## ФИНАЛЬНЫЕ: ОБЕ ОСИ ЗАВЕРШАЮТСЯ

**ФАЗА E** [BINDINGS_MACHINE_SELECTION - Фаза E]
- saveBindings(): machineId берётся из BindingsManager.selectedMachineId
- Валидация: машина выбрана?

**ФАЗА 5** [ITERATION - Фаза 5]
- Сценарий 1: Одна схема + разные машины
  - save schema
  - select machine-A, configure bindings, save
  - select machine-B, configure bindings, save
  - load schema, load machine-A bindings, check tags
  - load machine-B bindings, check tags

**ФАЗА F** [BINDINGS_MACHINE_SELECTION - Фаза F]
- loadBindings(): проверка machineId
- Если несовпадение: confirm + переключение

**ФИНАЛЬНОЕ**: Тестирование (из Фазы 5 и Фазы F)
- Сценарий 2: Валидация
  - Сохранение bindings без машины: ошибка?
  - Использование тега другой машины: ошибка?
  - Загрузка несовместимых bindings: confirm + переключение?

---

## МИНИМАЛЬНАЯ НОМЕНКЛАТУРА

- **ITERATION_SAVE_LOAD_PLAN.md**: Мастер-план, 5 основных фаз
- **BINDINGS_MACHINE_SELECTION.md**: Механика привязок, 6 вспомогательных фаз
- **ЭТО**: Контекстная карта для нейросети

---

## МИНИМУМ: МНОГОЗНАЧНАЯ ПАЛИТРА

ДВЕ УТД = 4 координируются + 2 выполняются параллельно

Матрица исполнителя:

| День | UDI 1 (Сохр/Загр) | UDI 2 (Привязки) |
|------|---------------------------|---------------------------|
| Mon | Фаза 1 (ОБЩ) | - |
| Tue | Фаза 2.1-2.2 | Фаза A |
| Wed | Фаза 2 (ОСТ) | Фаза B-D |
| Thu | Фаза 3-4 | - |
| Fri | Фаза 5 | Фаза E-F + Тесты |

---

**ОСНОВНОЕ**: Автозапоминание (currentSchemaId) работает в РАЗДЕЛЕ между двумя UDI.
