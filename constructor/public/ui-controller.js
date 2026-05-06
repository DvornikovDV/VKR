// ui-controller.js
// Координатор менеджеров системы.

import { CanvasManager } from './canvas-manager.js';
import { ImageManager } from './image-manager.js';
import { ConnectionPointManager } from './connection-point-manager.js';
import { ConnectionManager } from './connection-manager.js';
import { SelectionManager } from './selection-manager.js';
import { PropertiesPanel } from './properties-panel.js';
import { FileManager } from './file-manager.js';
import { WidgetManager } from './widget-manager.js';
import { ContextMenu } from './context-menu.js';
import { BindingsManager } from './bindings-manager.js';

function isElementNode(value) {
    return Boolean(value && typeof value === 'object' && value.nodeType === 1);
}

class UIController {
    constructor(options = {}) {
        this.canvasManager = null;
        this.imageManager = null;
        this.connectionPointManager = null;
        this.connectionManager = null;
        this.selectionManager = null;
        this.propertiesPanel = null;
        this.fileManager = null;
        this.widgetManager = null;
        this.contextMenu = null;
        this.bindingsManager = null;

        this.isCreateLineMode = false;
        this.isConnectionEditMode = false;
        this.firstPinSelected = null;
        this.previewLine = null;
        this.hostedOptions = options && typeof options === 'object' ? options : {};
        this.isHostedRuntime = this.hostedOptions.hostedRuntime === true;
        this.hostedConfig = this.hostedOptions.hostedConfig && typeof this.hostedOptions.hostedConfig === 'object'
            ? this.hostedOptions.hostedConfig
            : null;
        this.hostedCallbacks = this.getHostedCallbacks();
        this.rootElement = this.resolveRootElement();
        this.editorMode = this.resolveEditorMode();
        this.hostedMachines = Array.isArray(this.hostedOptions.machines)
            ? this.hostedOptions.machines
            : Array.isArray(this.hostedConfig && this.hostedConfig.machines)
                ? this.hostedConfig.machines
                : [];
        this.hostedDeviceCatalog = Array.isArray(this.hostedOptions.deviceCatalog)
            ? this.hostedOptions.deviceCatalog
            : Array.isArray(this.hostedConfig && this.hostedConfig.deviceCatalog)
                ? this.hostedConfig.deviceCatalog
                : [];
        this.hostedCommandCatalog = Array.isArray(this.hostedOptions.commandCatalog)
            ? this.hostedOptions.commandCatalog
            : Array.isArray(this.hostedConfig && this.hostedConfig.commandCatalog)
                ? this.hostedConfig.commandCatalog
                : [];
        this._destroyed = false;
        this._layoutLoadGeneration = 0;
        this._bindingsLoadGeneration = 0;
        this._domListenerCleanup = [];
        this.currentDirtyState = {
            layoutDirty: false,
            bindingsDirty: false,
        };
        this.initPromise = this.init();
    }

    resolveRootElement() {
        if (isElementNode(this.hostedOptions.container)) {
            return this.hostedOptions.container;
        }
        if (this.hostedConfig && isElementNode(this.hostedConfig.container)) {
            return this.hostedConfig.container;
        }
        return document;
    }

    resolveEditorMode() {
        const mode = (this.hostedConfig && this.hostedConfig.mode) || this.hostedOptions.mode;
        return mode === 'reduced' ? 'reduced' : 'full';
    }

    isReducedMode() {
        return this.editorMode === 'reduced';
    }

    isBindingsEnabled() {
        return !this.isReducedMode();
    }

    applyEditorModeAttributes() {
        const root = this.getRootElement();
        if (!root || root === document) {
            return;
        }

        if (typeof root.setAttribute === 'function') {
            root.setAttribute('data-editor-mode', this.editorMode);
        }

        if (root.classList && typeof root.classList.add === 'function') {
            root.classList.add(this.isBindingsEnabled() ? 'constructor-mode-full' : 'constructor-mode-reduced');
            root.classList.remove(this.isBindingsEnabled() ? 'constructor-mode-reduced' : 'constructor-mode-full');
        }
    }

    getRootElement() {
        return this.rootElement || document;
    }

    getElement(id) {
        const root = this.getRootElement();
        if (root !== document && typeof root.querySelector === 'function') {
            const scopedNode = root.querySelector(`#${id}`);
            if (scopedNode) {
                return scopedNode;
            }

            if (this.isHostedRuntime) {
                return null;
            }
        }

        return document.getElementById(id);
    }

    querySelector(selector) {
        const root = this.getRootElement();
        if (root !== document && typeof root.querySelector === 'function') {
            const scopedNode = root.querySelector(selector);
            if (scopedNode) {
                return scopedNode;
            }

            if (this.isHostedRuntime) {
                return null;
            }
        }

        return document.querySelector(selector);
    }

    registerDomListener(target, eventName, handler) {
        if (!target || typeof target.addEventListener !== 'function') {
            return;
        }

        target.addEventListener(eventName, handler);
        this._domListenerCleanup.push(() => {
            target.removeEventListener(eventName, handler);
        });
    }

    cleanupDomListeners() {
        while (this._domListenerCleanup.length > 0) {
            const cleanup = this._domListenerCleanup.pop();
            try {
                cleanup();
            } catch (_) {
                // Ignore listener cleanup errors.
            }
        }
    }

