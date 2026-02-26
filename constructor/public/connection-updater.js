// connection-updater.js
// Модуль обновления геометрии соединений при смещении узлов графа.
class ConnectionUpdater {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
    }

    /** Пайплайн обновления маршрутов для узла при его триггере.
     * Вход: pin (Konva.Circle), newX (Number), newY (Number), oldX (Number), oldY (Number), isImageDrag (Boolean), connections (Array), redrawConnection (Function). */
    updateConnections(pin, newX, newY, oldX, oldY, isImageDrag, connections, redrawConnection) {
        const pinMeta = pin.getAttr('cp-meta');
        if (!pinMeta.connectedTo) return;

        connections.forEach(connection => {
            const connMeta = connection.getAttr('connection-meta');
            if (!connMeta) return;

            const isFromPin = connMeta.fromPin === pin;
            const isToPin = connMeta.toPin === pin;

            if (!isFromPin && !isToPin) return;

            if (isFromPin) {
                this.updateFromPinConnections(connMeta, newX, newY, oldX, oldY, isImageDrag);
            } else if (isToPin) {
                this.updateToPinConnections(connMeta, newX, newY, oldX, oldY, isImageDrag);
            }

            connection.setAttr('connection-meta', connMeta);
            redrawConnection(connection);
        });
    }

    /** Корректировка исходящего маршрута.
     * Вход: connMeta (Object), newX (Number), newY (Number), oldX (Number), oldY (Number), isImageDrag (Boolean). */
    updateFromPinConnections(connMeta, newX, newY, oldX, oldY, isImageDrag) {
        const firstSeg = connMeta.segments[0];

        // Синхронизация стартовой координаты
        firstSeg.start.x = newX;
        firstSeg.start.y = newY;

        if (isImageDrag) {
            // Триггер смещения родительского изображения
            this.updateSegmentEndForImageDrag(firstSeg, newX, newY, oldX, oldY);
        } else {
            // Триггер локального смещения узла по границе
            this.updateSegmentEndForPinDrag(firstSeg, newX, newY);
        }

        // Фиксация точек излома для второго смежного сегмента
        if (connMeta.segments.length > 1) {
            const secondSeg = connMeta.segments[1];
            secondSeg.start.x = firstSeg.end.x;
            secondSeg.start.y = firstSeg.end.y;
        }
    }

    /** Корректировка входящего маршрута.
     * Вход: connMeta (Object), newX (Number), newY (Number), oldX (Number), oldY (Number), isImageDrag (Boolean). */
    updateToPinConnections(connMeta, newX, newY, oldX, oldY, isImageDrag) {
        const lastSegIdx = connMeta.segments.length - 1;
        const lastSeg = connMeta.segments[lastSegIdx];

        // Синхронизация терминальной координаты
        lastSeg.end.x = newX;
        lastSeg.end.y = newY;

        if (isImageDrag) {
            // Триггер смещения родительского изображения
            this.updateSegmentStartForImageDrag(lastSeg, newX, newY, oldX, oldY);
        } else {
            // Триггер локального смещения узла по границе
            this.updateSegmentStartForPinDrag(lastSeg, newX, newY);
        }

        // Фиксация точек излома для смежного сегмента
        if (lastSegIdx > 0) {
            const prevSeg = connMeta.segments[lastSegIdx - 1];
            prevSeg.end.x = lastSeg.start.x;
            prevSeg.end.y = lastSeg.start.y;
        }
    }

    /** Поддержание ортогональности конечной точки сегмента.
     * Вход: segment (Object), newX (Number), newY (Number). */
    updateSegmentEndForPinDrag(segment, newX, newY) {
        if (segment.direction === 'H') {
            // Компенсация по оси Y
            segment.end.y = newY;
        } else if (segment.direction === 'V') {
            // Компенсация по оси X
            segment.end.x = newX;
        }
    }

    /** Поддержание ортогональности начальной точки сегмента.
     * Вход: segment (Object), newX (Number), newY (Number). */
    updateSegmentStartForPinDrag(segment, newX, newY) {
        if (segment.direction === 'H') {
            // Компенсация по оси Y
            segment.start.y = newY;
        } else if (segment.direction === 'V') {
            // Компенсация по оси X
            segment.start.x = newX;
        }
    }

    /** Ортогональная компенсация конца сегмента для родительского компонента.
     * Вход: segment (Object), newX (Number), newY (Number), oldX (Number), oldY (Number). */
    updateSegmentEndForImageDrag(segment, newX, newY, oldX, oldY) {
        // Декодирование локальной функции
        this.updateSegmentEndForPinDrag(segment, newX, newY);
    }

    /** Ортогональная компенсация начальной точки сегмента для родительского компонента.
     * Вход: segment (Object), newX (Number), newY (Number), oldX (Number), oldY (Number). */
    updateSegmentStartForImageDrag(segment, newX, newY, oldX, oldY) {
        // Декодирование локальной функции
        this.updateSegmentStartForPinDrag(segment, newX, newY);
    }

    /** Анализ вектора перемещения на соосность оси сегмента.
     * Вход: segment (Object), deltaX (Number), deltaY (Number).
     * Выход: Флаг соосности (Boolean). */
    isMovementAlongSegment(segment, deltaX, deltaY) {
        if (segment.direction === 'H') {
            // Минимальное отклонение по Y для H-сегмента
            return Math.abs(deltaY) < 5;
        } else if (segment.direction === 'V') {
            // Минимальное отклонение по X для V-сегмента
            return Math.abs(deltaX) < 5;
        }
        return false;
    }
}

export { ConnectionUpdater };