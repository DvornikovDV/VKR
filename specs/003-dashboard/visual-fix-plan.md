# План: Визуальные исправления Dashboard

**Дата**: 2026-04-25 | **Статус**: Утверждён  
**Контекст**: Задачи T001–T056 закрыты. Дашборд функционально работает, UI требует переработки.

---

## Цели

1. Layout как в конструкторе: шапка + canvas на всё оставшееся пространство, без карточек и рамок
2. Исправить отрисовку: рамки у изображений, рабочие соединения (fix формата segments)
3. Навигация: wheel-zoom к курсору, drag-pan, единственная кнопка — Fit to View

## Нецели

- Бизнес-логика runtime session, binding resolution, telemetry projection не меняется
- Конструктор не меняется
- Новые функции не добавляются

---

## Целевой вид

```
┌───────────────────────────────────────────────────────────────┐
│ User Hub (sidebar)  │ [Diagram ▾] [Edge ▾]  [⛶ Fit] [ⓘ Det] │ ← шапка
│                     ├─────────────────────────────────────────┤
│ Gallery             │                                         │
│ ▸Dashboard          │   ┌──────────┐        ┌──────────┐     │
│ Equipment           │   │  ┌img──┐ │━━━━━━━━┤  ┌img──┐ │     │ ← рамки + соединения
│ Profile             │   │  │     │ │        │  │     │ │     │
│                     │   │  └─────┘ │        │  └─────┘ │     │
│                     │   │   ● ●    │        └──────────┘     │
│                     │   └──────────┘                          │
│                     │                                         │
│                     │ ┌─── Diagnostics (overlay, по клику) ──┐│
│                     │ │ Status │ Telemetry │ Bindings │ Issues││
│ user@mail.ru        │ └───────────────────────────────────────┘│
│ ↪ Sign out          │                                         │
└───────────────────────────────────────────────────────────────┘
```

**Навигация**: scroll wheel = zoom к/от курсора, drag = pan, Fit = вписать диаграмму.  
**Diagnostics**: по кнопке Details или по handle снизу. Вкладки: Status, Telemetry, Bindings, Render issues.  
**Recovery states (empty/loading/error)**: минимальная заглушка в рабочей области + подробности в Diagnostics → вкладка Status.

---

## Этап 1: Исправить парсинг segments

**Цель**: Соединения (connections) отрисовываются корректно — ошибки `unsupported-connection-segment` исчезают.

### Причина

Конструктор экспортирует segments как `{ start: {x,y}, end: {x,y}, direction, index }`.
`resolveSegmentEndpointPair` в `runtimeLayout.ts` проверяет `{x1,y1,x2,y2}`, `{from,to}`, `{points:[]}` — но не `{start,end}`. Все segments проваливаются → recoverable issues.

### Изменения

**`client/src/features/dashboard/model/types.ts`** — расширить `DashboardSavedConnectionSegment`, добавив optional поля `start`, `end` (тип `DashboardCanvasPoint`), `direction` (`string`), `index` (`number`).

**`client/src/features/dashboard/model/runtimeLayout.ts`** — в `resolveSegmentEndpointPair` добавить ветку `if (isCanvasPoint(segment.start) && isCanvasPoint(segment.end))` **перед** веткой `from`/`to`.

**`client/tests/unit/dashboardRuntimeLayout.test.ts`** — добавить тест: layout с segments `{start, end, direction, index}` → render segments валидные, issues пустые.

**`client/tests/fixtures/dashboardVisualLayout.ts`** — обновить fixture connections: segments в формате `{start, end, direction, index}` (как сохраняет конструктор).

---

## Этап 2: Добавить рамки изображениям

**Цель**: Изображения на холсте обведены чёрной рамкой (как в конструкторе), пины не «висят в воздухе».

### Изменения

**`client/src/features/dashboard/components/DashboardVisualSurface.tsx`** — в блоке рендера изображений обернуть каждый `KonvaImage` в `Group`, добавить `Rect` c `stroke="#000000" strokeWidth={2}` перед `KonvaImage`. Координаты и размеры Rect и Image совпадают.

---

## Этап 3: Рефактор layout

**Цель**: Убрать карточку StatePanel, убрать тройную рамку, встроить селекторы Diagram/Edge прямо в RuntimeSurface. Дашборд занимает всё доступное пространство.

Самый крупный этап, затрагивает 4 файла.

### 3.1 Убрать DashboardStatePanel

**`client/src/features/user-hub/pages/DashboardPage.tsx`**:
- Убрать `<DashboardStatePanel ... />` из JSX и удалить его импорт.
- Файл `DashboardStatePanel.tsx` не удалять — он может быть полезен как справочник recovery-сообщений.