    async init() {
        if (this._destroyed) {
            return;
        }

        this.applyEditorModeAttributes();

        this.canvasManager = new CanvasManager({
            rootElement: this.getRootElement(),
            disableDocumentFallback: this.isHostedRuntime,
            canvasContainerElement: this.getElement('canvas-container'),
            canvasElement: this.getElement('canvas'),
            zoomSliderElement: this.getElement('zoom-slider'),
            zoomValueElement: this.getElement('zoom-value'),
        });
        await this.canvasManager.ready();
        if (this._destroyed) {
            return;
        }

        this.imageManager = new ImageManager(this.canvasManager);
        this.connectionPointManager = new ConnectionPointManager(this.canvasManager);
        this.connectionManager = new ConnectionManager(this.canvasManager);
        this.selectionManager = new SelectionManager(this.canvasManager);
        this.propertiesPanel = new PropertiesPanel(this.canvasManager, {
            containerElement: this.getElement('properties-content')
        });
        this.widgetManager = new WidgetManager(
            this.canvasManager.getLayer(),
            this.imageManager,
            this.canvasManager
        );
        this.bindingsManager = new BindingsManager([]);
        this.propertiesPanel.setBindingsManager(this.bindingsManager);
        this.fileManager = new FileManager(
            this.canvasManager,
            this.imageManager,
            this.connectionPointManager,
            this.connectionManager,
            this.widgetManager,
            this.bindingsManager,
            {
                hostedRuntime: this.isHostedRuntime,
                editorMode: this.editorMode,
                hostedCallbacks: this.getHostedCallbacks()
            }
        );
        this.contextMenu = new ContextMenu({
            rootElement: this.getRootElement() === document ? document.body : this.getRootElement(),
        });

        await this.loadDevicesRegistry();
        if (this._destroyed) {
            return;
        }

        this.setupManagerCallbacks();
        this.setupEventListeners();
        this.setupMachineSelection();
        this.setupBindingsManagerCallback();
        this.renderMachineOptions();
        this.notifyDirtyState({
            layoutDirty: false,
            bindingsDirty: false,
        });
    }

    /** Resolve host callbacks for hosted runtime mode. */
    getHostedCallbacks() {
        if (this.hostedCallbacks && typeof this.hostedCallbacks === 'object') {
            return this.hostedCallbacks;
        }
        if (this.hostedConfig && this.hostedConfig.callbacks && typeof this.hostedConfig.callbacks === 'object') {
            return this.hostedConfig.callbacks;
        }
        if (this.hostedOptions.callbacks && typeof this.hostedOptions.callbacks === 'object') {
            return this.hostedOptions.callbacks;
        }
        return null;
    }

    notifyDirtyState(state) {
        const callbacks = this.getHostedCallbacks();
        const previousState = this.currentDirtyState || {
            layoutDirty: false,
            bindingsDirty: false,
        };
        const nextState = state && typeof state === 'object'
            ? {
                layoutDirty: typeof state.layoutDirty === 'boolean'
                    ? state.layoutDirty
                    : previousState.layoutDirty,
                bindingsDirty: typeof state.bindingsDirty === 'boolean'
                    ? state.bindingsDirty
                    : previousState.bindingsDirty,
            }
            : previousState;

        this.currentDirtyState = {
            layoutDirty: Boolean(nextState.layoutDirty),
            bindingsDirty: this.isBindingsEnabled() ? Boolean(nextState.bindingsDirty) : false,
        };

        if (!callbacks || typeof callbacks.onDirtyStateChange !== 'function') {
            return;
        }

        callbacks.onDirtyStateChange(this.currentDirtyState);
    }

    emitMachineChange(machineId) {
        const callbacks = this.getHostedCallbacks();
        if (!callbacks || typeof callbacks.onMachineChange !== 'function') {
            return;
        }

        callbacks.onMachineChange(machineId ?? null);
    }

    ready() {
        return this.initPromise;
    }

    nextLayoutLoadGeneration() {
        this._layoutLoadGeneration += 1;
        return this._layoutLoadGeneration;
    }

    nextBindingsLoadGeneration() {
        this._bindingsLoadGeneration += 1;
        return this._bindingsLoadGeneration;
    }

    isLayoutLoadStale(generation) {
        return this._destroyed || generation !== this._layoutLoadGeneration;
    }

    isBindingsLoadStale(generation) {
        return this._destroyed || generation !== this._bindingsLoadGeneration;
    }

