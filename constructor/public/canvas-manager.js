// canvas-manager.js
// Менеджер основного холста приложения и обработка базовых событий.

const GRID_SIZE = 20;
const GRID_EXTENT_MULTIPLIER = 20;

class CanvasManager {
    constructor() {
        this.stage = null;
        this.layer = null;
        this.zoom = 1;
        this.isPanning = false;
        this.readyPromise = new Promise(resolve => {
            this.resolveReady = resolve;
        });
        this.init();
    }

    /** Получение Promise готовности холста.
     * Выход: Promise. */
    ready() {
        return this.readyPromise;
    }

    /** Асинхронная инициализация холста с задержкой для рендеринга DOM. */
    init() {
        setTimeout(() => {
            this.createStage();
            this.setupEventListeners();
            this.resolveReady();
        }, 100);
    }

    /** Создание и настройка экземпляра Konva.Stage и базового слоя. */
    createStage() {
        const container = document.getElementById('canvas-container');
        if (!container) {
            console.error('Canvas container not found');
            return;
        }

        this.stage = new Konva.Stage({
            container: 'canvas',
            width: container.offsetWidth,
            height: container.offsetHeight,
        });

        this.layer = new Konva.Layer();
        this.stage.add(this.layer);

        this.addGrid();
    }

    /** Отрисовка координатной сетки на фоне. */
    addGrid() {
        const gridSize = GRID_SIZE;
        const width = this.stage.width();
        const height = this.stage.height();
        const extent = Math.max(width, height) * GRID_EXTENT_MULTIPLIER;

        this.gridGroup = new Konva.Group({
            listening: false
        });

        for (let x = -extent; x <= width + extent; x += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [x, -extent, x, height + extent],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }

        for (let y = -extent; y <= height + extent; y += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [-extent, y, width + extent, y],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }

        this.layer.add(this.gridGroup);
        this.layer.draw();
    }

    /** Перерисовка координатной сетки при изменении размеров или масштаба. */
    updateGrid() {
        if (!this.gridGroup) return;

        const gridSize = GRID_SIZE;
        const width = this.stage.width();
        const height = this.stage.height();
        const extent = Math.max(width, height) * GRID_EXTENT_MULTIPLIER;

        this.gridGroup.destroyChildren();

        for (let x = -extent; x <= width + extent; x += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [x, -extent, x, height + extent],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }

        for (let y = -extent; y <= height + extent; y += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [-extent, y, width + extent, y],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }
    }

    /** Инициализация глобальных обработчиков событий холста. */
    setupEventListeners() {
        // Обработка изменения размеров окна
        window.addEventListener('resize', () => {
            if (this.stage) {
                this.stage.width(document.getElementById('canvas-container').offsetWidth);
                this.stage.height(document.getElementById('canvas-container').offsetHeight);
                this.updateGrid();
                this.stage.draw();
            }
        });

        const zoomSlider = document.getElementById('zoom-slider');
        const zoomValue = document.getElementById('zoom-value');

        if (zoomSlider) {
            // Обработка ползунка масштабирования из UI
            zoomSlider.addEventListener('input', (e) => {
                this.zoom = parseFloat(e.target.value);
                if (zoomValue) zoomValue.textContent = this.zoom.toFixed(1) + 'x';

                this.zoom = Math.max(0.1, Math.min(10, this.zoom));
                this.stage.scaleX(this.zoom);
                this.stage.scaleY(this.zoom);
                this.stage.draw();
            });
        }

        // Обработка масштабирования колесом мыши с центрированием по курсору
        this.stage.on('wheel', (evt) => {
            evt.evt.preventDefault();
            const scaleBy = 1.1;
            const oldScale = this.stage.scaleX();
            const pointer = this.stage.getPointerPosition();
            const mousePointTo = {
                x: (pointer.x - this.stage.x()) / oldScale,
                y: (pointer.y - this.stage.y()) / oldScale,
            };
            const direction = evt.evt.deltaY > 0 ? 1 : -1;
            let newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy;
            newScale = Math.max(0.1, Math.min(10, newScale));
            this.stage.scale({ x: newScale, y: newScale });
            this.stage.position({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            });
            this.zoom = newScale;
            if (zoomSlider && zoomValue) {
                zoomSlider.value = String(newScale);
                zoomValue.textContent = (parseFloat(zoomSlider.value)).toFixed(1) + 'x';
            }
            this.stage.batchDraw();
        });

        // Обработка активации панорамирования (CTRL + ЛКМ)
        this.stage.on('mousedown', (evt) => {
            if (evt.target === this.stage && evt.evt.ctrlKey) {
                this.isPanning = true;
                this.stage.draggable(true);
            }
        });

        // Обработка завершения панорамирования
        this.stage.on('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.stage.draggable(false);
            }
        });

        // Обработка клика по пустой области холста
        this.stage.on('click', (evt) => {
            if (evt.target === this.stage) {
            }
        });
    }

    /** Получение экземпляра Konva.Stage.
     * Выход: Узел сцены (Konva.Stage). */
    getStage() {
        return this.stage;
    }

    /** Получение базового графического слоя.
     * Выход: Слой (Konva.Layer). */
    getLayer() {
        return this.layer;
    }
}

export { CanvasManager };
