// connection-point-manager.js
// Управление точками соединения

const HANDLE_RADIUS = 6;
const FRAME_PADDING = 10;

class ConnectionPointManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.points = [];
        this.onPointSelected = null; // callback для UIController
        this.onPointCreated = null;
        this.onPointMoved = null;   // callback вызывает updateConnectionsForPin
        this.onPointDeleted = null;
        this.onPointDoubleClick = null;
    }

    /**
     * Создать точку соединения на стороне
     */
    createConnectionPointOnSide(imageNode, side, offset) {
        const meta = { side, offset };
        const xy = this.sideAndOffsetToXY(imageNode, side, offset);

        const point = new Konva.Circle({
            x: xy.x,
            y: xy.y,
            radius: HANDLE_RADIUS,
            fill: '#198754', // свободная: зеленая
            stroke: '#fff',
            strokeWidth: 1,
            draggable: true,
            hitStrokeWidth: 20,
            listening: true
        });

        const id = 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        point.setAttr('cp-meta', { id, side, offset, connectedTo: null, imageId: imageNode._id || '' });

        // перемещение вдоль стороны
        point.on('dragmove', () => {
            const current = point.getAttr('cp-meta');
            const proj = this.projectAlongSide(imageNode, current.side, point.position());
            point.position(proj.xy);
            current.offset = proj.offset;
            point.setAttr('cp-meta', current);

            // Передаем абсолютные координаты
            if (this.onPointMoved) {
                this.onPointMoved(point);
            }
            this.canvasManager.getLayer().batchDraw();
        });

        // клик — показать свойства
        point.on('click', (e) => {
            e.evt.stopPropagation();
            if (this.onPointSelected) {
                this.onPointSelected(point);
            }
        });

        // двойной клик — удалить
        point.on('dblclick', (e) => {
            e.evt.stopPropagation();
            if (this.onPointDoubleClick) {
                this.onPointDoubleClick(point);
            }
        });

        // регистрируем поинт у изображения
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

    /**
     * Получить ближайшую сторону и офсет
     */
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

    /**
     * Преобразование стороны и смещения в координаты
     */
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

    /**
     * Проекция одновременно на сторону
     */
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

    /**
     * Обновить точки актуализируя их позиции
     */
    updatePointsForImage(imageNode) {
        if (Array.isArray(imageNode._cp_points)) {
            imageNode._cp_points.forEach((pt) => {
                const meta = pt.getAttr('cp-meta');
                const xy = this.sideAndOffsetToXY(imageNode, meta.side, meta.offset);
                pt.position(xy);
            });
        }
    }

    /**
     * Удалить точку
     */
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

    /**
     * Получить все точки
     */
    getPoints() {
        return this.points;
    }

    /**
     * Экспорт точек соединения для сохранения схемы
     */
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

    /**
     * Импорт точек соединения из сохраненной схемы
     */
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

    /**
     * Восстановить стандартные обработчики событий (click, dblclick)
     * Используется после выхода из режима создания линий
     */
    restoreDefaultEvents(point) {
        // Сначала удаляем, чтобы не дублировать
        point.off('click');
        point.off('dblclick');
        point.off('pointerdown'); // удаляем обработчик создания линий если он был

        // клик — показать свойства
        point.on('click', (e) => {
            e.evt.stopPropagation();
            if (this.onPointSelected) {
                this.onPointSelected(point);
            }
        });

        // двойной клик — удалить
        point.on('dblclick', (e) => {
            e.evt.stopPropagation();
            if (this.onPointDoubleClick) {
                this.onPointDoubleClick(point);
            }
        });
    }

    /**
     * Очистить все точки
     */
    clear() {
        this.points.forEach(p => p.destroy());
        this.points = [];
    }
}

export { ConnectionPointManager };
