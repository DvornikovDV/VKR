// bindings-manager.js
// Handles machine-scoped widget bindings in constructor runtime.

class BindingsManager {
    constructor(devices = []) {
        this.allDevices = Array.isArray(devices) ? devices : [];
        this.selectedMachineId = null;
        this.availableDevices = []; // device ids for selected machine
        this.availableDeviceMetrics = []; // { deviceId, metric } pairs for selected machine
        this.bindings = []; // [{ widgetId, deviceId, metric }] – telemetry/reported state
        this.commandBindings = []; // [{ widgetId, deviceId, commandType }] – desired command targets
        this.availableCommandOptions = []; // [{ deviceId, commandType, label, ... }] for active machine
        this.onMachineChanged = null;
        this.onBindingsClearRequest = null;
    }

    normalizeMetric(metric) {
        if (typeof metric !== 'string') {
            return null;
        }

        const trimmedMetric = metric.trim();
        return trimmedMetric.length > 0 ? trimmedMetric : null;
    }

    collectDeviceMetrics(device) {
        const metrics = [];
        const pushMetric = (value) => {
            const normalizedMetric = this.normalizeMetric(value);
            if (normalizedMetric) {
                metrics.push(normalizedMetric);
            }
        };

        if (Array.isArray(device.metrics)) {
            device.metrics.forEach((metricEntry) => {
                if (typeof metricEntry === 'string') {
                    pushMetric(metricEntry);
                    return;
                }

                if (metricEntry && typeof metricEntry === 'object') {
                    pushMetric(metricEntry.key || metricEntry.metric || metricEntry.label);
                }
            });
        }

        if (metrics.length === 0) {
            pushMetric(device.metric);
        }

        if (metrics.length === 0) {
            metrics.push('value');
        }

        return Array.from(new Set(metrics));
    }

    getAvailableDeviceMetricsForMachine(machineId) {
        const deviceMetrics = [];

        this.allDevices
            .filter((device) => device.machineId === machineId)
            .forEach((device) => {
                const deviceId = typeof device.id === 'string' ? device.id : null;
                if (!deviceId) {
                    return;
                }

                this.collectDeviceMetrics(device).forEach((metric) => {
                    deviceMetrics.push({
                        deviceId,
                        metric,
                    });
                });
            });

        return deviceMetrics;
    }

    resolveMetricForDevice(deviceId, metric) {
        const normalizedMetric = this.normalizeMetric(metric);
        if (normalizedMetric) {
            return normalizedMetric;
        }

        const fallbackMetricEntry = this.availableDeviceMetrics.find(
            (entry) => entry.deviceId === deviceId,
        );

        return fallbackMetricEntry ? fallbackMetricEntry.metric : 'value';
    }

    // Set active machine id.
    selectMachine(machineId, skipConfirm = false) {
        if (!machineId) return false;

        if (this.bindings.length > 0 && machineId !== this.selectedMachineId && !skipConfirm) {
            if (!confirm('Bindings will be cleared after machine switch. Continue?')) {
                return false;
            }

            this.bindings = [];
            this.commandBindings = [];
            if (this.onBindingsClearRequest) {
                this.onBindingsClearRequest();
            }
        }

        const oldMachineId = this.selectedMachineId;
        this.selectedMachineId = machineId;
        this.availableDeviceMetrics = this.getAvailableDeviceMetricsForMachine(machineId);
        this.availableDevices = Array.from(
            new Set(this.availableDeviceMetrics.map((entry) => entry.deviceId)),
        );

        if (oldMachineId !== machineId && this.onMachineChanged) {
            this.onMachineChanged(machineId);
        }

        return true;
    }

    // Return available { deviceId, metric } pairs for machine.
    async fetchDevices(machineId) {
        return this.getAvailableDeviceMetricsForMachine(machineId);
    }

    // Validate assignment for selected machine.
    canAssignDevice(deviceId, metric = null) {
        if (!this.selectedMachineId) {
            return false;
        }

        if (!this.availableDevices.includes(deviceId)) {
            return false;
        }

        const normalizedMetric = this.normalizeMetric(metric);
        if (!normalizedMetric) {
            return true;
        }

        return this.availableDeviceMetrics.some(
            (entry) => entry.deviceId === deviceId && entry.metric === normalizedMetric,
        );
    }

