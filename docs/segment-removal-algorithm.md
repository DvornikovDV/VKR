# Алгоритм удаления сегментов соединения

## Основной принцип

**Точки — источник истины. Сегменты — их производная.**

Соединение определяется массивом **всех точек**: fromPin, промежуточные точки, toPin. Сегменты вычисляются из точек автоматически: каждая пара последовательных точек образует один сегмент.

```
Формула: N точек → N-1 сегментов
Пример: [P₀, P₁, P₂, P₃] → Seg₀(P₀→P₁), Seg₁(P₁→P₂), Seg₂(P₂→P₃)
```

При удалении сегмента мы **удаляем две соседние точки** и пересчитываем сегменты из оставшихся точек. Поскольку удаление двух точек уменьшает массив на 2 элемента, число сегментов уменьшается на 2.

---

## Классификация соединений (по числу ТОЧЕК)

### Тип A: Нечётное число точек (5, 7, 9...)

**Структура:**
```
P₀ — P₁ — P₂ — P₃ — P₄
Seg₀    Seg₁    Seg₂    Seg₃
(чётное число сегментов)

Пример Type A (5 точек):
P₀ — P₁ — P₂ — P₃ — P₄
Seg₀    Seg₁    Seg₂    Seg₃  (4 сегмента)
H       V       H       V

Центральная точка: P₂ (одна)
```

**Характеристики:**
- Нечётное число точек → чётное число сегментов
- Одна центральная точка (между сегментами (N-1)/2)
- Допустимые позиции удаления: только центральная пара

**Условие удаления:**
- Минимум: 5 точек (удаление 2 → 3 точки)
- Можно удалить пару с центральной точкой индекса `(N-1)/2` вместе с соседней
- После удаления: N → N-2 точек, сегментов: (N-1) → (N-3)

---

### Тип B: Чётное число точек (6, 8, 10...)

**Структура:**
```
P₀ — P₁ — P₂ — P₃ — P₄ — P₅
Seg₀    Seg₁    Seg₂    Seg₃    Seg₄
(нечётное число сегментов)

Пример Type B (6 точек):
P₀ — P₁ — P₂ — P₃ — P₄ — P₅
Seg₀    Seg₁    Seg₂    Seg₃    Seg₄  (5 сегментов)
H       V       H       V       H

Центральные точки: P₂ и P₃ (две)
```

**Характеристики:**
- Чётное число точек → нечётное число сегментов
- Две центральные точки (окружают центральный сегмент)
- Допустимые позиции удаления: любая из двух центральных пар

**Условие удаления:**
- Минимум: 6 точек (удаление 2 → 4 точки)
- Можно удалить пару индекса `N/2 - 1` или `N/2` вместе с соседней
- После удаления: N → N-2 точек, сегментов: (N-1) → (N-3)

---

## Логика удаления

### Шаг 1: Валидация

**Входные данные:**
- `points` — массив всех точек соединения (fromPin, промежуточные, toPin)
- `handleSegmentIndex` — индекс сегмента, на котором лежит ручка

**Условия отказа:**

```
1. Ручка на крайних сегментах (Seg₀ или Seg_{N-1})
   → запретить (затрагивает пины)
   if (handleSegmentIndex === 0 || handleSegmentIndex === points.length - 1)
       return ERROR("Нельзя удалить крайний сегмент (пины)")

2. Минимум точек
   Type A (нечётное): минимум 5 точек
   Type B (чётное): минимум 6 точек
   
   isTypeA = (points.length % 2 === 1)
   if (isTypeA && points.length < 5)
       return ERROR("Type A требует минимум 5 точек")
   if (!isTypeA && points.length < 6)
       return ERROR("Type B требует минимум 6 точек")

3. Ручка в допустимой центральной позиции
   Можно удалять ТОЛЬКО центральные сегменты
   
   Type A: допустимый индекс Seg = (N-1)/2, где N = points.length
   Type B: допустимые индексы Seg = [N/2 - 1, N/2]
   
   Если ручка не в центре → отказать
```

### Шаг 2: Определить индексы точек для удаления

**Связь между индексом сегмента и точками:**

Сегмент i соединяет points[i] и points[i+1].

При удалении сегмента удаляются **две соседние точки**:
```
points[segmentIndex] и points[segmentIndex + 1]
```

