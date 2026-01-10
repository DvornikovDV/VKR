// properties-panel.js
// Управление панелью свойств

class PropertiesPanel {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.container = document.getElementById('properties-content');
        this.selectedImage = null;
    }

    /**
     * Показать свойства изображения
     */
    showPropertiesForImage(konvaImg) {
        if (!this.container) return;

        this.selectedImage = konvaImg;
        const id = konvaImg._id || 'unknown';
        const width = (konvaImg.width() * konvaImg.scaleX()).toFixed(0);
        const height = (konvaImg.height() * konvaImg.scaleY()).toFixed(0);
        const x = konvaImg.x().toFixed(0);
        const y = konvaImg.y().toFixed(0);
        const pointCount = Array.isArray(konvaImg._cp_points) ? konvaImg._cp_points.length : 0;
        
        this.container.innerHTML = '' +
            '<div class="mb-2"><strong>Изображение</strong></div>' +
            `<div class="small text-muted">ID: ${id}</div>` +
            `<div class="small">X: ${x} px</div>` +
            `<div class="small">Y: ${y} px</div>` +
            `<div class="small">Ширина: ${width} px</div>` +
            `<div class="small">Высота: ${height} px</div>` +
            `<div class="small text-muted mt-2">Точек соединения: ${pointCount}</div>`;
    }

    /**
     * Обновить отображение свойств изображения (при перемещении/масштабировании)
     */
    refreshImageProperties(konvaImg) {
        if (this.selectedImage && this.selectedImage === konvaImg) {
            this.showPropertiesForImage(konvaImg);
        }
    }

    /**
     * Показать свойства точки соединения
     */
    showPropertiesForPoint(point) {
        if (!this.container) return;

        const meta = point.getAttr('cp-meta');
        this.container.innerHTML = '' +
            '<div class="mb-2"><strong>Точка соединения</strong></div>' +
            `<div class="small text-muted">ID: ${meta.id}</div>` +
            `<div class="small">imageId: ${meta.imageId || '-'}</div>` +
            `<div class="small">side: ${meta.side}</div>` +
            `<div class="small">offset: ${meta.offset.toFixed(2)}</div>` +
            `<div class="small">connectedTo: ${meta.connectedTo || '-'}</div>`;
    }

    /**
     * Показать свойства соединения
     */
    showPropertiesForConnection(connection) {
        if (!this.container) return;

        const meta = connection.getAttr('connection-meta');
        this.container.innerHTML = '' +
            '<div class="mb-2"><strong>Соединение</strong></div>' +
            `<div class="small text-muted">ID: ${meta.id}</div>` +
            `<div class="small">От: ${meta.fromPin.getAttr('cp-meta').id}</div>` +
            `<div class="small">До: ${meta.toPin.getAttr('cp-meta').id}</div>` +
            '<div class="small text-muted">Двойной клик для удаления</div>';
    }

    /**
     * Показать сообщение по умолчанию
     */
    showDefaultMessage() {
        if (!this.container) return;
        this.container.innerHTML = '<p class="text-muted">Выберите элемент для редактирования свойств</p>';
        this.selectedImage = null;
    }

    /**
     * Очистить панель
     */
    clear() {
        this.showDefaultMessage();
    }
}

export { PropertiesPanel };