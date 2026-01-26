# КАРТА ФАЙЛОВ ПРОЕКТА

**Версия**: 1.4  
**Дата обновления**: 26.01.2026  
**Статус**: Актуальная - синхронизирована с feature/widgets-phase1-display

---

## СТРУКТУРА ПРОЕКТА

```
VKR/
├── public/                           ОСНОВНОЙ КОД
│   ├── index.html                    точка входа браузера
│   ├── main.js                       инициализация UIController
│   ├── canvas-manager.js             управление Konva.js (7.3 KB)
│   ├── ui-controller.js              КООРДИНАТОР менеджеров (13.9 KB)
│   ├── diagram-element.js            базовый класс элементов (1.4 KB)
│   ├── image-manager.js              работа с изображениями (9.9 KB)
│   ├── connection-point-manager.js   точки соединения на сторонах (7.2 KB)
│   ├── connection-manager.js         линии с ортогональностью (7.2 KB)
│   ├── connection-router.js          маршрутизация соединений (9.0 KB)
│   ├── connection-updater.js         обновление при движении (8.3 KB)
│   ├── connection-editor.js          редактирование разрывов (21.6 KB)
│   ├── selection-manager.js          выделение элементов (4.3 KB)
│   ├── properties-panel.js           панель свойств (4.5 KB)
│   ├── file-manager.js               сохранение/загрузка JSON (1.6 KB)
│   ├── context-menu.js               контекстное меню и команды (4.8 KB)
│   ├── widget-manager.js             менеджер виджетов на изображениях (8.7 KB)
│   ├── widget-types.js               типы виджетов (индикаторы, дисплеи и т.п.) (8.4 KB)
│   ├── styles.css                    все стили в одном файле (5.7 KB)
│   └── note.md                       локальные заметки разработчика
│
├── doc/                              ДОКУМЕНТАЦИЯ
│   ├── vision.md                     техническое видение (1.9 KB)
│   ├── conventions.md                правила кодирования (9.0 KB)
│   ├── workflow.md                   процесс разработки (1.9 KB)
│   ├── connections-implementation-plan.md  план итерации 1 (25.8 KB)
│   ├── status-system.md              план итерации 2 (12.4 KB)
│   ├── widgets-dev-guide.md          руководство по виджетам (37.9 KB)
│   ├── widgets-implementation-plan.md план реализации виджетов (30.9 KB)
│   └── scada-architecture.md         полная архитектура системы (19.9 KB)
│
├── АРХИТЕКТУРА_ПРОЕКТА.md            актуальная архитектура (19.0 KB)
├── REFACTORING_COMPLETE.md           сводка рефакторинга (19.0 KB)
├── refactoring-strategy.md           стратегия разработки (10.3 KB)
├── README.md                         краткое описание (0.2 KB)
├── FILE_MAP.md                       ЭТА КАРТА (актуальная)
│
└── server/                           BACKEND (БУДУЩЕЕ)
    └── (not implemented yet)
```

---

## ИЗМЕНЕНИЯ В v1.4 (26.01.2026)

- ✓ Добавлены новые файлы: `public/context-menu.js`, `public/widget-manager.js`, `public/widget-types.js`
- ✓ Обновлены размеры ключевых файлов в `public/` и `doc/` под текущее состояние ветки `feature/widgets-phase1-display`
- ✓ Статус карты синхронизирован с feature-веткой (виджеты, контекстное меню)
- ✓ Дальнейшие детали реализации виджетов смотри в `doc/widgets-dev-guide.md` и `doc/widgets-implementation-plan.md`

---

**Эта карта актуальна для ветки feature/widgets-phase1-display.**
