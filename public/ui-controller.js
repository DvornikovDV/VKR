// ui-controller.js
// Управление UI, элементами и взаимодействиями

import { CanvasManager } from './canvas-manager.js';

const HANDLE_RADIUS = 6; // радиус точки/ручки
const FRAME_PADDING = 10; // отступ рамки от изображения

class UIController {
    constructor() {
        this.canvasManager = null;
        this.selected = null;
        this.points = [];
        this.connections = [];
        this.isCreateLineMode = false;
        this.firstPinSelected = null;
        this.previewLine = null;
        this.init();
    }

    init() {
        // Инициализируем Canvas Manager
        this.canvasManager = new CanvasManager();
        
        // Настраиваем обработчики UI
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Инициализируем bootstrap tooltips, если доступны
        try {
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.forEach(function (tooltipTriggerEl) {
                if (window.bootstrap && bootstrap.Tooltip) new bootstrap.Tooltip(tooltipTriggerEl);
            });
        } catch (_) {}

        // Кнопка добавления изображения
        document.getElementById('add-image-btn').addEventListener('click', () => {
            this.addImage();
        });

        // Кнопка сохранения
        document.getElementById('save-btn').addEventListener('click', () => {
            this.saveScheme();
        });

        // Кнопка загрузки
        document.getElementById('load-btn').addEventListener('click', () => {
            this.loadScheme();
        });

        // Кнопка очистки
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearCanvas();
        });

        // Кнопка удаления
        document.getElementById('delete-btn')?.addEventListener('click', () => {
            this.deleteSelected();
        });

        // Центр. блок иконок
        const undoBtn = document.getElementById('undo-btn');
        const createLineBtn = document.getElementById('create-line-btn');
        const deleteSelectedBtn = document.getElementById('delete-selected-btn');

        // Отмена: вспышка и действие
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                undoBtn.classList.add('active');
                setTimeout(() => undoBtn.classList.remove('active'), 150);
                // TODO: реализовать undo-стек
            });
        }

        // Создать линию: переключатель режима
        if (createLineBtn) {
            createLineBtn.addEventListener('click', () => {
                this.toggleLineCreationMode();
            });
        }

        // Удалить выбранное: одноразовая подсветка, при повторном нажатии подсветка снимается
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => {
                if (deleteSelectedBtn.classList.contains('active')) {
                    deleteSelectedBtn.classList.remove('active');
                    return;
                }
                deleteSelectedBtn.classList.add('active');
                this.deleteSelected();
                setTimeout(() => deleteSelectedBtn.classList.remove('active'), 200);
            });
        }
    }

    addImage() {
        const fileInput = document.getElementById('file-input');
        fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                this.addImageFromBase64(reader.result);
                fileInput.value = '';
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    }

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

            layer.add(konvaImg);
            this.attachSelectionFrame(konvaImg);
            layer.draw();
        };
        imgObj.src = dataUrl;
    }

    attachSelectionFrame(konvaImg) {
        const layer = this.canvasManager.getLayer();
        const padding = FRAME_PADDING;
        // Контур-рамка вокруг изображения, кликабельная и чуть за границами (ровная)
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
        // клик по контуру удобнее
        frame.fillEnabled(false);
        frame.hitStrokeWidth(20);

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
            // обновляем точки, привязанные к этому изображению
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
            const newScaleX = Math.max(0.2, (handle.x() - konvaImg.x()) / konvaImg.width());
            const newScaleY = Math.max(0.2, (handle.y() - konvaImg.y()) / konvaImg.height());
            konvaImg.scale({ x: newScaleX, y: newScaleY });
            updateOverlays();
            this.updateConnectionsForImage(konvaImg);
            layer.batchDraw();
        });

        konvaImg.on('dragmove', () => {
            updateOverlays();
            this.updateConnectionsForImage(konvaImg);
            layer.batchDraw();
        });

        // Перемещение по рамке двигает изображение
        frame.on('dragmove', () => {
            konvaImg.position({
                x: frame.x() + padding,
                y: frame.y() + padding,
            });
            updateOverlays();
            this.updateConnectionsForImage(konvaImg);
            layer.batchDraw();
        });

        // Выбор по клику на изображение или на рамку (без конфликта с pan)
        const selectHandler = () => this.selectElement(konvaImg, frame, handle);
        konvaImg.on('mousedown', (e) => {
            // предотвратить включение pan
            e.cancelBubble = true;
        });
        konvaImg.on('click', selectHandler);
        frame.on('mousedown', (e) => { e.cancelBubble = true; });
        frame.on('click', selectHandler);

        // Двойной клик по рамке — создать точку соединения
        frame.on('dblclick', (e) => {
            e.cancelBubble = true;
            const pos = this.getPointerStageCoords();
            // определить сторону из позиции относительно рамки
            const sideMeta = this.getNearestSideAndOffsetFromFrame(frame, pos);
            this.createConnectionPointOnSide(konvaImg, sideMeta.side, sideMeta.offset);
        });

        layer.add(frame);
        layer.add(handle);
        this.selectElement(konvaImg, frame, handle);
    }

    selectElement(node, frame, handle) {
        // сброс прошлого выделения
        if (this.selected && this.selected.cleanup) this.selected.cleanup();
        const layer = this.canvasManager.getLayer();
        // Подсветка: синяя тонкая рамка поверх черной рамки
        const highlight = new Konva.Rect({
            x: () => node.x() - 12,
            y: () => node.y() - 12,
            width: () => node.width() * node.scaleX() + 24,
            height: () => node.height() * node.scaleY() + 24,
            stroke: '#0d6efd',
            strokeWidth: Math.max(1, HANDLE_RADIUS / 2),
            opacity: 0.9,
            cornerRadius: 8,
            listening: false
        });
        layer.add(highlight);
        layer.moveToTop(node);
        layer.batchDraw();

        const cleanup = () => {
            highlight.destroy();
            if (this.selected && this.selected.handle) {
                this.selected.handle.visible(false);
            }
            layer.batchDraw();
        };
        handle.visible(true);
        this.selected = { node, frame, handle, cleanup };
    }

    // Создание точки соединения на ближайшей стороне рамки
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
            hitStrokeWidth: 20, // Увеличиваем зону клика
            listening: true
        });
        const id = 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        point.setAttr('cp-meta', { id, side, offset, connectedTo: null, imageId: imageNode._id || '' });

        // Перемещение вдоль соответствующей стороны
        point.on('dragmove', () => {
            const current = point.getAttr('cp-meta');
            const proj = this.projectAlongSide(imageNode, current.side, point.position());
            point.position(proj.xy);
            current.offset = proj.offset;
            point.setAttr('cp-meta', current);
            this.updateConnectionsForPin(point);
            this.canvasManager.getLayer().batchDraw();
        });

        // Показ свойств по одиночному клику (только вне режима)
        point.on('click', (e) => {
            e.evt.stopPropagation();
            if (!this.isCreateLineMode) {
                this.clearSelection();
                this.showPropertiesForPoint(point);
            }
        });

        // Двойной клик — удалить (только вне режима, если не подключен)
        point.on('dblclick', (e) => {
            e.evt.stopPropagation();
            if (this.isCreateLineMode) return; // Запрещаем удаление в режиме
            const meta = point.getAttr('cp-meta');
            if (meta.connectedTo) {
                alert('Нельзя удалить подключенную точку соединения. Сначала удалите соединение.');
                return;
            }
            point.destroy();
            this.canvasManager.getLayer().batchDraw();
            const container = document.getElementById('properties-content');
            if (container) container.innerHTML = '<p class="text-muted">Выберите элемент для редактирования свойств</p>';
        });

        // регистрируем точку у изображения
        if (!Array.isArray(imageNode._cp_points)) imageNode._cp_points = [];
        imageNode._cp_points.push(point);

        this.canvasManager.getLayer().add(point);
        this.points.push(point);

        // Если в режиме создания линии, настраиваем для выбора
        if (this.isCreateLineMode) {
            point.draggable(false);
            point.listening(true);
            point.off('click');
            point.off('dblclick');
            point.on('pointerdown', (e) => {
                console.log('Pointerdown on new pin in mode! ID:', point.getAttr('cp-meta').id); // Для отладки
                e.evt.stopPropagation();
                this.handlePinClickForLineCreation(point);
            });
        }

        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw(); // Дополнительный refresh

        // показать свойства созданной точки
        this.showPropertiesForPoint(point);
    }

    // =================
    handlePinClickForLineCreation(point) {
        console.log('Handling pin click! ID:', point.getAttr('cp-meta').id, 'Mode:', this.isCreateLineMode); // Отладка
        const meta = point.getAttr('cp-meta');
        
        // Проверяем, что пин свободен
        if (meta.connectedTo) {
            console.log('Cannot connect occupied pin:', meta.id);
            return;
        }

        if (!this.firstPinSelected) {
            // Выбираем первый пин
            this.firstPinSelected = point;
            point.fill('#dc3545'); // красный для выбранного
            this.canvasManager.getLayer().batchDraw();
            console.log('First pin selected:', meta.id);
        } else if (this.firstPinSelected === point) {
            // Отменяем выбор первого пина
            this.firstPinSelected.fill('#198754'); // возвращаем зеленый
            this.firstPinSelected = null;
            this.clearPreviewLine();
            console.log('Selection cancelled for pin:', meta.id);
        } else {
            // Создаем соединение между двумя пинами
            console.log('Creating connection between:', this.firstPinSelected.getAttr('cp-meta').id, 'and', meta.id);
            this.createConnection(this.firstPinSelected, point);
            this.firstPinSelected = null;
            this.clearPreviewLine();
        }
    }

    // Вычисление ближайшей стороны и относительного смещения 0..1
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

    // ближайшая сторона и offset относительно рамки (учитывает FRAME_PADDING)
    getNearestSideAndOffsetFromFrame(frame, pos) {
        const left = frame.x();
        const top = frame.y();
        const width = frame.width();
        const height = frame.height();
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

    // Преобразование стороны и смещения в координаты
    sideAndOffsetToXY(imageNode, side, offset) {
        // координаты по рамке, а не по краю изображения
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

    // Проекция произвольной точки на сторону и расчет offset 0..1
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

    // Панель свойств для точки
    showPropertiesForPoint(point) {
        const meta = point.getAttr('cp-meta');
        const container = document.getElementById('properties-content');
        if (!container) return;
        container.innerHTML = '' +
            '<div class="mb-2"><strong>Точка соединения</strong></div>'+
            `<div class="small text-muted">ID: ${meta.id}</div>`+
            `<div class="small">imageId: ${meta.imageId || '-'}</div>`+
            `<div class="small">side: ${meta.side}</div>`+
            `<div class="small">offset: ${meta.offset.toFixed(2)}</div>`+
            `<div class="small">connectedTo: ${meta.connectedTo || '-'}</div>`;
    }

    // Координаты указателя, нормализованные к системе координат stage (с учетом pan/zoom)
    getPointerStageCoords() {
        const stage = this.canvasManager.getStage();
        const p = stage.getPointerPosition();
        if (!p) return { x: 0, y: 0 };
        return {
            x: (p.x - stage.x()) / stage.scaleX(),
            y: (p.y - stage.y()) / stage.scaleY(),
        };
    }

    saveScheme() {
        console.log('Сохранение схемы - будет реализовано в следующей итерации');
        alert('Функция сохранения будет реализована в следующей итерации');
    }

    loadScheme() {
        console.log('Загрузка схемы - будет реализовано в следующей итерации');
        alert('Функция загрузки будет реализована в следующей итерации');
    }

    clearCanvas() {
        if (confirm('Очистить canvas? Все элементы будут удалены.')) {
            this.canvasManager.getLayer().destroyChildren();
            this.canvasManager.addGrid();
            console.log('Canvas очищен');
        }
    }

    deleteSelected() {
        console.log('Удаление выбранного - будет реализовано в следующей итерации');
        alert('Функция удаления будет реализована в следующей итерации');
    }

    // Переключение режима создания линии
    toggleLineCreationMode() {
        this.isCreateLineMode = !this.isCreateLineMode;
        const createLineBtn = document.getElementById('create-line-btn');
        if (createLineBtn) {
            createLineBtn.classList.toggle('active', this.isCreateLineMode);
        }

        if (this.isCreateLineMode) {
            this.highlightFreePins();
            // Отключаем draggable и обеспечиваем listening
            this.points.forEach(point => {
                point.draggable(false);
                point.listening(true);
            });
            this.canvasManager.getLayer().batchDraw();
            this.canvasManager.getStage().batchDraw(); // Дополнительный refresh hit-graph
            this.setupLineCreationHandlers();
        } else {
            this.clearPinHighlighting();
            this.clearLineCreationHandlers();
            this.clearPreviewLine();
            this.firstPinSelected = null;
            // Восстанавливаем draggable
            this.points.forEach(point => {
                point.draggable(true);
                point.listening(true);
            });
            this.canvasManager.getLayer().batchDraw();
            this.canvasManager.getStage().batchDraw();
        }
    }

    // Подсветка свободных пинов зеленым цветом
    highlightFreePins() {
        this.points.forEach(point => {
            const meta = point.getAttr('cp-meta');
            if (!meta.connectedTo) {
                point.fill('#198754'); // зеленый для свободных
            }
        });
        this.canvasManager.getLayer().batchDraw();
    }

    // Убрать подсветку пинов
    clearPinHighlighting() {
        this.points.forEach(point => {
            const meta = point.getAttr('cp-meta');
            if (!meta.connectedTo) {
                point.fill('#198754'); // возвращаем зеленый для свободных
            }
        });
        this.canvasManager.getLayer().batchDraw();
    }

    // Настройка обработчиков для создания линий
    setupLineCreationHandlers() {
        console.log('Setting up handlers for', this.points.length, 'pins');
        this.points.forEach(point => console.log('Pin ID:', point.getAttr('cp-meta').id, 'Listening:', point.listening()));

        const stage = this.canvasManager.getStage();
        
        // Обработчик движения мыши для предварительного просмотра
        stage.on('mousemove', this.handleMouseMoveForLinePreview.bind(this));
        
        // Обработчик для пинов
        this.points.forEach(point => {
            point.off('click');  // Снимаем старые
            point.off('mousedown');
            point.off('pointerdown');
            point.off('dblclick');  // Запрещаем удаление в режиме
            point.on('pointerdown', (e) => {
                console.log('Pointerdown on pin in mode! ID:', point.getAttr('cp-meta').id); // Для отладки
                e.evt.stopPropagation();
                this.handlePinClickForLineCreation(point);
            });
        });
    }

    // Очистка обработчиков создания линий
    clearLineCreationHandlers() {
        const stage = this.canvasManager.getStage();
        stage.off('mousemove');
        
        // Восстанавливаем обычные обработчики для пинов
        this.points.forEach(point => {
            point.off('pointerdown');  // Снимаем режим
            point.on('click', (e) => {
                e.evt.stopPropagation();
                this.clearSelection();
                this.showPropertiesForPoint(point);
            });
            point.on('dblclick', (e) => {  // Восстанавливаем удаление
                e.evt.stopPropagation();
                const meta = point.getAttr('cp-meta');
                if (meta.connectedTo) {
                    alert('Нельзя удалить подключенную точку соединения. Сначала удалите соединение.');
                    return;
                }
                point.destroy();
                this.canvasManager.getLayer().batchDraw();
                const container = document.getElementById('properties-content');
                if (container) container.innerHTML = '<p class="text-muted">Выберите элемент для редактирования свойств</p>';
            });
        });
    }

    // Обработка движения мыши для предварительного просмотра линии
    handleMouseMoveForLinePreview(e) {
        if (!this.firstPinSelected) return;
        
        const pos = this.getPointerStageCoords();
        this.updatePreviewLine(this.firstPinSelected.position(), pos);
    }

    // Обработка клика по пину в режиме создания линии
    handlePinClickForLineCreation(point) {
        const meta = point.getAttr('cp-meta');
        
        // Проверяем, что пин свободен
        if (meta.connectedTo) {
            console.log('Нельзя соединить занятый пин');
            return;
        }

        if (!this.firstPinSelected) {
            // Выбираем первый пин
            this.firstPinSelected = point;
            point.fill('#dc3545'); // красный для выбранного
            this.canvasManager.getLayer().batchDraw();
        } else if (this.firstPinSelected === point) {
            // Отменяем выбор первого пина
            this.firstPinSelected.fill('#198754'); // возвращаем зеленый
            this.firstPinSelected = null;
            this.clearPreviewLine();
        } else {
            // Создаем соединение между двумя пинами
            this.createConnection(this.firstPinSelected, point);
            this.firstPinSelected = null;
            this.clearPreviewLine();
        }
    }

    // Создание предварительной линии
    updatePreviewLine(startPos, endPos) {
        if (this.previewLine) {
            this.previewLine.destroy();
        }

        // Создаем простую ортогональную линию для предварительного просмотра
        const midX = (startPos.x + endPos.x) / 2;
        const points = [
            startPos.x, startPos.y,
            midX, startPos.y,
            midX, endPos.y,
            endPos.x, endPos.y
        ];
        
        this.previewLine = new Konva.Line({
            points: points,
            stroke: '#6c757d',
            strokeWidth: 2,
            dash: [5, 5],
            listening: false
        });

        this.canvasManager.getLayer().add(this.previewLine);
        this.canvasManager.getLayer().batchDraw();
    }

    // Создание простой линии: 2 вилки + 1 сегмент
    createSimpleLine(pin1, pin2) {
        const pos1 = pin1.position();
        const pos2 = pin2.position();
        const meta1 = pin1.getAttr('cp-meta');
        const meta2 = pin2.getAttr('cp-meta');
        
        const fork1 = this.createSmartFork(pos1, meta1.side, pos2);
        const fork2 = this.createSmartFork(pos2, meta2.side, pos1);
        
        // Preferred first direction перпендикулярно вилке1
        const preferredFirst = (meta1.side === 'top' || meta1.side === 'bottom') ? 'horizontal' : 'vertical';
        
        const segment = this.createOrthogonalSegment(fork1.end, fork2.end, preferredFirst);
        
        const points = [
            pos1.x, pos1.y,
            fork1.end.x, fork1.end.y,
            segment.x, segment.y,
            fork2.end.x, fork2.end.y,
            pos2.x, pos2.y
        ];
        
        return {
            points: points,
            fork1: fork1,
            fork2: fork2,
            segment: segment
        };
    }

    distanceToSegment(pos, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        let t = ((pos.x - p1.x) * dx + (pos.y - p1.y) * dy) / (dx * dx + dy * dy);
        t = Math.max(0, Math.min(1, t));
        const proj = { x: p1.x + t * dx, y: p1.y + t * dy };
        const dx2 = pos.x - proj.x;
        const dy2 = pos.y - proj.y;
        return Math.sqrt(dx2 * dx2 + dy2 * dy2);
    }

    getDirectionFromSide(side) {
        switch (side) {
            case 'top': return {x: 0, y: -1}; // outward
            case 'right': return {x: 1, y: 0};
            case 'bottom': return {x: 0, y: 1};
            case 'left': return {x: -1, y: 0};
            default: return {x: -1, y: 0};
        }
    }

    // Создание умной вилки (динамическая длина на основе dist до target, outward или inward)
    createSmartFork(pinPos, side, targetPos) {
        const direction = this.getDirectionFromSide(side);
        const dist = Math.hypot(targetPos.x - pinPos.x, targetPos.y - pinPos.y);
        const length = Math.max(30, dist / 2); // Динамическая: пропорциональна dist, min 30
        let endX = pinPos.x + direction.x * length;
        let endY = pinPos.y + direction.y * length;
        
        // Если target ближе — inward (короткая вилка внутрь)
        if (dist < 50) {
            endX = pinPos.x - direction.x * (50 - dist); // Обратное направление для inward
            endY = pinPos.y - direction.y * (50 - dist);
        }
        
        return {
            start: pinPos,
            end: { x: endX, y: endY },
            side: side
        };
    }

    createOrthogonalSegment(start, end, preferredFirst = 'horizontal') {
        // Выбираем order для перпендикулярности вилке
        if (preferredFirst === 'horizontal') {
            return { x: end.x, y: start.y }; // horizontal first, then vertical
        } else {
            return { x: start.x, y: end.y }; // vertical first, then horizontal
        }
    }


    // Очистка предварительной линии
    clearPreviewLine() {
        if (this.previewLine) {
            this.previewLine.destroy();
            this.previewLine = null;
            this.canvasManager.getLayer().batchDraw();
        }
    }



    // Создание соединения между двумя пинами
    createConnection(pin1, pin2) {
        const meta1 = pin1.getAttr('cp-meta');
        const meta2 = pin2.getAttr('cp-meta');
        
        // Создаем простую линию: 2 вилки + 1 сегмент
        const lineData = this.createSimpleLine(pin1, pin2);
        
        const connection = new Konva.Line({
            points: lineData.points,
            stroke: '#000',
            strokeWidth: 2,
            listening: true,
            hitStrokeWidth: 10 // увеличиваем область клика
        });

        // Сохраняем ссылки на пины в метаданных линии
        connection.setAttr('connection-meta', {
            id: 'conn_' + Date.now(),
            fromPin: pin1,
            toPin: pin2,
            fork1: lineData.fork1,
            fork2: lineData.fork2,
            segment: lineData.segment,
            segments: [] // массив для дополнительных сегментов
        });

        // Обработчик клика по линии для выделения
        connection.on('click', (e) => {
            e.cancelBubble = true;
            this.selectConnection(connection);
            this.addLineEditHandles(connection);
        });

        // Обработчик двойного клика для добавления сегмента
        connection.on('dblclick', (e) => {
            e.cancelBubble = true;
            this.addSegmentToConnection(connection);
        });

        // Обновляем статус пинов
        meta1.connectedTo = meta2.id;
        meta2.connectedTo = meta1.id;
        pin1.setAttr('cp-meta', meta1);
        pin2.setAttr('cp-meta', meta2);

        // Меняем цвет пинов на красный (соединенные)
        pin1.fill('#dc3545');
        pin2.fill('#dc3545');

        this.canvasManager.getLayer().add(connection);
        this.connections.push(connection);
        this.canvasManager.getLayer().batchDraw();

        console.log(`Создано соединение между ${meta1.id} и ${meta2.id}`);
    }

    // Обновление соединений для пина (динамический пересчёт обеих вилок)
    updateConnectionsForPin(pin) {
        const pinMeta = pin.getAttr('cp-meta');
        if (!pinMeta.connectedTo) return;

        this.connections.forEach(connection => {
            const connMeta = connection.getAttr('connection-meta');
            if (connMeta && (connMeta.fromPin === pin || connMeta.toPin === pin)) {
                const points = connection.points();
                const newPos = pin.position();
                const isFromPin = connMeta.fromPin === pin;
                const length = points.length;
                
                // Обновить позицию пина
                const pinIndex = isFromPin ? 0 : length - 2;
                points[pinIndex] = newPos.x;
                points[pinIndex + 1] = newPos.y;
                
                // Динамически пересчитать вилку
                let fork, targetPos, nextIndex;
                if (isFromPin) {
                    // Fork1: target — начало следующего сегмента (points[4/5])
                    nextIndex = 4;
                    targetPos = { x: points[nextIndex], y: points[nextIndex + 1] };
                    fork = this.createSmartFork(newPos, pinMeta.side, targetPos);
                    // Обновить end fork1 в points
                    points[2] = fork.end.x;
                    points[3] = fork.end.y;
                    connMeta.fork1 = fork;
                } else {
                    // Fork2: target — конец предыдущего сегмента (points[length-6 / -5])
                    nextIndex = length - 6;
                    targetPos = { x: points[nextIndex], y: points[nextIndex + 1] };
                    fork = this.createSmartFork(newPos, pinMeta.side, targetPos);
                    // Обновить start fork2 в points (end вилки — перед пином)
                    points[length - 4] = fork.end.x;
                    points[length - 3] = fork.end.y;
                    connMeta.fork2 = fork;
                }
                
                connection.points(points);
                connection.setAttr('connection-meta', connMeta);
                
                // Enforce для остальных сегментов
                this.enforceOrthogonal(connection, isFromPin);
            }
        });
        this.canvasManager.getLayer().batchDraw();
    }

    // Enforce ортогональности (с пересчётом вилок после propagation)
    enforceOrthogonal(connection, updatedFromStart = true) {
        const points = connection.points();
        const meta = connection.getAttr('connection-meta');
        const length = points.length;
        
        // Enforce fork1 (start) — динамически на основе target (следующий сегмент)
        const side1 = meta.fromPin.getAttr('cp-meta').side;
        const target1 = { x: points[4], y: points[5] }; // Следующий сегмент
        const fork1 = this.createSmartFork(
            { x: points[0], y: points[1] }, // pin pos
            side1,
            target1
        );
        points[2] = fork1.end.x;
        points[3] = fork1.end.y;
        
        // Enforce middle segments (propagate)
        for (let i = 4; i < length - 4; i += 2) { // Skip вилки
            const dx = points[i + 2] - points[i];
            const dy = points[i + 3] - points[i + 1];
            if (Math.abs(dx) > Math.abs(dy)) {
                points[i + 3] = points[i + 1]; // make horizontal
            } else {
                points[i + 2] = points[i]; // make vertical
            }
        }
        
        // Enforce fork2 (end) — динамически на основе target (предыдущий сегмент)
        const side2 = meta.toPin.getAttr('cp-meta').side;
        const target2 = { x: points[length - 6], y: points[length - 5] }; // Предыдущий сегмент
        const fork2 = this.createSmartFork(
            { x: points[length - 2], y: points[length - 1] }, // pin pos
            side2,
            target2
        );
        points[length - 4] = fork2.end.x;
        points[length - 3] = fork2.end.y;
        
        // Reverse propagation if from end
        if (!updatedFromStart) {
            for (let i = length - 6; i >= 4; i -= 2) {
                const dx = points[i + 2] - points[i];
                const dy = points[i + 3] - points[i + 1];
                if (Math.abs(dx) > Math.abs(dy)) {
                    points[i + 3] = points[i + 1];
                } else {
                    points[i + 2] = points[i];
                }
            }
        }
        
        // Обновить meta
        meta.fork1 = fork1;
        meta.fork2 = fork2;
        connection.setAttr('connection-meta', meta);
        connection.points(points);
        this.canvasManager.getLayer().batchDraw();
    }

    // Обновление всех соединений для изображения (устраняет дублирование)
    updateConnectionsForImage(imageNode) {
        if (Array.isArray(imageNode._cp_points)) {
            imageNode._cp_points.forEach((pin) => {
                this.updateConnectionsForPin(pin);
            });
        }
    }

    // Выделение соединения
    selectConnection(connection) {
        // Сбрасываем предыдущее выделение
        if (this.selected && this.selected.cleanup) this.selected.cleanup();
        
        const layer = this.canvasManager.getLayer();
        const connMeta = connection.getAttr('connection-meta');
        
        // Создаем подсветку для линии
        const highlight = new Konva.Line({
            points: connection.points(),
            stroke: '#0d6efd',
            strokeWidth: 4,
            opacity: 0.7,
            listening: false
        });

        layer.add(highlight);
        layer.moveToTop(connection);
        layer.batchDraw();

        const cleanup = () => {
            highlight.destroy();
            layer.batchDraw();
        };

        this.selected = { connection, cleanup };
        
        // Показываем свойства соединения
        this.showPropertiesForConnection(connection);
    }

    // Панель свойств для соединения
    showPropertiesForConnection(connection) {
        const meta = connection.getAttr('connection-meta');
        const container = document.getElementById('properties-content');
        if (!container) return;
        
        container.innerHTML = '' +
            '<div class="mb-2"><strong>Соединение</strong></div>' +
            `<div class="small text-muted">ID: ${meta.id}</div>` +
            `<div class="small">От: ${meta.fromPin.getAttr('cp-meta').id}</div>` +
            `<div class="small">До: ${meta.toPin.getAttr('cp-meta').id}</div>` +
            '<div class="small text-muted">Двойной клик для удаления</div>';
    }

    // Удаление соединения
    deleteConnection(connection) {
        const meta = connection.getAttr('connection-meta');
        
        // Освобождаем пины
        const fromPinMeta = meta.fromPin.getAttr('cp-meta');
        const toPinMeta = meta.toPin.getAttr('cp-meta');
        
        fromPinMeta.connectedTo = null;
        toPinMeta.connectedTo = null;
        meta.fromPin.setAttr('cp-meta', fromPinMeta);
        meta.toPin.setAttr('cp-meta', toPinMeta);
        
        // Возвращаем пинам зеленый цвет
        meta.fromPin.fill('#198754');
        meta.toPin.fill('#198754');
        
        // Удаляем ручки редактирования
        this.removeLineEditHandles(connection);
        
        // Удаляем соединение из массива
        const index = this.connections.indexOf(connection);
        if (index > -1) {
            this.connections.splice(index, 1);
        }
        
        // Удаляем соединение с canvas
        connection.destroy();
        
        // Очищаем выделение
        if (this.selected && this.selected.connection === connection) {
            this.selected.cleanup();
            this.selected = null;
        }
        
        // Очищаем панель свойств
        const container = document.getElementById('properties-content');
        if (container) {
            container.innerHTML = '<p class="text-muted">Выберите элемент для редактирования свойств</p>';
        }
        
        this.canvasManager.getLayer().batchDraw();
        console.log(`Удалено соединение ${meta.id}`);
    }

    // Сброс выделения
    clearSelection() {
        if (this.selected && this.selected.cleanup) {
            this.selected.cleanup();
            
            // Удаляем ручки редактирования линий
            if (this.selected.connection) {
                this.removeLineEditHandles(this.selected.connection);
            }
            
            this.selected = null;
        }
        
        // Очищаем панель свойств
        const container = document.getElementById('properties-content');
        if (container) {
            container.innerHTML = '<p class="text-muted">Выберите элемент для редактирования свойств</p>';
        }
    }

    // Добавление ручек редактирования для линии
    addLineEditHandles(connection) {
        // Удаляем старые ручки
        this.removeLineEditHandles(connection);
        
        const meta = connection.getAttr('connection-meta');
        const points = connection.points();
        const handles = [];
        const lineWidth = connection.strokeWidth();
        
        // Loop over ends of middle segments (skip first вилка end i=2, last вилка start i=length-4)
        for (let i = 4; i < points.length - 4; i += 2) {
            // Red point at end of seg
            const redPoint = new Konva.Circle({
                x: points[i],
                y: points[i + 1],
                radius: lineWidth / 2,
                fill: '#dc3545',
                stroke: '#fff',
                strokeWidth: 1,
                listening: false
            });
            
            // Blue handle at mid of seg
            const midX = (points[i - 2] + points[i]) / 2;
            const midY = (points[i - 1] + points[i + 1]) / 2;
            
            const blueHandle = new Konva.Circle({
                x: midX,
                y: midY,
                radius: 4,
                fill: '#007bff',
                stroke: '#fff',
                strokeWidth: 1,
                draggable: true
            });
            
            blueHandle.setAttr('line-edit-meta', {
                connection: connection,
                segmentIndex: (i - 2) / 2
            });
            
            blueHandle.on('dragmove', () => {
                this.updateSegmentOrthogonally(blueHandle);
            });
            
            handles.push(redPoint, blueHandle);
            this.canvasManager.getLayer().add(redPoint);
            this.canvasManager.getLayer().add(blueHandle);
        }
        
        meta.editHandles = handles;
        connection.setAttr('connection-meta', meta);
        
        this.canvasManager.getLayer().batchDraw();
    }

    // Удаление ручек редактирования
    removeLineEditHandles(connection) {
        const meta = connection.getAttr('connection-meta');
        if (meta.editHandles) {
            meta.editHandles.forEach(handle => handle.destroy());
            meta.editHandles = [];
            connection.setAttr('connection-meta', meta);
        }
    }

    // Ортогональное обновление сегмента при перетаскивании ручки
    updateSegmentOrthogonally(handle) {
        const meta = handle.getAttr('line-edit-meta');
        const connection = meta.connection;
        const segmentIndex = meta.segmentIndex;
        
        const points = connection.points();
        const startIndex = segmentIndex * 2 + 2; // propusk вилки?
        const endIndex = startIndex + 2;
        
        const dx = points[endIndex] - points[startIndex];
        const dy = points[endIndex + 1] - points[startIndex + 1];
        
        if (Math.abs(dx) > Math.abs(dy)) {
            points[startIndex + 1] = handle.y();
            points[endIndex + 1] = handle.y();
        } else {
            points[startIndex] = handle.x();
            points[endIndex] = handle.x();
        }
        
        connection.points(points);
        
        // Enforce orthogonal after move
        this.enforceOrthogonal(connection);
        
        this.canvasManager.getLayer().batchDraw();
    }

    // Добавление сегмента к соединению (двойной клик)
    addSegmentToConnection(connection) {
        const meta = connection.getAttr('connection-meta');
        const points = connection.points();
        const pos = this.getPointerStageCoords();
        
        // Найти closest seg (кроме вилок)
        let minDist = Infinity;
        let segIndex = -1;
        for (let i = 2; i < points.length - 4; i += 2) { // skip first (i=0) and last (i=length-4)
            const p1 = { x: points[i], y: points[i + 1] };
            const p2 = { x: points[i + 2], y: points[i + 3] };
            const dist = this.distanceToSegment(pos, p1, p2);
            if (dist < minDist) {
                minDist = dist;
                segIndex = i / 2 - 1; // seg index starting from 0 for middle
            }
        }
        
        if (segIndex === -1) return; // no middle seg or not clicked on middle
        
        const startIndex = 2 + segIndex * 2; // absolute index for start of seg
        const start = { x: points[startIndex], y: points[startIndex + 1] };
        const end = { x: points[startIndex + 2], y: points[startIndex + 3] };
        
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        let newPoint1, newPoint2;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal seg - split vertical
            const midX = (start.x + end.x) / 2;
            newPoint1 = { x: midX, y: start.y };
            newPoint2 = { x: midX, y: end.y };
        } else {
            // Vertical seg - split horizontal
            const midY = (start.y + end.y) / 2;
            newPoint1 = { x: start.x, y: midY };
            newPoint2 = { x: end.x, y: midY };
        }
        
        // Insert at end of seg
        points.splice(startIndex + 2, 0, newPoint1.x, newPoint1.y, newPoint2.x, newPoint2.y);
        
        // Update line
        connection.points(points);
        
        // Add to segments
        meta.segments.push(newPoint1, newPoint2);
        connection.setAttr('connection-meta', meta);
        
        this.canvasManager.getLayer().batchDraw();
        console.log('Added new segments to connection');
    }

}

export { UIController };