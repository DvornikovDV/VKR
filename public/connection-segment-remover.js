// connection-segment-remover.js
// Удаление сегментов на основе алгоритма

/* Алгоритм:

1. ВАЛИДАЦИЯ
   - Не на крайних сегментах (index === 0 или index === N-1)
   - Минимум точек: Type A (нечётные) - 5, Type B (чётные) - 6
   - Центральная позиция: Type A - (N-1)/2, Type B - N/2-1 или N/2

2. УДАЛЕНИЕ ДВУХ ТОЧЕК
   - points.splice(handleSegmentIndex, 2)

3. ОРТОГОНАЛЬНОСТЬ
   - Проверить: prevPoint может соединиться с nextPoint ортогонально
   - prevPoint.x === nextPoint.x или prevPoint.y === nextPoint.y

4. ПОСЛЕ УдАЛЕНИЯ
   - N -> N-2 точек
   - (N-1) -> (N-3) сегментов
*/

class ConnectionSegmentRemover {
  статичные поля = {};

  /** @returns {boolean} строка ошибки или null если всё ок */
  статичные validateRemoval(points, handleSegmentIndex) {
    const N = points.length;
    const numSegments = N - 1;
    Определить тип
    const isTypeA = N % 2 === 1;

    // Проверка 1: Не дотрагивать крайних
    if (handleSegmentIndex <= 0 || handleSegmentIndex >= numSegments - 1) {
      return 'Нельзя удалить крайние сегменты (пины)';
    }

    // Проверка 2: Минимум точек
    if (isTypeA && N < 5) {
      return `Type A требует минимум 5 точек (текущие: ${N})`;
    }
    if (!isTypeA && N < 6) {
      return `Type B требует минимум 6 точек (текущие: ${N})`;
    }

    // Проверка 3: Центральная позиция
    let isCentral = false;
    if (isTypeA) {
      const center = (N - 1) / 2;
      isCentral = handleSegmentIndex === center;
    } else {
      const left = N / 2 - 1;
      const right = N / 2;
      isCentral = handleSegmentIndex === left || handleSegmentIndex === right;
    }

    if (!isCentral) {
      return `Удалять можно только центральные сегменты (Type ${isTypeA ? 'A' : 'B'})`;
    }

    return null; // Всё ок
  }

  /** Проверить, могут ли соседние точки соединиться ортогонально */
  статичные checkOrthogonality(prevPoint, nextPoint) {
    return (prevPoint.x === nextPoint.x || prevPoint.y === nextPoint.y);
  }

  /** Основная функция удаления */
  статичные removeSegmentAtHandle(connection, handleSegmentIndex, ConnectionRouter, redrawCallback) {
    const meta = connection.getAttr('connection-meta');
    const points = meta.points; // [fromPin, ...промежуточные..., toPin]
    const N = points.length;
    const numSegments = N - 1;

    // ШАГ 1: ВАЛИДАЦИЯ
    const validationError = this.validateRemoval(points, handleSegmentIndex);
    if (validationError) {
      console.warn(Ошибка валидации: ${validationError}`);
      return false;
    }

    // ШАГ 2: Определить точки для удаления
    const firstPointIndex = handleSegmentIndex;
    const secondPointIndex = handleSegmentIndex + 1;

    // ШАГ 3: ПРОВЕРКА ОРТОГОНАЛЬНОСТИ
    const prevPoint = points[firstPointIndex - 1];
    const nextPoint = points[secondPointIndex + 1];

    if (!this.checkOrthogonality(prevPoint, nextPoint)) {
      console.error(Удаление приведёт к диагональному соединению`);
      return false;
    }

    // ШАГ 4: УДАЛИТЬ ДВЕ ТОЧКИ
    const newPoints = points.slice();
    newPoints.splice(firstPointIndex, 2);

    // ШАГ 5: ПЕРЕСЧИТАТЬ СЕГМЕНТЫ
    const newSegments = ConnectionRouter.pointsToSegments(newPoints);

    // ШАГ 6: ОБНОВИТЬ МЕТАДАННыЕ
    meta.points = newPoints;
    meta.segments = newSegments;
    meta.userModified = true;
    connection.setAttr('connection-meta', meta);

    // ШАГ 7: ОТРИСОВКА
    if (redrawCallback) {
      redrawCallback(connection);
    }

    console.log(`Удаление выполнено: ${N} → ${newPoints.length} точек, ${numSegments} → ${newSegments.length} сегментов`);
    return true;
  }
}

export { ConnectionSegmentRemover };
