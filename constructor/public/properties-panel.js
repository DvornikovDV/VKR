// properties-panel.js
// Управление панелью свойств для изображений, точек, соединений и виджетов.

// Константы валидации для каждого типа свойства.
const VALIDATION_RULES = {
    x: { min: -Infinity, max: Infinity, type: 'integer' },
    y: { min: -Infinity, max: Infinity, type: 'integer' },
    width: { min: 10, max: 5000, type: 'integer' },
    height: { min: 10, max: 5000, type: 'integer' },
    fontSize: { min: 8, max: 48, type: 'integer' },
    radius: { min: 5, max: 100, type: 'integer' },
    min: { min: -Infinity, max: Infinity, type: 'number' },
    max: { min: -Infinity, max: Infinity, type: 'number' },
    step: { min: 0.1, max: Infinity, type: 'float' },
    maxLength: { min: 1, max: 1000, type: 'integer' },
    borderWidth: { min: 1, max: 10, type: 'integer' },
    value: { min: -Infinity, max: Infinity, type: 'number' }
};

// Вспомогательные функции для генерации HTML-разметки.
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
    let html = '';

    if (widget.type === 'number-input' || widget.type === 'text-input') {
        html += '<div class="mb-2 mt-3"><strong>Параметры ввода</strong></div>';
    }

    if (widget.type === 'number-input') {
        const min = widget.min ?? 0;
        const max = widget.max ?? 100;
        const step = widget.step ?? 1;
        html += `
    ${createNumberProperty('Min', 'min', min)}
    ${createNumberProperty('Max', 'max', max)}
    ${createNumberProperty('Step', 'step', step, '', '', '0.1')}`;
    } else if (widget.type === 'text-input') {
        const maxLength = widget.maxLength ?? 50;
        const pattern = widget.pattern || '.*';
        const placeholder = widget.placeholder || 'Ввод текста';
        html += `
    ${createNumberProperty('Max длина', 'maxLength', maxLength, 1)}
    ${createTextProperty('Паттерн (regex)', 'pattern', pattern, '.*')}
    ${createTextProperty('Placeholder', 'placeholder', placeholder)}`;
    } else if (widget.type === 'led') {
        const radius = widget.radius || 20;
        html += '<div class="mb-2 mt-3"><strong>Дополнительные свойства</strong></div>';
        html += `
    ${createNumberProperty('Радиус', 'radius', radius, 5, 100)}`;
    }

    return html;
}

function createControlParametersSection(widget) {
    let html = '<div class="mb-2 mt-3"><strong>Параметры управления</strong></div>';

    if (widget.type === 'toggle') {
        const labelOn = widget.labelOn || 'ON';
        const labelOff = widget.labelOff || 'OFF';
        html += `
    ${createTextProperty('Метка ON', 'labelOn', labelOn)}
    ${createTextProperty('Метка OFF', 'labelOff', labelOff)}`;
    } else if (widget.type === 'button') {
        const text = widget.text || 'Button';
        html += `
    ${createTextProperty('Текст кнопки', 'text', text)}`;
    } else if (widget.type === 'slider') {
        const min = widget.min ?? 0;
        const max = widget.max ?? 100;
        const step = widget.step ?? 1;
        const value = widget.value ?? (min + max) / 2;
        html += `
    ${createNumberProperty('Min', 'min', min)}
    ${createNumberProperty('Max', 'max', max)}
    ${createNumberProperty('Step', 'step', step, '', '', '1')}
    ${createNumberProperty('Текущее значение', 'value', value)}`;
    }

    return html;
}

/** Функция валидации и автокоррекции значения. 
 * Вход: widget (Object), propName (String), value (String|Number). 
 * Выход: скорректированное значение (Number|String) или null. */
function validateAndAutoCorrectValue(widget, propName, value) {
    let rules = VALIDATION_RULES[propName];
    if (!rules) return value; // Возврат исходного значения при отсутствии правил валидации

    // Клонирование правил для локальной модификации
    rules = { ...rules };

    // Динамическая адаптация минимальных размеров по типу виджета
    if (propName === 'width' || propName === 'height') {
        if (widget.type === 'button') {
            rules.min = 20;
        } else if (widget.type === 'toggle') {
            rules.min = propName === 'width' ? 40 : 20;
        } else if (widget.type === 'slider') {
            rules.min = propName === 'width' ? 50 : 30;
        }
    }

    let numValue;
    if (rules.type === 'integer') {
        numValue = parseInt(value);
    } else if (rules.type === 'float') {
        numValue = parseFloat(value);
    } else if (rules.type === 'number') {
        numValue = Number(value);
    } else {
        return value;
    }

    // Исключение нечисловых значений
    if (isNaN(numValue)) {
        return null; // Ошибка
    }

    // Ограничение значения диапазоном [min, max]
    if (numValue < rules.min) {
        return rules.min;
    }
    if (numValue > rules.max) {
        return rules.max;
    }

    return numValue;
}

