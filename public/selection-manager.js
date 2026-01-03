// selection-manager.js
// Управление выделением элементов

const HANDLE_RADIUS = 6;

class SelectionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.selected = null;
    }

    /**
     * Выбрать изображение
     */
    selectElement(node, frame, handle) {
        // сброс прошлого
        this.clearSelection();

        const layer = this.canvasManager.getLayer();

        // Подсветка: синяя тонкая рамка
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

    /**
     * Выбрать соединение
     */
    selectConnection(connection) {
        // сброс
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
        layer.batchDraw();

        const cleanup = () => {
            highlight.destroy();
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
