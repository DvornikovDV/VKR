# Iteration 2: Selection & Properties

**Период**: 2 дня  
**Статус**: Planning  
**Ветка**: `feature/widgets-phase2-selection`  
**Фокус**: Выделение виджетов + редактирование свойств  

---

## Цель

Добавить выделение виджетов и панель редактирования свойств (позиция, размер, оформление).

---

## Задачи

### День 1: Базис (выделение + панель)

- [ ] **Task 1.1**: SelectionManager
  - Класс `public/js/selection-manager.js`
  - Методы: `select()`, `deselect()`, `drawSelectionFrame()`, `getSelected()`
  - Обработчик клика на виджет
  - Передача выбранного в PropertiesPanel

- [ ] **Task 1.2**: WidgetManager расширение
  - Методы: `updatePosition()`, `updateSize()`, `updateColor()`, `updateFontSize()`, `updateBackgroundColor()`
  - Граничные проверки в `updatePosition()`
  - Файл: `public/js/widget-manager.js`

- [ ] **Task 1.3**: PropertiesPanel базовая
  - Класс `public/js/properties-panel.js`
  - Показать: ID, тип, позицию (X, Y), размер (W, H)
  - Input'ы для редактирования
  - Обработчики `onchange`

- [ ] **Task 1.4**: UIController интеграция
  - Инициализация SelectionManager и PropertiesPanel
  - Передача ссылок между компонентами
  - Файл: `public/js/ui-controller.js`

**Результат дня 1**: Выбор работает, панель показывает данные

### День 2: Полнота (оформление + синхро)

- [ ] **Task 2.1**: Оформление в панели
  - Color picker для цвета текста
  - Color picker для цвета фона
  - Number input для размера шрифта
  - Файл: `public/js/properties-panel.js`

- [ ] **Task 2.2**: Граничные проверки при drag
  - `attachDragHandlers()` вызывает `updatePosition()` при dragmove
  - Виджет не выходит за границы изображения
  - Файл: `public/js/widget-manager.js`

- [ ] **Task 2.3**: Синхронизация панели
  - При drag панель обновляет X, Y
  - После dragend панель рефрешится
  - Файл: `public/js/properties-panel.js`

- [ ] **Task 2.4**: Полное тестирование
  - Выбрать виджет → видна рамка
  - Отредактировать позицию → виджет переместился
  - Отредактировать размер → виджет изменился
  - Отредактировать цвет → изменился на холсте
  - Перетянуть за границу → остался на границе
  - Отменить выделение → панель исчезла
  - Нет ошибок в консоли

**Результат дня 2**: Всё работает полностью

---

## Файлы

### Новые (2)
- `public/js/selection-manager.js` (~100 строк)
- `public/js/properties-panel.js` (~200 строк)

### Обновляемые (2)
- `public/js/widget-manager.js` (+150 строк)
- `public/js/ui-controller.js` (+30 строк)

---

## Граничные проверки

```javascript
const boundedX = Math.max(imgX, Math.min(x, imgX + imgWidth - widget.width));
const boundedY = Math.max(imgY, Math.min(y, imgY + imgHeight - widget.height));
```

**Минимальный размер**: 20x20 px  
**Максимальный размер**: не больше изображения  

---

## Готово когда

✅ Выделение рамкой работает  
✅ Панель показывает свойства (ID, тип, позицию, размер)  
✅ Редактирование позиции в UI работает  
✅ Редактирование размера в UI работает  
✅ Редактирование цвета и шрифта работает  
✅ Drag с граничными проверками работает  
✅ Панель синхронизируется при движении  
✅ Нет консольных ошибок  
✅ Все виджеты редактируются независимо  

---

## Ссылки

- **Iteration 1**: ✅ `feature/widgets-phase1-display` (Display виджеты готовы)
- **Guide**: `doc/widgets-dev-guide.md` (Iteration 2 раздел)
- **Implementation**: `doc/widgets-implementation-plan.md` (Общий план)