class PropertiesPanel {
    constructor(canvasManager, options = {}) {
        this.canvasManager = canvasManager;
        this.container = options.containerElement || document.getElementById('properties-content');
        this.selectedImage = null;
        this.selectedWidget = null;
        this.bindingsManager = null;
        this.onWidgetUpdated = null; // Callback изменения свойств для UIController
        this.onWidgetPositionOrSizeChange = null; // Callback изменения геометрии для UIController
    }

    /** Установка ссылки на BindingsManager. 
     * Вход: bindingsManager (Object). */
    setBindingsManager(bindingsManager) {
        this.bindingsManager = bindingsManager;
    }

    normalizeBindingMetric(metric) {
        if (typeof metric !== 'string') {
            return null;
        }

        const trimmedMetric = metric.trim();
        return trimmedMetric.length > 0 ? trimmedMetric : null;
    }

    getAvailableDevices() {
        if (!this.bindingsManager || !this.bindingsManager.selectedMachineId || !Array.isArray(this.bindingsManager.allDevices)) {
            return [];
        }

        return this.bindingsManager.allDevices.filter(
            (device) => device.machineId === this.bindingsManager.selectedMachineId,
        );
    }

    getAvailableMetricsForDevice(deviceId) {
        if (!deviceId) {
            return [];
        }

        const metrics = [];
        const pushMetric = (metricValue) => {
            const normalizedMetric = this.normalizeBindingMetric(metricValue);
            if (normalizedMetric) {
                metrics.push(normalizedMetric);
            }
        };

        if (this.bindingsManager && Array.isArray(this.bindingsManager.availableDeviceMetrics)) {
            this.bindingsManager.availableDeviceMetrics.forEach((entry) => {
                if (entry && entry.deviceId === deviceId) {
                    pushMetric(entry.metric);
                }
            });
        }

        if (metrics.length > 0) {
            return Array.from(new Set(metrics));
        }

        const device = this.getAvailableDevices().find((entry) => entry.id === deviceId);
        if (!device) {
            return [];
        }

        if (Array.isArray(device.metrics)) {
            device.metrics.forEach((entry) => {
                if (typeof entry === 'string') {
                    pushMetric(entry);
                    return;
                }

                if (entry && typeof entry === 'object') {
                    pushMetric(entry.key || entry.metric || entry.label);
                }
            });
        }

        pushMetric(device.metric);

        return Array.from(new Set(metrics));
    }

    setWidgetBinding(widget, deviceId, metric) {
        const resolvedDeviceId = typeof deviceId === 'string' && deviceId.length > 0 ? deviceId : null;
        if (!resolvedDeviceId) {
            widget.bindingId = null;
            widget.bindingMetric = null;
            widget.binding = null;
            return;
        }

        const availableMetrics = this.getAvailableMetricsForDevice(resolvedDeviceId);
        let resolvedMetric = this.normalizeBindingMetric(metric);

        if (!resolvedMetric) {
            resolvedMetric = availableMetrics[0] || null;
        }

        if (!resolvedMetric) {
            resolvedMetric = 'value';
        }

        if (this.bindingsManager && typeof this.bindingsManager.canAssignDevice === 'function') {
            const isValidPair = this.bindingsManager.canAssignDevice(resolvedDeviceId, resolvedMetric);
            if (!isValidPair) {
                const fallbackMetric = availableMetrics.find((metricKey) =>
                    this.bindingsManager.canAssignDevice(resolvedDeviceId, metricKey),
                );

                if (!fallbackMetric) {
                    widget.bindingId = null;
                    widget.bindingMetric = null;
                    widget.binding = null;
                    return;
                }

                resolvedMetric = fallbackMetric;
            }
        }

        widget.bindingId = resolvedDeviceId;
        widget.bindingMetric = resolvedMetric;
        widget.binding = {
            deviceId: resolvedDeviceId,
            metric: resolvedMetric,
        };
    }

