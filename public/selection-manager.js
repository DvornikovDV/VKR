// selection-manager.js
// Управление выделением элементов

const HANDLE_RADIUS = 6;

class SelectionManager {
    constructor(canvasManager, connectionManager) {
        this.canvasManager = canvasManager;
        this.connectionManager = connectionManager;
        this.selected = null;
        this.canvasClickListenerSetup = false;
        this.highlightUpdateInterval = null;
    }

    /**
     * Настроить слушатель на клик по canvas
     */
    ensureCanvasClickListener() {
        if (this.canvasClickListenerSetup) return;
        
        try {
            const stage = this.canvasManager.getStage();
            if (!stage) return;
            
            stage.on('click', (e) => {
                if (e.target === stage) {
                    this.clearSelection();
                }
            });
            
            this.canvasClickListenerSetup = true;
        } catch (err) {
            // Stage еще не инициализирован
        }
    }

    /**
     * Обновить позицию подсветки для изображения
     */
    updateHighlightPosition() {
        if (!this.selected || !this.selected.highlight || !this.selected.node) return;
        
        const node = this.selected.node;
        const highlight = this.selected.highlight;
        
        highlight.x(node.x() - 12);
        highlight.y(node.y() - 12);
        highlight.width(node.width() * node.scaleX() + 24);
        highlight.height(node.height() * node.scaleY() + 24);
    }

    /**
     * Начать непрерывное обновление подсветки
     */
    startHighlightUpdate() {
        // Остановить старый таймер
        this.stopHighlightUpdate();
        
        this.highlightUpdateInterval = setInterval(() => {
            this.updateHighlightPosition();
            if (this.canvasManager.getLayer()) {
                this.canvasManager.getLayer().batchDraw();
            }
        }, 16); // ~60fps
    }

    /**
     * Остановить обновление подсветки
     */
    stopHighlightUpdate() {
        if (this.highlightUpdateInterval) {
            clearInterval(this.highlightUpdateInterval);
            this.highlightUpdateInterval = null;
        }
    }

    /**
     * Выбрать изображение
     */
    selectElement(node, frame, handle) {
        this.ensureCanvasClickListener();
        this.clearSelection();

        const layer = this.canvasManager.getLayer();

        // Подсветка: синяя тонкая рамка
        const highlight = new Konva.Rect({
            x: node.x() - 12,
            y: node.y() - 12,
            width: node.width() * node.scaleX() + 24,
            height: node.height() * node.scaleY() + 24,
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
            this.stopHighlightUpdate();
            highlight.destroy();
            if (this.selected && this.selected.handle) {
                this.selected.handle.visible(false);
            }
            layer.batchDraw();
        };

        handle.visible(true);
        this.selected = { node, frame, handle, highlight, cleanup };
        
        // Начать обновлять подсветку во время драга
        this.startHighlightUpdate();
    }

    /**
     * Выбрать соединение
     */
    selectConnection(connection) {
        this.ensureCanvasClickListener();
        this.clearSelection();

        const layer = this.canvasManager.getLayer();
        const connMeta = connection.getAttr('connection-meta');

        // подсветка
        const highlight = new Konva.Line({
            points: connection.points(),
            stroke: '#0d6efd',
            strokeWidth: 4,
            opacity: 0.7,
            listening: false
        });

        layer.add(highlight);
        layer.moveToTop(connection);
        
        connMeta.highlightLine = highlight;
        connection.setAttr('connection-meta', connMeta);
        
        if (this.connectionManager) {
            this.connectionManager.selectConnection(connection);
        }
        
        layer.batchDraw();

        const cleanup = () => {
            this.stopHighlightUpdate();
            highlight.destroy();
            connMeta.highlightLine = null;
            connection.setAttr('connection-meta', connMeta);
            if (this.connectionManager) {
                this.connectionManager.deselectConnection(connection);
            }
            layer.batchDraw();
        };

        this.selected = { connection, cleanup };
    }

    /**
     * Очистить выделение
     */
    clearSelection() {
        if (this.selected && this.selected.cleanup) {
            this.selected.cleanup();
            this.selected = null;
        }
    }

    /**
     * Получить текущее выделение
     */
    getSelected() {
        return this.selected;
    }

    /**
     * Получить нод выделения
     */
    getSelectedNode() {
        if (!this.selected) return null;
        return this.selected.node || this.selected.connection || null;
    }
}

export { SelectionManager };