    // Assign widget binding as widgetId + deviceId + metric.
    assignDeviceToElement(widgetId, deviceId, metric = null) {
        if (!this.selectedMachineId) {
            alert('Select a machine first.');
            return false;
        }

        const resolvedMetric = this.resolveMetricForDevice(deviceId, metric);
        if (!this.canAssignDevice(deviceId, resolvedMetric)) {
            alert(`"${deviceId}" is not available for machine ${this.selectedMachineId}`);
            return false;
        }

        this.bindings.push({
            widgetId,
            deviceId,
            metric: resolvedMetric,
        });

        return true;
    }

    // ------------------------------------------------------------------
    // Command binding state – separate from telemetry bindings[]
    // ------------------------------------------------------------------

    /**
     * Load command options for the active machine from the command catalog.
     * Called by UIController when catalog is updated.
     * @param {Array<{deviceId: string, commandType: string, label?: string, valueType?: string, min?: number, max?: number, reportedMetric?: string}>} commandOptions
     */
    setCommandOptions(commandOptions) {
        this.availableCommandOptions = Array.isArray(commandOptions) ? commandOptions : [];
    }

    /**
     * Assign a command binding to a widget.
     * Does NOT touch this.bindings[].
     * @param {string} widgetId
     * @param {string} deviceId
     * @param {'set_bool'|'set_number'} commandType
     * @returns {boolean}
     */
    assignCommand(widgetId, deviceId, commandType) {
        if (!widgetId || !deviceId || !commandType) {
            return false;
        }

        if (!this.isCommandAvailable(deviceId, commandType)) {
            console.warn(`Command ${commandType} for device ${deviceId} is not available in the current catalog.`);
            return false;
        }

        // Remove any existing command binding for this widget before adding the new one.
        this.commandBindings = this.commandBindings.filter((b) => b.widgetId !== widgetId);
        this.commandBindings.push({ widgetId, deviceId, commandType });
        return true;
    }

    /**
     * Check if a specific command is available in the current machine's catalog.
     * @param {string} deviceId
     * @param {string} commandType
     * @returns {boolean}
     */
    isCommandAvailable(deviceId, commandType) {
        return this.availableCommandOptions.some(
            (opt) => opt.deviceId === deviceId && opt.commandType === commandType
        );
    }

    /**
     * Remove the command binding for a widget.
     * @param {string} widgetId
     */
    removeCommand(widgetId) {
        this.commandBindings = this.commandBindings.filter((b) => b.widgetId !== widgetId);
    }

    /**
     * Return the current command binding for a widget, or null.
     * @param {string} widgetId
     * @returns {{ widgetId: string, deviceId: string, commandType: string }|null}
     */
    getCommandBindingForWidget(widgetId) {
        return this.commandBindings.find((b) => b.widgetId === widgetId) ?? null;
    }

    /**
     * Return a snapshot of all current command bindings.
     * @returns {Array<{ widgetId: string, deviceId: string, commandType: string }>}
     */
    getCommandBindings() {
        return this.commandBindings.slice();
    }

    /**
     * Clear all command bindings.
     */
    clearCommandBindings() {
        this.commandBindings = [];
    }

    /**
     * Replace command bindings from an imported array.
     * Only entries with valid widgetId, deviceId, and allowed commandType are kept.
     * Does NOT touch this.bindings[].
     * @param {Array} raw
     */
    importCommandBindings(raw) {
        if (!Array.isArray(raw)) {
            this.commandBindings = [];
            return;
        }

        const ALLOWED = new Set(['set_bool', 'set_number']);
        this.commandBindings = raw.filter(
            (b) =>
                b &&
                typeof b.widgetId === 'string' && b.widgetId.length > 0 &&
                typeof b.deviceId === 'string' && b.deviceId.length > 0 &&
                ALLOWED.has(b.commandType)
        ).map((b) => ({
            widgetId: b.widgetId,
            deviceId: b.deviceId,
            commandType: b.commandType,
        }));
    }
}

export { BindingsManager };
