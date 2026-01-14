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

            // НОВОЕ: двойной клик для добавления/удаления разрыва
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
        
        // точка посередине ручки (посередине сегмента)
        const midPoint = {
            x: (segment.start.x + segment.end.x) / 2,
            y: (segment.start.y + segment.end.y) / 2
        };
        
        this.addBreakPointToSegment(connection, handleIndex, midPoint);
    }

    /**
     * Удалить разрыв на ручке (Ctrl+двойной клик)
     * Удаляет только 2 точки сегмента и нормализует соединение
     * @param {Konva.Line} connection
     * @param {number} handleSegmentIndex - индекс сегмента для удаления
     */
    removeBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        // Минимально 2 сегмента для HV или VH
        if (segments.length < 3) {
            console.warn('Не можно удалить разрыв - минимум 2 сегмента');
            return;
        }

        // Не можем удалить первый и последний сегменты
        if (handleSegmentIndex === 0 || handleSegmentIndex === segments.length - 1) {
            console.warn('Не можно удалить концевые разрывы');
            return;
        }

        // Проверяем: после удаления не получится ли одностороннее (HHH или VVV)
        const leftSegment = segments[handleSegmentIndex - 1];
        const centerSegment = segments[handleSegmentIndex];
        const rightSegment = segments[handleSegmentIndex + 1];

        // После удаления центр одного сегмента будет segments.length - 1
        // Если осталось только 2, то это HV или VH - OK
        // Если осталось 3+, проверяем соседей центра
        if (segments.length > 3) {
            // Если все три одного направления - нельзя
            if (leftSegment.direction === centerSegment.direction &&
                centerSegment.direction === rightSegment.direction) {
                console.warn('Нельзя удалить - соединение станет односторонним');
                return;
            }
        }

        // Просто удаляем 1 сегмент (только среднее звено)
        segments.splice(handleSegmentIndex, 1);

        // Перенумеровать
        for (let i = 0; i < segments.length; i++) {
            segments[i].index = i;
        }

        meta.segments = segments;
        connection.setAttr('connection-meta', meta);

        // Нормализируем соединение чтобы вернуть ортогональность
        this.normalizeSegments(segments);

        this.redrawConnection(connection);
        this.addLineEditHandles(connection);

        console.log(`Удален разрыв (segments: ${segments.length + 1} → ${segments.length})`);
    }

    /**
     * Нормализировать сегменты для восстановления ортогональности
     * Основывается на направлениях сегментов и автоматически исправляет координаты
     */
    normalizeSegments(segments) {
        if (segments.length < 2) return;

        // Проходим по всем соединениям и риортанизируем их границы
        for (let i = 0; i < segments.length - 1; i++) {
            const seg = segments[i];
            const nextSeg = segments[i + 1];

            // Ортогональные сегменты должны делить одну ось
            // H (горизонтальный) меняет X, V (вертикальный) меняет Y

            if (seg.direction === 'H' && nextSeg.direction === 'V') {
                // H→V: обеспечить что закончиться H в той х, где начинается V
                seg.end.x = nextSeg.start.x;
                nextSeg.start.x = seg.end.x;
                nextSeg.start.y = seg.end.y;
            } else if (seg.direction === 'V' && nextSeg.direction === 'H') {
                // V→H: обеспечить что закончиться V в том Y, где начинается H
                seg.end.y = nextSeg.start.y;
                nextSeg.start.y = seg.end.y;
                nextSeg.start.x = seg.end.x;
            }
        }
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
            console.warn('Разрыв не может быть ат конце');
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
     * Удалить разрыв (слить 3 сегмента в 1)
     * H-V-H → H
     * V-H-V → V
     * 
     * ЗАЩИТА: Нельзя удалять если segments.length < 5
     * Причина: минимум 5 сегментов нужно для удаления разрыва без распада маршрута
     * 2 сегмента = HV базовый маршрут
     * 3 сегмента = HVH базовый маршрут (центр НЕЛЬЗЯ удалять)
     * 5 сегментов = HVHVH (можно удалить центр V → HVH)
     */
    removeBreakPointAtHandle(connection, handleSegmentIndex) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        // ЗАЩИТА 1: минимум 5 сегментов
        if (segments.length < 5) {
            console.warn(`Нельзя удалить разрыв - недостаточно сегментов. Минимум 5 требуется, текущих: ${segments.length}`);
            return;
        }

        // ЗАЩИТА 2: нельзя удалять крайние разрывы
        if (handleSegmentIndex === 0 || handleSegmentIndex === segments.length - 1) {
            console.warn('Нельзя удалить концевой разрыв');
            return;
        }

        // ЗАЩИТА 3: должно быть 3 сегмента для слияния (левый-центр-правый)
        if (handleSegmentIndex < 1 || handleSegmentIndex > segments.length - 2) {
            console.warn('Нельзя удалить - недостаточно соседних сегментов');
            return;
        }

        const leftSegment = segments[handleSegmentIndex - 1];
        const centerSegment = segments[handleSegmentIndex];
        const rightSegment = segments[handleSegmentIndex + 1];

        // ЗАЩИТА 4: три сегмента не должны быть одного направления
        // Это значит, что удаление оставит два сегмента одного направления подряд
        // Пример: HH или VV → невозможно отобразить ортогонально
        if (leftSegment.direction === centerSegment.direction &&
            centerSegment.direction === rightSegment.direction) {
            console.warn('Нельзя удалить - результат будет три сегмента одного направления');
            return;
        }

        // СЛИЯНИЕ: 3 сегмента → 1
        // Направление = направление левого сегмента
        // Start = start левого, End = end правого
        const mergedSegment = {
            index: handleSegmentIndex - 1,
            direction: leftSegment.direction,
            start: { x: leftSegment.start.x, y: leftSegment.start.y },
            end: { x: rightSegment.end.x, y: rightSegment.end.y }
        };

        // Удалить 3 сегмента и вставить 1
        segments.splice(handleSegmentIndex - 1, 3, mergedSegment);

        // Пересчитать индексы
        for (let i = 0; i < segments.length; i++) {
            segments[i].index = i;
        }

        meta.segments = segments;
        meta.userModified = true;
        connection.setAttr('connection-meta', meta);

        // НЕ вызываем normalizeSegments() при слиянии
        // Ортогональность восстанавливается автоматически
        // Если пины расположены корректно (p1.y === p2.y для H-маршрута),
        // то mergedSegment будет ортогонален

        this.redrawConnection(connection);
        this.addLineEditHandles(connection);

        console.log(`Удален разрыв (segments: ${segments.length + 3} → ${segments.length})`);
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