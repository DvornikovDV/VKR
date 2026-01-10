// connection-breaker.js
// Управление точками отклонения в соединениях

class ConnectionBreaker {
    /**
     * Добавить точку отклонения на сегмент
     * Включает вся ручки в режим отклонения
     * 
     * @param {Object} connMeta - Метаданные соединения
     * @param {number} segmentIndex - Номер сегмента
     * @returns {Object} Обновленная метаданные
     */
    static addBreakToSegment(connMeta, segmentIndex) {
        // Получить сегмент
        const segment = connMeta.segments[segmentIndex];
        if (!segment) return connMeta;

        // Вычислить мидпойнт сегмента
        const midX = (segment.start.x + segment.end.x) / 2;
        const midY = (segment.start.y + segment.end.y) / 2;

        // Определить направление перпендикулярного перемещения
        // Для H-сегмента: вертикальное отклонение
        // Для V-сегмента: горизонтальное отклонение
        const breakDist = 30; // пиксели на отклонение
        const perpDirection = segment.direction === 'H' ? 'V' : 'H';

        // Найти следующий сегмент для отсчета численности
        let nextSegIndex = segmentIndex + 1;
        let breakReturnDist = 0;

        if (nextSegIndex < connMeta.segments.length) {
            // Отклонение должно вернуться на следующий сегмент
            breakReturnDist = 40;
        }

        // Определить координаты точки отклонения
        let breakPointX, breakPointY, returnPointX, returnPointY;

        if (segment.direction === 'H') {
            // H-сегмент: отклонение вертикальное
            breakPointX = midX;
            breakPointY = midY + breakDist;
            returnPointX = midX;
            returnPointY = midY + breakDist + breakReturnDist;
        } else {
            // V-сегмент: отклонение горизонтальное
            breakPointX = midX + breakDist;
            breakPointY = midY;
            returnPointX = midX + breakDist + breakReturnDist;
            returnPointY = midY;
        }

        // Найти текущие сегменты, которые отклоняются
        const inBreakMode = connMeta.segments.some(seg => seg.isBreak);
        if (inBreakMode) {
            // Не позволять добавлять еще отклонения
            console.warn('Мода отклонения уже активна. Не можно добавлять новые отклонения.');
            return connMeta;
        }

        // Найти все отклоняющиеся сегменты и маркировать в режиме отклонения
        connMeta.segments.forEach((seg, idx) => {
            if (idx === segmentIndex) {
                // Первый новый сегмент: на мидпоинт
                seg.isBreak = true;
            }
        });

        // Структура рассыпается, имеем тоесть первые два новых сегмента
        const newSegments = [];
        connMeta.segments.forEach((seg, idx) => {
            if (idx < segmentIndex) {
                // Оставить неизменным
                newSegments.push(seg);
            } else if (idx === segmentIndex) {
                // Отклоняющие сегменты
                // Seg 1: оригинал до мидпоинта
                newSegments.push({
                    direction: segment.direction,
                    start: { x: segment.start.x, y: segment.start.y },
                    end: { x: midX, y: midY },
                    isBreak: true
                });
                // Seg 2: перпендикулярное отклонение
                newSegments.push({
                    direction: perpDirection,
                    start: { x: midX, y: midY },
                    end: { x: breakPointX, y: breakPointY },
                    isBreak: true
                });
                // Seg 3: возврат на главное направление
                newSegments.push({
                    direction: segment.direction,
                    start: { x: breakPointX, y: breakPointY },
                    end: { x: returnPointX, y: returnPointY },
                    isBreak: true
                });
                // Seg 4: на следующий сегмент
                newSegments.push({
                    direction: perpDirection,
                    start: { x: returnPointX, y: returnPointY },
                    end: { x: segment.end.x, y: segment.end.y },
                    isBreak: true
                });
            } else {
                // Оставить неизменным
                newSegments.push(seg);
            }
        });

        // Обновить сегменты
        connMeta.segments = newSegments;

        // Обновить данные статуса
        connMeta.userModified = true;
        connMeta.lastModified = new Date().toISOString();

        return connMeta;
    }

    /**
     * Проверить энаходится ли сигмент в режиме отклонения
     */
    static isInBreakMode(connMeta) {
        return connMeta.segments && connMeta.segments.some(seg => seg.isBreak === true);
    }

    /**
     * Получить огинающие сегменты
     */
    static getBreakSegments(connMeta) {
        return connMeta.segments ? connMeta.segments.filter(seg => seg.isBreak === true) : [];
    }
}

export { ConnectionBreaker };