### 3.2 Убрать тройную рамку

**`client/src/features/user-hub/pages/DashboardPage.tsx`**:
- Удалить `<section className="rounded-xl ...">` и `<div className="rounded-lg ...">` обёртки вокруг `<DashboardRuntimeSurface />`. Рендерить RuntimeSurface напрямую.

**`client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`**:
- Убрать собственные `rounded-lg border border-[var(--color-surface-border)]` из корневого элемента.

### 3.3 Flex-layout для полного заполнения

**`client/src/features/user-hub/pages/DashboardPage.tsx`**:
- Корневой элемент: `className="flex h-full flex-col overflow-hidden"` вместо `mx-auto w-full max-w-6xl px-4 py-6` / `space-y-4`.
- RuntimeSurface получает `className="flex-1 min-h-0"` (или аналог), чтобы занять все доступное место.

### 3.4 Встроить toolbar inline в RuntimeSurface

**`client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`**:
- Принять новые props: `diagrams`, `selectedDiagramId`, `edgeOptions`, `selectedEdgeId`, `disabled`, `onDiagramChange`, `onEdgeChange`.
- В шапке компонента рендерить inline: два `<select>` (Diagram, Edge), кнопку Fit to View (⛶), кнопку Details (ⓘ). Одна горизонтальная полоса.
- Убрать `<h2>Live Runtime Surface</h2>` и текстовые строки Transport/Edge state (они уходят в Diagnostics → вкладка Status).

**`client/src/features/user-hub/pages/DashboardPage.tsx`**:
- Убрать отдельный рендер `<DashboardToolbar />` и его импорт.
- Передать toolbar-props напрямую в `<DashboardRuntimeSurface />`.

**`client/src/features/dashboard/components/DashboardToolbar.tsx`** — удалить файл. Содержимое (два select, кнопка Details) теперь inline в RuntimeSurface.

### 3.5 Recovery states без StatePanel

При `isActiveContext === false` RuntimeSurface уже показывает заглушку. Расширить:
- **empty**: иконка + «Select Diagram and Edge Server to start» (краткий текст в рабочей области).
- **loading**: spinner/progress bar + «Loading...».
- **error / invalid-selection / missing-binding / invalid-binding**: иконка ошибки + краткое сообщение + «Open Details for more info».
- Подробные сообщения, подсказки, recovery hints — переносятся в Diagnostics → вкладка Status.

Для `partial-visual-rendering` — canvas отрисовывается нормально, Diagnostics открывается с бейджем.

### 3.6 Расширить DashboardDiagnosticsPanel вкладками

**`client/src/features/dashboard/components/DashboardDiagnosticsPanel.tsx`**:

Текущая структура: три секции в `grid`-layout (Telemetry, Bindings, Render issues) — все видны одновременно.

Новая структура: **4 вкладки**:
1. **Status** — recovery state message, hint, transport status, edge availability. Всё, что раньше было в StatePanel.
2. **Telemetry** — live telemetry values (уже есть).
3. **Bindings** — widget bindings (уже есть).
4. **Render issues** — visual render issues (уже есть).

Передать в DashboardDiagnosticsPanel дополнительные props: `recoveryState`, `transportStatus`, `edgeAvailability`, `recoveryMessage`, `recoveryHint`.

> Вкладки реализовать простым inline tab-switch (state + conditional render), без внешних библиотек.

---

## Этап 4: Навигация — wheel-zoom

**Цель**: Zoom колесом мыши к позиции курсора. Из кнопок — только Fit to View.

### Изменения

**`client/src/features/dashboard/components/DashboardVisualSurface.tsx`**:
- Добавить prop `onZoomAtCursor: (anchor: DashboardCanvasPoint, factor: number) => void`.
- Добавить `onWheel` handler на `<Stage>`: `e.evt.preventDefault()`, вычислить `pointer` через `stage.getPointerPosition()`, вызвать `onZoomAtCursor` с `factor = e.evt.deltaY > 0 ? 0.9 : 1.1`.

**`client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`**:
- Передать `onZoomAtCursor` в `DashboardVisualSurface`: `(anchor, factor) => setViewport(current => zoomDashboardViewport(current, { factor, anchor }))`.
- Убрать передачу `onZoomIn`, `onZoomOut`, `onReset`, `onPan` callbacks.
- Кнопка Fit to View уже inline в шапке (этап 3.4).

**`client/src/features/dashboard/components/DashboardViewportControls.tsx`** — удалить файл. Кнопка Fit to View находится в шапке RuntimeSurface, индикатор масштаба — опционально, можно добавить рядом.

`viewport.ts` — **не меняется**, `zoomDashboardViewport` уже поддерживает anchor-based zoom.

