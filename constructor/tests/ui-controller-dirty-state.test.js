import test from 'node:test';
import assert from 'node:assert/strict';
import { UIController } from '../public/ui-controller.js';

function createControllerHarness() {
    const calls = [];
    const controller = Object.create(UIController.prototype);
    controller.currentDirtyState = {
        layoutDirty: false,
        bindingsDirty: false,
    };
    controller.isBindingsEnabled = () => true;
    controller.getHostedCallbacks = () => ({
        onDirtyStateChange: (state) => calls.push({ ...state }),
    });

    return { controller, calls };
}

test('UIController merges partial dirty-state updates without dropping layoutDirty', () => {
    const { controller, calls } = createControllerHarness();

    controller.notifyDirtyState({ layoutDirty: true });
    controller.notifyDirtyState({ bindingsDirty: true });

    assert.deepEqual(calls, [
        { layoutDirty: true, bindingsDirty: false },
        { layoutDirty: true, bindingsDirty: true },
    ]);
});

test('UIController explicit clean update resets both dirty flags', () => {
    const { controller, calls } = createControllerHarness();

    controller.notifyDirtyState({ layoutDirty: true, bindingsDirty: true });
    controller.notifyDirtyState({ layoutDirty: false, bindingsDirty: false });

    assert.deepEqual(calls.at(-1), { layoutDirty: false, bindingsDirty: false });
});

test('UIController marks layout dirty for widget lifecycle changes', () => {
    const { controller, calls } = createControllerHarness();
    const removedCommandWidgetIds = [];

    controller.imageManager = {};
    controller.connectionPointManager = {};
    controller.connectionManager = {};
    controller.selectionManager = {};
    controller.propertiesPanel = {
        refreshWidgetProperties: () => {},
    };
    controller.widgetManager = {};
    controller.bindingsManager = {
        allDevices: [],
        removeCommand: (widgetId) => removedCommandWidgetIds.push(widgetId),
    };
    controller.stripBindingsUiFromPropertiesPanel = () => {};

    controller.setupManagerCallbacks();
    controller.widgetManager.onWidgetCreated({ id: 'widget_led_1' });
    controller.widgetManager.onWidgetDeleted({ id: 'widget_toggle_2' });
    controller.widgetManager.onWidgetDragEnd({ id: 'widget_led_1' });

    assert.deepEqual(calls, [
        { layoutDirty: true, bindingsDirty: false },
        { layoutDirty: true, bindingsDirty: true },
        { layoutDirty: true, bindingsDirty: true },
    ]);
    assert.deepEqual(removedCommandWidgetIds, ['widget_toggle_2']);
});
