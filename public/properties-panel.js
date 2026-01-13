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
        const fromMeta = meta.fromPin.getAttr('cp-meta');
        const toMeta = meta.toPin.getAttr('cp-meta');
        const segmentCount = meta.segments.length;

        let html = '' +
            '<div class="mb-2"><strong>Соединение</strong></div>' +
            `<div class="small text-muted">ID: ${meta.id}</div>` +
            `<div class="small">От: ${fromMeta.id}</div>` +
            `<div class="small">До: ${toMeta.id}</div>` +
            `<div class="small">Сегментов: ${segmentCount}</div>`;

        // Раздел управления разрывами
        html += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #ddd;">' +
            '<div class="small" style="font-weight: 600; margin-bottom: 8px;">Управление разрывами</div>';

        const hints = [
            { icon: '⊕', text: 'DBL-CLICK на ручку → добавить разрыв' },
            { icon: '⊗', text: 'CTRL+DBL-CLICK на ручку → удалить разрыв' },
            { icon: '●', text: 'Синяя ручка → редактируемая' },
            { icon: '●', text: 'Серая ручка → концевая' }
        ];

        hints.forEach(hint => {
            html += `<div class="small text-muted" style="margin-bottom: 4px;">${hint.icon} ${hint.text}</div>`;
        });

        html += '</div>';

        this.container.innerHTML = html;
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