### Проверка

Wheel-zoom и адаптивный resize проверяются вручную, без автотестов (JSDOM не поддерживает Konva wheel events и ResizeObserver).

---

## Этап 5: Адаптивный размер Stage

**Цель**: Canvas занимает всё доступное пространство и адаптируется при ресайзе окна. Убрать хардкод `960×540`.

### Изменения

**`client/src/features/dashboard/components/DashboardRuntimeSurface.tsx`**:
- Удалить константу `VISUAL_VIEWPORT_SIZE`.
- Добавить `useRef<HTMLDivElement>` на контейнер canvas-области.
- Добавить `ResizeObserver` в `useEffect`, обновляющий `containerSize` state при ресайзе.
- Передавать `containerSize` как `viewportSize` в `DashboardVisualSurface`.
- Пересчитывать viewport (вызвать `createDashboardInitialViewport`) при изменении `containerSize`.
- Fallback: если container ещё не измерен, использовать `{ width: 960, height: 540 }`.

### Проверка

Проверяется вручную: изменение размера окна → canvas растягивается/сжимается.

---

## Этап 6: Обновить тесты

**Цель**: Тесты проходят после всех изменений.

### Изменения

**`client/tests/unit/dashboardRuntimeLayout.test.ts`**:
- Добавить тест для segments `{start, end}` (этап 1).
- Если есть тест, ожидающий `unsupported-connection-segment` для segments с `start`/`end` — обновить ожидание на success.

**`client/tests/integration/DashboardVisualSurface.test.tsx`**:
- Убрать тест клика «Zoom in» (кнопка удалена).
- Убрать тест клика «Reset view» (кнопка удалена).
- Оставить тест «Fit to view» (кнопка осталась).
- Обновить поиск кнопки Fit to view, если DOM-структура изменилась.

**`client/tests/integration/DashboardPage.test.tsx`**:
- Убрать проверки текста «Dashboard Monitoring» (StatePanel удалён).
- Обновить селекторы для Diagram/Edge select, если DOM сменилась.
- Оставить проверки `dashboard-visual-surface`, Diagnostics, селекторов.

**`client/tests/fixtures/dashboardVisualLayout.ts`**:
- Segments в формате `{start, end, direction, index}`.

---

## Порядок выполнения

```
Этап 1 (segments)   — самостоятельный, не зависит от UI
Этап 2 (рамки)      — самостоятельный, не зависит от UI
  ↕ параллельно
Этап 3 (layout)     — зависит от 1+2 (удобнее проверять, когда canvas уже выглядит лучше)
Этап 4 (navigation) — зависит от 3 (шапка RuntimeSurface)
Этап 5 (resize)     — зависит от 3 (flex-layout)
  ↕ параллельно
Этап 6 (тесты)      — после всех предыдущих
```

---

## Удаляемые файлы

| Файл | Причина |
|------|---------|
| `client/src/features/dashboard/components/DashboardToolbar.tsx` | Содержимое inline в RuntimeSurface |
| `client/src/features/dashboard/components/DashboardViewportControls.tsx` | Кнопки заменены wheel-zoom + Fit inline |

## Файлы, которые не удаляются, но перестают рендериться

| Файл | Причина |
|------|---------|
| `client/src/features/dashboard/components/DashboardStatePanel.tsx` | Не рендерится, остаётся как справочник recovery-сообщений |

## Изменяемые файлы

| Файл | Этапы | Суть |
|------|-------|------|
| `types.ts` | 1 | Расширить `DashboardSavedConnectionSegment` |
| `runtimeLayout.ts` | 1 | Ветка `start`/`end` в `resolveSegmentEndpointPair` |
| `DashboardVisualSurface.tsx` | 2, 4 | Рамки у изображений, `onWheel` + `onZoomAtCursor` |
| `DashboardPage.tsx` | 3 | Удалить StatePanel/Toolbar/обёртки, flex-layout, передать props в RuntimeSurface |
| `DashboardRuntimeSurface.tsx` | 3, 4, 5 | Inline toolbar+Fit+Details в шапке, recovery заглушки, убрать рамку, adaptive resize, передача zoom callback |
| `DashboardDiagnosticsPanel.tsx` | 3 | 4 вкладки: Status, Telemetry, Bindings, Render issues |
| `dashboardRuntimeLayout.test.ts` | 6 | Тест start/end segments |
| `DashboardVisualSurface.test.tsx` | 6 | Убрать Zoom in/Reset view тесты |
| `DashboardPage.test.tsx` | 6 | Убрать StatePanel проверки |
| `dashboardVisualLayout.ts` | 6 | Segments в формате конструктора |
