// bindings-manager.js
// Handles machine-scoped widget bindings in constructor runtime.

class BindingsManager {
    constructor(devices = []) {
        this.allDevices = Array.isArray(devices) ? devices : [];
        this.selectedMachineId = null;
        this.availableDevices = []; // device ids for selected machine
        this.availableDeviceMetrics = []; // { deviceId, metric } pairs for selected machine
        this.bindings = []; // [{ widgetId, deviceId, metric }]
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
}

export { BindingsManager };
