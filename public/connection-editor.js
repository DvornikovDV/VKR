// connection-editor.js
// Редактирование сегментов и визуализация

import { ConnectionRouter } from './connection-router.js';

class ConnectionEditor {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
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

            // двойной клик для добавления/удаления разрыва
            // dblclick: добавить разрыв (любых сегментов, включая крайние)
            // Ctrl+dblclick: удалить разрыв (только допустимые центральные сегменты по алгоритму)
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
     * Реализация по алгоритму docs/segment-removal-algorithm.md.
     * Удаляет две точки из маршрута, если операция безопасна по всем инвариантам:
     * - не трогаем крайние сегменты (пины)
     * - соблюдаем минимум точек для Type A/B
     * - разрешаем только центральные сегменты
     * - не допускаем диагональных соединений после удаления
     * @param {Konva.Line} connection
     * @param {number} handleSegmentIndex - индекс сегмента, на котором лежит ручка
     */
    removeBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        // 1. Сегменты → точки (точки — источник истины)
        const flatPoints = ConnectionRouter.segmentsToPoints(segments);
        const points = [];
        for (let i = 0; i < flatPoints.length; i += 2) {
            points.push({ x: flatPoints[i], y: flatPoints[i + 1] });
        }

        const N = points.length;

        // ЗАЩИТА 1: ручка на крайних сегментах (затрагивает пины)
        if (handleSegmentIndex === 0 || handleSegmentIndex === N - 1) {
            console.warn('Нельзя удалить крайний сегмент (пины)');
            return false;
        }

        // ЗАЩИТА 2: определить тип по количеству точек
        const isTypeA = (N % 2 === 1); // нечётное число точек → Type A

        // ЗАЩИТА 3: минимальное количество точек
        if (isTypeA && N < 5) {
            console.warn(`Type A: минимум 5 точек, сейчас ${N}`);
            return false;
        }
        if (!isTypeA && N < 6) {
            console.warn(`Type B: минимум 6 точек, сейчас ${N}`);
            return false;
        }

        // ЗАЩИТА 4: ручка должна быть на центральном сегменте
        let isCentral = false;
        if (isTypeA) {
            const center = (N - 1) / 2; // единственный центральный сегмент
            isCentral = (handleSegmentIndex === center);
        } else {
            const left = N / 2 - 1;
            const right = N / 2;
            isCentral = (handleSegmentIndex === left || handleSegmentIndex === right);
        }

        if (!isCentral) {
            console.warn(`Удалять можно только центральные сегменты для Type ${isTypeA ? 'A' : 'B'} (index=${handleSegmentIndex}, N=${N})`);
            return false;
        }

        // Шаг 2: индексы точек для удаления
        const firstPointIndex = handleSegmentIndex;
        const secondPointIndex = handleSegmentIndex + 1;

        // Шаг 3: предварительная проверка ортогональности prevPoint → nextPoint
        const prevPoint = points[firstPointIndex - 1];
        const nextPoint = points[secondPointIndex + 1];

        if (!prevPoint || !nextPoint) {
            console.error('Некорректные индексы точек для проверки ортогональности');
            return false;
        }

        if (prevPoint.x !== nextPoint.x && prevPoint.y !== nextPoint.y) {
            console.error(`Удаление приведёт к диагональному соединению: (${prevPoint.x}, ${prevPoint.y}) → (${nextPoint.x}, ${nextPoint.y})`);
            return false;
        }

        // Шаг 4: удалить две точки
        const newPoints = points.slice();
        newPoints.splice(firstPointIndex, 2);

        // Шаг 5: пересчитать сегменты из оставшихся точек
        const newFlatPoints = [];
        for (let i = 0; i < newPoints.length; i++) {
            newFlatPoints.push(newPoints[i].x, newPoints[i].y);
        }
        const newSegments = ConnectionRouter.pointsToSegments(newFlatPoints);

        try {
            ConnectionRouter.validateSegments(newSegments);
        } catch (e) {
            console.error('Ошибка валидации после удаления разрыва:', e.message);
            return false;
        }

        meta.segments = newSegments;
        meta.userModified = true;
        connection.setAttr('connection-meta', meta);

        this.redrawConnection(connection);
        this.refreshConnectionHighlight(connection);
        this.addLineEditHandles(connection);

        console.log(`Удаление разрыва выполнено: точек ${N} → ${newPoints.length}, сегментов ${segments.length} → ${newSegments.length}`);
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

        // Вычислить середину сегмента
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