**Пример:**
```
Points: [P₀, P₁, P₂, P₃, P₄]
Seg₀: P₀→P₁  (индекс 0)
Seg₁: P₁→P₂  (индекс 1)
Seg₂: P₂→P₃  (индекс 2) ← центральный
Seg₃: P₃→P₄  (индекс 3)

Удаляем Seg₂:
firstPointIndex = 2
secondPointIndex = 3
Удаляем: points[2] (P₂) и points[3] (P₃)
Points после: [P₀, P₁, P₄]
```

---

### Шаг 3: Предварительная проверка ортогональности

**Необходимо проверить:** могут ли соседние точки (до и после удаляемой пары) соединиться ортогонально.

```javascript
firstPointIndex = handleSegmentIndex
secondPointIndex = handleSegmentIndex + 1

prevPoint = points[firstPointIndex - 1]   // точка ДО удаляемой пары
nextPoint = points[secondPointIndex + 1]  // точка ПОСЛЕ удаляемой пары

// Проверить ортогональность: prevPoint — nextPoint
if (prevPoint.x !== nextPoint.x && prevPoint.y !== nextPoint.y) {
    // Диагональное соединение!
    return ERROR("Удаление приведёт к диагональному соединению, отмена")
}
```

Если эта проверка пройдена, удаление безопасно.

---

### Шаг 4: Удалить две точки

```javascript
const newPoints = points.slice()
newPoints.splice(firstPointIndex, 2)  // удалить 2 элемента
```

### Шаг 5: Пересчитать сегменты из оставшихся точек

**После удаления двух точек новые сегменты вычисляются автоматически:**

```javascript
const newSegments = []
for (let i = 0; i < newPoints.length - 1; i++) {
    const start = newPoints[i]
    const end = newPoints[i + 1]
    
    // Определить направление
    let direction
    if (start.x === end.x) {
        direction = 'V'
    } else if (start.y === end.y) {
        direction = 'H'
    } else {
        // ОШИБКА: нарушена ортогональность
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
```

---

## Критическая логика обеспечения ортогональности

### Предусловие: ортогональность исходного маршрута

Если исходное соединение уже ортогонально (H/V чередуются), то удаление **любых двух последовательных точек** гарантирует ортогональность результата **только если** соседние точки (до и после удаляемых) выровнены по одной из координат.

**Критический момент:**
```
Исходно ортогонально:
P₀(0,0) — P₁(100,0) — P₂(100,100) — P₃(200,100) — P₄(200,200)
H            V            H             V

Удаляем P₂ и P₃:
P₀(0,0) — P₁(100,0) — P₄(200,200)
H            ???           V?

Диагональ! P₁.x ≠ P₄.x И P₁.y ≠ P₄.y
```

### Решение: Валидация перед удалением, отмена при нарушении

Перед удалением необходимо проверить, что соседние точки могут соединиться ортогонально:

```javascript
firstPointIndex = handleSegmentIndex
secondPointIndex = handleSegmentIndex + 1

prevPoint = points[firstPointIndex - 1]
nextPoint = points[secondPointIndex + 1]

// Проверить ортогональность: prevPoint — nextPoint
if (prevPoint.x !== nextPoint.x && prevPoint.y !== nextPoint.y) {
    return ERROR("Удаление приведёт к диагональному соединению, отмена")
}
```

Если эта проверка пройдена, удаление гарантирует ортогональность.

---

## Полный алгоритм (псевдокод)

```javascript
function removeSegmentAtHandle(connection, handleSegmentIndex) {
    const meta = connection.getAttr('connection-meta')
    const points = meta.points  // все точки (fromPin, промежуточные, toPin)
    const N = points.length
    
    // Шаг 1: Валидация
    
    // 1.1: Крайние сегменты
    if (handleSegmentIndex === 0 || handleSegmentIndex === N - 1) {
        console.warn('Нельзя удалить крайний сегмент (пины)')
        return false
    }
    
    // 1.2: Определить тип
    const isTypeA = (N % 2 === 1)  // нечётное число точек → Type A
    
    // 1.3: Минимум точек
    if (isTypeA && N < 5) {
        console.warn('Type A: минимум 5 точек')
        return false
    }
    if (!isTypeA && N < 6) {
        console.warn('Type B: минимум 6 точек')
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
    const prevPoint = points[firstPointIndex - 1]
    const nextPoint = points[secondPointIndex + 1]
    
    if (prevPoint.x !== nextPoint.x && prevPoint.y !== nextPoint.y) {
        console.error(`Удаление приведёт к диагональному соединению: 
            (${prevPoint.x}, ${prevPoint.y}) → (${nextPoint.x}, ${nextPoint.y})`)
        return false
    }
    
    // Шаг 4: Удалить две точки
    const newPoints = points.slice()
    newPoints.splice(firstPointIndex, 2)
    
    // Шаг 5: Пересчитать сегменты из оставшихся точек
    const newSegments = []
    for (let i = 0; i < newPoints.length - 1; i++) {
        const start = newPoints[i]
        const end = newPoints[i + 1]
        
        let direction
        if (start.x === end.x) {
            direction = 'V'
        } else if (start.y === end.y) {
            direction = 'H'
        } else {
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
    meta.points = newPoints
    meta.segments = newSegments
    meta.userModified = true
    
    connection.setAttr('connection-meta', meta)
    this.redrawConnection(connection)
    this.addLineEditHandles(connection)
    
    console.log(`Удаление выполнено: ${N} → ${newPoints.length} точек, ${N - 1} → ${newSegments.length} сегментов`)
    return true
}
```

