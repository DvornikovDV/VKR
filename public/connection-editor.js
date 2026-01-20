// connection-editor.js
// Редактирование сегментов и визуализация

import { ConnectionRouter } from './connection-router.js';

class ConnectionEditor {
    constructor(canvasManager, connectionManager) {
        this.canvasManager = canvasManager;
        this.connectionManager = connectionManager;
    }

    /**
     * Добавить ручки редактирования для выделенного соединения
     */
    addLineEditHandles(connection) {
        this.removeLineEditHandles(connection);

        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;
        const handles = [];
        const layer = this.canvasManager.getLayer();

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const handleX = (seg.start.x + seg.end.x) / 2;
            const handleY = (seg.start.y + seg.end.y) / 2;

            const isEndSegment = (i === 0 || i === segments.length - 1);

            const handle = new Konva.Circle({
                x: handleX,
                y: handleY,
                radius: 5,
                fill: isEndSegment ? '#ccc' : '#2196F3',
                stroke: '#fff',
                strokeWidth: 1.5,
                draggable: !isEndSegment,
                listening: true,
                hitStrokeWidth: 8
            });

            handle.setAttr('segment-handle-meta', {
                connection: connection,
                segmentIndex: i,
                direction: seg.direction,
                isEndSegment: isEndSegment
            });

            handle.on('dragstart', () => {
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

            // dblclick: добавить разрыв
            // Ctrl+dblclick: удалить разрыв (любой, кроме конечных)
            handle.on('dblclick', (e) => {
                e.cancelBubble = true;
                const meta = handle.getAttr('segment-handle-meta');
                const segmentIndex = meta.segmentIndex;

                if (e.evt.ctrlKey) {
                    this.removeBreakPointAtHandle(connection, segmentIndex);
                } else {
                    this.addBreakPointOnHandle(connection, segmentIndex);
                }
            });

            layer.add(handle);
            handles.push(handle);
        }

        handles.forEach(h => layer.moveToTop(h));

        meta.handles = handles;
        connection.setAttr('connection-meta', meta);
        layer.batchDraw();
    }

    /**
     * Добавить разрыв на ручке (двойной клик без модификаторов)
     * Вставляет 2 новых точки посередине сегмента под ручкой
     * @param {Konva.Line} connection
     * @param {number} handleIndex - индекс ручки
     */
    addBreakPointOnHandle(connection, handleIndex) {
        const meta = connection.getAttr('connection-meta');
        const segment = meta.segments[handleIndex];

        const midPoint = {
            x: (segment.start.x + segment.end.x) / 2,
            y: (segment.start.y + segment.end.y) / 2
        };

        this.addBreakPointToSegment(connection, handleIndex, midPoint);
    }

    /**
     * Удалить разрыв на ручке (Ctrl+двойной клик)
     * Упрощённый алгоритм: удалить две точки, пересчитать направления, зафиксировать одну координату для диагоналей.
     * Затем вызвать updateConnectionsForPin() для toPin, чтобы пересчитать конечные координаты.
     * 
     * Валидация:
     * - Не удалять конечные сегменты (затрагивают пины)
     * - Минимум точек: 5 для нечётного, 6 для чётного исходного количества
     * 
     * @param {Konva.Line} connection
     * @param {number} handleSegmentIndex - индекс сегмента, на котором лежит ручка
     */
    removeBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        // Шаг 1: Сегменты → точки (точки — источник истины)
        const flatPoints = ConnectionRouter.segmentsToPoints(segments);
        const points = [];
        for (let i = 0; i < flatPoints.length; i += 2) {
            points.push({ x: flatPoints[i], y: flatPoints[i + 1] });
        }

        const N = points.length;
        const prevSegmentCount = segments.length;

        // Валидация 1: не крайние сегменты (они затрагивают пины)
        if (handleSegmentIndex === 0 || handleSegmentIndex === prevSegmentCount - 1) {
            console.warn(`Нельзя удалить крайний сегмент (пины): индекс ${handleSegmentIndex}`);
            return false;
        }

        // Валидация 2: минимум точек
        const isTypeA = (N % 2 === 1);
        const minPoints = isTypeA ? 5 : 6;
        if (N < minPoints) {
            console.warn(`Недостаточно точек для удаления: ${N} < ${minPoints} (Type ${isTypeA ? 'A' : 'B'})`);
            return false;
        }

        // Шаг 2: индексы точек для удаления
        // Сегмент i соединяет points[i] и points[i+1]
        // Удаляем обе точки: points[handleSegmentIndex] и points[handleSegmentIndex+1]
        const firstPointIndex = handleSegmentIndex;
        const secondPointIndex = handleSegmentIndex + 1;

        // Шаг 3: удалить две точки
        const newPoints = points.slice();
        newPoints.splice(firstPointIndex, 2);

        if (newPoints.length < 2) {
            console.error('После удаления не осталось точек для соединения');
            return false;
        }

        // Шаг 4: пересчитать сегменты из оставшихся точек
        // Определяем направления по координатам
        const newSegments = [];
        for (let i = 0; i < newPoints.length - 1; i++) {
            const start = newPoints[i];
            const end = newPoints[i + 1];
            let direction;

            if (start.x === end.x) {
                direction = 'V';
            } else if (start.y === end.y) {
                direction = 'H';
            } else {
                // Диагональный сегмент — нужно зафиксировать одну координату
                // Сегмент до удаляемой пары (если есть) определит, какую координату менять
                if (i < firstPointIndex) {
                    // Сегмент ДО удаляемой пары
                    const prevSeg = newSegments[i - 1];
                    if (prevSeg && prevSeg.direction === 'H') {
                        // Предыдущий был горизонтальный → этот должен быть вертикальный
                        direction = 'V';
                        end.x = start.x; // фиксируем X
                    } else {
                        direction = 'H';
                        end.y = start.y; // фиксируем Y
                    }
                } else {
                    // Сегмент ПОСЛЕ удаляемой пары
                    if (i === firstPointIndex) {
                        // Этот сегмент мостит разрыв (соединяет соседей удаляемых)
                        // Определяем направление чередованием: если перед ним был V, то этот H
                        const prevSeg = newSegments[i - 1];
                        if (prevSeg && prevSeg.direction === 'V') {
                            direction = 'H';
                            end.y = start.y;
                        } else {
                            direction = 'V';
                            end.x = start.x;
                        }
                    } else {
                        // Регулярный сегмент после пересчёта
                        const prevSeg = newSegments[i - 1];
                        if (prevSeg && prevSeg.direction === 'H') {
                            direction = 'V';
                            end.x = start.x;
                        } else {
                            direction = 'H';
                            end.y = start.y;
                        }
                    }
                }
            }

            newSegments.push({
                index: i,
                direction: direction,
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y }
            });
        }

