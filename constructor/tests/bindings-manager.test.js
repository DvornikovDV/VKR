import test from 'node:test';
import assert from 'node:assert/strict';
import { BindingsManager } from '../public/bindings-manager.js';

test('BindingsManager imports and exports command bindings separately from telemetry', () => {
    const manager = new BindingsManager();
    
    // Initial state
    assert.deepEqual(manager.getCommandBindings(), []);
    
    // Import
    const raw = [
        { widgetId: 'w1', deviceId: 'd1', commandType: 'set_bool' },
        { widgetId: 'w2', deviceId: 'd2', commandType: 'set_number' },
        { widgetId: 'w3', deviceId: 'd3', commandType: 'invalid' } // Should be filtered out
    ];
    
    manager.importCommandBindings(raw);
    
    const exported = manager.getCommandBindings();
    assert.equal(exported.length, 2);
    assert.equal(exported[0].widgetId, 'w1');
    assert.equal(exported[1].widgetId, 'w2');
    assert.equal(exported[0].commandType, 'set_bool');
    assert.equal(exported[1].commandType, 'set_number');
});

test('BindingsManager assignCommand respects catalog and replaces existing', () => {
    const manager = new BindingsManager();
    manager.setCommandOptions([
        { deviceId: 'd1', commandType: 'set_bool' }
    ]);
    
    // Assign valid
    const ok = manager.assignCommand('w1', 'd1', 'set_bool');
    assert.equal(ok, true);
    assert.equal(manager.getCommandBindings().length, 1);
    
    // Assign invalid (not in catalog)
    const fail = manager.assignCommand('w2', 'd1', 'set_number');
    assert.equal(fail, false);
    assert.equal(manager.getCommandBindings().length, 1);
    
    // Replace
    manager.setCommandOptions([
        { deviceId: 'd1', commandType: 'set_bool' },
        { deviceId: 'd1', commandType: 'set_number' }
    ]);
    manager.assignCommand('w1', 'd1', 'set_number');
    const bindings = manager.getCommandBindings();
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].commandType, 'set_number');
});

test('BindingsManager removeCommand and clearCommandBindings work', () => {
    const manager = new BindingsManager();
    manager.setCommandOptions([{ deviceId: 'd1', commandType: 'set_bool' }]);
    manager.assignCommand('w1', 'd1', 'set_bool');
    manager.assignCommand('w2', 'd1', 'set_bool');
    
    assert.equal(manager.getCommandBindings().length, 2);
    
    manager.removeCommand('w1');
    assert.equal(manager.getCommandBindings().length, 1);
    assert.equal(manager.getCommandBindings()[0].widgetId, 'w2');
    
    manager.clearCommandBindings();
    assert.equal(manager.getCommandBindings().length, 0);
});
