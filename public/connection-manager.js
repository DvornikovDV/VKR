// connection-manager.js
// Управление соединениями (линиями) с поддержкой сегментов и их редактирования

class ConnectionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.connections = [];
        this.onConnectionCreated = null;
        this.onConnectionSelected = null;
        this.onConnectionDeleted = null;
        this.activeDragConnection = null; // Для предотвращения одновременного перетаскивания
        this.selectedConnection = null; // Отслеживание выбранного соединения для обновления подсветки
    }

    /**
     * Создать соединение между двумя пинами
     */
    createConnection(pin1, pin2) {
        const meta1 = pin1.getAttr('cp-meta');
        const meta2 = pin2.getAttr('cp-meta');

        // Создаём сегменты на основе сторон пинов
        const segments = this.calculateSegments(pin1, pin2);
        const points = this.segmentsToPoints(segments);

        const connection = new Konva.Line({
            points: points,
            stroke: '#000',
            strokeWidth: 2,
            listening: true,
            hitStrokeWidth: 10
        });

        connection.setAttr('connection-meta', {
            id: 'conn_' + Date.now(),
            fromPin: pin1,
            toPin: pin2,
            segments: segments,
            handles: [],
            isDragging: false,
            userModified: false,
            lastModified: new Date().toISOString(),
            highlightLine: null // Для подсветки выделения
        });

        connection.on('click', (e) => {
            e.cancelBubble = true;
            if (this.onConnectionSelected) {
                this.onConnectionSelected(connection);
            }
        });

        // Обновить статус пинов
        meta1.connectedTo = meta2.id;
        meta2.connectedTo = meta1.id;
        pin1.setAttr('cp-meta', meta1);
        pin2.setAttr('cp-meta', meta2);

        // Меняем цвет пинов
        pin1.fill('#dc3545');
        pin2.fill('#dc3545');

        this.canvasManager.getLayer().add(connection);
        this.connections.push(connection);
        this.canvasManager.getLayer().batchDraw();

        if (this.onConnectionCreated) {
            this.onConnectionCreated(connection);
        }

        console.log(`Создано соединение между ${meta1.id} и ${meta2.id}`);
        return connection;
    }

    /**
     * Определить тип маршрутизации (2 или 3 сегмента)
     */
    getRoutingCase(pin1, pin2) {
        const side1 = pin1.getAttr('cp-meta').side;
        const side2 = pin2.getAttr('cp-meta').side;

        const sameSideHorizontal = 
            (side1 === 'left' && side2 === 'right') ||
            (side1 === 'right' && side2 === 'left');
        
        const sameSideVertical = 
            (side1 === 'top' && side2 === 'bottom') ||
            (side1 === 'bottom' && side2 === 'top');

        if (sameSideHorizontal || sameSideVertical) {
            return 'THREE_SEGMENTS';
        } else {
            return 'TWO_SEGMENTS';
        }
    }

    /**
     * Вычислить сегменты маршрута
     */
    calculateSegments(pin1, pin2) {
        const pos1 = pin1.position();
        const pos2 = pin2.position();
        const side1 = pin1.getAttr('cp-meta').side;
        const side2 = pin2.getAttr('cp-meta').side;

        const routingCase = this.getRoutingCase(pin1, pin2);
        const segments = [];

        if (routingCase === 'TWO_SEGMENTS') {
            // L-shape маршрутизация
            const midX = this.isSideHorizontal(side1) ? pos2.x : pos1.x;
            const midY = this.isSideHorizontal(side1) ? pos1.y : pos2.y;

            if (this.isSideHorizontal(side1)) {
                // Сначала горизонтально, потом вертикально
                segments.push({
                    index: 0,
                    direction: 'H',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: midX, y: midY }
                });
                segments.push({
                    index: 1,
                    direction: 'V',
                    start: { x: midX, y: midY },
                    end: { x: pos2.x, y: pos2.y }
                });
            } else {
                // Сначала вертикально, потом горизонтально
                segments.push({
                    index: 0,
                    direction: 'V',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: midX, y: midY }
                });
                segments.push({
                    index: 1,
                    direction: 'H',
                    start: { x: midX, y: midY },
                    end: { x: pos2.x, y: pos2.y }
                });
            }
        } else {
            // Center-axis маршрутизация (3 сегмента)
            const centerX = (pos1.x + pos2.x) / 2;
            const centerY = (pos1.y + pos2.y) / 2;

            if (this.isSideHorizontal(side1)) {
                // H-V-H
                segments.push({
                    index: 0,
                    direction: 'H',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: centerX, y: pos1.y }
                });
                segments.push({
                    index: 1,
                    direction: 'V',
                    start: { x: centerX, y: pos1.y },
                    end: { x: centerX, y: centerY }
                });
                segments.push({
                    index: 2,
                    direction: 'H',
                    start: { x: centerX, y: centerY },
                    end: { x: pos2.x, y: pos2.y }
                });
            } else {
                // V-H-V
                segments.push({
                    index: 0,
                    direction: 'V',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: pos1.x, y: centerY }
                });
                segments.push({
                    index: 1,
                    direction: 'H',
                    start: { x: pos1.x, y: centerY },
                    end: { x: centerX, y: centerY }
                });
                segments.push({
                    index: 2,
                    direction: 'V',
                    start: { x: centerX, y: centerY },
                    end: { x: pos2.x, y: pos2.y }
                });
            }
        }

        return segments;
    }

    /**
     * Проверить, горизонтальная ли сторона
     */
    isSideHorizontal(side) {
        return side === 'left' || side === 'right';
    }

    /**
     * Перевести сегменты в плоский массив точек
     */
    segmentsToPoints(segments) {
        const points = [];
        for (let i = 0; i < segments.length; i++) {
            if (i === 0) {
                points.push(segments[i].start.x, segments[i].start.y);
            }
            points.push(segments[i].end.x, segments[i].end.y);
        }
        return points;
    }

    /**
     * Перевести точки в сегменты
     */
    pointsToSegments(points) {
        const segments = [];
        for (let i = 0; i < points.length - 2; i += 2) {
            const start = { x: points[i], y: points[i + 1] };
            const end = { x: points[i + 2], y: points[i + 3] };
            const direction = (start.x === end.x) ? 'V' : 'H';

            segments.push({
                index: i / 2,
                direction: direction,
                start: start,
                end: end
            });
        }
        return segments;
    }

    /**
     * Валидировать сегменты
     */
    validateSegments(segments) {
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];

            // Проверить ортогональность
            if (seg.direction === 'H') {
                if (seg.start.y !== seg.end.y) {
                    throw new Error(`Segment ${i}: H-segment Y mismatch`);
                }
            } else if (seg.direction === 'V') {
                if (seg.start.x !== seg.end.x) {
                    throw new Error(`Segment ${i}: V-segment X mismatch`);
                }
            }

            // Проверить непрерывность
            if (i < segments.length - 1) {
                if (seg.end.x !== segments[i + 1].start.x ||
                    seg.end.y !== segments[i + 1].start.y) {
                    throw new Error(`Segment ${i}: discontinuity with segment ${i + 1}`);
                }
            }

            // Проверить чередование
            if (i > 0) {
                if (seg.direction === segments[i - 1].direction) {
                    throw new Error(`Segment ${i}: consecutive segments have same direction`);
                }
            }
        }
        return true;
    }

    /**
     * Добавить ручки редактирования для выделенного соединения
     */
    addLineEditHandles(connection) {
        this.removeLineEditHandles(connection);

        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;
        const handles = [];

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const handleX = (seg.start.x + seg.end.x) / 2;
            const handleY = (seg.start.y + seg.end.y) / 2;

            // Проверить, является ли сегмент крайним (не допустить перетаскивание)
            const isEndSegment = (i === 0 || i === segments.length - 1);

            const handle = new Konva.Circle({
                x: handleX,
                y: handleY,
                radius: 5,
                fill: isEndSegment ? '#ccc' : '#2196F3', // Серый для крайних
                stroke: '#fff',
                strokeWidth: 1.5,
                draggable: !isEndSegment, // Не перетаскиваемые для крайних
                listening: true
            });

            handle.setAttr('segment-handle-meta', {
                connection: connection,
                segmentIndex: i,
                direction: seg.direction,
                isEndSegment: isEndSegment
            });

            handle.on('dragstart', () => {
                // Предотвращение одновременного перетаскивания
                if (meta.isDragging) return;
                meta.isDragging = true;
                connection.setAttr('connection-meta', meta);
            });

            handle.on('dragmove', () => {
                this.onHandleDragMove(handle, connection);
            });

            handle.on('dragend', () => {
                this.onHandleDragEnd(handle, connection);
            });

            this.canvasManager.getLayer().add(handle);
            handles.push(handle);
        }

        meta.handles = handles;
        connection.setAttr('connection-meta', meta);
        this.canvasManager.getLayer().batchDraw();
    }

    /**
     * Обработчик начала перетаскивания ручки
     */
    onHandleDragMove(handle, connection) {
        const meta = handle.getAttr('segment-handle-meta');
        const connectionMeta = connection.getAttr('connection-meta');
        const segmentIndex = meta.segmentIndex;
        const direction = meta.direction;
        const segment = connectionMeta.segments[segmentIndex];

        // Вычислить дельта от начальной позиции
        const initialX = (segment.start.x + segment.end.x) / 2;
        const initialY = (segment.start.y + segment.end.y) / 2;
        const currentX = handle.x();
        const currentY = handle.y();
        const deltaX = currentX - initialX;
        const deltaY = currentY - initialY;

        // Движение должно быть перпендикулярно сегменту
        if (direction === 'V' && Math.abs(deltaX) > Math.abs(deltaY)) {
            // Вертикальный сегмент: может двигаться только влево/вправо
            this.updateSegmentPosition(connection, segmentIndex, deltaX, 0);
        } else if (direction === 'H' && Math.abs(deltaY) > Math.abs(deltaX)) {
            // Горизонтальный сегмент: может двигаться только вверх/вниз
            this.updateSegmentPosition(connection, segmentIndex, 0, deltaY);
        }

        this.redrawConnection(connection);
        this.refreshConnectionHighlight(connection);
    }

    /**
     * Обновить позицию сегмента
     */
    updateSegmentPosition(connection, segmentIndex, deltaX, deltaY) {
        const meta = connection.getAttr('connection-meta');
        const segment = meta.segments[segmentIndex];

        // Обновить координаты перетаскиваемого сегмента
        segment.start.x += deltaX;
        segment.start.y += deltaY;
        segment.end.x += deltaX;
        segment.end.y += deltaY;

        // Обновить конечную точку предыдущего сегмента
        if (segmentIndex > 0) {
            const prevSeg = meta.segments[segmentIndex - 1];
            prevSeg.end.x = segment.start.x;
            prevSeg.end.y = segment.start.y;
        }

        // Обновить начальную точку следующего сегмента
        if (segmentIndex < meta.segments.length - 1) {
            const nextSeg = meta.segments[segmentIndex + 1];
            nextSeg.start.x = segment.end.x;
            nextSeg.start.y = segment.end.y;
        }

        connection.setAttr('connection-meta', meta);
    }

    /**
     * Обработчик конца перетаскивания ручки
     */
    onHandleDragEnd(handle, connection) {
        const connectionMeta = connection.getAttr('connection-meta');
        connectionMeta.isDragging = false;
        connection.setAttr('connection-meta', connectionMeta);
    }

    /**
     * Перерисовать соединение
     */
    redrawConnection(connection) {
        const meta = connection.getAttr('connection-meta');
        const points = this.segmentsToPoints(meta.segments);
        connection.points(points);

        // Обновить позиции ручек
        if (meta.handles && meta.handles.length > 0) {
            for (let i = 0; i < meta.segments.length; i++) {
                const seg = meta.segments[i];
                const handle = meta.handles[i];
                handle.x((seg.start.x + seg.end.x) / 2);
                handle.y((seg.start.y + seg.end.y) / 2);
            }
        }

        this.canvasManager.getLayer().batchDraw();
    }

    /**
     * Обновить подсветку выделения при изменении соединения
     */
    refreshConnectionHighlight(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.highlightLine) {
            meta.highlightLine.points(connection.points());
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /**
     * Установить выделенное соединение для отслеживания обновлений
     */
    setSelectedConnection(connection) {
        this.selectedConnection = connection;
    }

    /**
     * Показать ручки редактирования
     */
    showHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.visible(true));
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /**
     * Скрыть ручки редактирования
     */
    hideHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.visible(false));
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /**
     * Удалить ручки редактирования
     */
    removeLineEditHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.destroy());
            meta.handles = [];
            connection.setAttr('connection-meta', meta);
        }
    }

    /**
     * Обновить соединение когда пин двигается (только первый и последний сегмент)
     */
    updateConnectionsForPin(pin) {
        const pinMeta = pin.getAttr('cp-meta');
        if (!pinMeta.connectedTo) return;

        this.connections.forEach(connection => {
            const connMeta = connection.getAttr('connection-meta');
            if (connMeta && (connMeta.fromPin === pin || connMeta.toPin === pin)) {
                const isFromPin = connMeta.fromPin === pin;
                const newPos = pin.position();

                if (isFromPin) {
                    // Обновить первый сегмент
                    const firstSeg = connMeta.segments[0];
                    firstSeg.start.x = newPos.x;
                    firstSeg.start.y = newPos.y;

                    // Обновить конец первого сегмента
                    const secondSeg = connMeta.segments[1];
                    if (connMeta.segments[0].direction === 'H') {
                        firstSeg.end.x = newPos.x + (firstSeg.end.x - firstSeg.start.x);
                        firstSeg.end.y = newPos.y;
                    } else {
                        firstSeg.end.x = newPos.x;
                        firstSeg.end.y = newPos.y + (firstSeg.end.y - firstSeg.start.y);
                    }
                    // Обновить начало второго сегмента
                    secondSeg.start = { ...firstSeg.end };
                } else {
                    // Обновить последний сегмент
                    const lastSegIdx = connMeta.segments.length - 1;
                    const lastSeg = connMeta.segments[lastSegIdx];
                    const prevSeg = connMeta.segments[lastSegIdx - 1];

                    lastSeg.end.x = newPos.x;
                    lastSeg.end.y = newPos.y;

                    // Обновить начало последнего сегмента
                    if (lastSeg.direction === 'H') {
                        lastSeg.start.x = newPos.x - (lastSeg.end.x - lastSeg.start.x);
                        lastSeg.start.y = newPos.y;
                    } else {
                        lastSeg.start.x = newPos.x;
                        lastSeg.start.y = newPos.y - (lastSeg.end.y - lastSeg.start.y);
                    }
                    // Обновить конец предыдущего сегмента
                    prevSeg.end = { ...lastSeg.start };
                }

                connection.setAttr('connection-meta', connMeta);
                this.redrawConnection(connection);
                this.refreshConnectionHighlight(connection);
            }
        });
    }

    /**
     * Удалить соединение
     */
    deleteConnection(connection) {
        const meta = connection.getAttr('connection-meta');

        // Освобождаем пины
        const fromPinMeta = meta.fromPin.getAttr('cp-meta');
        const toPinMeta = meta.toPin.getAttr('cp-meta');

        fromPinMeta.connectedTo = null;
        toPinMeta.connectedTo = null;
        meta.fromPin.setAttr('cp-meta', fromPinMeta);
        meta.toPin.setAttr('cp-meta', toPinMeta);

        // Возвращаем цвет
        meta.fromPin.fill('#198754');
        meta.toPin.fill('#198754');

        // Удаляем ручки
        this.removeLineEditHandles(connection);

        // Удаляем подсветку
        if (meta.highlightLine) {
            meta.highlightLine.destroy();
        }

        const index = this.connections.indexOf(connection);
        if (index > -1) {
            this.connections.splice(index, 1);
        }

        connection.destroy();
        this.canvasManager.getLayer().batchDraw();

        if (this.onConnectionDeleted) {
            this.onConnectionDeleted(connection);
        }

        console.log(`Удалено соединение ${meta.id}`);
    }

    /**
     * Получить все соединения
     */
    getConnections() {
        return this.connections;
    }

    /**
     * Валидировать целостность соединения
     */
    validateConnectionIntegrity(connection) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        // Проверить сегменты
        this.validateSegments(segments);

        // Проверить привязку пинов
        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const fromPinPos = meta.fromPin.position();
        const toPinPos = meta.toPin.position();

        if (firstSeg.start.x !== fromPinPos.x || firstSeg.start.y !== fromPinPos.y) {
            throw new Error('From pin not attached correctly');
        }

        if (lastSeg.end.x !== toPinPos.x || lastSeg.end.y !== toPinPos.y) {
            throw new Error('To pin not attached correctly');
        }
    }

    /**
     * Очистить все соединения
     */
    clear() {
        this.connections.forEach(c => c.destroy());
        this.connections = [];
    }
}

export { ConnectionManager };
