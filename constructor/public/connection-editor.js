// connection-editor.js
// Модуль редактирования сегментов графа и визуализации опорных точек.

import { ConnectionRouter } from './connection-router.js';

class ConnectionEditor {
    constructor(canvasManager, connectionManager) {
        this.canvasManager = canvasManager;
        this.connectionManager = connectionManager;
    }

    /** Инициализация интерактивных элементов (ручек) для изменения маршрута соединения.
     * Вход: connection (Konva.Line). */
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

            // Обработчики двойного клика для создания и удаления точек излома (разрывов)
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

    /** Вставка новой точки излома в середину сегмента по двойному клику манипулятора.
     * Вход: connection (Konva.Line), handleIndex (Number). */
    addBreakPointOnHandle(connection, handleIndex) {
        const meta = connection.getAttr('connection-meta');
        const segment = meta.segments[handleIndex];

        const midPoint = {
            x: (segment.start.x + segment.end.x) / 2,
            y: (segment.start.y + segment.end.y) / 2
        };

        this.addBreakPointToSegment(connection, handleIndex, midPoint);
    }

    /** Исключение точки излома и оптимизация маршрутизации через пересчет сегментов (Ctrl + двойной клик).
     * Вход: connection (Konva.Line), handleSegmentIndex (Number).
     * Выход: Статус выполнения (Boolean). */
    removeBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        // Резолвинг точек текущих сегментов
        const flatPoints = ConnectionRouter.segmentsToPoints(segments);
        const points = [];
        for (let i = 0; i < flatPoints.length; i += 2) {
            points.push({ x: flatPoints[i], y: flatPoints[i + 1] });
        }

        const N = points.length;
        const prevSegmentCount = segments.length;

        // Блокировка удаления терминальных (крайних) сегментов
        if (handleSegmentIndex === 0 || handleSegmentIndex === prevSegmentCount - 1) {
            console.warn(`Нельзя удалить крайний сегмент (пины): индекс ${handleSegmentIndex}`);
            return false;
        }

        // Валидация минимального количества точек маршрута
        const isTypeA = (N % 2 === 1);
        const minPoints = isTypeA ? 5 : 6;
        if (N < minPoints) {
            console.warn(`Недостаточно точек для удаления: ${N} < ${minPoints} (Type ${isTypeA ? 'A' : 'B'})`);
            return false;
        }

        // Определение целевых точек для удаления
        const firstPointIndex = handleSegmentIndex;
        const secondPointIndex = handleSegmentIndex + 1;

        // Удаление целевых узлов маршрута
        const newPoints = points.slice();
        newPoints.splice(firstPointIndex, 2);

        if (newPoints.length < 2) {
            console.error('После удаления не осталось точек для соединения');
            return false;
        }

        // Пересчет сегментов для оставшегося массива точек
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
                // Компенсация диагонального сдвига путем фиксации одной из плоскостей
                if (i < firstPointIndex) {
                    // Сегмент ДО удаляемой пары
                    const prevSeg = newSegments[i - 1];
                    if (prevSeg && prevSeg.direction === 'H') {
                        // Наследование вертикального направления
                        direction = 'V';
                        end.x = start.x; // фиксируем X
                    } else {
                        direction = 'H';
                        end.y = start.y; // фиксируем Y
                    }
                } else {
                    // Обработка сегментов после области удаления
                    if (i === firstPointIndex) {
                        // Восстановление соединения (чередование направления)
                        const prevSeg = newSegments[i - 1];
                        if (prevSeg && prevSeg.direction === 'V') {
                            direction = 'H';
                            end.y = start.y;
                        } else {
                            direction = 'V';
                            end.x = start.x;
                        }
                    } else {
                        // Калькуляция стандартного сегмента
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

        // Валидация расчетной структуры маршрута
        try {
            ConnectionRouter.validateSegments(newSegments);
        } catch (e) {
            console.error('Ошибка валидации после удаления:', e.message);
            return false;
        }

        // Применение и рендеринг обновлений
        meta.segments = newSegments;
        meta.userModified = true;
        connection.setAttr('connection-meta', meta);

        this.redrawConnection(connection);
        this.refreshConnectionHighlight(connection);
        this.addLineEditHandles(connection);

        console.log(`Удаление разрыва: ${N} → ${newPoints.length} точек, ${prevSegmentCount} → ${newSegments.length} сегментов`);

        // Синхронизация терминальной точки узла
        if (this.connectionManager) {
            const toPin = meta.toPin;
            const toPinPos = toPin.position();
            // Делегирование пересчета контуров менеджеру соединений
            this.connectionManager.updateConnectionsForPin(toPin, toPinPos.x, toPinPos.y, true);
        }

        return true;
    }

    /** Вставка точек излома (разрыва) в произвольных координатах сегмента.
     * Вход: connection (Konva.Line), segmentIndex (Number), clickPoint (Object {x, y}). */
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

    /** Проекция произвольной точки на осевую линию сегмента.
     * Вход: clickPoint (Object {x, y}), segment (Object).
     * Выход: Координаты (Object {x, y}). */
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

    /** Вставка нового узла маршрутизации (деление одного сегмента на три).
     * Вход: connection (Konva.Line), handleSegmentIndex (Number). */
    addBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;
        const segment = segments[handleSegmentIndex];

        if (!segment) return;

        // Расчет центральной точки сегмента
        const midX = (segment.start.x + segment.end.x) / 2;
        const midY = (segment.start.y + segment.end.y) / 2;

        // Реструктуризация: формирование новых сегментов маршрута
        const newSegs = [];
        if (segment.direction === 'H') {
            // Деление горизонтального: H -> H-V-H
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
            // Деление вертикального: V -> V-H-V
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

        // Применение изменений в матрице сегментов
        segments.splice(handleSegmentIndex, 1, ...newSegs);

        // Актуализация индексов маршрута
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

    /** Обработчик перемещения манипулятора сегмента.
     * Вход: handle (Konva.Circle), connection (Konva.Line). */
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

    /** Обновление координат граничных точек смещаемого сегмента.
     * Вход: connection (Konva.Line), segmentIndex (Number), deltaX (Number), deltaY (Number). */
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

    /** Обработчик завершения перемещения манипулятора.
     * Вход: handle (Konva.Circle), connection (Konva.Line). */
    onHandleDragEnd(handle, connection) {
        const connectionMeta = connection.getAttr('connection-meta');
        connectionMeta.isDragging = false;
        connection.setAttr('connection-meta', connectionMeta);
    }

    /** Перерисовка контура соединения в соответствии с матрицей сегментов.
     * Вход: connection (Konva.Line). */
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

    /** Актуализация линии подсветки выделения графа.
     * Вход: connection (Konva.Line). */
    refreshConnectionHighlight(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.highlightLine) {
            meta.highlightLine.points(connection.points());
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /** Отображение манипуляторов конфигурации сегмента.
     * Вход: connection (Konva.Line). */
    showHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.visible(true));
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /** Скрытие манипуляторов конфигурации сегмента.
     * Вход: connection (Konva.Line). */
    hideHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.handles) {
            meta.handles.forEach(handle => handle.visible(false));
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /** Полное удаление манипуляторов конфигурации для соединения.
     * Вход: connection (Konva.Line). */
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
