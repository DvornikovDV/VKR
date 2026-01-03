// properties-panel.js
// Управление панелью свойств

class PropertiesPanel {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.container = document.getElementById('properties-content');
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
    }

    /**
     * Очистить панель
     */
    clear() {
        this.showDefaultMessage();
    }
}

export { PropertiesPanel };
