// canvas-manager.js
// Управление канвасом и базовыми событиями

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

    ready() {
        return this.readyPromise;
    }

    init() {
        setTimeout(() => {
            this.createStage();
            this.setupEventListeners();
            this.resolveReady();
        }, 100);
    }

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

    setupEventListeners() {
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
            zoomSlider.addEventListener('input', (e) => {
                this.zoom = parseFloat(e.target.value);
                if (zoomValue) zoomValue.textContent = this.zoom.toFixed(1) + 'x';
                
                this.zoom = Math.max(0.1, Math.min(10, this.zoom));
                this.stage.scaleX(this.zoom);
                this.stage.scaleY(this.zoom);
                this.stage.draw();
            });
        }

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

        this.stage.on('click', (evt) => {
            if (evt.target === this.stage) {
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
