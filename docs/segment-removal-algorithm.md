# Алгоритм удаления сегментов соединения

## Основной принцип

**Точки — источник истины. Сегменты — их производная.**

Соединение определяется массивом **всех точек**: два пина (fromPin и toPin) плюс промежуточные точки между ними. Сегменты вычисляются из точек автоматически: каждая пара последовательных точек образует один сегмент.

```
Формула: N точек → N-1 сегментов
Пример: [fromPin, P₁, toPin] → Seg₀(fromPin→P₁), Seg₁(P₁→toPin)

Всего точек = 2 (пины) + intermediatePoints.length
Всего сегментов = intermediatePoints.length + 1
```

При удалении сегмента мы **удаляем две промежуточные точки** и пересчитываем сегменты из оставшихся точек. Поскольку удаление двух точек уменьшает массив на 2 элемента, число сегментов уменьшается на 2.

**Пины невозможно удалить**, так как при удалении сегментов есть ограничения на минимальное число точек:
- Type A: минимум 3 промежуточные точки → 5 точек всего (2 пина + 3 промежуточные)
- Type B: минимум 4 промежуточные точки → 6 точек всего (2 пина + 4 промежуточные)

---

## Классификация соединений (по числу промежуточных точек)

### Тип A: Нечётное число промежуточных точек (1, 3, 5, 7...)

**Структура:**
```
fromPin — P₁ — P₂ — P₃ — ... — toPin
Seg₀      Seg₁   Seg₂   Seg₃
(чётное число сегментов)

Пример Type A (3 промежуточные точки, 5 точек всего):
fromPin — P₁ — P₂ — P₃ — toPin
Seg₀      Seg₁   Seg₂   Seg₃   (4 сегмента)
H         V      H      V

Центральные точки: P₂ (одна)
```

**Характеристики:**
- Нечётное число промежуточных точек → чётное число сегментов
- Одна центральная точка (между Seg₁ и Seg₂)
- Допустимые позиции удаления: только центральный сегмент

**Условие удаления:**
- Минимум для удаления: 3 промежуточные точки (5 точек всего с пинами)
- Можно удалить точку индекса `(N-1)/2` вместе с соседней (всего 2 точки)
- После удаления: N → N-2 промежуточных точек, сегментов: (N+1) → (N-1)

---

### Тип B: Чётное число промежуточных точек (2, 4, 6, 8...)

**Структура:**
```
fromPin — P₁ — P₂ — P₃ — P₄ — toPin
Seg₀      Seg₁   Seg₂   Seg₃   Seg₄
(нечётное число сегментов)

Пример Type B (4 промежуточные точки, 6 точек всего):
fromPin — P₁ — P₂ — P₃ — P₄ — toPin
Seg₀      Seg₁   Seg₂   Seg₃   Seg₄  (5 сегментов)
H         V      H      V      H

Центральные точки: P₂ и P₃ (две)
```

**Характеристики:**
- Чётное число промежуточных точек → нечётное число сегментов
- Две центральные точки (окружают центральный сегмент)
- Допустимые позиции удаления: любой из двух центральных сегментов

**Условие удаления:**
- Минимум для удаления: 4 промежуточные точки (6 точек всего с пинами)
- Можно удалить точку индекса `N/2 - 1` или `N/2` вместе с соседней
- После удаления: N → N-2 промежуточных точек, сегментов: (N+1) → (N-1)

---

## Логика удаления

### Шаг 1: Валидация

**Входные данные:**
- `intermediatePoints` — массив промежуточных точек (без пинов)
- `handleSegmentIndex` — индекс сегмента, на котором лежит ручка
- `fromPin`, `toPin` — пины соединения

**Условия отказа:**

