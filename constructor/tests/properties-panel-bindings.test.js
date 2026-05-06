import test from 'node:test';
import assert from 'node:assert/strict';
import { BindingsManager } from '../public/bindings-manager.js';
import { PropertiesPanel } from '../public/properties-panel.js';

function createPanel() {
    const manager = new BindingsManager([
        {
            machineId: 'edge-1',
            id: 'pump_main',
            metrics: [
                { key: 'actual_state', label: 'Actual state', valueType: 'boolean' },
                { key: 'humidity', label: 'Humidity', valueType: 'number' },
            ],
        },
        {
            machineId: 'edge-1',
            id: 'valve_main',
            metrics: [
                { key: 'actual_state', label: 'Actual state', valueType: 'boolean' },
            ],
        },
    ]);

    manager.selectMachine('edge-1', true);
    manager.setCommandOptions([
        {
            deviceId: 'pump_main',
            commandType: 'set_bool',
            valueType: 'boolean',
            reportedMetric: 'actual_state',
            label: 'Pump main set bool',
        },
    ]);

    const panel = new PropertiesPanel(null, {
        containerElement: {
            querySelector: () => null,
            querySelectorAll: () => [],
        },
    });
    panel.setBindingsManager(manager);

    return { manager, panel };
}

test('PropertiesPanel filters LED reported telemetry to boolean metrics', () => {
    const { panel } = createPanel();
    const widget = { id: 'led-1', type: 'led' };

    assert.deepEqual(panel.getAvailableMetricsForDevice('pump_main', widget), ['actual_state']);
    assert.deepEqual(
        panel.getAvailableDevices(widget).map((device) => device.id),
        ['pump_main', 'valve_main'],
    );
});

test('PropertiesPanel constrains command widget reported metric to selected command feedback', () => {
    const { manager, panel } = createPanel();
    const widget = {
        id: 'toggle-1',
        type: 'toggle',
        bindingId: 'pump_main',
        bindingMetric: 'humidity',
        binding: { deviceId: 'pump_main', metric: 'humidity' },
    };

    panel.setCommandBinding(widget, 'pump_main', 'set_bool');

    assert.deepEqual(manager.getCommandBindingForWidget('toggle-1'), {
        widgetId: 'toggle-1',
        deviceId: 'pump_main',
        commandType: 'set_bool',
    });
    assert.equal(widget.bindingId, 'pump_main');
    assert.equal(widget.bindingMetric, 'actual_state');
    assert.deepEqual(panel.getAvailableMetricsForDevice('pump_main', widget), ['actual_state']);
});
