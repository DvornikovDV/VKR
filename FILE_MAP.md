# КАРТА ФАЙЛОВ ПРОЕКТА

**Версия**: 1.5  
**Дата обновления**: 30.01.2026  
**Статус**: Актуальная - синхронизирована с dev/widgets  
**Ветка**: dev/widgets

---

## СТРУКТУРА ПРОЕКТА

```
VKR/
├── public/                           ОСНОВНОЙ КОД
│   ├── index.html                    точка входа браузера (5.0 KB)
│   ├── main.js                       инициализация UIController (320 B)
│   ├── canvas-manager.js             управление Konva.js (5.8 KB)
│   ├── ui-controller.js              КООРДИНАТОР менеджеров (18.6 KB)
│   ├── diagram-element.js            базовый класс элементов (1.4 KB)
│   ├── image-manager.js              работа с изображениями (14.6 KB)
│   ├── connection-point-manager.js   точки соединения на сторонах (7.2 KB)
│   ├── connection-manager.js         линии с ортогональностью (7.2 KB)
│   ├── connection-router.js          маршрутизация соединений (9.1 KB)
│   ├── connection-updater.js         обновление при движении (8.3 KB)
│   ├── connection-editor.js          редактирование разрывов (21.6 KB)
│   ├── selection-manager.js          выделение элементов (5.4 KB)
│   ├── properties-panel.js           панель свойств (20.8 KB)
│   ├── file-manager.js               сохранение/загрузка JSON (4.0 KB)
│   ├── context-menu.js               контекстное меню и команды (4.9 KB)
│   ├── widget-manager.js             менеджер виджетов на изображениях (14.2 KB)
│   ├── widget-types.js               типы виджетов (индикаторы, дисплеи и т.п.) (18.7 KB)
│   ├── devices-registry.json         реестр доступных устройств (3.1 KB)
│   ├── styles.css                    все стили в одном файле (6.4 KB)
│   └── note.md                       локальные заметки разработчика
│
├── doc/                              ДОКУМЕНТАЦИЯ
│   ├── vision.md                     техническое видение (1.9 KB)
│   ├── conventions.md                правила кодирования (9.0 KB)
│   ├── workflow.md                   процесс разработки (1.9 KB)
│   ├── scada-architecture.md         полная архитектура системы (19.9 KB)
│   ├── status-system.md              план итерации 2 (12.5 KB)
│   ├── connections-implementation-plan.md  план итерации 1 (25.8 KB)
│   ├── widgets-implementation-plan.md      план реализации виджетов (30.9 KB)
│   ├── widgets-dev-guide.md                руководство по виджетам (37.9 KB)
│   └── widgets-iterations-plan.md         план итераций виджетов (26.9 KB)
│
├── АРХИТЕКТУРА_ПРОЕКТА.md            актуальная архитектура (18.9 KB)
├── REFACTORING_COMPLETE.md           сводка рефакторинга (18.7 KB)
├── ITERATION_PLAN_WIDGETS_PHASE1.md  план фазы 1 виджетов (16.9 KB)
├── CHANGELOG.md                      история изменений (5.5 KB)
├── refactoring-strategy.md           стратегия разработки (10.3 KB)
├── README.md                         краткое описание (172 B)
├── FILE_MAP.md                       ЭТА КАРТА (актуальная)
│
└── server/                           BACKEND (БУДУЩЕЕ)
    └── (not implemented yet)
```

---

## КЛЮЧЕВЫЕ ИЗМЕНЕНИЯ В v1.5 (30.01.2026)

### Новые файлы
- ✓ `doc/widgets-iterations-plan.md` - детальный план развития виджетов по итерациям
- ✓ `public/devices-registry.json` - реестр доступных устройств и их параметров

### Обновленные файлы (с изменениями)
- ✓ `public/widget-manager.js` - добавлена null-check в updateSize() (14.2 KB, было 8.7 KB)
- ✓ `public/properties-panel.js` - обновлена (20.8 KB, было 4.5 KB)
- ✓ `public/image-manager.js` - обновлена (14.6 KB, было 9.9 KB)
- ✓ `public/ui-controller.js` - обновлена (18.6 KB, было 13.9 KB)

### Актуализированные размеры файлов
- Все размеры в `public/` проверены и обновлены к текущему состоянию ветки
- Все размеры в `doc/` проверены и обновлены к текущему состоянию ветки
- Корневые документы обновлены

### Статус виджетов
- ✓ Базовая система виджетов реализована
- ✓ Widget Manager с полной поддержкой
- ✓ 12 типов виджетов (Display, Input, Control категории)
- ✓ Error handling audit завершен с рекомендациями
- ✓ Memory management проверен
- ⏳ Критические fixes в обработке destroy() - в очереди

---

## ОРГАНИЗАЦИЯ ДОКУМЕНТАЦИИ