```
1. Ручка на крайнем сегменте (Seg₀ или Seg_{N})
   → запретить (затрагивает пины)
   if (handleSegmentIndex === 0 || handleSegmentIndex === intermediatePoints.length)
       return ERROR("Нельзя удалить крайний сегмент (пины)")

2. Минимум промежуточных точек для безопасного удаления
   Type A (нечётное): минимум 3 промежуточные точки → 5 точек всего
   Type B (чётное): минимум 4 промежуточные точки → 6 точек всего
   
   isTypeA = (intermediatePoints.length % 2 === 1)
   if (isTypeA && intermediatePoints.length < 3)
       return ERROR("Type A требует минимум 3 промежуточные точки (5 точек всего)")
   if (!isTypeA && intermediatePoints.length < 4)
       return ERROR("Type B требует минимум 4 промежуточные точки (6 точек всего)")

3. Ручка в допустимой центральной позиции
   Можно удалять ТОЛЬКО центральные сегменты
   (сегменты, удаление которых оставляет валидную структуру)
   
   Type A: допустимый индекс Seg = (N-1)/2, где N = intermediatePoints.length
   Type B: допустимые индексы Seg = [N/2 - 1, N/2]
   
   Если ручка не в центре — отказать
```

### Шаг 2: Определить индексы точек для удаления

**Формула связи между индексом сегмента и точками:**

Сегмент i соединяет:
- начало: `i === 0 ? fromPin : intermediatePoints[i-1]`
- конец: `i === intermediatePoints.length ? toPin : intermediatePoints[i]`

При удалении сегмента удаляются **его конец и начало следующего** (одна общая точка на границе):
```
Seg₀ — P₁ — Seg₁ — P₂ — Seg₂ — ...

Удаляем Seg₁:
- Конец Seg₁ = intermediatePoints[1] (это P₂)
- Начало Seg₂ = intermediatePoints[1] (это P₂, совпадает!)
- Удаляем: точку с индексом 1

Но нужно удалить ДВЕ точки (чтобы уменьшить на 2).
Удаляемый сегмент затрагивает две промежуточные точки:
- previousPoint = intermediatePoints[segmentIndex - 1]  (конец сегмента до удаляемого)
- currentPoint = intermediatePoints[segmentIndex]       (конец удаляемого сегмента)
```

**Точнее:**
```
segmentIndexToRemove = handleSegmentIndex

firstPointIndexToRemove = segmentIndexToRemove
secondPointIndexToRemove = segmentIndexToRemove + 1

intermediatePoints.splice(firstPointIndexToRemove, 2)
```

### Шаг 3: Пересчитать сегменты

**После удаления двух точек новые сегменты вычисляются автоматически:**

```javascript
newSegments = []
allPoints = [fromPin, ...newIntermediatePoints, toPin]

for (i = 0; i < allPoints.length - 1; i++) {
    start = allPoints[i]
    end = allPoints[i + 1]
    
    // Определить направление
    if (start.x === end.x) {
        direction = 'V'
    } else if (start.y === end.y) {
        direction = 'H'
    } else {
        // ОШИБКА: нарушена ортогональность
        return ERROR("После удаления нарушена ортогональность: диагональное соединение")
    }
    
    newSegments.push({
        index: i,
        direction: direction,
        start: start,
        end: end
    })
}
```

---

## Критическая логика обеспечения ортогональности

### Предусловие: ортогональность исходного маршрута

Если исходное соединение уже ортогонально (H/V чередуются), то удаление **любых двух последовательных промежуточных точек** гарантирует ортогональность результата только если соседние точки (до и после удаляемых) **выровнены по одной из координат**.

**Доказательство опасности:**
```
Исходно: 
fromPin(0,0) — P₁(100,0) — P₂(100,100) — P₃(200,100) — P₄(200,200) — toPin(300,200)
H              V            H              V              H

Удаляем P₂ и P₃:
fromPin(0,0) — P₁(100,0) — P₄(200,200) — toPin(300,200)

Направление от P₁ к P₄:
P₁.x = 100, P₁.y = 0
P₄.x = 200, P₄.y = 200
P₁.x ≠ P₄.x И P₁.y ≠ P₄.y → ДИАГОНАЛЬ!
```

### Вывод: Необходимо гарантировать выравнивание

**Решение: Валидация перед удалением, отмена при нарушении.**

Перед удалением двух точек необходимо проверить:
- Две удаляемые промежуточные точки должны быть соседними (последовательны по индексу)
- Их удаление не должно привести к диагональному соединению

