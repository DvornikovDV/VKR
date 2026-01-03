// canvas-manager.js
// Управление канвасом и базовыми событиями

const GRID_SIZE = 20;
const GRID_EXTENT_MULTIPLIER = 20; // во сколько раз сетка покрывает видимую область

class CanvasManager {
    constructor() {
        this.stage = null;
        this.layer = null;
        this.zoom = 1;
        this.isPanning = false;
        this.init();
    }

    init() {
        // Ждем загрузки DOM
        setTimeout(() => {
            this.createStage();
            this.setupEventListeners();
        }, 100);
    }

    createStage() {
        const container = document.getElementById('canvas-container');
        if (!container) {
            console.error('Canvas container not found');
            return;
        }

        // Создаем Konva stage
        this.stage = new Konva.Stage({
            container: 'canvas',
            width: container.offsetWidth,
            height: container.offsetHeight,
        });

        // Создаем слой для элементов
        this.layer = new Konva.Layer();
        this.stage.add(this.layer);

        // Добавляем серую сетку
        this.addGrid();
    }

    addGrid() {
        const gridSize = GRID_SIZE;
        const width = this.stage.width();
        const height = this.stage.height();
        const extent = Math.max(width, height) * GRID_EXTENT_MULTIPLIER;

        // Создаем группу для сетки
        this.gridGroup = new Konva.Group({
            listening: false
        });

        // Вертикальные линии (с запасом по краям)
        for (let x = -extent; x <= width + extent; x += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [x, -extent, x, height + extent],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }

        // Горизонтальные линии (с запасом по краям)
        for (let y = -extent; y <= height + extent; y += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [-extent, y, width + extent, y],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }

        // Добавляем сетку в самый низ слоя (под всеми элементами)
        this.layer.add(this.gridGroup);
        this.layer.draw();
    }

    updateGrid() {
        if (!this.gridGroup) return;
        
        const gridSize = GRID_SIZE;
        const width = this.stage.width();
        const height = this.stage.height();
        const extent = Math.max(width, height) * GRID_EXTENT_MULTIPLIER;

        // Очищаем старую сетку
        this.gridGroup.destroyChildren();

        // Вертикальные линии (с запасом по краям)
        for (let x = -extent; x <= width + extent; x += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [x, -extent, x, height + extent],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }

        // Горизонтальные линии (с запасом по краям)
        for (let y = -extent; y <= height + extent; y += gridSize) {
            this.gridGroup.add(new Konva.Line({
                points: [-extent, y, width + extent, y],
                stroke: '#e0e0e0',
                strokeWidth: 1,
                listening: false
            }));
        }
    }

    setupEventListeners() {
        // Обработчик изменения размера окна
        window.addEventListener('resize', () => {
            this.stage.width(document.getElementById('canvas-container').offsetWidth);
            this.stage.height(document.getElementById('canvas-container').offsetHeight);
            this.updateGrid();
            this.stage.draw();
        });

        // Обработчик масштабирования ползунком
        const zoomSlider = document.getElementById('zoom-slider');
        const zoomValue = document.getElementById('zoom-value');
        
        zoomSlider.addEventListener('input', (e) => {
            this.zoom = parseFloat(e.target.value);
            zoomValue.textContent = this.zoom.toFixed(1) + 'x';
            
            // ограничиваем масштаб в пределах 0.1 - 10
            this.zoom = Math.max(0.1, Math.min(10, this.zoom));
            this.stage.scaleX(this.zoom);
            this.stage.scaleY(this.zoom);
            this.stage.draw();
        });

        // Масштабирование колесиком к курсору
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
            // ограничиваем масштаб
            newScale = Math.max(0.1, Math.min(10, newScale));
            this.stage.scale({ x: newScale, y: newScale });
            this.stage.position({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            });
            // синхронизируем ползунок
            this.zoom = newScale;
            if (zoomSlider) {
                zoomSlider.value = String(newScale);
                zoomValue.textContent = (parseFloat(zoomSlider.value)).toFixed(1) + 'x';
            }
            this.stage.batchDraw();
        });

        // Панорамирование сцены только при Ctrl+drag
        this.stage.on('mousedown', (evt) => {
            if (evt.target === this.stage && evt.evt.ctrlKey) {
                this.isPanning = true;
                this.stage.draggable(true);
            }
        });
        this.stage.on('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.stage.draggable(false);
            }
        });

        // Сброс выделения при клике в пустом месте
        this.stage.on('click', (evt) => {
            if (evt.target === this.stage) {
                // Вызов clearSelection из UIController (будет передан через callback или event)
                // Примечание: В полной реализации передай callback в UIController
            }
        });
    }

    getStage() {
        return this.stage;
    }

    getLayer() {
        return this.layer;
    }
}

export { CanvasManager };