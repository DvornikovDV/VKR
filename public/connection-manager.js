// connection-manager.js
// Управление соединениями (линиями)

class ConnectionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.connections = [];
        this.onConnectionCreated = null;
        this.onConnectionSelected = null;
        this.onConnectionDeleted = null;
    }

    /**
     * Создать соединение бетвее двумя пинами
     */
    createConnection(pin1, pin2) {
        const meta1 = pin1.getAttr('cp-meta');
        const meta2 = pin2.getAttr('cp-meta');

        const lineData = this.createSimpleLine(pin1, pin2);

        const connection = new Konva.Line({
            points: lineData.points,
            stroke: '#000',
            strokeWidth: 2,
            listening: true,
            hitStrokeWidth: 10
        });

        connection.setAttr('connection-meta', {
            id: 'conn_' + Date.now(),
            fromPin: pin1,
            toPin: pin2,
            fork1: lineData.fork1,
            fork2: lineData.fork2,
            segment: lineData.segment,
            segments: [],
            editHandles: []
        });

        connection.on('click', (e) => {
            e.cancelBubble = true;
            if (this.onConnectionSelected) {
                this.onConnectionSelected(connection);
            }
        });

        // двойной клик — добавить сегмент
        connection.on('dblclick', (e) => {
            e.cancelBubble = true;
            this.addSegmentToConnection(connection);
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
     * Найти направление от стороны
     */
    getDirectionFromSide(side) {
        switch (side) {
            case 'top': return { x: 0, y: -1 };
            case 'right': return { x: 1, y: 0 };
            case 'bottom': return { x: 0, y: 1 };
            case 'left': return { x: -1, y: 0 };
            default: return { x: -1, y: 0 };
        }
    }

    /**
     * Создать умную вилку
     */
    createSmartFork(pinPos, side, targetPos) {
        const direction = this.getDirectionFromSide(side);
        const dist = Math.hypot(targetPos.x - pinPos.x, targetPos.y - pinPos.y);
        const length = Math.max(30, dist / 2);
        let endX = pinPos.x + direction.x * length;
        let endY = pinPos.y + direction.y * length;

        if (dist < 50) {
            endX = pinPos.x - direction.x * (50 - dist);
            endY = pinPos.y - direction.y * (50 - dist);
        }

        return {
            start: pinPos,
            end: { x: endX, y: endY },
            side: side
        };
    }

    /**
     * Создать ортогональный сегмент
     */
    createOrthogonalSegment(start, end, preferredFirst = 'horizontal') {
        if (preferredFirst === 'horizontal') {
            return { x: end.x, y: start.y };
        } else {
            return { x: start.x, y: end.y };
        }
    }

    /**
     * Создать простую линию: 2 вилки + 1 сегмент
     */
    createSimpleLine(pin1, pin2) {
        const pos1 = pin1.position();
        const pos2 = pin2.position();
        const meta1 = pin1.getAttr('cp-meta');
        const meta2 = pin2.getAttr('cp-meta');

        const fork1 = this.createSmartFork(pos1, meta1.side, pos2);
        const fork2 = this.createSmartFork(pos2, meta2.side, pos1);

        const preferredFirst = (meta1.side === 'top' || meta1.side === 'bottom') ? 'horizontal' : 'vertical';
        const segment = this.createOrthogonalSegment(fork1.end, fork2.end, preferredFirst);

        const points = [
            pos1.x, pos1.y,
            fork1.end.x, fork1.end.y,
            segment.x, segment.y,
            fork2.end.x, fork2.end.y,
            pos2.x, pos2.y
        ];

        return {
            points: points,
            fork1: fork1,
            fork2: fork2,
            segment: segment
        };
    }

    /**
     * Обновить соединение когда пин двигается
     */
    updateConnectionsForPin(pin) {
        const pinMeta = pin.getAttr('cp-meta');
        if (!pinMeta.connectedTo) return;

        this.connections.forEach(connection => {
            const connMeta = connection.getAttr('connection-meta');
            if (connMeta && (connMeta.fromPin === pin || connMeta.toPin === pin)) {
                const points = connection.points();
                const newPos = pin.position();
                const isFromPin = connMeta.fromPin === pin;
                const length = points.length;

                const pinIndex = isFromPin ? 0 : length - 2;
                points[pinIndex] = newPos.x;
                points[pinIndex + 1] = newPos.y;

                let fork, targetPos, nextIndex;
                if (isFromPin) {
                    nextIndex = 4;
                    targetPos = { x: points[nextIndex], y: points[nextIndex + 1] };
                    fork = this.createSmartFork(newPos, pinMeta.side, targetPos);
                    points[2] = fork.end.x;
                    points[3] = fork.end.y;
                    connMeta.fork1 = fork;
                } else {
                    nextIndex = length - 6;
                    targetPos = { x: points[nextIndex], y: points[nextIndex + 1] };
                    fork = this.createSmartFork(newPos, pinMeta.side, targetPos);
                    points[length - 4] = fork.end.x;
                    points[length - 3] = fork.end.y;
                    connMeta.fork2 = fork;
                }

                connection.points(points);
                connection.setAttr('connection-meta', connMeta);
                this.enforceOrthogonal(connection, isFromPin);
            }
        });
        this.canvasManager.getLayer().batchDraw();
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
     * Обособливание ортогональности
     */
    enforceOrthogonal(connection, updatedFromStart = true) {
        const points = connection.points();
        const meta = connection.getAttr('connection-meta');
        const length = points.length;

        // Fork1
        const side1 = meta.fromPin.getAttr('cp-meta').side;
        const target1 = { x: points[4], y: points[5] };
        const fork1 = this.createSmartFork(
            { x: points[0], y: points[1] },
            side1,
            target1
        );
        points[2] = fork1.end.x;
        points[3] = fork1.end.y;

        // Middle segments
        for (let i = 4; i < length - 4; i += 2) {
            const dx = points[i + 2] - points[i];
            const dy = points[i + 3] - points[i + 1];
            if (Math.abs(dx) > Math.abs(dy)) {
                points[i + 3] = points[i + 1];
            } else {
                points[i + 2] = points[i];
            }
        }

        // Fork2
        const side2 = meta.toPin.getAttr('cp-meta').side;
        const target2 = { x: points[length - 6], y: points[length - 5] };
        const fork2 = this.createSmartFork(
            { x: points[length - 2], y: points[length - 1] },
            side2,
            target2
        );
        points[length - 4] = fork2.end.x;
        points[length - 3] = fork2.end.y;

        // Reverse propagation
        if (!updatedFromStart) {
            for (let i = length - 6; i >= 4; i -= 2) {
                const dx = points[i + 2] - points[i];
                const dy = points[i + 3] - points[i + 1];
                if (Math.abs(dx) > Math.abs(dy)) {
                    points[i + 3] = points[i + 1];
                } else {
                    points[i + 2] = points[i];
                }
            }
        }

        meta.fork1 = fork1;
        meta.fork2 = fork2;
        connection.setAttr('connection-meta', meta);
        connection.points(points);
        this.canvasManager.getLayer().batchDraw();
    }

    /**
     * Добавить сегмент (двойной клик)
     */
    addSegmentToConnection(connection) {
        const meta = connection.getAttr('connection-meta');
        const points = connection.points();

        // Пока стуб — не реализовано
        console.log('Add segment not yet implemented');
    }

    /**
     * Обновить сегмент при перетаскивании ручки
     */
    updateSegmentOrthogonally(handle) {
        const meta = handle.getAttr('line-edit-meta');
        const connection = meta.connection;
        const segmentIndex = meta.segmentIndex;

        const points = connection.points();
        const startIndex = segmentIndex * 2 + 2;
        const endIndex = startIndex + 2;

        const dx = points[endIndex] - points[startIndex];
        const dy = points[endIndex + 1] - points[startIndex + 1];

        if (Math.abs(dx) > Math.abs(dy)) {
            points[startIndex + 1] = handle.y();
            points[endIndex + 1] = handle.y();
        } else {
            points[startIndex] = handle.x();
            points[endIndex] = handle.x();
        }

        connection.points(points);
        this.enforceOrthogonal(connection);
        this.canvasManager.getLayer().batchDraw();
    }

    /**
     * Добавить ручки редактирования
     */
    addLineEditHandles(connection) {
        this.removeLineEditHandles(connection);

        const meta = connection.getAttr('connection-meta');
        const points = connection.points();
        const handles = [];
        const lineWidth = connection.strokeWidth();

        for (let i = 4; i < points.length - 4; i += 2) {
            const blueHandle = new Konva.Circle({
                x: (points[i - 2] + points[i]) / 2,
                y: (points[i - 1] + points[i + 1]) / 2,
                radius: 4,
                fill: '#007bff',
                stroke: '#fff',
                strokeWidth: 1,
                draggable: true
            });

            blueHandle.setAttr('line-edit-meta', {
                connection: connection,
                segmentIndex: (i - 2) / 2
            });

            blueHandle.on('dragmove', () => {
                this.updateSegmentOrthogonally(blueHandle);
            });

            handles.push(blueHandle);
            this.canvasManager.getLayer().add(blueHandle);
        }

        meta.editHandles = handles;
        connection.setAttr('connection-meta', meta);
        this.canvasManager.getLayer().batchDraw();
    }

    /**
     * Удалить ручки редактирования
     */
    removeLineEditHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.editHandles) {
            meta.editHandles.forEach(handle => handle.destroy());
            meta.editHandles = [];
            connection.setAttr('connection-meta', meta);
        }
    }

    /**
     * Получить все соединения
     */
    getConnections() {
        return this.connections;
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
