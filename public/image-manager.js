// image-manager.js
// Управление изображениями

const HANDLE_RADIUS = 6; // радиус точки/ручки
const FRAME_PADDING = 10; // отступ рамки от изображения

class ImageManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.images = [];
        this.selectedImage = null;
        this.onImageSelected = null; // callback для UIController
        this.onImageMoved = null;    // callback вызывается при драге изображения
        this.onImageScaled = null;
        this.connectionManager = null; // будет продан из UIController
        this.updateConnectionsCallback = null; // callback для обновления соединений при resize
    }

    /**
     * Установить менеджер соединений
     * Нужно для обновления соединений при драге изображения
     */
    setConnectionManager(connectionManager) {
        this.connectionManager = connectionManager;
    }

    /**
     * Установить callback для обновления соединений при resize
     */
    setUpdateConnectionsCallback(callback) {
        this.updateConnectionsCallback = callback;
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

            layer.add(konvaImg);
            this.attachSelectionFrame(konvaImg);
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
        
        // Удалить рамку и ручку
        if (konvaImg._frame) {
            konvaImg._frame.destroy();
        }
        if (konvaImg._handle) {
            konvaImg._handle.destroy();
        }
        
        // Удалить все точки соединения этого изображения
        if (Array.isArray(konvaImg._cp_points)) {
            konvaImg._cp_points.forEach(point => {
                point.destroy();
            });
            konvaImg._cp_points = [];
        }
        
        // Удалить само изображение
        konvaImg.destroy();
        
        // Удалить из массива
        const index = this.images.indexOf(konvaImg);
        if (index > -1) {
            this.images.splice(index, 1);
        }
        
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

        // ручка ресайза
        const handle = new Konva.Circle({
            radius: HANDLE_RADIUS,
            fill: '#007bff',
            stroke: '#fff',
            strokeWidth: 1,
            draggable: true,
        });
        handle.visible(false);

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

            // обновляем точки соединения
            if (Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach((pt) => {
                    const meta = pt.getAttr('cp-meta');
                    const xy = this.sideAndOffsetToXY(konvaImg, meta.side, meta.offset);
                    pt.position(xy);
                });
            }
        };
        updateOverlays();

        // редактирование по нажатию handle
        handle.on('dragmove', () => {
            const newScaleX = Math.max(0.2, (handle.x() - konvaImg.x()) / konvaImg.width());
            const newScaleY = Math.max(0.2, (handle.y() - konvaImg.y()) / konvaImg.height());
            konvaImg.scale({ x: newScaleX, y: newScaleY });
            updateOverlays();
            // Новое: обновляем соединения при resize
            if (this.updateConnectionsCallback) {
                this.updateConnectionsCallback(konvaImg);
            }
            if (this.onImageScaled) this.onImageScaled(konvaImg);
            layer.batchDraw();
        });

        // перемещение изображения (Iteration 3: координатный подход)
        konvaImg.on('dragmove', () => {
            updateOverlays();
            
            // Новая функциональность: обновляем соединения
            if (this.connectionManager && Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach(pin => {
                    // Передаем абсолютные координаты
                    this.connectionManager.updateConnectionsForPin(
                        pin,
                        pin.x(),
                        pin.y(),
                        true  // isImageDrag = true
                    );
                });
            }

            if (this.onImageMoved) this.onImageMoved(konvaImg);
            layer.batchDraw();
        });

        // перемещение по рамке (Iteration 3: координатный подход)
        frame.on('dragmove', () => {
            konvaImg.position({
                x: frame.x() + padding,
                y: frame.y() + padding,
            });
            updateOverlays();

            // Новая функциональность: обновляем соединения
            if (this.connectionManager && Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach(pin => {
                    // Передаем абсолютные координаты
                    this.connectionManager.updateConnectionsForPin(
                        pin,
                        pin.x(),
                        pin.y(),
                        true  // isImageDrag = true
                    );
                });
            }

            if (this.onImageMoved) this.onImageMoved(konvaImg);
            layer.batchDraw();
        });

        // выбор по клику
        const selectHandler = () => {
            if (this.onImageSelected) {
                this.onImageSelected(konvaImg, frame, handle);
            }
        };

        konvaImg.on('mousedown', (e) => { e.cancelBubble = true; });
        konvaImg.on('click', selectHandler);
        frame.on('mousedown', (e) => { e.cancelBubble = true; });
        frame.on('click', selectHandler);

        // двойной клик — событие для UIController
        frame.on('dblclick', (e) => {
            e.cancelBubble = true;
            if (this.onFrameDoubleClick) {
                this.onFrameDoubleClick(konvaImg, frame);
            }
        });

        // сторим рсылки и рамку
        konvaImg._frame = frame;
        konvaImg._handle = handle;

        layer.add(frame);
        layer.add(handle);
    }

    /**
     * Преобразование стороны и месмещения в координаты
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
     * Очистить все изображения
     */
    clear() {
        this.images = [];
        this.selectedImage = null;
    }
}

export { ImageManager };