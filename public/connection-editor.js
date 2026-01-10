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
                hitStrokeWidth: 4
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

            layer.add(handle);
            handles.push(handle);
        }

        // Повысить ручки выше линии
        handles.forEach(h => layer.moveToTop(h));

        meta.handles = handles;
        connection.setAttr('connection-meta', meta);
        layer.batchDraw();
    }

    /**
     * Добавить разрыв (break point) на сегмент
     * Вставляет две новые точки в segments[] соединения
     * @param {Konva.Line} connection - соединение
     * @param {number} segmentIndex - индекс сегмента для вставки
     * @param {Object} clickPoint - точка клика {x, y}
     */
    addBreakPointToSegment(connection, segmentIndex, clickPoint) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        if (segmentIndex < 0 || segmentIndex >= segments.length) {
            console.warn('Invalid segment index for break point');
            return;
        }

        const segment = segments[segmentIndex];
        const newPoint = this.getProjectedPointOnSegment(clickPoint, segment);

        // Проверьте: точка в середине сегмента
        if ((segment.direction === 'H' && newPoint.x === segment.start.x && newPoint.x === segment.end.x) ||
            (segment.direction === 'V' && newPoint.y === segment.start.y && newPoint.y === segment.end.y)) {
            console.warn('Break point would be at endpoint, skipping');
            return;
        }

        // Создать три новых сегмента вместо одного
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

        // Вставить новые сегменты в массив
        segments.splice(segmentIndex, 1, newSegment1, newSegment2, newSegment3);

        // Пересчитать индексы всех новых сегментов
        for (let i = segmentIndex; i < segments.length; i++) {
            segments[i].index = i;
        }

        // Обновить соединение
        meta.segments = segments;
        connection.setAttr('connection-meta', meta);

        // Перерисовать и обновить ручки
        this.redrawConnection(connection);
        this.addLineEditHandles(connection);
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

        // Обновить позиции ручек (если они есть)
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