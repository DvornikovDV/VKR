// connection-updater.js
// Обновление соединений при перемещении пинов и изображений
//
// Унифицированная система обновления:
// 1. При движении ПИНА: пересчитываются ОБЕ крайние точки (конец и предпоследняя)
// 2. При движении ИЗОБРАЖЕНИЯ: анализируется направление движения относительно крайнего сегмента
//    - Если движение вдоль сегмента (H или V) → обновляется только конец (пин)
//    - Если движение не вдоль сегмента → обновляются оба конца для ортогональности

class ConnectionUpdater {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
    }

    /**
     * Унифицированный метод обновления соединений
     * Работает для движения пинов и изображений
     * 
     * @param {Konva.Circle} pin - Пин, связанный с движением
     * @param {Object} moveData - {deltaX, deltaY, isImageDrag} данные о движении
     * @param {Array} connections - Все соединения
     * @param {Function} redrawConnection - Коллбэк для перерисовки
     */
    updateConnections(pin, moveData, connections, redrawConnection) {
        const pinMeta = pin.getAttr('cp-meta');
        if (!pinMeta.connectedTo) return;

        const { deltaX = 0, deltaY = 0, isImageDrag = false } = moveData;

        connections.forEach(connection => {
            const connMeta = connection.getAttr('connection-meta');
            if (!connMeta) return;

            const isFromPin = connMeta.fromPin === pin;
            const isToPin = connMeta.toPin === pin;

            if (!isFromPin && !isToPin) return;

            if (isImageDrag) {
                // Движение ИЗОБРАЖЕНИЯ: анализируем направление
                if (isFromPin) {
                    this.updateForImageDragFromPin(connMeta, pin, deltaX, deltaY);
                } else if (isToPin) {
                    this.updateForImageDragToPin(connMeta, pin, deltaX, deltaY);
                }
            } else {
                // Движение ПИНА: обновляем обе крайние точки
                if (isFromPin) {
                    this.updateForPinDragFromPin(connMeta, deltaX, deltaY);
                } else if (isToPin) {
                    this.updateForPinDragToPin(connMeta, deltaX, deltaY);
                }
            }

            connection.setAttr('connection-meta', connMeta);
            redrawConnection(connection);
        });
    }

    /**
     * Обновление при движении ПИНА (исходящий пин)
     * Обновляются ОБЕ крайние точки для сохранения ортогональности
     */
    updateForPinDragFromPin(connMeta, deltaX, deltaY) {
        const firstSeg = connMeta.segments[0];
        
        // 1. Обновить начало первого сегмента (пин)
        firstSeg.start.x += deltaX;
        firstSeg.start.y += deltaY;

        // 2. Обновить конец первого сегмента в зависимости от направления
        if (firstSeg.direction === 'H') {
            // Горизонтальный сегмент: меняем Y конца, X не меняется
            firstSeg.end.y = firstSeg.start.y;
        } else if (firstSeg.direction === 'V') {
            // Вертикальный сегмент: меняем X конца, Y не меняется
            firstSeg.end.x = firstSeg.start.x;
        }

        // 3. Обновить начало второго сегмента для непрерывности
        if (connMeta.segments.length > 1) {
            const secondSeg = connMeta.segments[1];
            secondSeg.start.x = firstSeg.end.x;
            secondSeg.start.y = firstSeg.end.y;
        }
    }

    /**
     * Обновление при движении ПИНА (входящий пин)
     * Обновляются ОБЕ крайние точки для сохранения ортогональности
     */
    updateForPinDragToPin(connMeta, deltaX, deltaY) {
        const lastSegIdx = connMeta.segments.length - 1;
        const lastSeg = connMeta.segments[lastSegIdx];

        // 1. Обновить конец последнего сегмента (пин)
        lastSeg.end.x += deltaX;
        lastSeg.end.y += deltaY;

        // 2. Обновить начало последнего сегмента в зависимости от направления
        if (lastSeg.direction === 'H') {
            // Горизонтальный сегмент: меняем Y начала, X не меняется
            lastSeg.start.y = lastSeg.end.y;
        } else if (lastSeg.direction === 'V') {
            // Вертикальный сегмент: меняем X начала, Y не меняется
            lastSeg.start.x = lastSeg.end.x;
        }

        // 3. Обновить конец предыдущего сегмента для непрерывности
        if (lastSegIdx > 0) {
            const prevSeg = connMeta.segments[lastSegIdx - 1];
            prevSeg.end.x = lastSeg.start.x;
            prevSeg.end.y = lastSeg.start.y;
        }
    }

    /**
     * Обновление при движении ИЗОБРАЖЕНИЯ (исходящий пин)
     * Анализируем направление движения относительно первого сегмента
     * 
     * - Если движение вдоль сегмента (параллельно): обновляется только пин
     * - Если движение не вдоль сегмента (перпендикулярно или диагонально): обновляются обе точки
     */
    updateForImageDragFromPin(connMeta, pin, deltaX, deltaY) {
        const firstSeg = connMeta.segments[0];

        // Новая позиция пина
        const newPinX = pin.x() + deltaX;
        const newPinY = pin.y() + deltaY;

        // Обновить начало первого сегмента (позиция пина)
        firstSeg.start.x = newPinX;
        firstSeg.start.y = newPinY;

        // Определяем, движется ли изображение вдоль сегмента или перпендикулярно
        const isMovementAlongSegment = this.isMovementAlongSegment(
            firstSeg,
            deltaX,
            deltaY
        );

        if (isMovementAlongSegment) {
            // Движение ВДОЛь сегмента: обновляем только пин
            // Конец сегмента сдвигается вместе с пином, сохраняя расстояние
            const segmentLength = this.getSegmentLength(firstSeg);
            if (firstSeg.direction === 'H') {
                firstSeg.end.y = firstSeg.start.y; // Y выравнивается с пином
                // X остается неизменным (сегмент скользит горизонтально)
            } else if (firstSeg.direction === 'V') {
                firstSeg.end.x = firstSeg.start.x; // X выравнивается с пином
                // Y остается неизменным (сегмент скользит вертикально)
            }
        } else {
            // Движение НЕ вдоль сегмента: обновляем обе крайние точки
            // Сегмент поворачивается для сохранения ортогональности
            if (firstSeg.direction === 'H') {
                firstSeg.end.y = firstSeg.start.y; // Y выравнивается
                // X конца сохраняется (определяется следующим сегментом)
            } else if (firstSeg.direction === 'V') {
                firstSeg.end.x = firstSeg.start.x; // X выравнивается
                // Y конца сохраняется (определяется следующим сегментом)
            }
        }

        // Обновить начало второго сегмента для непрерывности
        if (connMeta.segments.length > 1) {
            const secondSeg = connMeta.segments[1];
            secondSeg.start.x = firstSeg.end.x;
            secondSeg.start.y = firstSeg.end.y;
        }
    }

    /**
     * Обновление при движении ИЗОБРАЖЕНИЯ (входящий пин)
     * Анализируем направление движения относительно последнего сегмента
     */
    updateForImageDragToPin(connMeta, pin, deltaX, deltaY) {
        const lastSegIdx = connMeta.segments.length - 1;
        const lastSeg = connMeta.segments[lastSegIdx];

        // Новая позиция пина
        const newPinX = pin.x() + deltaX;
        const newPinY = pin.y() + deltaY;

        // Обновить конец последнего сегмента (позиция пина)
        lastSeg.end.x = newPinX;
        lastSeg.end.y = newPinY;

        // Определяем, движется ли изображение вдоль сегмента или перпендикулярно
        const isMovementAlongSegment = this.isMovementAlongSegment(
            lastSeg,
            deltaX,
            deltaY
        );

        if (isMovementAlongSegment) {
            // Движение ВДОЛЬ сегмента: обновляем только пин
            if (lastSeg.direction === 'H') {
                lastSeg.start.y = lastSeg.end.y; // Y выравнивается с пином
                // X остается неизменным
            } else if (lastSeg.direction === 'V') {
                lastSeg.start.x = lastSeg.end.x; // X выравнивается с пином
                // Y остается неизменным
            }
        } else {
            // Движение НЕ вдоль сегмента: обновляем обе крайние точки
            if (lastSeg.direction === 'H') {
                lastSeg.start.y = lastSeg.end.y; // Y выравнивается
                // X начала сохраняется (определяется предыдущим сегментом)
            } else if (lastSeg.direction === 'V') {
                lastSeg.start.x = lastSeg.end.x; // X выравнивается
                // Y начала сохраняется (определяется предыдущим сегментом)
            }
        }

        // Обновить конец предыдущего сегмента для непрерывности
        if (lastSegIdx > 0) {
            const prevSeg = connMeta.segments[lastSegIdx - 1];
            prevSeg.end.x = lastSeg.start.x;
            prevSeg.end.y = lastSeg.start.y;
        }
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
            // Горизонтальный сегмент: проверяем что deltaY ≈ 0
            return Math.abs(deltaY) < Math.abs(deltaX) || Math.abs(deltaY) < 5;
        } else if (segment.direction === 'V') {
            // Вертикальный сегмент: проверяем что deltaX ≈ 0
            return Math.abs(deltaX) < Math.abs(deltaY) || Math.abs(deltaX) < 5;
        }
        return false;
    }

    /**
     * Получить длину сегмента
     */
    getSegmentLength(segment) {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Легаси-метод для совместимости (используется при обновлении пинов без delta)
     * Был использован ранее, сохраняем для обратной совместимости
     */
    updateConnectionsForPin(pin, imageMoveData, connections, redrawConnection) {
        // Делегируем к унифицированному методу с флагом isImageDrag
        const moveData = {
            deltaX: imageMoveData.deltaX || 0,
            deltaY: imageMoveData.deltaY || 0,
            isImageDrag: true
        };
        this.updateConnections(pin, moveData, connections, redrawConnection);
    }
}

export { ConnectionUpdater };
