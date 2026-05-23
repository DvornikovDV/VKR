import test from 'node:test';
import assert from 'node:assert/strict';
import { UIController } from '../public/ui-controller.js';
import { BindingsManager } from '../public/bindings-manager.js';
import { WidgetManager } from '../public/widget-manager.js';

class MockKonvaNode {
    constructor(attrs = {}) {
        this.attrs = { ...attrs };
        this.children = [];
        this.handlers = new Map();
        this.destroyed = false;
        this._x = attrs.x ?? 0;
        this._y = attrs.y ?? 0;
        this._draggable = Boolean(attrs.draggable);
    }

    add(child) {
        this.children.push(child);
        return this;
    }

    destroy() {
        this.destroyed = true;
        this.children = [];
    }

    on(eventName, handler) {
        this.handlers.set(eventName, handler);
    }

    off(eventName, handler) {
        if (!this.handlers.has(eventName)) {
            return;
        }

        if (!handler || this.handlers.get(eventName) === handler) {
            this.handlers.delete(eventName);
        }
    }

    draggable(value) {
        if (typeof value === 'boolean') {
            this._draggable = value;
        }

        return this._draggable;
    }

    x(value) {
        if (typeof value === 'number') {
            this._x = value;
            return this;
        }

        return this._x;
    }

    y(value) {
        if (typeof value === 'number') {
            this._y = value;
            return this;
        }

        return this._y;
    }
}

globalThis.Konva = {
    Group: MockKonvaNode,
    Rect: MockKonvaNode,
    Text: MockKonvaNode,
    Circle: MockKonvaNode,
};

function createLayer() {
    return {
        nodes: [],
        add(node) {
            this.nodes.push(node);
        },
        batchDraw() {},
        destroyChildren() {
            this.nodes = [];
        },
    };
}

function createImageNode() {
    return {
        x: () => 10,
        y: () => 20,
        width: () => 400,
        height: () => 300,
        scaleX: () => 1,
        scaleY: () => 1,
    };
}

function createImageManager() {
    const images = new Map([['image-1', createImageNode()]]);

    return {
        images: [],
        getImage(imageId) {
            return images.get(imageId) || null;
        },
        getImages() {
            return [];
        },
        clear() {
            this.images = [];
        },
    };
}

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

function createHostedLayoutHarness() {
    const layer = createLayer();
    const imageManager = createImageManager();
    const widgetManager = new WidgetManager(layer, imageManager, {});
    const bindingsManager = new BindingsManager([]);
    const controller = Object.create(UIController.prototype);

    controller._destroyed = false;
    controller._layoutLoadGeneration = 0;
    controller._bindingsLoadGeneration = 0;
    controller.editorMode = 'full';
    controller.ready = async () => undefined;
    controller.notifyDirtyState = () => undefined;
    controller.fileManager = {
        clearCanvas() {
            widgetManager.clear();
        },
        importImages: async () => undefined,
        exportImages: async () => [],
    };
    controller.connectionPointManager = {
        importPoints() {},
        exportPoints() {
            return [];
        },
    };
    controller.connectionManager = {
        importConnections() {},
        exportConnections() {
            return [];
        },
    };
    controller.imageManager = imageManager;
    controller.widgetManager = widgetManager;
    controller.bindingsManager = bindingsManager;

    return { controller };
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

test('UIController layout boundary preserves button commandValue outside binding profile', async () => {
    const { controller } = createHostedLayoutHarness();

    await controller.loadLayout({
        widgets: [
            {
                id: 'widget_button_1',
                type: 'button',
                imageId: 'image-1',
                x: 40,
                y: 60,
                width: 120,
                height: 32,
                text: 'Silence siren',
                commandValue: false,
            },
            {
                id: 'widget_button_2',
                type: 'button',
                imageId: 'image-1',
                x: 40,
                y: 110,
                width: 120,
                height: 32,
                text: 'Valve 50%',
                commandValue: 128,
            },
        ],
    });

    const layout = await controller.getLayout();
    const falseButton = layout.widgets.find((widget) => widget.id === 'widget_button_1');
    const numericButton = layout.widgets.find((widget) => widget.id === 'widget_button_2');

    assert.equal(falseButton.commandValue, false);
    assert.equal(numericButton.commandValue, 128);

    await controller.loadBindingProfile({
        widgetBindings: [
            {
                widgetId: 'widget_button_1',
                deviceId: 'siren',
                metric: 'actual_state',
                commandValue: false,
            },
        ],
        commandBindings: [
            {
                widgetId: 'widget_button_1',
                deviceId: 'siren',
                commandType: 'set_bool',
                commandValue: false,
            },
        ],
    });

    const profile = await controller.getBindingProfile();

    assert.deepEqual(profile, {
        widgetBindings: [
            {
                widgetId: 'widget_button_1',
                deviceId: 'siren',
                metric: 'actual_state',
            },
        ],
        commandBindings: [
            {
                widgetId: 'widget_button_1',
                deviceId: 'siren',
                commandType: 'set_bool',
            },
        ],
    });
});