**Предварительная проверка:**
```javascript
segmentIndexToRemove = handleSegmentIndex
firstPointIndex = segmentIndexToRemove
secondPointIndex = segmentIndexToRemove + 1

firstPoint = intermediatePoints[firstPointIndex]
secondPoint = intermediatePoints[secondPointIndex]

// Получить соседей (точки ДО и ПОСЛЕ удаляемой пары)
prevPoint = firstPointIndex === 0 ? fromPin : intermediatePoints[firstPointIndex - 1]
nextPoint = secondPointIndex === intermediatePoints.length - 1 ? toPin : intermediatePoints[secondPointIndex + 1]

// Проверить ортогональность: prevPoint — nextPoint
if (prevPoint.x !== nextPoint.x && prevPoint.y !== nextPoint.y) {
    // Диагональное соединение!
    return ERROR("Удаление приведёт к диагональному соединению, отмена")
}
```

Если эта проверка пройдена, удаление безопасно.

---

## Алгоритм полностью (псевдокод)

```javascript
function removeSegmentAtHandle(connection, handleSegmentIndex) {
    const meta = connection.getAttr('connection-meta')
    const intermediatePoints = meta.intermediatePoints || []
    const N = intermediatePoints.length
    
    // Шаг 1: Валидация
    
    // 1.1: Крайние сегменты
    if (handleSegmentIndex === 0 || handleSegmentIndex === N) {
        console.warn('Нельзя удалить крайний сегмент (пины)')
        return false
    }
    
    // 1.2: Определить тип
    isTypeA = (N % 2 === 1)  // нечётное число точек → Type A
    
    // 1.3: Минимум точек (с учётом пинов)
    if (isTypeA && N < 3) {
        console.warn('Type A: минимум 3 промежуточные точки (5 точек всего с пинами)')
        return false
    }
    if (!isTypeA && N < 4) {
        console.warn('Type B: минимум 4 промежуточные точки (6 точек всего с пинами)')
        return false
    }
    
    // 1.4: Центральные позиции
    let isCentral = false
    if (isTypeA) {
        const center = (N - 1) / 2
        isCentral = (handleSegmentIndex === center)
    } else {
        const left = N / 2 - 1
        const right = N / 2
        isCentral = (handleSegmentIndex === left || handleSegmentIndex === right)
    }
    
    if (!isCentral) {
        console.warn(`Удалять можно только центральные сегменты (Type ${isTypeA ? 'A' : 'B'})`)
        return false
    }
    
    // Шаг 2: Определить индексы точек
    const firstPointIndex = handleSegmentIndex
    const secondPointIndex = handleSegmentIndex + 1
    
    // Шаг 3: Предварительная проверка ортогональности
    const prevPoint = (firstPointIndex === 0) 
        ? meta.fromPin.position() 
        : intermediatePoints[firstPointIndex - 1]
    
    const nextPoint = (secondPointIndex >= N)
        ? meta.toPin.position()
        : intermediatePoints[secondPointIndex]
    
    // Проверить: можно ли соединить prevPoint с nextPoint ортогонально?
    if (prevPoint.x !== nextPoint.x && prevPoint.y !== nextPoint.y) {
        console.error(`Удаление приведёт к диагональному соединению: 
            (${prevPoint.x}, ${prevPoint.y}) → (${nextPoint.x}, ${nextPoint.y})`)
        return false
    }
    
    // Шаг 4: Удалить две промежуточные точки
    const newIntermediatePoints = intermediatePoints.slice()
    newIntermediatePoints.splice(firstPointIndex, 2)
    
    // Шаг 5: Пересчитать сегменты из оставшихся точек
    const allPoints = [
        meta.fromPin.position(),
        ...newIntermediatePoints,
        meta.toPin.position()
    ]
    
    const newSegments = []
    for (let i = 0; i < allPoints.length - 1; i++) {
        const start = allPoints[i]
        const end = allPoints[i + 1]
        
        let direction
        if (start.x === end.x) {
            direction = 'V'
        } else if (start.y === end.y) {
            direction = 'H'
        } else {
            // Это не должно случиться после предварительной проверки
            console.error(`Логическая ошибка: диагональный сегмент ${i}`)
            return false
        }
        
        newSegments.push({
            index: i,
            direction: direction,
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y }
        })
    }
    
    // Шаг 6: Применить изменения
    meta.intermediatePoints = newIntermediatePoints
    meta.segments = newSegments
    meta.userModified = true
    
    connection.setAttr('connection-meta', meta)
    this.redrawConnection(connection)
    this.addLineEditHandles(connection)
    
    console.log(`Сегменты удалены (${N} → ${newIntermediatePoints.length} промежуточных точек, 
        ${allPoints.length} → ${allPoints.length - 2} точек всего с пинами,
        ${N + 1} → ${newSegments.length} сегментов)`)
    return true
}
```