### Архитектура & Плани
- `АРХИТЕКТУРА_ПРОЕКТА.md` - полное описание системы
- `ITERATION_PLAN_WIDGETS_PHASE1.md` - текущая фаза виджетов
- `doc/widgets-iterations-plan.md` - долгосрочное развитие
- `refactoring-strategy.md` - стратегия рефакторинга
- `REFACTORING_COMPLETE.md` - сводка завершенного рефакторинга

### Руководства разработчика
- `doc/conventions.md` - правила кодирования (обязательно читать)
- `doc/scada-architecture.md` - архитектура SCADA системы
- `doc/widgets-dev-guide.md` - руководство разработки виджетов
- `doc/widgets-implementation-plan.md` - детальный план реализации
- `doc/status-system.md` - система статусов (итерация 2)
- `doc/connections-implementation-plan.md` - система соединений (итерация 1)

### История
- `CHANGELOG.md` - журнал всех изменений
- `FILE_MAP.md` - эта карта проекта

---

## СТАТУС ПО КОМПОНЕНТАМ

### Ядро
| Компонент | Файл | Статус | Размер |
|-----------|------|--------|--------|
| Canvas Manager | canvas-manager.js | ✅ Готово | 5.8 KB |
| UI Controller | ui-controller.js | ✅ Готово | 18.6 KB |
| File Manager | file-manager.js | ✅ Готово | 4.0 KB |

### Изображения
| Компонент | Файл | Статус | Размер |
|-----------|------|--------|--------|
| Image Manager | image-manager.js | ✅ Готово | 14.6 KB |
| Selection Manager | selection-manager.js | ✅ Готово | 5.4 KB |

### Соединения
| Компонент | Файл | Статус | Размер |
|-----------|------|--------|--------|
| Connection Manager | connection-manager.js | ✅ Готово | 7.2 KB |
| Connection Router | connection-router.js | ✅ Готово | 9.1 KB |
| Connection Updater | connection-updater.js | ✅ Готово | 8.3 KB |
| Connection Point Mgr | connection-point-manager.js | ✅ Готово | 7.2 KB |
| Connection Editor | connection-editor.js | ✅ Готово | 21.6 KB |

### Виджеты (текущая фаза)
| Компонент | Файл | Статус | Размер |
|-----------|------|--------|--------|
| Widget Manager | widget-manager.js | ✅ Готово (+ fix) | 14.2 KB |
| Widget Types | widget-types.js | ✅ Готово | 18.7 KB |
| Properties Panel | properties-panel.js | ✅ Готово | 20.8 KB |

### Интерфейс
| Компонент | Файл | Статус | Размер |
|-----------|------|--------|--------|
| Context Menu | context-menu.js | ✅ Готово | 4.9 KB |
| Styles | styles.css | ✅ Готово | 6.4 KB |
| HTML | index.html | ✅ Готово | 5.0 KB |

### Данные
| Компонент | Файл | Статус | Размер |
|-----------|------|--------|--------|
| Devices Registry | devices-registry.json | ✅ Готово | 3.1 KB |

---

## ДИАГРАММА ЗАВИСИМОСТЕЙ

```
main.js
  └── UIController
      ├── CanvasManager
      │   ├── Konva.js (external)
      │   └── Diagram rendering
      │
      ├── ImageManager
      │   └── Image operations
      │
      ├── ConnectionManager
      │   ├── ConnectionRouter
      │   ├── ConnectionUpdater
      │   ├── ConnectionPointManager
      │   └── ConnectionEditor
      │
      ├── WidgetManager
      │   ├── Widget types
      │   └── EventHandlers
      │
      ├── SelectionManager
      │   └── Selection logic
      │
      ├── PropertiesPanel
      │   ├── WidgetManager
      │   └── Properties UI
      │
      ├── ContextMenu
      │   └── Commands
      │
      └── FileManager
          └── JSON I/O

styles.css
  └── All UI styling

devices-registry.json
  └── Device definitions
```

---

## ДЛЯ РАЗРАБОТЧИКОВ

### Начало работы
1. Изучить `doc/conventions.md` (обязательно!)
2. Прочитать `АРХИТЕКТУРА_ПРОЕКТА.md`
3. Для виджетов: `doc/widgets-dev-guide.md`
4. Для соединений: `doc/connections-implementation-plan.md`

### Текущий фокус (dev/widgets)
- Refinement виджет-системы
- Error handling improvements
- Memory management optimizations
- Preparation для фазы 2

### Следующие шаги
- [ ] Implement destroy() fixes (widget-types.js)
- [ ] Add try-catch to render() methods
- [ ] Memory profiling tests
- [ ] Validation enhancements
- [ ] Phase 2 planning

---

## МЕТАИНФОРМАЦИЯ

- **Текущая ветка**: dev/widgets
- **Основная ветка**: main
- **Предыдущая фаза**: feature/widgets-phase1-display (merged)
- **Тип проекта**: SCADA диаграмма редактор
- **Stack**: Vanilla JS + Konva.js + HTML/CSS
- **Версия проекта**: 1.5

---

**Последняя синхронизация**: 30.01.2026 11:45 UTC+9  
**Ответственный за карту**: DevOps/Documentation Team