    mapHostedCatalogToBindingsDevices(deviceCatalog = []) {
        const mappedDevices = [];
        const seenDeviceKeys = new Set();
        const normalizeMetricValue = (value) => {
            if (typeof value !== 'string') {
                return null;
            }

            const trimmedValue = value.trim();
            return trimmedValue.length > 0 ? trimmedValue : null;
        };

        deviceCatalog.forEach((entry) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }

            const machineId = entry.edgeServerId || null;
            const deviceId = entry.deviceId || null;

            if (!machineId || !deviceId) {
                return;
            }

            const dedupeKey = `${machineId}::${deviceId}`;
            if (seenDeviceKeys.has(dedupeKey)) {
                return;
            }
            seenDeviceKeys.add(dedupeKey);

            const metrics = Array.isArray(entry.metrics) ? entry.metrics : [];
            const normalizedMetrics = [];

            metrics.forEach((metricEntry) => {
                if (typeof metricEntry === 'string') {
                    const metricKey = normalizeMetricValue(metricEntry);
                    if (!metricKey) {
                        return;
                    }

                    normalizedMetrics.push({
                        key: metricKey,
                        label: metricKey,
                    });
                    return;
                }

                if (!metricEntry || typeof metricEntry !== 'object') {
                    return;
                }

                const metricKey = normalizeMetricValue(metricEntry.key || metricEntry.metric || metricEntry.label);
                if (!metricKey) {
                    return;
                }

                const normalizedMetricEntry = {
                    key: metricKey,
                    label: normalizeMetricValue(metricEntry.label) || metricKey,
                };

                if (
                    metricEntry.valueType === 'boolean' ||
                    metricEntry.valueType === 'number' ||
                    metricEntry.valueType === 'string'
                ) {
                    normalizedMetricEntry.valueType = metricEntry.valueType;
                }

                const normalizedUnit = normalizeMetricValue(metricEntry.unit);
                if (normalizedUnit) {
                    normalizedMetricEntry.unit = normalizedUnit;
                }

                if (typeof metricEntry.min === 'number') {
                    normalizedMetricEntry.min = metricEntry.min;
                }

                if (typeof metricEntry.max === 'number') {
                    normalizedMetricEntry.max = metricEntry.max;
                }

                normalizedMetrics.push(normalizedMetricEntry);
            });

            const dedupedMetrics = [];
            const seenMetricKeys = new Set();
            normalizedMetrics.forEach((metricEntry) => {
                if (seenMetricKeys.has(metricEntry.key)) {
                    return;
                }
                seenMetricKeys.add(metricEntry.key);
                dedupedMetrics.push(metricEntry);
            });

            const fallbackMetric = { key: 'value', label: 'value' };
            const metricsForDevice = dedupedMetrics.length > 0 ? dedupedMetrics : [fallbackMetric];
            const firstMetric = metricsForDevice[0];

            mappedDevices.push({
                machineId: machineId,
                id: deviceId,
                name: entry.deviceLabel || deviceId,
                type: entry.deviceType || 'device',
                metrics: metricsForDevice,
                metric: firstMetric.key,
                unit: firstMetric && firstMetric.unit ? firstMetric.unit : null,
                min: firstMetric && typeof firstMetric.min === 'number' ? firstMetric.min : null,
                max: firstMetric && typeof firstMetric.max === 'number' ? firstMetric.max : null,
                description: firstMetric && firstMetric.label ? firstMetric.label : null
            });
        });

        return mappedDevices;
    }

    /**
     * Map the hosted command catalog to a flat array of command options scoped to a machine.
     * Kept separate from mapHostedCatalogToBindingsDevices (telemetry path).
     * @param {Array} commandCatalog - EditorDeviceCommandCatalogEntry[]
     * @param {string|null} machineId - filter by edgeServerId; pass null to return all
     * @returns {Array<{ deviceId, commandType, label, valueType, min, max, reportedMetric }>}
     */
    mapHostedCommandCatalogToOptions(commandCatalog = [], machineId = null) {
        const options = [];

        if (!Array.isArray(commandCatalog)) {
            return options;
        }

        commandCatalog.forEach((entry) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }

            const entryEdgeServerId = entry.edgeServerId || null;
            const deviceId = typeof entry.deviceId === 'string' ? entry.deviceId.trim() : null;

            if (!deviceId) {
                return;
            }

            // Filter by machineId when provided
            if (machineId !== null && entryEdgeServerId !== machineId) {
                return;
            }

            const commands = Array.isArray(entry.commands) ? entry.commands : [];
            commands.forEach((cmd) => {
                if (!cmd || typeof cmd !== 'object') {
                    return;
                }

                const commandType = cmd.commandType || null;
                const ALLOWED = new Set(['set_bool', 'set_number']);
                if (!ALLOWED.has(commandType)) {
                    return;
                }

                const option = {
                    deviceId,
                    commandType,
                    label: typeof cmd.label === 'string' ? cmd.label : `${deviceId}/${commandType}`,
                    valueType: cmd.valueType || (commandType === 'set_bool' ? 'boolean' : 'number'),
                };

                if (typeof cmd.min === 'number') option.min = cmd.min;
                if (typeof cmd.max === 'number') option.max = cmd.max;
                if (typeof cmd.reportedMetric === 'string') option.reportedMetric = cmd.reportedMetric;

                options.push(option);
            });
        });

        return options;
    }

    getHostedMachineOptions() {
        if (!Array.isArray(this.hostedMachines)) {
            return [];
        }

        return this.hostedMachines;
    }

    renderMachineOptions() {
        const machineSelect = this.getElement('machine-select');
        if (!machineSelect || !this.isHostedRuntime) {
            return;
        }

        if (!this.isBindingsEnabled()) {
            machineSelect.innerHTML = '';

            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = 'No machine';
            machineSelect.appendChild(emptyOption);

            machineSelect.value = '';
            machineSelect.disabled = true;
            return;
        }

        machineSelect.disabled = false;
        const previousValue = machineSelect.value;
        machineSelect.innerHTML = '';

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No machine';
        machineSelect.appendChild(emptyOption);

        this.getHostedMachineOptions().forEach((machine) => {
            if (!machine || typeof machine !== 'object') {
                return;
            }

            const option = document.createElement('option');
            option.value = machine.edgeServerId;
            option.textContent = machine.label || machine.edgeServerId;
            machineSelect.appendChild(option);
        });

        machineSelect.value = previousValue || '';
    }

    /** Load constructor device registry for standalone mode. */
    async loadDevicesRegistry() {
        const bindingsEnabled = typeof this.isBindingsEnabled === 'function'
            ? this.isBindingsEnabled()
            : this.editorMode !== 'reduced';

        if (!bindingsEnabled) {
            if (this.bindingsManager) {
                this.bindingsManager.allDevices = [];
                this.bindingsManager.selectedMachineId = null;
            }
            if (typeof this.renderMachineOptions === 'function') {
                this.renderMachineOptions();
            }
            return;
        }

        if (this.isHostedRuntime) {
            if (this.bindingsManager) {
                this.bindingsManager.allDevices = this.mapHostedCatalogToBindingsDevices(this.hostedDeviceCatalog);
                this.bindingsManager.setCommandOptions(
                    this.mapHostedCommandCatalogToOptions(this.hostedCommandCatalog, null)
                );
            }
            if (typeof this.renderMachineOptions === 'function') {
                this.renderMachineOptions();
            }
            return;
        }

        try {
            const response = await fetch('devices-registry.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.devices && Array.isArray(data.devices)) {
                this.bindingsManager.allDevices = data.devices;
            }
        } catch (error) {
            console.error('Ошибка загрузки реестра устройств:', error);
        }
    }

    /** Callback для обновления списка при смене контроллера. */
    setupBindingsManagerCallback() {
        if (!this.isBindingsEnabled()) {
            this.bindingsManager.onMachineChanged = null;
            return;
        }

        this.bindingsManager.onMachineChanged = (newMachineId) => {
            const machineSelect = this.getElement('machine-select');
            if (machineSelect) {
                machineSelect.value = newMachineId;
                console.log(`UI обновлен: машина изменена на ${newMachineId}`);
            }
        };
    }

    /** Настройка интерфейса выбора контроллера. */
    setupMachineSelection() {
        const machineSelect = this.getElement('machine-select');

        if (!machineSelect) return;
        if (!this.isBindingsEnabled()) {
            machineSelect.value = '';
            machineSelect.disabled = true;
            return;
        }

        this.registerDomListener(machineSelect, 'change', () => {
            const machineId = machineSelect.value;

            if (!machineId) {
                // Очистка состояния при сбросе выбора
                this.bindingsManager.selectedMachineId = null;
                this.fileManager.currentMachineId = null;
                this.emitMachineChange(null);
                console.log('Машина не выбрана');
                return;
            }

            // Валидация выбора контроллера
            if (!this.bindingsManager.selectMachine(machineId)) {
                // Сброс списка при отказе
                machineSelect.value = '';
                return;
            }

            this.fileManager.currentMachineId = machineId;
            this.emitMachineChange(machineId);
            console.log(`Выбрана машина: ${machineId}`);
        });
    }

    /** Настройка callback-функций менеджеров. */
    stripBindingsUiFromPropertiesPanel() {
        if (this.isBindingsEnabled()) {
            return;
        }

        const propertiesRoot = this.getElement('properties-content');
        if (!propertiesRoot || typeof propertiesRoot.querySelector !== 'function') {
            return;
        }

        const deviceSelect = propertiesRoot.querySelector('#device-binding-select');
        const metricSelect = propertiesRoot.querySelector('#metric-binding-select');
        const deviceSection = deviceSelect && typeof deviceSelect.closest === 'function'
            ? deviceSelect.closest('.mb-1')
            : null;
        const metricSection = metricSelect && typeof metricSelect.closest === 'function'
            ? metricSelect.closest('.mb-1')
            : null;
        const headingSection = deviceSection ? deviceSection.previousElementSibling : null;

        if (deviceSection && typeof deviceSection.remove === 'function') {
            deviceSection.remove();
        }
        if (metricSection && typeof metricSection.remove === 'function') {
            metricSection.remove();
        }
        if (
            headingSection &&
            typeof headingSection.remove === 'function' &&
            typeof headingSection.textContent === 'string' &&
            headingSection.textContent.toLowerCase().includes('привяз')
        ) {
            headingSection.remove();
        }

        const metadataSection = propertiesRoot.querySelector('.mt-2.p-2');
        if (metadataSection && typeof metadataSection.remove === 'function') {
            metadataSection.remove();
        }
    }

    setupManagerCallbacks() {
        // Обработчики ImageManager
        this.imageManager.onImageSelected = (konvaImg, frame, handle) => {
            if (this.isCreateLineMode) {
                this.toggleLineCreationMode();
            }
            this.setConnectionEditMode(false);
            this.selectionManager.selectElement(konvaImg, frame, handle);
            this.propertiesPanel.showPropertiesForImage(konvaImg);
        };

        this.imageManager.onFrameDoubleClick = (konvaImg, frame) => {
            const pos = this.getPointerStageCoords();
            const sideMeta = this.getNearestSideAndOffsetFromFrame(frame, pos);
            this.connectionPointManager.createConnectionPointOnSide(konvaImg, sideMeta.side, sideMeta.offset);
        };

        // Обновление соединений и виджетов при перемещении изображения
        this.imageManager.onImageMoved = (konvaImg, deltaX, deltaY) => {
            // Обновление соединений
            if (Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach(pin => {
                    this.connectionManager.updateConnectionsForPin(pin, pin.x(), pin.y(), true);
                });
            }

            // Обновление виджетов
            const imageId = konvaImg.getAttr('imageId');
            if (imageId) {
                this.widgetManager.onImageMove(imageId, deltaX, deltaY);
            }
        };

        // Обновление соединений и виджетов при масштабировании изображения
        this.imageManager.onImageScaled = (konvaImg) => {
            // Обновление соединений
            if (Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach(pin => {
                    this.connectionManager.updateConnectionsForPin(pin, pin.x(), pin.y(), true);
                });
            }

            // Обновление виджетов
            const imageId = konvaImg.getAttr('imageId');
            if (imageId) {
                const image = this.imageManager.getImage(imageId);
                if (image) {
                    this.widgetManager.onImageResize(imageId, image.width() * image.scaleX(), image.height() * image.scaleY());
                }
            }
        };

        // Удаление виджетов при удалении изображения
        this.imageManager.onImageDeleted = (imageId) => {
            if (this.widgetManager) {
                this.widgetManager.onImageDelete(imageId);
            }
        };

        // Удаление точек соединения при удалении изображения
        this.imageManager.onPointDeleteRequest = (point) => {
            this.connectionPointManager.deletePoint(point);
        };

        // Отображение контекстного меню
        this.imageManager.onContextMenuRequested = (imageId, konvaImg, pos, clientX, clientY) => {
            const menuItems = [
                {
                    label: 'Добавить виджет',
                    submenu: [
                        { label: '📊 Числовой дисплей', type: 'number-display' },
                        { label: '📝 Текстовый дисплей', type: 'text-display' },
                        { label: '💡 Индикатор', type: 'led' },
                        { label: '🔢 Числовой ввод', type: 'number-input' },
                        { label: '✏️ Текстовый ввод', type: 'text-input' },
                        { label: '🔀 Переключатель', type: 'toggle' },
                        { label: '🔘 Кнопка', type: 'button' },
                        { label: '📏 Слайдер', type: 'slider' }
                    ],
                    onSelect: (type) => {
                        const defaults = {
                            'number-display': { width: 100, height: 30 },
                            'text-display': { width: 120, height: 25 },
                            'led': { width: 40, height: 40 },
                            'number-input': { width: 100, height: 30 },
                            'text-input': { width: 150, height: 30 },
                            'toggle': { width: 60, height: 26 },
                            'button': { width: 100, height: 32 },
                            'slider': { width: 140, height: 30 }
                        };

                        const defaultSize = defaults[type] || { width: 100, height: 30 };
                        const image = this.imageManager.getImage(imageId);
                        if (!image) return;

                        let widgetX = pos.x - defaultSize.width / 2;
                        let widgetY = pos.y - defaultSize.height / 2;

                        const imgX = image.x();
                        const imgY = image.y();
                        const imgWidth = image.width() * image.scaleX();
                        const imgHeight = image.height() * image.scaleY();

                        if (widgetX < imgX) widgetX = imgX;
                        if (widgetX + defaultSize.width > imgX + imgWidth) {
                            widgetX = imgX + imgWidth - defaultSize.width;
                        }
                        if (widgetY < imgY) widgetY = imgY;
                        if (widgetY + defaultSize.height > imgY + imgHeight) {
                            widgetY = imgY + imgHeight - defaultSize.height;
                        }

                        this.widgetManager.create({
                            type,
                            imageId,
                            x: widgetX,
                            y: widgetY,
                            width: defaultSize.width,
                            height: defaultSize.height
                        });
                    }
                }
            ];

            this.contextMenu.show(menuItems, clientX, clientY);
        };

        // Обработчики ConnectionPointManager
        this.connectionPointManager.onPointSelected = (point) => {
            if (!this.isCreateLineMode) {
                this.setConnectionEditMode(false);
                this.selectionManager.clearSelection();
                this.propertiesPanel.showPropertiesForPoint(point);
            }
        };

        this.connectionPointManager.onPointDoubleClick = (point) => {
            if (this.isCreateLineMode) return;
            const meta = point.getAttr('cp-meta');
            if (meta.connectedTo) {
                alert('Нельзя удалить подключенную точку соединения. Сначала удалите соединение.');
                return;
            }
            this.connectionPointManager.deletePoint(point);
            this.propertiesPanel.showDefaultMessage();
        };

        this.connectionPointManager.onPointMoved = (point) => {
            this.connectionManager.updateConnectionsForPin(
                point,
                point.x(),
                point.y(),
                false
            );
        };

        // Каскадное удаление соединений при удалении точки
        this.connectionPointManager.onPointDeleted = (point) => {
            const connections = this.connectionManager.getConnections();
            // Копирование массива для безопасного удаления в процессе итерации
            [...connections].forEach(conn => {
                const meta = conn.getAttr('connection-meta');
                if (meta && (meta.fromPin === point || meta.toPin === point)) {
                    this.connectionManager.deleteConnection(conn);
                }
            });
        };

        // Обработчики ConnectionManager
        this.connectionManager.onConnectionSelected = (connection) => {
            if (this.isCreateLineMode) {
                this.toggleLineCreationMode();
            }
            this.setConnectionEditMode(true);
            this.selectionManager.selectConnection(connection);
            this.propertiesPanel.showPropertiesForConnection(connection);
        };

        // Обработчики SelectionManager
        this.selectionManager.onConnectionSelectRequest = (connection) => {
            this.connectionManager.selectConnection(connection);
        };

        this.selectionManager.onConnectionDeselectRequest = (connection) => {
            this.connectionManager.deselectConnection(connection);
        };

        // Обработчики BindingsManager
        this.bindingsManager.onBindingsClearRequest = () => {
            if (this.widgetManager && Array.isArray(this.widgetManager.widgets)) {
                this.widgetManager.widgets.forEach(w => {
                    if (typeof this.widgetManager.syncWidgetBinding === 'function') {
                        this.widgetManager.syncWidgetBinding(w, null);
                    } else {
                        w.bindingId = null;
                        w.bindingMetric = null;
                        w.binding = null;
                    }
                });
            }
            // Systemic notification of bindings clearing
            this.notifyDirtyState({ bindingsDirty: true });
        };

        // Обработчики PropertiesPanel
        this.propertiesPanel.onWidgetUpdated = (widget) => {
            if (this.widgetManager) {
                this.widgetManager.reattachDragHandlers(widget);
            }
            // Systemic notification of visual changes
            this.notifyDirtyState({ layoutDirty: true });
        };

        // Notify host when any binding (telemetry or command) is changed via the properties panel.
        this.propertiesPanel.onBindingsChanged = () => {
            this.notifyDirtyState({ bindingsDirty: true });
        };

        this.propertiesPanel.onWidgetPositionOrSizeChange = (widget, propName, value) => {
            if (this.widgetManager) {
                if (propName === 'x') {
                    this.widgetManager.updatePosition(widget.id, value, widget.y);
                } else if (propName === 'y') {
                    this.widgetManager.updatePosition(widget.id, widget.x, value);
                } else if (propName === 'width') {
                    this.widgetManager.updateSize(widget.id, value, widget.height);
                } else if (propName === 'height') {
                    this.widgetManager.updateSize(widget.id, widget.width, value);
                }
            }
        };

        // Обработчики WidgetManager
        this.widgetManager.onWidgetSelected = (widget) => {
            this.selectionManager.selectWidget(widget);
            this.propertiesPanel.showPropertiesForWidget(widget, this.bindingsManager.allDevices);
            this.stripBindingsUiFromPropertiesPanel();
        };

        this.widgetManager.onWidgetCreated = () => {
            this.notifyDirtyState({ layoutDirty: true });
        };

        this.widgetManager.onWidgetDeleted = (widget) => {
            if (this.bindingsManager && widget && typeof this.bindingsManager.removeCommand === 'function') {
                this.bindingsManager.removeCommand(widget.id);
            }
            this.notifyDirtyState({ layoutDirty: true, bindingsDirty: true });
        };

        this.widgetManager.onWidgetDragEnd = (widget) => {
            this.propertiesPanel.refreshWidgetProperties(widget);
            this.notifyDirtyState({ layoutDirty: true });
        };
    }

    /** Установка режима редактирования соединения. Вход: value (boolean). */
    setConnectionEditMode(value) {
        if (this.isConnectionEditMode === value) return;

        this.isConnectionEditMode = value;

        const editBtn = this.getElement('edit-connection-btn');
        if (editBtn) {
            editBtn.classList.toggle('active', value);
        }

        const canvasArea = this.querySelector('.canvas-area');
        if (canvasArea) {
            canvasArea.classList.toggle('edit-mode', value);
        }
    }

    /** Инициализация слушателей событий интерфейса. */
    setupEventListeners() {
        try {
            const queryRoot = this.getRootElement() === document ? document : this.getRootElement();
            const tooltipTriggerList = [].slice.call(queryRoot.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.forEach(function (tooltipTriggerEl) {
                if (window.bootstrap && bootstrap.Tooltip) new bootstrap.Tooltip(tooltipTriggerEl);
            });
        } catch (_) { }

        const addImageBtn = this.getElement('add-image-btn');
        if (addImageBtn) {
            this.registerDomListener(addImageBtn, 'click', () => {
                this.addImage();
            });
        }

        const saveSchemaBtn = this.getElement('save-schema-btn');
        if (saveSchemaBtn) {
            this.registerDomListener(saveSchemaBtn, 'click', () => {
                this.fileManager.saveScheme();
            });
        }

        const saveAsBtn = this.getElement('save-as-btn');
        if (saveAsBtn) {
            this.registerDomListener(saveAsBtn, 'click', () => {
                this.fileManager.requestSaveAs();
            });
        }

        const loadSchemaBtn = this.getElement('load-schema-btn');
        if (loadSchemaBtn) {
            this.registerDomListener(loadSchemaBtn, 'click', () => {
                this.fileManager.loadScheme();
            });
        }

        const saveBindingsBtn = this.getElement('save-bindings-btn');
        if (saveBindingsBtn && this.isBindingsEnabled()) {
            this.registerDomListener(saveBindingsBtn, 'click', () => {
                this.fileManager.saveBindings();
            });
        }

        const loadBindingsBtn = this.getElement('load-bindings-btn');
        if (loadBindingsBtn && this.isBindingsEnabled()) {
            this.registerDomListener(loadBindingsBtn, 'click', () => {
                this.fileManager.loadBindings();
            });
        }

        const clearBtn = this.getElement('clear-btn');
        if (clearBtn) {
            this.registerDomListener(clearBtn, 'click', () => {
                this.fileManager.clearCanvas();
                // Systemic notification of total clearing
                this.notifyDirtyState({ layoutDirty: true, bindingsDirty: true });
            });
        }

        const createLineBtn = this.getElement('create-line-btn');
        if (createLineBtn) {
            this.registerDomListener(createLineBtn, 'click', () => {
                this.toggleLineCreationMode();
            });
        }

        const deleteBtn = this.getElement('delete-selected-btn');
        if (deleteBtn) {
            this.registerDomListener(deleteBtn, 'click', () => {
                this.deleteSelected();
            });
        }

        const stage = this.canvasManager.getStage();
        if (stage) {
            stage.on('click', (e) => {
                if (e.target === stage) {
                    this.setConnectionEditMode(false);
                    this.selectionManager.clearSelection();
                    this.propertiesPanel.showDefaultMessage();
                }
            });
        }
    }
    deleteSelected() {
        const selected = this.selectionManager.getSelected();
        if (!selected) return;

        if (selected.widget) {
            this.widgetManager.delete(selected.widget.id);
            this.selectionManager.clearSelection();
            this.propertiesPanel.clear();
            return;
        }

        if (selected.connection) {
            this.connectionManager.deleteConnection(selected.connection);
            this.setConnectionEditMode(false);
            this.selectionManager.clearSelection();
            this.propertiesPanel.showDefaultMessage();
            return;
        }

        if (selected.node) {
            this.imageManager.deleteImage(selected.node);
            this.selectionManager.clearSelection();
            this.propertiesPanel.showDefaultMessage();
        }
    }

    /** Открытие диалога выбора файла. */
    addImage() {
        const fileInput = this.getElement('file-input');
        if (!fileInput) return;
        fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                this.imageManager.addImageFromBase64(reader.result);
                fileInput.value = '';
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    }

    /** Переключение режима создания соединений. */
    toggleLineCreationMode() {
        this.isCreateLineMode = !this.isCreateLineMode;
        const createLineBtn = this.getElement('create-line-btn');
        if (createLineBtn) {
            createLineBtn.classList.toggle('active', this.isCreateLineMode);
        }

        if (this.isCreateLineMode) {
            this.setConnectionEditMode(false);
            this.selectionManager.clearSelection();
            this.propertiesPanel.showDefaultMessage();
            this.setupLineCreationMode();
        } else {
            this.teardownLineCreationMode();
        }
    }

    /** Инициализация режима создания соединений. */
    setupLineCreationMode() {
        const points = this.connectionPointManager.getPoints();
        points.forEach(point => {
            point.draggable(false);
            point.listening(true);
            point.off('click');
            point.off('dblclick');
            point.on('pointerdown', (e) => {
                e.evt.stopPropagation();
                this.handlePinClickForLineCreation(point);
            });
        });

        const stage = this.canvasManager.getStage();
        stage.on('mousemove', this.handleMouseMoveForLinePreview.bind(this));

        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();
    }

    /** Деинициализация режима создания соединений. */
    teardownLineCreationMode() {
        const stage = this.canvasManager.getStage();
        stage.off('mousemove');

        const points = this.connectionPointManager.getPoints();
        points.forEach(point => {
            point.draggable(true);
            point.listening(true);
            // Восстановление стандартных обработчиков
            this.connectionPointManager.restoreDefaultEvents(point);
        });

        this.clearPreviewLine();
        this.firstPinSelected = null;
        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();
    }

    /** Обработка выбора точки для создания соединения. Вход: point (Konva.Circle). */
    handlePinClickForLineCreation(point) {
        const meta = point.getAttr('cp-meta');

        if (meta.connectedTo) {
            return;
        }

        if (!this.firstPinSelected) {
            this.firstPinSelected = point;
            point.fill('#dc3545');
            this.canvasManager.getLayer().batchDraw();
        } else if (this.firstPinSelected === point) {
            this.firstPinSelected.fill('#198754');
            this.firstPinSelected = null;
            this.clearPreviewLine();
        } else {
            this.connectionManager.createConnection(this.firstPinSelected, point);
            this.firstPinSelected = null;
            this.clearPreviewLine();
        }
    }

    /** Обновление координат предварительной линии соединения. Вход: e (событие мыши). */
    handleMouseMoveForLinePreview(e) {
        if (!this.firstPinSelected) return;

        const pos = this.getPointerStageCoords();
        this.updatePreviewLine(this.firstPinSelected.position(), pos);
    }

    /** Отрисовка предварительной линии соединения. Вход: startPos (объект координат), endPos (объект координат). */
    updatePreviewLine(startPos, endPos) {
        if (this.previewLine) {
            this.previewLine.destroy();
        }

        const midX = (startPos.x + endPos.x) / 2;
        const points = [
            startPos.x, startPos.y,
            midX, startPos.y,
            midX, endPos.y,
            endPos.x, endPos.y
        ];

        this.previewLine = new Konva.Line({
            points: points,
            stroke: '#6c757d',
            strokeWidth: 2,
            dash: [5, 5],
            listening: false
        });

        this.canvasManager.getLayer().add(this.previewLine);
        this.canvasManager.getLayer().batchDraw();
    }

    /** Удаление предварительной линии соединения с холста. */
    clearPreviewLine() {
        if (this.previewLine) {
            this.previewLine.destroy();
            this.previewLine = null;
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /** Получение координат указателя в системе координат холста. Выход: объект {x, y}. */
    getPointerStageCoords() {
        const stage = this.canvasManager.getStage();
        const p = stage.getPointerPosition();
        if (!p) return { x: 0, y: 0 };
        return {
            x: (p.x - stage.x()) / stage.scaleX(),
            y: (p.y - stage.y()) / stage.scaleY(),
        };
    }

    /** Расчет ближайшей стороны и смещения относительно рамки. Вход: frame (Konva.Rect), pos (объект координат). Выход: объект {side, offset}. */
    getNearestSideAndOffsetFromFrame(frame, pos) {
        const left = frame.x();
        const top = frame.y();
        const width = frame.width();
        const height = frame.height();
        const right = left + width;
        const bottom = top + height;

        const dTop = Math.abs(pos.y - top);
        const dRight = Math.abs(pos.x - right);
        const dBottom = Math.abs(pos.y - bottom);
        const dLeft = Math.abs(pos.x - left);
        const min = Math.min(dTop, dRight, dBottom, dLeft);

        if (min === dTop) return { side: 'top', offset: Math.min(1, Math.max(0, (pos.x - left) / width)) };
        if (min === dRight) return { side: 'right', offset: Math.min(1, Math.max(0, (pos.y - top) / height)) };
        if (min === dBottom) return { side: 'bottom', offset: Math.min(1, Math.max(0, (pos.x - left) / width)) };
        return { side: 'left', offset: Math.min(1, Math.max(0, (pos.y - top) / height)) };
    }

    async loadLayout(layout = {}) {
        const loadGeneration = this.nextLayoutLoadGeneration();
        await this.ready();
        if (this.isLayoutLoadStale(loadGeneration)) {
            return;
        }

        this.fileManager.clearCanvas(false);
        if (this.isLayoutLoadStale(loadGeneration)) {
            return;
        }

        await this.fileManager.importImages(layout.images || []);
        if (this.isLayoutLoadStale(loadGeneration)) {
            return;
        }
        this.connectionPointManager.importPoints(layout.connectionPoints || [], this.imageManager);
        if (this.isLayoutLoadStale(loadGeneration)) {
            return;
        }
        this.connectionManager.importConnections(layout.connections || [], this.connectionPointManager);
        if (this.isLayoutLoadStale(loadGeneration)) {
            return;
        }
        if (this.widgetManager) {
            this.widgetManager.importWidgets(layout.widgets || [], this.imageManager);
            if (this.isLayoutLoadStale(loadGeneration)) {
                return;
            }
        }

        this.notifyDirtyState({
            layoutDirty: false,
            bindingsDirty: false,
        });
    }

    async getLayout() {
        await this.ready();
        if (this._destroyed) {
            return {};
        }

        return {
            images: await this.fileManager.exportImages(),
            connectionPoints: this.connectionPointManager.exportPoints(),
            connections: this.connectionManager.exportConnections(),
            widgets: this.widgetManager ? this.widgetManager.exportWidgets() : [],
        };
    }

    async loadBindings(bindings = []) {
        const loadGeneration = this.nextBindingsLoadGeneration();
        await this.ready();
        if (this.editorMode === 'reduced' || this.isBindingsLoadStale(loadGeneration)) {
            return;
        }

        if (this.widgetManager) {
            this.widgetManager.importBindings(Array.isArray(bindings) ? bindings : []);
            if (this.isBindingsLoadStale(loadGeneration)) {
                return;
            }
        }

        this.notifyDirtyState({
            layoutDirty: false,
            bindingsDirty: false,
        });
    }

    async getBindings() {
        await this.ready();
        if (this._destroyed || this.editorMode === 'reduced') {
            return [];
        }

        if (!this.widgetManager) {
            return [];
        }

        return this.widgetManager.exportBindings();
    }

    async loadBindingProfile(profile = {}) {
        const loadGeneration = this.nextBindingsLoadGeneration();
        await this.ready();
        if (this.editorMode === 'reduced' || this.isBindingsLoadStale(loadGeneration)) {
            return;
        }

        const widgetBindings = Array.isArray(profile.widgetBindings) ? profile.widgetBindings : [];
        const commandBindings = Array.isArray(profile.commandBindings) ? profile.commandBindings : [];

        if (this.widgetManager) {
            this.widgetManager.importBindings(widgetBindings);
        }
        if (this.bindingsManager) {
            this.bindingsManager.importCommandBindings(commandBindings);
        }

        this.notifyDirtyState({
            layoutDirty: false,
            bindingsDirty: false,
        });
    }

    async getBindingProfile() {
        await this.ready();
        if (this._destroyed || this.editorMode === 'reduced') {
            return { widgetBindings: [], commandBindings: [] };
        }

        return {
            widgetBindings: this.widgetManager ? this.widgetManager.exportBindings() : [],
            commandBindings: this.bindingsManager ? this.bindingsManager.getCommandBindings() : []
        };
    }

    updateCatalog(input = {}) {
        if (this._destroyed) {
            return;
        }

        this.hostedMachines = Array.isArray(input.machines) ? input.machines : [];
        this.hostedDeviceCatalog = Array.isArray(input.deviceCatalog) ? input.deviceCatalog : [];
        this.hostedCommandCatalog = Array.isArray(input.commandCatalog) ? input.commandCatalog : this.hostedCommandCatalog;

        if (this.bindingsManager) {
            this.bindingsManager.allDevices = this.isBindingsEnabled()
                ? this.mapHostedCatalogToBindingsDevices(this.hostedDeviceCatalog)
                : [];

            // Update command options for the active machine
            const activeMachineId = this.bindingsManager.selectedMachineId ?? null;
            this.bindingsManager.setCommandOptions(
                this.isBindingsEnabled()
                    ? this.mapHostedCommandCatalogToOptions(this.hostedCommandCatalog, activeMachineId)
                    : []
            );

            if (!this.isBindingsEnabled() || !this.bindingsManager.selectedMachineId) {
                this.bindingsManager.availableDeviceMetrics = [];
                this.bindingsManager.availableDevices = [];
            } else {
                this.bindingsManager.selectMachine(this.bindingsManager.selectedMachineId, true);
            }
        }

        this.renderMachineOptions();
    }

    setActiveMachine(machineId) {
        if (this._destroyed || this.editorMode === 'reduced') {
            return;
        }

        if (!this.bindingsManager || !this.fileManager) {
            return;
        }

        const machineSelect = this.getElement('machine-select');
        if (machineSelect) {
            machineSelect.value = machineId || '';
        }

        if (!machineId) {
            this.bindingsManager.selectedMachineId = null;
            this.bindingsManager.availableDeviceMetrics = [];
            this.bindingsManager.availableDevices = [];
            // Clear command options when no machine is selected
            this.bindingsManager.setCommandOptions([]);
            this.fileManager.currentMachineId = null;
            this.emitMachineChange(null);
            return;
        }

        this.bindingsManager.selectMachine(machineId, true);
        // Sync command options to the newly active machine — closes the invariant
        this.bindingsManager.setCommandOptions(
            this.mapHostedCommandCatalogToOptions(this.hostedCommandCatalog, machineId)
        );
        this.fileManager.currentMachineId = machineId;
        this.emitMachineChange(machineId);
    }

    async destroy() {
        if (this._destroyed) {
            return;
        }

        this._destroyed = true;
        this.nextLayoutLoadGeneration();
        this.nextBindingsLoadGeneration();

        this.cleanupDomListeners();

        const contextMenu = this.contextMenu;
        this.contextMenu = null;
        if (contextMenu && typeof contextMenu.destroy === 'function') {
            contextMenu.destroy();
        }

        const canvasManager = this.canvasManager;
        this.canvasManager = null;
        if (canvasManager && typeof canvasManager.destroy === 'function') {
            canvasManager.destroy();
        }
    }
}

export { UIController };




