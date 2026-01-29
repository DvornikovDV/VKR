// properties-panel.js
// Управление панелью свойств для изображений, точек, соединений и виджетов

// Вспомогательные функции для избежания дублирования HTML кода
function createColorProperty(label, propName, value) {
    return `
    <div class="mb-1">
      <label class="form-label small">${label}</label>
      <input type="color" class="form-control form-control-color widget-prop-input" data-prop="${propName}" value="${value}">
    </div>`;
}

function createNumberProperty(label, propName, value, min = '', max = '', step = '') {
    const minAttr = min ? `min="${min}"` : '';
    const maxAttr = max ? `max="${max}"` : '';
    const stepAttr = step ? `step="${step}"` : '';
    return `
    <div class="mb-1">
      <label class="form-label small">${label}</label>
      <input type="number" class="form-control form-control-sm widget-prop-input" data-prop="${propName}" value="${value}" ${minAttr} ${maxAttr} ${stepAttr}>
    </div>`;
}

function createTextProperty(label, propName, value, placeholder = '') {
    const placeholderAttr = placeholder ? `placeholder="${placeholder}"` : '';
    return `
    <div class="mb-1">
      <label class="form-label small">${label}</label>
      <input type="text" class="form-control form-control-sm widget-prop-input" data-prop="${propName}" value="${value}" ${placeholderAttr}>
    </div>`;
}

function createSizeAndColorProperties(widget) {
    const fontSize = widget.fontSize || 14;
    const color = widget.color || '#000000';
    const bgColor = widget.backgroundColor || (widget.type?.includes('input') ? '#ffffff' : '#f5f5f5');
    const borderColor = widget.borderColor || '#cccccc';
    
    return `
    ${createNumberProperty('Размер шрифта', 'fontSize', fontSize, 8, 48)}
    ${createColorProperty('Цвет текста', 'color', color)}
    ${createColorProperty('Цвет фона', 'backgroundColor', bgColor)}
    ${createColorProperty('Цвет границы', 'borderColor', borderColor)}`;
}

function createInputParametersSection(widget) {
    let html = '<div class="mb-2 mt-3"><strong>Параметры ввода</strong></div>';
    
    if (widget.type === 'number-input') {
        const min = widget.min || 0;
        const max = widget.max || 100;
        const step = widget.step || 1;
        html += `
    ${createNumberProperty('Min', 'min', min)}
    ${createNumberProperty('Max', 'max', max)}
    ${createNumberProperty('Step', 'step', step, '', '', '0.1')}`;
    } else if (widget.type === 'text-input') {
        const maxLength = widget.maxLength || 50;
        const pattern = widget.pattern || '.*';
        const placeholder = widget.placeholder || 'Ввод текста';
        html += `
    ${createNumberProperty('Max длина', 'maxLength', maxLength, 1)}
    ${createTextProperty('Паттерн (regex)', 'pattern', pattern, '.*')}
    ${createTextProperty('Placeholder', 'placeholder', placeholder)}`;
    } else if (widget.type === 'led') {
        const radius = widget.radius || 20;
        html = '<div class="mb-2 mt-3"><strong>Дополнительные свойства</strong></div>';
        html += `
    ${createNumberProperty('Радиус', 'radius', radius, 5, 100)}`;
    }
    
    return html;
}