---

## Примеры пошагово

### Пример 1: Type A (5 точек → 3 точки)

**Исходно:**
```
points = [P₀(0,0), P₁(100,0), P₂(100,100), P₃(200,100), P₄(200,0)]
N = 5 (нечётное) → Type A

Сегменты:
Seg₀: H (0,0) → (100,0)       [P₀ → P₁]
Seg₁: V (100,0) → (100,100)   [P₁ → P₂]
Seg₂: H (100,100) → (200,100) [P₂ → P₃]  ← центральный
Seg₃: V (200,100) → (200,0)   [P₃ → P₄]
```

**Удаляем Seg₂ (центральный):**
```
handleSegmentIndex = 2
firstPointIndex = 2
secondPointIndex = 3

Удаляем: points[2] (P₂) и points[3] (P₃)

Проверка ортогональности:
prevPoint = points[1] = P₁(100,0)
nextPoint = points[4] = P₄(200,0)
P₁.x ≠ P₄.x (100 ≠ 200) ✓
P₁.y === P₄.y (0 === 0) ✓
→ Ортогональная H!

Числа после удаления:
points = [P₀(0,0), P₁(100,0), P₄(200,0)]
N = 3

Новые сегменты:
Seg₀: H (0,0) → (100,0)
Seg₁: H (100,0) → (200,0)

Результат: 5 → 3 точки, 4 → 2 сегмента
```

---

### Пример 2: Type B (6 точек → 4 точки)

**Исходно:**
```
points = [P₀(0,0), P₁(100,0), P₂(100,100), P₃(200,100), P₄(200,0), P₅(300,0)]
N = 6 (чётное) → Type B

Сегменты (5):
Seg₀: H (0,0) → (100,0)       [P₀ → P₁]
Seg₁: V (100,0) → (100,100)   [P₁ → P₂]
Seg₂: H (100,100) → (200,100) [P₂ → P₃]  ← центральные (можно удалить)
Seg₃: V (200,100) → (200,0)   [P₃ → P₄]  ← центральные
Seg₄: H (200,0) → (300,0)     [P₄ → P₅]
```

**Удаляем Seg₂:**
```
handleSegmentIndex = 2
firstPointIndex = 2
secondPointIndex = 3

Удаляем: points[2] (P₂) и points[3] (P₃)

Проверка:
prevPoint = points[1] = P₁(100,0)
nextPoint = points[4] = P₄(200,0)
P₁.x ≠ P₄.x (100 ≠ 200) ✓
P₁.y === P₄.y (0 === 0) ✓
→ Ортогональная H ✓

Числа после удаления:
points = [P₀(0,0), P₁(100,0), P₄(200,0), P₅(300,0)]
N = 4

Новые сегменты:
Seg₀: H (0,0) → (100,0)
Seg₁: H (100,0) → (200,0)
Seg₂: H (200,0) → (300,0)

Результат: 6 → 4 точки, 5 → 3 сегмента
```

---

## Инварианты

✓ **Точки — источник истины.** Сегменты всегда пересчитываются из точек.

✓ **Отмена вместо исправления.** Если предварительная проверка ортогональности не пройдена, операция отменяется.

✓ **Бинарный результат.** Удаление либо полностью выполняется, либо отменяется. Нет промежуточных состояний.

✓ **Сохранение крайних направлений.** Первый и последний сегменты определены пинами и сохраняют свои направления.

✓ **Минимум точек:** Type A требует минимум 5 точек, Type B требует минимум 6 точек. Это защищает пины от удаления.
