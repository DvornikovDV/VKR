// image-manager.js
// Управление изображениями

const HANDLE_RADIUS = 6; // радиус точки/рубки
const FRAME_PADDING = 10; // отступ рамки от изображения

class ImageManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.images = [];
        this.selectedImage = null;
        this.onImageSelected = null; // callback для UIController
        this.onImageMoved = null;    // callback вызывается при драге изображения
        this.onImageScaled = null;
        this.onImageDeleted = null;  // callback при удалении изображения
        this.onContextMenuRequested = null; // callback для показа контекстного меню
        this.onFrameDoubleClick = null; // callback при двойном клике на рамку
    }



    /**
     * Добавить изображение из base64
     */
    addImageFromBase64(dataUrl) {
        const stage = this.canvasManager.getStage();
        const layer = this.canvasManager.getLayer();
        const imgObj = new Image();

        imgObj.onload = () => {
            const konvaImg = new Konva.Image({
                image: imgObj,
                x: stage.width() / 2 - imgObj.width / 2,
                y: stage.height() / 2 - imgObj.height / 2,
                draggable: true
            });

            // Новые идентификаторы
            konvaImg._id = 'img_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            konvaImg._cp_points = []; // точки соединения

            // сохраняем imageId как атрибут для поиска
            konvaImg.setAttr('imageId', konvaImg._id);

            layer.add(konvaImg);
            this.attachSelectionFrame(konvaImg);
            this.attachContextMenu(konvaImg);
            layer.draw();
            this.images.push(konvaImg);
        };

        imgObj.src = dataUrl;
    }

    /**
     * Удалить изображение со сцены
     */
    deleteImage(konvaImg) {
        if (!konvaImg) return;

        const layer = this.canvasManager.getLayer();
        const imageId = konvaImg.getAttr('imageId');

        // Уведомить контроллер об удалении изображения
        if (this.onImageDeleted && imageId) {
            this.onImageDeleted(imageId);
        }

        // Удалить рамку и рубку
        if (konvaImg._frame) { konvaImg._frame.destroy(); }
        if (konvaImg._handle) { konvaImg._handle.destroy(); }

        // Удалить все точки соединения этого изображения
        if (Array.isArray(konvaImg._cp_points)) {
            konvaImg._cp_points.forEach(point => {
                if (this.onPointDeleteRequest) {
                    this.onPointDeleteRequest(point);
                } else {
                    point.destroy(); // Фолбэк на случай если координатор не подписан
                }
            });
            konvaImg._cp_points = [];
        }

        konvaImg.destroy();

        const index = this.images.indexOf(konvaImg);
        if (index > -1) { this.images.splice(index, 1); }

        layer.batchDraw();
    }

    /**
     * Прикрепить рамку выделения к изображению
     */
    attachSelectionFrame(konvaImg) {
        const layer = this.canvasManager.getLayer();
        const padding = FRAME_PADDING;

        // Контур-рамка вокруг изображения
        const frame = new Konva.Rect({
            x: konvaImg.x() - padding,
            y: konvaImg.y() - padding,
            width: konvaImg.width() * konvaImg.scaleX() + padding * 2,
            height: konvaImg.height() * konvaImg.scaleY() + padding * 2,
            stroke: '#000',
            strokeWidth: Math.max(2, HANDLE_RADIUS),
            cornerRadius: 6,
            listening: true,
            draggable: true
        });
        frame.fillEnabled(false);
        frame.hitStrokeWidth(20);

        // рубка ресайза
        const handle = new Konva.Circle({
            radius: HANDLE_RADIUS,
            fill: '#007bff',
            stroke: '#fff',
            strokeWidth: 1,
            draggable: true,
        });
        handle.visible(false);

        // Сохранить старую позицию для расчета дельты
        let lastX = konvaImg.x();
        let lastY = konvaImg.y();

        const updateOverlays = () => {
            frame.position({
                x: konvaImg.x() - padding,
                y: konvaImg.y() - padding,
            });
            frame.size({
                width: konvaImg.width() * konvaImg.scaleX() + padding * 2,
                height: konvaImg.height() * konvaImg.scaleY() + padding * 2,
            });
            handle.position({
                x: konvaImg.x() + konvaImg.width() * konvaImg.scaleX(),
                y: konvaImg.y() + konvaImg.height() * konvaImg.scaleY(),
            });

            if (Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach((pt) => {
                    const meta = pt.getAttr('cp-meta');
                    const xy = this.sideAndOffsetToXY(konvaImg, meta.side, meta.offset);
                    pt.position(xy);
                });
            }
        };
        updateOverlays();

        handle.on('dragmove', () => {
            const minW = 150;
            const minH = 150;
            const minScaleX = minW / konvaImg.width();
            const minScaleY = minH / konvaImg.height();

            const newScaleX = Math.max(minScaleX, (handle.x() - konvaImg.x()) / konvaImg.width());
            const newScaleY = Math.max(minScaleY, (handle.y() - konvaImg.y()) / konvaImg.height());

            konvaImg.scale({ x: newScaleX, y: newScaleY });
            updateOverlays(); // Принудительно корректируем позицию handle, если вышли за границы

            if (this.onImageScaled) this.onImageScaled(konvaImg);
            layer.batchDraw();
        });

        // перемещение изображения
        konvaImg.on('dragmove', () => {
            const currentX = konvaImg.x();
            const currentY = konvaImg.y();
            const deltaX = currentX - lastX;
            const deltaY = currentY - lastY;

            updateOverlays();

            if (this.onImageMoved) {
                this.onImageMoved(konvaImg, deltaX, deltaY);
            }

            lastX = currentX;
            lastY = currentY;
            layer.batchDraw();
        });

        // перемещение по рамке
        frame.on('dragmove', () => {
            const newX = frame.x() + padding;
            const newY = frame.y() + padding;
            const deltaX = newX - konvaImg.x();
            const deltaY = newY - konvaImg.y();

            konvaImg.position({ x: newX, y: newY });
            updateOverlays();

            if (this.onImageMoved) {
                this.onImageMoved(konvaImg, deltaX, deltaY);
            }

            layer.batchDraw();
        });

        // выбор по клику
        const selectHandler = () => {
            if (this.onImageSelected) { this.onImageSelected(konvaImg, frame, handle); }
        };

        konvaImg.on('mousedown', (e) => { e.cancelBubble = true; });
        konvaImg.on('click', selectHandler);
        frame.on('mousedown', (e) => { e.cancelBubble = true; });
        frame.on('click', selectHandler);

        frame.on('dblclick', (e) => {
            e.cancelBubble = true;
            if (this.onFrameDoubleClick) { this.onFrameDoubleClick(konvaImg, frame); }
        });

        konvaImg._frame = frame;
        konvaImg._handle = handle;

        layer.add(frame);
        layer.add(handle);
    }

    /**
     * Привязать контекстное меню к изображению (ПКМ)
     */
    attachContextMenu(konvaImg) {
        konvaImg.on('contextmenu', (e) => {
            e.evt.preventDefault();
            const imageId = konvaImg.getAttr('imageId');
            if (!imageId) return;

            const stagePos = this.canvasManager.getStage().getPointerPosition();
            if (!stagePos) return;

            const stage = this.canvasManager.getStage();
            const pos = {
                x: (stagePos.x - stage.x()) / stage.scaleX(),
                y: (stagePos.y - stage.y()) / stage.scaleY()
            };

            // Делегируем показ меню контроллеру
            if (this.onContextMenuRequested) {
                this.onContextMenuRequested(imageId, konvaImg, pos, e.evt.clientX, e.evt.clientY);
            }
        });
    }

    /**
     * Преобразование стороны и местмещения в координаты
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
     * Получить все изображения
     */
    getImages() {
        return this.images;
    }

    /**
     * Получить изображение по imageId
     */
    getImage(imageId) {
        return this.images.find(img => img.getAttr('imageId') === imageId) || null;
    }

    /**
     * Очистить все изображения
     */
    clear() {
        this.images = [];
        this.selectedImage = null;
    }
}

export { ImageManager };