    /** Отображение свойств графического элемента. 
     * Вход: konvaImg (Konva.Image). */
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
            '<div class="mb-2"><strong>Машина</strong></div>' +
            `<div class="small text-muted">ID: ${id}</div>` +
            `<div class="small">X: ${x} px</div>` +
            `<div class="small">Y: ${y} px</div>` +
            `<div class="small">Ширина: ${width} px</div>` +
            `<div class="small">Высота: ${height} px</div>` +
            `<div class="small text-muted mt-2">Точек соединения: ${pointCount}</div>`;
    }

    /** Обновление панели свойств графического элемента. 
     * Вход: konvaImg (Konva.Image). */
    refreshImageProperties(konvaImg) {
        if (this.selectedImage && this.selectedImage === konvaImg) {
            this.showPropertiesForImage(konvaImg);
        }
    }

    /** Отображение свойств виджета. 
     * Вход: widget (Object). */
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
        const availableDevices = this.getAvailableDevices();

        let bindingId = widget.bindingId || '';
        let bindingMetric = this.normalizeBindingMetric(widget.bindingMetric);
        const bindingDeviceExists = availableDevices.some((device) => device.id === bindingId);

        if (!bindingDeviceExists) {
            this.setWidgetBinding(widget, null, null);
            bindingId = '';
            bindingMetric = null;
        } else {
            const availableMetrics = this.getAvailableMetricsForDevice(bindingId);
            if (!bindingMetric || !availableMetrics.includes(bindingMetric)) {
                this.setWidgetBinding(widget, bindingId, bindingMetric || null);
                bindingMetric = this.normalizeBindingMetric(widget.bindingMetric);
            }
        }

        let html = `
            <div class="mb-2"><strong>Виджет</strong></div>
            <div class="small text-muted">ID: ${id}</div>
            <div class="small">Тип: ${type}</div>
            
            <div class="mb-2 mt-3"><strong>Позиция и размер</strong></div>
            ${createNumberProperty('X', 'x', x)}
            ${createNumberProperty('Y', 'y', y)}`;

        // Исключение размерных свойств для индикаторов (свойство radius)
        if (type !== 'led') {
            html += `
            ${createNumberProperty('Ширина', 'width', w, 10)}
            ${createNumberProperty('Высота', 'height', h, 10)}`;
        }

        // Базовые свойства оформления
        html += '<div class="mb-2 mt-3"><strong>Оформление</strong></div>';

        if (type === 'led') {
            const colorOn = widget.colorOn || '#4caf50';
            const colorOff = widget.colorOff || '#cccccc';
            html += `
            ${createColorProperty('Цвет (горит)', 'colorOn', colorOn)}
            ${createColorProperty('Цвет (не горит)', 'colorOff', colorOff)}
            ${createColorProperty('Цвет границы', 'borderColor', widget.borderColor || '#999999')}`;
        } else if (type === 'number-display' || type === 'text-display' || type === 'number-input' || type === 'text-input' || type === 'button' || type === 'slider') {
            html += createSizeAndColorProperties(widget);
        } else if (type === 'toggle') {
            const colorOn = widget.backgroundColorOn || '#4caf50';
            const colorOff = widget.backgroundColorOff || '#cccccc';
            const borderColor = widget.borderColor || '#999999';
            html += `
            ${createColorProperty('Цвет ON', 'backgroundColorOn', colorOn)}
            ${createColorProperty('Цвет OFF', 'backgroundColorOff', colorOff)}
            ${createColorProperty('Цвет границы', 'borderColor', borderColor)}`;
        }

        // Параметры ввода данных
        html += createInputParametersSection(widget);

        // Параметры элементов управления
        if (type === 'toggle' || type === 'button' || type === 'slider') {
            html += createControlParametersSection(widget);
        }

        // Параметры аппаратной привязки
        html += `
            <div class="mb-2 mt-3"><strong>Привязка устройства</strong></div>
            <div class="mb-1">
              <label class="form-label small">Устройство:</label>
              <select id="device-binding-select" class="form-control form-control-sm" style="max-height: 150px; overflow-y: auto;">
                <option value="">-- не привязано --</option>
        `;

        availableDevices.forEach(device => {
            const selected = bindingId === device.id ? 'selected' : '';
            html += `<option value="${device.id}" ${selected}>${device.name} (${device.type})</option>`;
        });

        const availableMetrics = bindingId ? this.getAvailableMetricsForDevice(bindingId) : [];
        const selectedMetric = bindingMetric && availableMetrics.includes(bindingMetric)
            ? bindingMetric
            : '';

        html += `
              </select>
            </div>
            <div class="mb-1">
              <label class="form-label small">Metric:</label>
              <select id="metric-binding-select" class="form-control form-control-sm" ${bindingId ? '' : 'disabled'}>
                <option value="">-- select metric --</option>
        `;

        availableMetrics.forEach((metricKey) => {
            const selected = selectedMetric === metricKey ? 'selected' : '';
            html += `<option value="${metricKey}" ${selected}>${metricKey}</option>`;
        });

        html += `
              </select>
            </div>
        `;

        // Отрисовка метаданных привязанного устройства
        if (bindingId) {
            const device = availableDevices.find(d => d.id === bindingId);
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

    /** Привязка обработчиков событий к полям ввода свойств. 
     * Вход: widget (Object). */
    attachWidgetPropertyListeners(widget) {
        const inputs = this.container.querySelectorAll('.widget-prop-input');

        // Базовая функция валидации и применения свойства
        const applyProp = (input, rawValue) => {
            const propName = input.getAttribute('data-prop');
            const inputType = input.getAttribute('type');

            // Исключение валидации для текстовых и цветовых свойств
            if (inputType === 'color' || inputType === 'text') {
                widget[propName] = rawValue;
            } else {
                // Валидация числовых значений
                const correctedValue = validateAndAutoCorrectValue(widget, propName, rawValue);
                if (correctedValue === null) {
                    // Откат при ошибке валидации
                    input.value = widget[propName];
                    return;
                }

                if (propName === 'x' || propName === 'y' || propName === 'width' || propName === 'height') {
                    if (this.onWidgetPositionOrSizeChange) {
                        this.onWidgetPositionOrSizeChange(widget, propName, correctedValue);
                    }
                    input.value = widget[propName]; // Значение может быть скорректировано контроллером
                } else {
                    widget[propName] = correctedValue;
                    input.value = correctedValue; // Синхронизация поля со скорректированным значением
                }

                // Ограничение текущего значения диапазоном ползунка
                if (widget.type === 'slider' && (propName === 'min' || propName === 'max' || propName === 'step')) {
                    const min = typeof widget.min === 'number' ? widget.min : 0;
                    const max = typeof widget.max === 'number' ? widget.max : min + 100;
                    let value = typeof widget.value === 'number' ? widget.value : (min + max) / 2;
                    if (value < min) value = min;
                    if (value > max) value = max;
                    widget.value = value;
                }
            }

            // Очередь перерисовки холста
            const layer = this.canvasManager ? this.canvasManager.getLayer() : null;
            if (layer) {
                widget.render(layer);
                if (this.onWidgetUpdated) this.onWidgetUpdated(widget);
                layer.batchDraw();
            }
        };

        inputs.forEach(input => {
            const inputType = input.getAttribute('type');

            if (inputType === 'color') {
                // Немедленное обновление при выборе цвета
                input.addEventListener('input', (e) => applyProp(input, e.target.value));
                // Фиксация значения при закрытии пикера
                input.addEventListener('change', (e) => applyProp(input, e.target.value));
            } else if (inputType === 'text') {
                // Обновление при вводе символов
                input.addEventListener('input', (e) => applyProp(input, e.target.value));
                input.addEventListener('change', (e) => applyProp(input, e.target.value));
            } else {
                // Фиксация числовых значений по завершению ввода
                input.addEventListener('change', (e) => applyProp(input, e.target.value));
            }
        });

        // Обработчик изменения аппаратной привязки
        const deviceSelect = this.container.querySelector('#device-binding-select');
        if (deviceSelect) {
            deviceSelect.addEventListener('change', (e) => {
                const nextDeviceId = e.target.value || null;
                const nextMetric = nextDeviceId
                    ? this.getAvailableMetricsForDevice(nextDeviceId)[0] || null
                    : null;
                this.setWidgetBinding(widget, nextDeviceId, nextMetric);
                this.showPropertiesForWidget(widget);
            });
        }

        const metricSelect = this.container.querySelector('#metric-binding-select');
        if (metricSelect) {
            metricSelect.addEventListener('change', (e) => {
                this.setWidgetBinding(widget, widget.bindingId || null, e.target.value || null);
                this.showPropertiesForWidget(widget);
            });
        }
    }

    /** Синхронизация полей ввода с геометрией виджета. 
     * Вход: widget (Object). */
    refreshWidgetProperties(widget) {
        if (this.selectedWidget && this.selectedWidget === widget) {
            const xInput = this.container.querySelector('[data-prop="x"]');
            const yInput = this.container.querySelector('[data-prop="y"]');
            const wInput = this.container.querySelector('[data-prop="width"]');
            const hInput = this.container.querySelector('[data-prop="height"]');

            if (xInput) xInput.value = widget.x.toFixed(0);
            if (yInput) yInput.value = widget.y.toFixed(0);
            if (wInput) wInput.value = widget.width.toFixed(0);
            if (hInput) hInput.value = widget.height.toFixed(0);
        }
    }

    /** Отображение параметров точки соединения. 
     * Вход: point (Konva.Circle). */
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

    /** Отображение параметров линии соединения. 
     * Вход: connection (Konva.Line). */
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

        // Блок управления маршрутизацией
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

    /** Отображение заглушки при отсутствии активного выделения. */
    showDefaultMessage() {
        if (!this.container) return;
        this.container.innerHTML = '<p class="text-muted">Выберите элемент для редактирования свойств</p>';
        this.selectedImage = null;
        this.selectedWidget = null;
    }

    /** Очистка панели свойств. */
    clear() {
        this.showDefaultMessage();
    }
}

export { PropertiesPanel };
