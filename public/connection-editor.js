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
                listening: true
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

            // DBL-CLICK: добавить разрыв
            handle.on('dblclick', (e) => {
                e.cancelBubble = true;
                this.addBreakPointAtHandle(connection, i);
            });

            // CTRL+DBL-CLICK: удалить разрыв
            handle.on('dblclick', (e) => {
                if (e.evt.ctrlKey) {
                    e.cancelBubble = true;
                    this.removeBreakPointAtHandle(connection, i);
                }
            });

            this.canvasManager.getLayer().add(handle);
            handles.push(handle);
        }

        meta.handles = handles;
        connection.setAttr('connection-meta', meta);
        this.canvasManager.getLayer().batchDraw();
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
     * Обновить подсветку выделения
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