        // Шаг 5: валидировать результат
        try {
            ConnectionRouter.validateSegments(newSegments);
        } catch (e) {
            console.error('Ошибка валидации после удаления:', e.message);
            return false;
        }

        // Шаг 6: применить изменения
        meta.segments = newSegments;
        meta.userModified = true;
        connection.setAttr('connection-meta', meta);

        this.redrawConnection(connection);
        this.refreshConnectionHighlight(connection);
        this.addLineEditHandles(connection);

        console.log(`Удаление разрыва: ${N} → ${newPoints.length} точек, ${prevSegmentCount} → ${newSegments.length} сегментов`);

        // Шаг 7: обновить конечные координаты через updateConnectionsForPin для toPin
        // Это исправляет баг когда правые сегменты не приходят в пин
        if (this.connectionManager) {
            const toPin = meta.toPin;
            const toPinPos = toPin.position();
            this.connectionManager.updateConnectionsForPin(toPin, toPinPos.x, toPinPos.y, false);
        }

        return true;
    }

    /**
     * Добавить разрыв на сегмент
     * Вставить 2 новых точки в центр сегмента
     * @param {Konva.Line} connection - соединение
     * @param {number} segmentIndex - индекс сегмента для разрыва
     * @param {Object} clickPoint - точка разрыва {x, y}
     */
    addBreakPointToSegment(connection, segmentIndex, clickPoint) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        if (segmentIndex < 0 || segmentIndex >= segments.length) {
            console.warn('Некорректный индекс сегмента');
            return;
        }

        const segment = segments[segmentIndex];
        const prevSegmentCount = segments.length;

        const newPoint = this.getProjectedPointOnSegment(clickPoint, segment);

        if ((segment.direction === 'H' && newPoint.x === segment.start.x && newPoint.x === segment.end.x) ||
            (segment.direction === 'V' && newPoint.y === segment.start.y && newPoint.y === segment.end.y)) {
            console.warn('Разрыв не может быть в конце');
            return;
        }

        const newSegment1 = {
            index: segmentIndex,
            direction: segment.direction,
            start: { x: segment.start.x, y: segment.start.y },
            end: { x: newPoint.x, y: newPoint.y }
        };

        const newSegment2 = {
            index: segmentIndex + 1,
            direction: segment.direction === 'H' ? 'V' : 'H',
            start: { x: newPoint.x, y: newPoint.y },
            end: { x: newPoint.x, y: newPoint.y }
        };

        const newSegment3 = {
            index: segmentIndex + 2,
            direction: segment.direction,
            start: { x: newPoint.x, y: newPoint.y },
            end: { x: segment.end.x, y: segment.end.y }
        };

        segments.splice(segmentIndex, 1, newSegment1, newSegment2, newSegment3);

        for (let i = segmentIndex; i < segments.length; i++) {
            segments[i].index = i;
        }

        meta.segments = segments;
        connection.setAttr('connection-meta', meta);

        this.redrawConnection(connection);
        this.addLineEditHandles(connection);

        console.log(`Вставлены 2 новых точки (segments: ${prevSegmentCount} → ${segments.length})`);
    }

    /**
     * Получить проецируемую точку на сегмент
     * @param {Object} clickPoint - исходная точка клика
     * @param {Object} segment - сегмент
     * @returns {Object} - проецируемая точка {x, y}
     */
    getProjectedPointOnSegment(clickPoint, segment) {
        const { start, end, direction } = segment;

        if (direction === 'H') {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            const projectedX = Math.max(minX, Math.min(maxX, clickPoint.x));
            return {
                x: projectedX,
                y: start.y
            };
        } else {
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            const projectedY = Math.max(minY, Math.min(maxY, clickPoint.y));
            return {
                x: start.x,
                y: projectedY
            };
        }
    }

    /**
     * Добавить разрыв (добавить 2 новых сегмента вместо 1)
     * Сегмент H → H-V-H
     * Сегмент V → V-H-V
     */
    addBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;
        const segment = segments[handleSegmentIndex];

        if (!segment) return;

        // Вычислить серединy сегмента
        const midX = (segment.start.x + segment.end.x) / 2;
        const midY = (segment.start.y + segment.end.y) / 2;

        // Создать 2 новых сегмента
        const newSegs = [];
        if (segment.direction === 'H') {
            // H → H-V-H
            newSegs.push({
                index: handleSegmentIndex,
                direction: 'H',
                start: { x: segment.start.x, y: segment.start.y },
                end: { x: midX, y: segment.start.y }
            });
            newSegs.push({
                index: handleSegmentIndex + 1,
                direction: 'V',
                start: { x: midX, y: segment.start.y },
                end: { x: midX, y: segment.end.y }
            });
            newSegs.push({
                index: handleSegmentIndex + 2,
                direction: 'H',
                start: { x: midX, y: segment.end.y },
                end: { x: segment.end.x, y: segment.end.y }
            });
        } else {
            // V → V-H-V
            newSegs.push({
                index: handleSegmentIndex,
                direction: 'V',
                start: { x: segment.start.x, y: segment.start.y },
                end: { x: segment.start.x, y: midY }
            });
            newSegs.push({
                index: handleSegmentIndex + 1,
                direction: 'H',
                start: { x: segment.start.x, y: midY },
                end: { x: segment.end.x, y: midY }
            });
            newSegs.push({
                index: handleSegmentIndex + 2,
                direction: 'V',
                start: { x: segment.end.x, y: midY },
                end: { x: segment.end.x, y: segment.end.y }
            });
        }

        // Заменить сегмент на 3 новых
        segments.splice(handleSegmentIndex, 1, ...newSegs);

        // Пересчитать индексы всех сегментов
        for (let i = 0; i < segments.length; i++) {
            segments[i].index = i;
        }

        meta.segments = segments;
        meta.userModified = true;
        connection.setAttr('connection-meta', meta);

        this.redrawConnection(connection);
        this.addLineEditHandles(connection);

        console.log(`Добавлен разрыв (segments: ${segments.length - 2} → ${segments.length})`);
    }

    /**
     * Обработчик движения ручки
     */
    onHandleDragMove(handle, connection) {
        const meta = handle.getAttr('segment-handle-meta');
        const connectionMeta = connection.getAttr('connection-meta');
        const segmentIndex = meta.segmentIndex;
        const direction = meta.direction;
        const segment = connectionMeta.segments[segmentIndex];

        const initialX = (segment.start.x + segment.end.x) / 2;
        const initialY = (segment.start.y + segment.end.y) / 2;
        const currentX = handle.x();
        const currentY = handle.y();
        const deltaX = currentX - initialX;
        const deltaY = currentY - initialY;

        if (direction === 'V' && Math.abs(deltaX) > Math.abs(deltaY)) {
            this.updateSegmentPosition(connection, segmentIndex, deltaX, 0);
        } else if (direction === 'H' && Math.abs(deltaY) > Math.abs(deltaX)) {
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

        segment.start.x += deltaX;
        segment.start.y += deltaY;
        segment.end.x += deltaX;
        segment.end.y += deltaY;

        if (segmentIndex > 0) {
            const prevSeg = meta.segments[segmentIndex - 1];
            prevSeg.end.x = segment.start.x;
            prevSeg.end.y = segment.start.y;
        }

        if (segmentIndex < meta.segments.length - 1) {
            const nextSeg = meta.segments[segmentIndex + 1];
            nextSeg.start.x = segment.end.x;
            nextSeg.start.y = segment.end.y;
        }

        connection.setAttr('connection-meta', meta);
    }

    /**
     * Обработчик конца перетаскивания
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
        const points = ConnectionRouter.segmentsToPoints(meta.segments);
        connection.points(points);

        if (meta.handles && meta.handles.length === meta.segments.length) {
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
     * Обновить подсвечивание выделения
     */
    refreshConnectionHighlight(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.highlightLine) {
            meta.highlightLine.points(connection.points());
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /**
     * Показать ручки
     */
    showHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.visible(true));
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /**
     * Скрыть ручки
     */
    hideHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.visible(false));
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /**
     * Удалить ручки
     */
    removeLineEditHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.destroy());
            meta.handles = [];
            connection.setAttr('connection-meta', meta);
        }
    }
}

export { ConnectionEditor };
