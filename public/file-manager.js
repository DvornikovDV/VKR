// file-manager.js
// Управление файлами (сохранение и лагружка)

class FileManager {
    constructor(canvasManager, imageManager, connectionPointManager, connectionManager, widgetManager = null) {
        this.canvasManager = canvasManager;
        this.imageManager = imageManager;
        this.connectionPointManager = connectionPointManager;
        this.connectionManager = connectionManager;
        this.widgetManager = widgetManager;
    }

    // Опционально установить WidgetManager после конструктора
    setWidgetManager(widgetManager) {
        this.widgetManager = widgetManager;
    }

    /**
     * Сохранить схему в JSON
     */
    saveScheme() {
        try {
            const scheme = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                images: this.imageManager.exportImages(),
                connectionPoints: this.connectionPointManager.exportPoints(),
                connections: this.connectionManager.exportConnections(),
                widgets: this.widgetManager ? this.widgetManager.exportWidgets() : []
            };

            const jsonString = JSON.stringify(scheme, null, 2);
            this.downloadJSON(jsonString, 'scheme.json');
            console.log('Схема сохранена');
        } catch (error) {
            console.error('Ошибка при сохранении:', error);
            alert('Ошибка при сохранении схемы');
        }
    }

    /**
     * Загружить схему из JSON
     */
    loadScheme() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const scheme = JSON.parse(event.target.result);
                    this.clearCanvas();
                    this.imageManager.importImages(scheme.images || []);
                    this.connectionPointManager.importPoints(scheme.connectionPoints || [], this.imageManager);
                    this.connectionManager.importConnections(scheme.connections || [], this.connectionPointManager);
                    if (this.widgetManager && scheme.widgets) {
                        this.widgetManager.importWidgets(scheme.widgets, this.imageManager);
                    }
                    console.log('Схема загружена');
                } catch (error) {
                    console.error('Ошибка при загружке:', error);
                    alert('Ошибка при загружке схемы');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * Очистить canvas (без подтверждения если указан flag)
     */
    clearCanvas(confirm_flag = true) {
        if (confirm_flag && !confirm('Очистить canvas? Все элементы будут удалены.')) {
            return;
        }

        this.canvasManager.getLayer().destroyChildren();
        this.canvasManager.addGrid();
        this.imageManager.clear();
        this.connectionPointManager.clear();
        this.connectionManager.clear();
        if (this.widgetManager) {
            this.widgetManager.clear();
        }
        console.log('Canvas очищен');
    }

    /**
     * Твспомогательные процедуры
     */
    downloadJSON(jsonString, filename) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
}

export { FileManager };
