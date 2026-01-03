// file-manager.js
// Управление файлами (сохранение и загружка)

class FileManager {
    constructor(canvasManager, imageManager, connectionPointManager, connectionManager) {
        this.canvasManager = canvasManager;
        this.imageManager = imageManager;
        this.connectionPointManager = connectionPointManager;
        this.connectionManager = connectionManager;
    }

    /**
     * Сохранить схему
     */
    saveScheme() {
        console.log('Сохранение схемы - будет реализовано в следующей итерации');
        alert('Функция сохранения будет реализована в следующей итерации');
    }

    /**
     * Загружить схему
     */
    loadScheme() {
        console.log('Загружка схемы - будет реализовано в следующей итерации');
        alert('Функция загружки будет реализована в следующей итерации');
    }

    /**
     * Очистить canvas
     */
    clearCanvas() {
        if (confirm('Очистить canvas? Все элементы будут удалены.')) {
            this.canvasManager.getLayer().destroyChildren();
            this.canvasManager.addGrid();
            this.imageManager.clear();
            this.connectionPointManager.clear();
            this.connectionManager.clear();
            console.log('Canvas очищен');
        }
    }
}

export { FileManager };