---

## Примеры пошагово

### Пример 1: Type A (3 промежуточные точки → 1 промежуточная)

**Исходно (5 точек всего):**
```
intermediatePoints = [P₁(100,0), P₂(100,100), P₃(200,100)]
fromPin = (0, 0)
toPin = (200, 0)

Всего точек: 2 (пины) + 3 (промежуточные) = 5

Сегменты:
Seg₀: H (0,0) → (100,0)       [fromPin → P₁]
Seg₁: V (100,0) → (100,100)   [P₁ → P₂]
Seg₂: H (100,100) → (200,100) [P₂ → P₃]
Seg₃: V (200,100) → (200,0)   [P₃ → toPin]
```

**Удаляем Seg₂ (центральный):**
```
handleSegmentIndex = 2
firstPointIndex = 2
secondPointIndex = 3
Удаляем: P₂(100,100) и P₃(200,100)

intermediatePoints после: [P₁(100,0)]

Проверка ортогональности:
prevPoint = P₁(100,0)
nextPoint = toPin(200,0)
P₁.x !== nextPoint.x (100 ≠ 200) ✓
P₁.y === nextPoint.y (0 === 0) ✓
→ Ортогональная H!

Новые сегменты (всего точек: 3):
allPoints = [(0,0), (100,0), (200,0)]
Seg₀: H (0,0) → (100,0)
Seg₁: H (100,0) → (200,0)

Результат: 
- 3 промежуточные → 1 промежуточная
- 5 точек всего → 3 точки всего
- 4 сегмента → 2 сегмента
```

---

### Пример 2: Type B (4 промежуточные точки → 2 промежуточные)

**Исходно (6 точек всего):**
```
intermediatePoints = [P₁(100,0), P₂(100,100), P₃(200,100), P₄(200,0)]
fromPin = (0, 0)
toPin = (300, 0)

Всего точек: 2 (пины) + 4 (промежуточные) = 6

Сегменты (5):
Seg₀: H (0,0) → (100,0)       [fromPin → P₁]
Seg₁: V (100,0) → (100,100)   [P₁ → P₂]
Seg₂: H (100,100) → (200,100) [P₂ → P₃]  ← центральные (можно удалить любой)
Seg₃: V (200,100) → (200,0)   [P₃ → P₄]  ← центральные
Seg₄: H (200,0) → (300,0)     [P₄ → toPin]
```

**Удаляем Seg₂:**
```
handleSegmentIndex = 2
firstPointIndex = 2
secondPointIndex = 3
Удаляем: P₂(100,100) и P₃(200,100)

intermediatePoints после: [P₁(100,0), P₄(200,0)]

Проверка:
prevPoint = P₁(100,0)
nextPoint = P₄(200,0)
P₁.x !== nextPoint.x (100 ≠ 200) ✓
P₁.y === nextPoint.y (0 === 0) ✓
→ Ортогональная H ✓

Новые сегменты (всего точек: 4):
allPoints = [(0,0), (100,0), (200,0), (300,0)]
Seg₀: H (0,0) → (100,0)
Seg₁: H (100,0) → (200,0)
Seg₂: H (200,0) → (300,0)

Результат:
- 4 промежуточные → 2 промежуточные
- 6 точек всего → 4 точки всего
- 5 сегментов → 3 сегмента
```

---

## Инварианты

✓ **Точки — источник истины.** Сегменты всегда пересчитываются из точек.

✓ **Пины считаются точками** и участвуют в подсчёте общего числа точек, но не могут быть удалены (защищены ограничениями на минимум).

✓ **Отмена вместо исправления.** Если предварительная проверка ортогональности не пройдена, операция отменяется. Нет попыток добавлять переходные сегменты.

✓ **Бинарный результат.** Удаление либо полностью выполняется, либо отменяется. Нет промежуточных состояний.

✓ **Сохранение крайних направлений.** Первый и последний сегменты определены пинами и сохраняют свои направления.

✓ **Минимум точек:** Type A требует минимум 5 точек всего (2 пина + 3 промежуточные), Type B требует минимум 6 точек всего (2 пина + 4 промежуточные).
