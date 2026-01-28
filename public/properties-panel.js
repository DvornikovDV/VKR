// properties-panel.js
// Управление панелью свойств для изображений, точек, соединений и виджетов

class PropertiesPanel {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.container = document.getElementById('properties-content');
        this.selectedImage = null;
        this.selectedWidget = null;
        this.widgetManager = null;
    }
    
    // Установить ссылку на WidgetManager для переприсоединения обработчиков
    setWidgetManager(widgetManager) {
        this.widgetManager = widgetManager;
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

        let html = `
            <div class="mb-2"><strong>Виджет</strong></div>
            <div class="small text-muted">ID: ${id}</div>
            <div class="small">Тип: ${type}</div>
            
            <div class="mb-2 mt-3"><strong>Позиция и размер</strong></div>
            <div class="mb-1">
              <label class="form-label small">X:</label>
              <input type="number" class="form-control form-control-sm widget-prop-input" data-prop="x" value="${x}">
            </div>
            <div class="mb-1">
              <label class="form-label small">Y:</label>
              <input type="number" class="form-control form-control-sm widget-prop-input" data-prop="y" value="${y}">
            </div>
        `;

        // Условно показываем ширину и высоту (не для LED)
        if (type !== 'led') {
            html += `
            <div class="mb-1">
              <label class="form-label small">Ширина:</label>
              <input type="number" class="form-control form-control-sm widget-prop-input" data-prop="width" value="${w}" min="10">
            </div>
            <div class="mb-1">
              <label class="form-label small">Высота:</label>
              <input type="number" class="form-control form-control-sm widget-prop-input" data-prop="height" value="${h}" min="10">
            </div>
            `;
        }

        // Свойства оформления - разные для каждого типа
        html += '<div class="mb-2 mt-3"><strong>Оформление</strong></div>';
        
        if (type === 'led') {
            // LED: радиус, цвета ON/OFF
            const radius = widget.radius || 20;
            const colorOn = widget.colorOn || '#4caf50';
            const colorOff = widget.colorOff || '#cccccc';
            
            html += `
            <div class="mb-1">
              <label class="form-label small">Радиус:</label>
              <input type="number" class="form-control form-control-sm widget-prop-input" data-prop="radius" value="${radius}" min="5" max="100">
            </div>
            <div class="mb-1">
              <label class="form-label small">Цвет (горит):</label>
              <input type="color" class="form-control form-control-color widget-prop-input" data-prop="colorOn" value="${colorOn}">
            </div>
            <div class="mb-1">
              <label class="form-label small">Цвет (не горит):</label>
              <input type="color" class="form-control form-control-color widget-prop-input" data-prop="colorOff" value="${colorOff}">
            </div>
            `;
        } else if (type === 'number-display' || type === 'text-display') {
            // Number и Text: размер шрифта, цвет текста, цвет фона
            const fontSize = widget.fontSize || 14;
            const color = widget.color || '#000000';
            const bgColor = widget.backgroundColor || '#f5f5f5';
            
            html += `
            <div class="mb-1">
              <label class="form-label small">Размер шрифта:</label>
              <input type="number" class="form-control form-control-sm widget-prop-input" data-prop="fontSize" value="${fontSize}" min="8" max="48">
            </div>
            <div class="mb-1">
              <label class="form-label small">Цвет текста:</label>
              <input type="color" class="form-control form-control-color widget-prop-input" data-prop="color" value="${color}">
            </div>
            <div class="mb-1">
              <label class="form-label small">Цвет фона:</label>
              <input type="color" class="form-control form-control-color widget-prop-input" data-prop="backgroundColor" value="${bgColor}">
            </div>
            `;
        }

        this.container.innerHTML = html;
        this.attachWidgetPropertyListeners(widget);
    }

    /**
     * Обработчик изменений свойств виджета (ИСПРАВЛЕННАЯ ВЕРСИЯ)
     */
    attachWidgetPropertyListeners(widget) {
        // Получить все input'ы с классом widget-prop-input
        const inputs = this.container.querySelectorAll('.widget-prop-input');
        
        inputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const propName = input.getAttribute('data-prop');
                let value = e.target.value;
                
                // Преобразовать в правильный тип
                if (['x', 'y', 'width', 'height', 'fontSize', 'radius'].includes(propName)) {
                    value = parseInt(value);
                }
                
                // Применить изменение
                widget[propName] = value;
                
                // Перерисовать виджет
                if (window.layer) {
                    widget.render(window.layer);
                    
                    // КРИТИЧНО: Переприсоединить обработчики после render!
                    if (this.widgetManager) {
                        this.widgetManager.reattachDragHandlers(widget);
                    }
                    
                    window.layer.batchDraw();
                }
                
                // Обновить панель свойств (просто обновляем значения input'ов)
                // Не пересоздавать весь HTML чтобы избежать потери фокуса
            });
        });
    }

    /**
     * Обновить панель при перемещении/ресайзе виджета
     */
    refreshWidgetProperties(widget) {
        if (this.selectedWidget && this.selectedWidget === widget) {
            // Только обновляем значения, не пересоздаем панель
            const xInput = this.container.querySelector('[data-prop="x"]');
            const yInput = this.container.querySelector('[data-prop="y"]');
            
            if (xInput) xInput.value = widget.x.toFixed(0);
            if (yInput) yInput.value = widget.y.toFixed(0);
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