class PropertiesPanel {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.container = document.getElementById('properties-content');
        this.selectedImage = null;
        this.selectedWidget = null;
        this.widgetManager = null;
        this.devices = []; // Реестр устройств
    }
    
    // Установить ссылку на WidgetManager для переприсоединения обработчиков
    setWidgetManager(widgetManager) {
        this.widgetManager = widgetManager;
    }
    
    // Установить список устройств (из backend или config)
    setDevices(devices) {
        this.devices = devices || [];
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
        const bindingId = widget.bindingId || '';

        let html = `
            <div class="mb-2"><strong>Виджет</strong></div>
            <div class="small text-muted">ID: ${id}</div>
            <div class="small">Тип: ${type}</div>
            
            <div class="mb-2 mt-3"><strong>Позиция и размер</strong></div>
            ${createNumberProperty('X', 'x', x)}
            ${createNumberProperty('Y', 'y', y)}`;

        // Условно показываем ширину и высоту (не для LED)
        if (type !== 'led') {
            html += `
            ${createNumberProperty('Ширина', 'width', w, 10)}
            ${createNumberProperty('Высота', 'height', h, 10)}`;
        }

        // Свойства оформления
        html += '<div class="mb-2 mt-3"><strong>Оформление</strong></div>';
        
        if (type === 'led') {
            const colorOn = widget.colorOn || '#4caf50';
            const colorOff = widget.colorOff || '#cccccc';
            html += `
            ${createColorProperty('Цвет (горит)', 'colorOn', colorOn)}
            ${createColorProperty('Цвет (не горит)', 'colorOff', colorOff)}
            ${createColorProperty('Цвет границы', 'borderColor', widget.borderColor || '#999999')}`;
        } else if (type === 'number-display' || type === 'text-display') {
            html += createSizeAndColorProperties(widget);
        } else if (type === 'number-input' || type === 'text-input') {
            html += createSizeAndColorProperties(widget);
        }

        // Раздел параметров (если есть)
        html += createInputParametersSection(widget);

        // Раздел привязки устройства
        html += `
            <div class="mb-2 mt-3"><strong>Привязка устройства</strong></div>
            <div class="mb-1">
              <label class="form-label small">Устройство:</label>
              <select id="device-binding-select" class="form-control form-control-sm" style="max-height: 150px; overflow-y: auto;">
                <option value="">-- не привязано --</option>
        `;
        
        this.devices.forEach(device => {
            const selected = bindingId === device.id ? 'selected' : '';
            html += `<option value="${device.id}" ${selected}>${device.name} (${device.type})</option>`;
        });
        
        html += `
              </select>
            </div>
        `;
        
        // Отобразить метаданные привязанного устройства (если есть)
        if (bindingId) {
            const device = this.devices.find(d => d.id === bindingId);
            if (device) {
                html += `
            <div class="mt-2 p-2" style="background-color: #f8f9fa; border-radius: 4px; border-left: 3px solid #0d6efd;">
              <div class="small text-muted mb-1"><strong>Метаданные устройства:</strong></div>
              <div class="small">Тип: ${device.type || '-'}</div>
              <div class="small">Единица: ${device.unit || '-'}</div>
              <div class="small">Диапазон: ${device.min || '?'} - ${device.max || '?'}</div>
              <div class="small text-muted" style="margin-top: 4px;">Описание: ${device.description || '-'}</div>
              <div class="small text-muted">MQTT: ${device.mqttTopic || '-'}</div>
              <div class="small text-muted">Тип данных: ${device.dataType || '-'}</div>
            </div>
                `;
            }
        }

        this.container.innerHTML = html;
        this.attachWidgetPropertyListeners(widget);
    }

    /**
     * Обработчик изменений свойств виджета
     */
    attachWidgetPropertyListeners(widget) {
        // Получить все input'ы с классом widget-prop-input
        const inputs = this.container.querySelectorAll('.widget-prop-input');
        
        inputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const propName = input.getAttribute('data-prop');
                let value = e.target.value;
                
                // Преобразовать в правильный тип для числовых свойств
                if (['x', 'y', 'width', 'height', 'fontSize', 'radius', 'min', 'max', 'maxLength'].includes(propName)) {
                    value = parseInt(value);
                } else if (['step'].includes(propName)) {
                    value = parseFloat(value);
                }
                
                // Применить изменение
                widget[propName] = value;
                
                // Перерисовать виджет
                if (window.layer) {
                    widget.render(window.layer);
                    
                    // Переприсоединить обработчики после render
                    if (this.widgetManager) {
                        this.widgetManager.reattachDragHandlers(widget);
                    }
                    
                    window.layer.batchDraw();
                }
            });
        });
        
        // Обработчик выпадающего списка привязки устройства
        const deviceSelect = this.container.querySelector('#device-binding-select');
        if (deviceSelect) {
            deviceSelect.addEventListener('change', (e) => {
                const deviceId = e.target.value;
                widget.bindingId = deviceId || null;
                
                // Пересоздать панель свойств чтобы показать/скрыть метаданные
                this.showPropertiesForWidget(widget);
            });
        }
    }

    /**
     * Обновить панель при перемещении/ресайзе виджета
     */
    refreshWidgetProperties(widget) {
        if (this.selectedWidget && this.selectedWidget === widget) {
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
