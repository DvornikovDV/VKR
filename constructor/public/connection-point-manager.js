// connection-point-manager.js
// Управление точками соединения узлов.

const HANDLE_RADIUS = 6;
const FRAME_PADDING = 10;

class ConnectionPointManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.points = [];
        this.onPointSelected = null; // Callback выбора точки
        this.onPointCreated = null; // Callback создания точки
        this.onPointMoved = null; // Callback перемещения точки (вызывает обновление соединений)
        this.onPointDeleted = null; // Callback удаления точки
        this.onPointDoubleClick = null; // Callback двойного клика
    }

    /** Инициализация новой точки соединения на границе узла.
     * Вход: imageNode (Konva.Image), side (String), offset (Number).
     * Выход: Узел точки (Konva.Circle). */
    createConnectionPointOnSide(imageNode, side, offset) {
        const meta = { side, offset };
        const xy = this.sideAndOffsetToXY(imageNode, side, offset);

        const point = new Konva.Circle({
            x: xy.x,
            y: xy.y,
            radius: HANDLE_RADIUS,
            fill: '#198754', // Цвет свободной точки (зеленый)
            stroke: '#fff',
            strokeWidth: 1,
            draggable: true,
            hitStrokeWidth: 20,
            listening: true
        });

        const id = 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        point.setAttr('cp-meta', { id, side, offset, connectedTo: null, imageId: imageNode._id || '' });

        // Ограничение перемещения вдоль выбранной стороны
        point.on('dragmove', () => {
            const current = point.getAttr('cp-meta');
            const proj = this.projectAlongSide(imageNode, current.side, point.position());
            point.position(proj.xy);
            current.offset = proj.offset;
            point.setAttr('cp-meta', current);

            // Трансляция абсолютных координат в callback
            if (this.onPointMoved) {
                this.onPointMoved(point);
            }
            this.canvasManager.getLayer().batchDraw();
        });

        // Обработка выделения точки для показа свойств
        point.on('click', (e) => {
            e.evt.stopPropagation();
            point.stopDrag(); // Блокировка drag-эффекта при одиночном клике
            if (this.onPointSelected) {
                this.onPointSelected(point);
            }
        });

        // Обработка удаления точки по двойному клику
        point.on('dblclick', (e) => {
            e.evt.stopPropagation();
            if (this.onPointDoubleClick) {
                this.onPointDoubleClick(point);
            }
        });

        // Регистрация точки в родительском узле изображения
        if (!Array.isArray(imageNode._cp_points)) imageNode._cp_points = [];
        imageNode._cp_points.push(point);

        this.canvasManager.getLayer().add(point);
        this.points.push(point);

        if (this.onPointCreated) {
            this.onPointCreated(point);
        }

        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();

        return point;
    }

    /** Определение ближайшей стороны и нормализованного смещения для произвольных координат.
     * Вход: imageNode (Konva.Image), pos (Object {x, y}).
     * Выход: Объект метаданных ({side: String, offset: Number}). */
    getNearestSideAndOffset(imageNode, pos) {
        const left = imageNode.x();
        const top = imageNode.y();
        const width = imageNode.width() * imageNode.scaleX();
        const height = imageNode.height() * imageNode.scaleY();
        const right = left + width;
        const bottom = top + height;

        const dTop = Math.abs(pos.y - top);
        const dRight = Math.abs(pos.x - right);
        const dBottom = Math.abs(pos.y - bottom);
        const dLeft = Math.abs(pos.x - left);
        const min = Math.min(dTop, dRight, dBottom, dLeft);

        if (min === dTop) return { side: 'top', offset: Math.min(1, Math.max(0, (pos.x - left) / width)) };
        if (min === dRight) return { side: 'right', offset: Math.min(1, Math.max(0, (pos.y - top) / height)) };
        if (min === dBottom) return { side: 'bottom', offset: Math.min(1, Math.max(0, (pos.x - left) / width)) };
        return { side: 'left', offset: Math.min(1, Math.max(0, (pos.y - top) / height)) };
    }

    /** Трансляция метаданных (сторона и смещение) в абсолютные координаты холста.
     * Вход: imageNode (Konva.Image), side (String), offset (Number).
     * Выход: Координаты (Object {x, y}). */
    sideAndOffsetToXY(imageNode, side, offset) {
        const left = imageNode.x() - FRAME_PADDING;
        const top = imageNode.y() - FRAME_PADDING;
        const width = imageNode.width() * imageNode.scaleX() + FRAME_PADDING * 2;
        const height = imageNode.height() * imageNode.scaleY() + FRAME_PADDING * 2;

        switch (side) {
            case 'top': return { x: left + width * offset, y: top };
            case 'right': return { x: left + width, y: top + height * offset };
            case 'bottom': return { x: left + width * offset, y: top + height };
            case 'left':
            default: return { x: left, y: top + height * offset };
        }
    }

    /** Проекция произвольной точки на заданную сторону узла.
     * Вход: imageNode (Konva.Image), side (String), pos (Object {x, y}).
     * Выход: Объект проекции ({xy: Object, offset: Number}). */
    projectAlongSide(imageNode, side, pos) {
        const left = imageNode.x() - FRAME_PADDING;
        const top = imageNode.y() - FRAME_PADDING;
        const width = imageNode.width() * imageNode.scaleX() + FRAME_PADDING * 2;
        const height = imageNode.height() * imageNode.scaleY() + FRAME_PADDING * 2;

        let xy, offset;

        switch (side) {
            case 'top':
                offset = Math.min(1, Math.max(0, (pos.x - left) / width));
                xy = { x: left + width * offset, y: top };
                break;
            case 'right':
                offset = Math.min(1, Math.max(0, (pos.y - top) / height));
                xy = { x: left + width, y: top + height * offset };
                break;
            case 'bottom':
                offset = Math.min(1, Math.max(0, (pos.x - left) / width));
                xy = { x: left + width * offset, y: top + height };
                break;
            case 'left':
            default:
                offset = Math.min(1, Math.max(0, (pos.y - top) / height));
                xy = { x: left, y: top + height * offset };
        }

        return { xy, offset };
    }

    /** Массовое обновление координат всех точек, привязанных к узлу.
     * Вход: imageNode (Konva.Image). */
    updatePointsForImage(imageNode) {
        if (Array.isArray(imageNode._cp_points)) {
            imageNode._cp_points.forEach((pt) => {
                const meta = pt.getAttr('cp-meta');
                const xy = this.sideAndOffsetToXY(imageNode, meta.side, meta.offset);
                pt.position(xy);
            });
        }
    }

    /** Удаление объекта точки соединения.
     * Вход: point (Konva.Circle). */
    deletePoint(point) {
        const index = this.points.indexOf(point);
        if (index > -1) {
            this.points.splice(index, 1);
        }
        point.destroy();
        if (this.onPointDeleted) {
            this.onPointDeleted(point);
        }
        this.canvasManager.getLayer().batchDraw();
    }

    /** Получение массива всех инициализированных точек.
     * Выход: Массив узлов (Array). */
    getPoints() {
        return this.points;
    }

    /** Экспорт метаданных точек соединения для сериализации конфигурации.
     * Выход: Массив конфигураций (Array). */
    exportPoints() {
        return this.points.map(point => {
            const meta = point.getAttr('cp-meta') || {};
            return {
                id: meta.id,
                side: meta.side,
                offset: meta.offset,
                imageId: meta.imageId || ''
            };
        });
    }

    /** Десериализация и инициализация точек соединения из данных схемы.
     * Вход: pointsData (Array), imageManager (Object). */
    importPoints(pointsData, imageManager) {
        this.clear();
        if (!Array.isArray(pointsData)) return;

        const layer = this.canvasManager.getLayer();

        pointsData.forEach(data => {
            const imageNode = imageManager.getImage(data.imageId);
            if (!imageNode) return;

            const xy = this.sideAndOffsetToXY(imageNode, data.side, data.offset);

            const point = new Konva.Circle({
                x: xy.x,
                y: xy.y,
                radius: HANDLE_RADIUS,
                fill: '#198754',
                stroke: '#fff',
                strokeWidth: 1,
                draggable: true,
                hitStrokeWidth: 20,
                listening: true
            });

            point.setAttr('cp-meta', {
                id: data.id,
                side: data.side,
                offset: data.offset,
                connectedTo: null,
                imageId: data.imageId || ''
            });

            point.on('dragmove', () => {
                const current = point.getAttr('cp-meta');
                const proj = this.projectAlongSide(imageNode, current.side, point.position());
                point.position(proj.xy);
                current.offset = proj.offset;
                point.setAttr('cp-meta', current);

                if (this.onPointMoved) {
                    this.onPointMoved(point);
                }
                this.canvasManager.getLayer().batchDraw();
            });

            point.on('click', (e) => {
                e.evt.stopPropagation();
                point.stopDrag(); // Блокировка drag-эффекта при одиночном клике
                if (this.onPointSelected) {
                    this.onPointSelected(point);
                }
            });

            point.on('dblclick', (e) => {
                e.evt.stopPropagation();
                if (this.onPointDoubleClick) {
                    this.onPointDoubleClick(point);
                }
            });

            if (!Array.isArray(imageNode._cp_points)) imageNode._cp_points = [];
            imageNode._cp_points.push(point);

            layer.add(point);
            this.points.push(point);
        });

        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();
    }

    /** Восстановление стандартного пайплайна событий (click, dblclick) после режима маршрутизации.
     * Вход: point (Konva.Circle). */
    restoreDefaultEvents(point) {
        // Очистка привязок для предотвращения дублирования
        point.off('click');
        point.off('dblclick');
        point.off('pointerdown'); // Сброс обработчика маршрутизации

        // Обработка выделения точки для показа свойств
        point.on('click', (e) => {
            e.evt.stopPropagation();
            point.stopDrag(); // Блокировка drag-эффекта при одиночном клике
            if (this.onPointSelected) {
                this.onPointSelected(point);
            }
        });

        // Обработка удаления точки по двойному клику
        point.on('dblclick', (e) => {
            e.evt.stopPropagation();
            if (this.onPointDoubleClick) {
                this.onPointDoubleClick(point);
            }
        });
    }

    /** Очистка массива точек менеджера. */
    clear() {
        this.points.forEach(p => p.destroy());
        this.points = [];
    }
}

export { ConnectionPointManager };
