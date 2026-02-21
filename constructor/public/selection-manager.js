// selection-manager.js
// Управление выделением элементов (изображения, соединения, виджеты)

const HANDLE_RADIUS = 6;

class SelectionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.selected = null;
        this.canvasClickListenerSetup = false;
        this.onConnectionSelectRequest = null; // callback для UIController
        this.onConnectionDeselectRequest = null; // callback для UIController
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
     * Выбрать изображение
     */
    selectElement(node, frame, handle) {
        this.ensureCanvasClickListener();
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
     * Выбрать виджет
     */
    selectWidget(widget) {
        this.ensureCanvasClickListener();
        this.clearSelection();

        if (!widget || !widget.konvaGroup) return;

        const layer = this.canvasManager.getLayer();
        const group = widget.konvaGroup;

        // Синяя рамка вокруг виджета
        const highlight = new Konva.Rect({
            x: () => group.x(),
            y: () => group.y(),
            width: () => group.width(),
            height: () => group.height(),
            stroke: '#0d6efd',
            strokeWidth: 2,
            opacity: 0.9,
            cornerRadius: 4,
            listening: false
        });

        layer.add(highlight);
        layer.moveToTop(group);
        layer.batchDraw();

        const cleanup = () => {
            highlight.destroy();
            layer.batchDraw();
        };

        this.selected = { widget, highlight, cleanup };
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

        // Сохранить ссылку на подсветку для обновления
        connMeta.highlightLine = highlight;
        connection.setAttr('connection-meta', connMeta);

        // Уведомить контроллер о выборе соединения
        if (this.onConnectionSelectRequest) {
            this.onConnectionSelectRequest(connection);
        }

        layer.batchDraw();

        const cleanup = () => {
            highlight.destroy();
            // Очистить ссылку на подсветку
            connMeta.highlightLine = null;
            connection.setAttr('connection-meta', connMeta);
            // Уведомить контроллер о снятии выделения
            if (this.onConnectionDeselectRequest) {
                this.onConnectionDeselectRequest(connection);
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
        return this.selected.node || this.selected.connection || this.selected.widget || null;
    }
}

export { SelectionManager };