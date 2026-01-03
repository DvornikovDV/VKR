// ui-controller.js
// координатор всеми менеджерами

import { CanvasManager } from './canvas-manager.js';
import { ImageManager } from './image-manager.js';
import { ConnectionPointManager } from './connection-point-manager.js';
import { ConnectionManager } from './connection-manager.js';
import { SelectionManager } from './selection-manager.js';
import { PropertiesPanel } from './properties-panel.js';
import { FileManager } from './file-manager.js';

class UIController {
    constructor() {
        this.canvasManager = null;
        this.imageManager = null;
        this.connectionPointManager = null;
        this.connectionManager = null;
        this.selectionManager = null;
        this.propertiesPanel = null;
        this.fileManager = null;

        // состояние режима создания линий
        this.isCreateLineMode = false;
        this.firstPinSelected = null;
        this.previewLine = null;

        this.init();
    }

    init() {
        // Одновременная инициализация всех менеджеров
        this.canvasManager = new CanvasManager();
        this.imageManager = new ImageManager(this.canvasManager);
        this.connectionPointManager = new ConnectionPointManager(this.canvasManager);
        this.connectionManager = new ConnectionManager(this.canvasManager);
        this.selectionManager = new SelectionManager(this.canvasManager);
        this.propertiesPanel = new PropertiesPanel(this.canvasManager);
        this.fileManager = new FileManager(
            this.canvasManager,
            this.imageManager,
            this.connectionPointManager,
            this.connectionManager
        );

        // Настраиваем коллбэки менеджеров
        this.setupManagerCallbacks();

        // Настраиваем UI-обывные обработчики
        this.setupEventListeners();
    }

    /**
     * Настройка каллбэков менеджеров
     */
    setupManagerCallbacks() {
        // Когда изображение выбрано
        this.imageManager.onImageSelected = (konvaImg, frame, handle) => {
            this.selectionManager.selectElement(konvaImg, frame, handle);
        };

        // Когда двойной клик по рамке
        this.imageManager.onFrameDoubleClick = (konvaImg, frame) => {
            const pos = this.getPointerStageCoords();
            const sideMeta = this.getNearestSideAndOffsetFromFrame(frame, pos);
            this.connectionPointManager.createConnectionPointOnSide(konvaImg, sideMeta.side, sideMeta.offset);
        };

        // Когда точка выбрана
        this.connectionPointManager.onPointSelected = (point) => {
            if (!this.isCreateLineMode) {
                this.selectionManager.clearSelection();
                this.propertiesPanel.showPropertiesForPoint(point);
            }
        };

        // Когда точка удаляется
        this.connectionPointManager.onPointDoubleClick = (point) => {
            if (this.isCreateLineMode) return;
            const meta = point.getAttr('cp-meta');
            if (meta.connectedTo) {
                alert('Нельзя удалить подключенную точку соединения. Сначала удалите соединение.');
                return;
            }
            this.connectionPointManager.deletePoint(point);
            this.propertiesPanel.showDefaultMessage();
        };

        // Когда точка двигается
        this.connectionPointManager.onPointMoved = (point) => {
            this.connectionManager.updateConnectionsForPin(point);
        };

        // Когда соединение выбрано
        this.connectionManager.onConnectionSelected = (connection) => {
            this.selectionManager.selectConnection(connection);
            this.connectionManager.addLineEditHandles(connection);
            this.propertiesPanel.showPropertiesForConnection(connection);
        };
    }

    /**
     * Настройка ЕвентЛистенеров
     */
    setupEventListeners() {
        // Bootstrap тултипы
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
            this.fileManager.saveScheme();
        });

        // Кнопка загружки
        document.getElementById('load-btn').addEventListener('click', () => {
            this.fileManager.loadScheme();
        });

        // Кнопка очистки
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.fileManager.clearCanvas();
        });

        // Основные кнопки во ртстсе домиенантго
        const createLineBtn = document.getElementById('create-line-btn');

        if (createLineBtn) {
            createLineBtn.addEventListener('click', () => {
                this.toggleLineCreationMode();
            });
        }
    }

    /**
     * Открыть диалог выбора файла
     */
    addImage() {
        const fileInput = document.getElementById('file-input');
        fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                this.imageManager.addImageFromBase64(reader.result);
                fileInput.value = '';
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    }

    /**
     * Переключать режим создания линий
     */
    toggleLineCreationMode() {
        this.isCreateLineMode = !this.isCreateLineMode;
        const createLineBtn = document.getElementById('create-line-btn');
        if (createLineBtn) {
            createLineBtn.classList.toggle('active', this.isCreateLineMode);
        }

        if (this.isCreateLineMode) {
            this.setupLineCreationMode();
        } else {
            this.teardownLineCreationMode();
        }
    }

    /**
     * Настроя режим создания
     */
    setupLineCreationMode() {
        const points = this.connectionPointManager.getPoints();
        points.forEach(point => {
            point.draggable(false);
            point.listening(true);
            point.off('click');
            point.off('dblclick');
            point.on('pointerdown', (e) => {
                e.evt.stopPropagation();
                this.handlePinClickForLineCreation(point);
            });
        });

        const stage = this.canvasManager.getStage();
        stage.on('mousemove', this.handleMouseMoveForLinePreview.bind(this));

        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();
    }

    /**
     * Отнимаем режим создания
     */
    teardownLineCreationMode() {
        const stage = this.canvasManager.getStage();
        stage.off('mousemove');

        const points = this.connectionPointManager.getPoints();
        points.forEach(point => {
            point.draggable(true);
            point.listening(true);
            point.off('pointerdown');
        });

        this.clearPreviewLine();
        this.firstPinSelected = null;
        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();
    }

    /**
     * Обработка клика по пину да созданию линии
     */
    handlePinClickForLineCreation(point) {
        const meta = point.getAttr('cp-meta');

        if (meta.connectedTo) {
            return;
        }

        if (!this.firstPinSelected) {
            this.firstPinSelected = point;
            point.fill('#dc3545');
            this.canvasManager.getLayer().batchDraw();
        } else if (this.firstPinSelected === point) {
            this.firstPinSelected.fill('#198754');
            this.firstPinSelected = null;
            this.clearPreviewLine();
        } else {
            this.connectionManager.createConnection(this.firstPinSelected, point);
            this.firstPinSelected = null;
            this.clearPreviewLine();
        }
    }

    /**
     * Обновление рыбного пресмотра линии
     */
    handleMouseMoveForLinePreview(e) {
        if (!this.firstPinSelected) return;

        const pos = this.getPointerStageCoords();
        this.updatePreviewLine(this.firstPinSelected.position(), pos);
    }

    /**
     * Обновление рисунка предварительного линии
     */
    updatePreviewLine(startPos, endPos) {
        if (this.previewLine) {
            this.previewLine.destroy();
        }

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

    /**
     * Очистка превью линии
     */
    clearPreviewLine() {
        if (this.previewLine) {
            this.previewLine.destroy();
            this.previewLine = null;
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /**
     * Координаты указателя в системе стандарта
     */
    getPointerStageCoords() {
        const stage = this.canvasManager.getStage();
        const p = stage.getPointerPosition();
        if (!p) return { x: 0, y: 0 };
        return {
            x: (p.x - stage.x()) / stage.scaleX(),
            y: (p.y - stage.y()) / stage.scaleY(),
        };
    }

    /**
     * Получить ближайшую сторону рамки
     */
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
}

export { UIController };
