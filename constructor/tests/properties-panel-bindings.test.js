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
        {
            machineId: 'edge-1',
            id: 'valve_positioner',
            metrics: [
                { key: 'actual_position', label: 'Actual position', valueType: 'number' },
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
        {
            deviceId: 'valve_positioner',
            commandType: 'set_number',
            valueType: 'number',
            min: 0,
            max: 200,
            reportedMetric: 'actual_position',
            label: 'Valve position preset',
        },
        {
            deviceId: 'pump_main',
            commandType: 'set_text',
            valueType: 'string',
            reportedMetric: 'actual_state',
            label: 'Unsupported free text command',
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
        ['pump_main', 'valve_main', 'valve_positioner'],
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

test('PropertiesPanel authors button command presets from catalog targets only', () => {
    const { manager, panel } = createPanel();
    const button = {
        id: 'button-1',
        type: 'button',
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        bindingId: 'pump_main',
        bindingMetric: 'humidity',
        binding: { deviceId: 'pump_main', metric: 'humidity' },
    };

    const buttonTargetTypes = panel
        .getCommandTargetOptions(panel.getAllowedCommandTypes(button.type))
        .map((option) => `${option.deviceId}:${option.commandType}`);
    assert.deepEqual(buttonTargetTypes, [
        'pump_main:set_bool',
        'valve_positioner:set_number',
    ]);
    assert.deepEqual(panel.getAllowedCommandTypes('toggle'), ['set_bool']);
    assert.deepEqual(panel.getAllowedCommandTypes('slider'), ['set_number']);

    panel.setCommandBinding(button, 'pump_main', 'set_bool');

    assert.deepEqual(manager.getCommandBindingForWidget('button-1'), {
        widgetId: 'button-1',
        deviceId: 'pump_main',
        commandType: 'set_bool',
    });
    assert.equal(button.bindingId, 'pump_main');
    assert.equal(button.bindingMetric, 'actual_state');
    assert.equal(Object.prototype.hasOwnProperty.call(button, 'commandValue'), false);

    assert.equal(panel.applyCommandPresetValue(button, 'false'), true);
    assert.equal(button.commandValue, false);
    assert.match(panel.renderCommandPresetSection(button), /value="false" selected/);

    panel.setCommandBinding(button, 'valve_positioner', 'set_number');

    assert.deepEqual(manager.getCommandBindingForWidget('button-1'), {
        widgetId: 'button-1',
        deviceId: 'valve_positioner',
        commandType: 'set_number',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(button, 'commandValue'), false);
    assert.equal(button.bindingId, 'valve_positioner');
    assert.equal(button.bindingMetric, 'actual_position');
    assert.deepEqual(panel.getAvailableMetricsForDevice('valve_positioner', button), ['actual_position']);
    assert.equal(panel.applyCommandPresetValue(button, '128'), true);
    assert.equal(button.commandValue, 128);
    assert.equal(panel.applyCommandPresetValue(button, '250'), false);
    assert.equal(button.commandValue, 128);
    assert.match(panel.renderCommandPresetSection(button), /min="0"/);
    assert.match(panel.renderCommandPresetSection(button), /max="200"/);

    panel.setCommandBinding(button, 'pump_main', 'set_text');

    assert.deepEqual(manager.getCommandBindingForWidget('button-1'), {
        widgetId: 'button-1',
        deviceId: 'valve_positioner',
        commandType: 'set_number',
    });
});
