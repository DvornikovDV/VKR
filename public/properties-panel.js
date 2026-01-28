// properties-panel.js
// Управление панелью свойств для изображений, точек, соединений и виджетов

class PropertiesPanel {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.container = document.getElementById('properties-content');
        this.selectedImage = null;
        this.selectedWidget = null;
    }

    /**
     * Показать свойства изображения
     */
    showPropertiesForImage(konvaImg) {
        if (!this.container) return;

        this.selectedImage = konvaImg;
        this.selectedWidget = null;
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
     * Показать свойства виджета
     */
    showPropertiesForWidget(widget) {
        if (!this.container || !widget) return;

        this.selectedWidget = widget;
        this.selectedImage = null;

        const id = widget.id || 'unknown';
        const type = widget.type || 'unknown';
        const x = widget.x.toFixed(0);
        const y = widget.y.toFixed(0);
        const w = widget.width.toFixed(0);
        const h = widget.height.toFixed(0);
        const fontSize = widget.fontSize || 14;
        const color = widget.color || '#000000';
        const bgColor = widget.backgroundColor || '#f5f5f5';

        let html = `
            <div class="mb-2"><strong>Виджет</strong></div>
            <div class="small text-muted">ID: ${id}</div>
            <div class="small">Тип: ${type}</div>
            
            <div class="mb-2 mt-3"><strong>Позиция и размер</strong></div>
            <div class="mb-1">
              <label class="form-label small">X:</label>
              <input type="number" class="form-control form-control-sm" id="widget-x" value="${x}">
            </div>
            <div class="mb-1">
              <label class="form-label small">Y:</label>
              <input type="number" class="form-control form-control-sm" id="widget-y" value="${y}">
            </div>
            <div class="mb-1">
              <label class="form-label small">Ширина:</label>
              <input type="number" class="form-control form-control-sm" id="widget-w" value="${w}" min="10">
            </div>
            <div class="mb-1">
              <label class="form-label small">Высота:</label>
              <input type="number" class="form-control form-control-sm" id="widget-h" value="${h}" min="10">
            </div>

            <div class="mb-2 mt-3"><strong>Оформление</strong></div>
            <div class="mb-1">
              <label class="form-label small">Размер шрифта:</label>
              <input type="number" class="form-control form-control-sm" id="widget-font-size" value="${fontSize}" min="8" max="48">
            </div>
            <div class="mb-1">
              <label class="form-label small">Цвет текста:</label>
              <input type="color" class="form-control form-control-color" id="widget-color" value="${color}">
            </div>
            <div class="mb-1">
              <label class="form-label small">Цвет фона:</label>
              <input type="color" class="form-control form-control-color" id="widget-bg-color" value="${bgColor}">
            </div>

            <div class="mt-3">
              <button id="delete-widget-btn" class="btn btn-danger btn-sm w-100">Удалить виджет</button>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachWidgetPropertyListeners(widget);
    }

    /**
     * Обработчик изменений свойств виджета
     */
    attachWidgetPropertyListeners(widget) {
        const inputs = {
            'widget-x': (val) => {
                if (window.onWidgetPropertyChange) {
                    window.onWidgetPropertyChange(widget, 'x', parseInt(val));
                }
            },
            'widget-y': (val) => {
                if (window.onWidgetPropertyChange) {
                    window.onWidgetPropertyChange(widget, 'y', parseInt(val));
                }
            },
            'widget-w': (val) => {
                if (window.onWidgetPropertyChange) {
                    window.onWidgetPropertyChange(widget, 'width', parseInt(val));
                }
            },
            'widget-h': (val) => {
                if (window.onWidgetPropertyChange) {
                    window.onWidgetPropertyChange(widget, 'height', parseInt(val));
                }
            },
            'widget-font-size': (val) => {
                widget.fontSize = parseInt(val);
                widget.render(window.layer);
                window.layer.batchDraw();
            },
            'widget-color': (val) => {
                widget.color = val;
                widget.render(window.layer);
                window.layer.batchDraw();
            },
            'widget-bg-color': (val) => {
                widget.backgroundColor = val;
                widget.render(window.layer);
                window.layer.batchDraw();
            }
        };

        Object.entries(inputs).forEach(([id, handler]) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => handler(e.target.value));
            }
        });

        // Кнопка удаления
        const deleteBtn = document.getElementById('delete-widget-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (window.onDeleteWidget) {
                    window.onDeleteWidget(widget.id);
                }
            });
        }
    }

    /**
     * Обновить панель при перемещении/ресайзе виджета
     */
    refreshWidgetProperties(widget) {
        if (this.selectedWidget && this.selectedWidget === widget) {
            this.showPropertiesForWidget(widget);
        }
    }

    /**
     * Показать свойства точки соединения
     */
    showPropertiesForPoint(point) {
        if (!this.container) return;

        this.selectedImage = null;
        this.selectedWidget = null;
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

        this.selectedImage = null;
        this.selectedWidget = null;
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
            { icon: '⊞', text: 'DBL-CLICK на ручку → добавить разрыв' },
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
        this.selectedImage = null;
        this.selectedWidget = null;
    }

    /**
     * Очистить панель
     */
    clear() {
        this.showDefaultMessage();
    }
}

export { PropertiesPanel };