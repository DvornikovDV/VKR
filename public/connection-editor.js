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
            // Ctrl+dblclick: удалить разрыв (только НЕ крайних сегментов)
            handle.on('dblclick', (e) => {
                e.cancelBubble = true;
                if (e.evt.ctrlKey) {
                    // Удаление: только не крайние
                    if (!isEndSegment) {
                        this.removeBreakPointAtHandle(connection, i);
                    }
                } else {
                    // Добавление: все
                    this.addBreakPointOnHandle(connection, i);
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
     * Удаляет ДВЕ точки из массива points и пересчитывает сегменты
     * Затем выполняет глобальную нормализацию для обеспечения ортогональности
     * 
     * Валидация типов:
     * Type 1 (четные точки, нечетные сегменты): минимум 5 сегментов
     * Type 2 (нечетные точки, четные сегменты): минимум 4 сегмента
     * 
     * Порядок операций:
     * 1. Валидация (тип, минимум, крайние)
     * 2. Удалить ДВЕ точки из массива points
     * 3. Пересчитать сегменты из нового массива points
     * 4. Выполнить глобальную нормализацию всех сегментов
     * 5. Отрисовать
     * 
     * @param {Konva.Line} connection
     * @param {number} handleSegmentIndex - индекс ручки (сегмента для удаления)
     */
    removeBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        // ЗАЩИТА 1: не удалять крайние разрывы
        if (handleSegmentIndex === 0 || handleSegmentIndex === segments.length - 1) {
            console.warn('Нельзя удалить концевой разрыв');
            return;
        }
        
        // ЗАЩИТА 2: определить тип соединения
        const isType1 = segments.length % 2 === 1;  // нечетное число = Type 1
        
        // ЗАЩИТА 3: валидация минимума в зависимости от типа
        if (isType1) {
            // Type 1 (четные точки): требуется минимум 5 сегментов
            if (segments.length < 5) {
                console.warn(`Нельзя удалить - недостаточно сегментов (минимум 5 для Type 1, текущих: ${segments.length})`);
                return;
            }
        } else {
            // Type 2 (нечетные точки): требуется минимум 4 сегмента
            if (segments.length < 4) {
                console.warn(`Нельзя удалить - недостаточно сегментов (минимум 4 для Type 2, текущих: ${segments.length})`);
                return;
            }
        }

        // ШАГ 1: Конвертировать сегменты в плоский массив точек
        let points = ConnectionRouter.segmentsToPoints(segments);
        const prevSegmentCount = segments.length;
        
        // ШАГ 2: Удалить ДВЕ точки (соответствующие удаляемому сегменту)
        // Сегмент N начинается с точки (N*2), поэтому удаляем с индекса (N*2) две точки
        const pointIndexToRemove = handleSegmentIndex * 2;
        points.splice(pointIndexToRemove, 4);  // удалить 2 координаты (4 элемента массива: x1, y1, x2, y2)
        
        // ШАГ 3: Пересчитать сегменты из обновленного массива точек
        let newSegments = ConnectionRouter.pointsToSegments(points);
        
        // ШАГ 4: Выполнить глобальную нормализацию всех сегментов
        newSegments = this.normalizeAllSegments(newSegments, meta.fromPin, meta.toPin);
        
        // ШАГ 5: Валидировать результат
        try {
            ConnectionRouter.validateSegments(newSegments);
        } catch (e) {
            console.error('Ошибка валидации после удаления разрыва:', e.message);
            return;
        }
        
        // ШАГ 6: Обновить метаданные
        meta.segments = newSegments;
        meta.userModified = true;
        connection.setAttr('connection-meta', meta);

        // ШАГ 7: Отрисовать
        this.redrawConnection(connection);
        this.addLineEditHandles(connection);

        console.log(`Удален разрыв (segments: ${prevSegmentCount} → ${newSegments.length}, points: ${points.length / 2})`);
    }

    /**
     * Нормализовать все сегменты глобально
     * Алгоритм Вариант 1: проходит от первого пина по всем сегментам
     * и исправляет координаты для обеспечения полной ортогональности
     * 
     * Процесс:
     * 1. Первая точка = позиция первого пина (закреплена)
     * 2. Для каждого сегмента: если H-сегмент → конец на Y первой точки
     *                           если V-сегмент → конец на X первой точки
     * 3. Если два соседних сегмента имеют одинаковое направление → слить в один
     * 4. Результат: все сегменты чередуют H и V, полная ортогональность
     * 
     * @param {Array} segments - массив сегментов после пересчета
     * @param {Konva.Circle} fromPin - начальный пин (закреплённая позиция)
     * @param {Konva.Circle} toPin - конечный пин (целевая позиция)
     * @returns {Array} - нормализованные сегменты
     */
    normalizeAllSegments(segments, fromPin, toPin) {
        if (segments.length === 0) return segments;
        if (segments.length === 1) return segments;

        const fromPos = fromPin.position();
        const toPos = toPin.position();
        
        // Начать с позиции первого пина (закреплена)
        segments[0].start.x = fromPos.x;
        segments[0].start.y = fromPos.y;
        
        // Пройти по всем сегментам и исправить координаты
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            
            if (i === 0) {
                // Первый сегмент начинается от fromPin
                if (seg.direction === 'H') {
                    seg.start.y = fromPos.y;
                    seg.end.y = fromPos.y;
                } else {
                    seg.start.x = fromPos.x;
                    seg.end.x = fromPos.x;
                }
            } else {
                // Остальные сегменты начинаются из конца предыдущего
                const prevSeg = segments[i - 1];
                seg.start.x = prevSeg.end.x;
                seg.start.y = prevSeg.end.y;
                
                if (seg.direction === 'H') {
                    // Горизонтальный сегмент: конец на той же Y
                    seg.end.y = seg.start.y;
                } else {
                    // Вертикальный сегмент: конец на том же X
                    seg.end.x = seg.start.x;
                }
            }
        }
        
        // Установить конец последнего сегмента в позицию toPin
        const lastSeg = segments[segments.length - 1];
        lastSeg.end.x = toPos.x;
        lastSeg.end.y = toPos.y;
        
        // Слить сегменты одинакового направления
        // Проходим в обратном порядке чтобы индексы не сдвигались при удалении
        for (let i = segments.length - 2; i >= 0; i--) {
            if (segments[i].direction === segments[i + 1].direction) {
                // Слить i-й и (i+1)-й сегменты
                segments[i].end.x = segments[i + 1].end.x;
                segments[i].end.y = segments[i + 1].end.y;
                segments.splice(i + 1, 1);
            }
        }
        
        // Пересчитать индексы
        for (let i = 0; i < segments.length; i++) {
            segments[i].index = i;
        }
        
        return segments;
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