// connection-updater.js
// Обновление соединений при перемещении пинов и изображений
// Координатный подход: передаются абсолютные координаты вместо дельты

class ConnectionUpdater {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
    }

    /**
     * Унифицированный метод обновления соединений
     * Работает для движения пинов и изображений
     * 
     * @param {Konva.Circle} pin - Пин, связанный с движением
     * @param {number} newX - Новая X координата пина
     * @param {number} newY - Новая Y координата пина
     * @param {number} oldX - Старая X координата пина (для определения направления движения)
     * @param {number} oldY - Старая Y координата пина
     * @param {boolean} isImageDrag - true если движение изображения, false если движение пина
     * @param {Array} connections - Все соединения
     * @param {Function} redrawConnection - Коллбэк для перерисовки
     */
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

    /**
     * Обновить соединения когда двигается исходящий пин (fromPin)
     */
    updateFromPinConnections(connMeta, newX, newY, oldX, oldY, isImageDrag) {
        const firstSeg = connMeta.segments[0];
        
        // Обновить начало первого сегмента (новая позиция пина)
        firstSeg.start.x = newX;
        firstSeg.start.y = newY;

        if (isImageDrag) {
            // Движение ИЗОБРАЖЕНИЯ: анализируем направление движения
            this.updateSegmentEndForImageDrag(firstSeg, newX, newY, oldX, oldY);
        } else {
            // Движение ПИНА: обновляем соседнюю точку для ортогональности
            this.updateSegmentEndForPinDrag(firstSeg, newX, newY);
        }

        // Обновить начало второго сегмента для непрерывности
        if (connMeta.segments.length > 1) {
            const secondSeg = connMeta.segments[1];
            secondSeg.start.x = firstSeg.end.x;
            secondSeg.start.y = firstSeg.end.y;
        }
    }

    /**
     * Обновить соединения когда двигается входящий пин (toPin)
     */
    updateToPinConnections(connMeta, newX, newY, oldX, oldY, isImageDrag) {
        const lastSegIdx = connMeta.segments.length - 1;
        const lastSeg = connMeta.segments[lastSegIdx];

        // Обновить конец последнего сегмента (новая позиция пина)
        lastSeg.end.x = newX;
        lastSeg.end.y = newY;

        if (isImageDrag) {
            // Движение ИЗОБРАЖЕНИЯ: анализируем направление движения
            this.updateSegmentStartForImageDrag(lastSeg, newX, newY, oldX, oldY);
        } else {
            // Движение ПИНА: обновляем соседнюю точку для ортогональности
            this.updateSegmentStartForPinDrag(lastSeg, newX, newY);
        }

        // Обновить конец предыдущего сегмента для непрерывности
        if (lastSegIdx > 0) {
            const prevSeg = connMeta.segments[lastSegIdx - 1];
            prevSeg.end.x = lastSeg.start.x;
            prevSeg.end.y = lastSeg.start.y;
        }
    }

    /**
     * Обновить конец сегмента при движении ПИНА
     * Выравнивает соседнюю точку в зависимости от направления
     */
    updateSegmentEndForPinDrag(segment, newX, newY) {
        if (segment.direction === 'H') {
            // Горизонтальный: Y выравнивается с пином, X не меняется
            segment.end.y = newY;
        } else if (segment.direction === 'V') {
            // Вертикальный: X выравнивается с пином, Y не меняется
            segment.end.x = newX;
        }
    }

    /**
     * Обновить начало сегмента при движении ПИНА
     * Выравнивает соседнюю точку в зависимости от направления
     */
    updateSegmentStartForPinDrag(segment, newX, newY) {
        if (segment.direction === 'H') {
            // Горизонтальный: Y выравнивается с пином, X не меняется
            segment.start.y = newY;
        } else if (segment.direction === 'V') {
            // Вертикальный: X выравнивается с пином, Y не меняется
            segment.start.x = newX;
        }
    }

    /**
     * Обновить конец сегмента при движении ИЗОБРАЖЕНИЯ
     * Анализирует направление движения: вдоль сегмента или перпендикулярно
     * ВСЕГДА обновляет соседнюю точку для сохранения ортогональности
     */
    updateSegmentEndForImageDrag(segment, newX, newY, oldX, oldY) {
        // ВСЕГДА обновляем соседнюю точку как при движении пина
        // для сохранения ортогональности
        this.updateSegmentEndForPinDrag(segment, newX, newY);
    }

    /**
     * Обновить начало сегмента при движении ИЗОБРАЖЕНИЯ
     * Анализирует направление движения: вдоль сегмента или перпендикулярно
     * ВСЕГДА обновляет соседнюю точку для сохранения ортогональности
     */
    updateSegmentStartForImageDrag(segment, newX, newY, oldX, oldY) {
        // ВСЕГДА обновляем соседнюю точку как при движении пина
        // для сохранения ортогональности
        this.updateSegmentStartForPinDrag(segment, newX, newY);
    }

    /**
     * Проверить, движется ли точка вдоль сегмента
     * 
     * @param {Object} segment - Сегмент {start, end, direction}
     * @param {number} deltaX - Смещение по X
     * @param {number} deltaY - Смещение по Y
     * @returns {boolean} - true если движение вдоль сегмента
     */
    isMovementAlongSegment(segment, deltaX, deltaY) {
        if (segment.direction === 'H') {
            // Горизонтальный сегмент: проверяем что deltaY минимален
            return Math.abs(deltaY) < 5;
        } else if (segment.direction === 'V') {
            // Вертикальный сегмент: проверяем что deltaX минимален
            return Math.abs(deltaX) < 5;
        }
        return false;
    }
}

export { ConnectionUpdater };
