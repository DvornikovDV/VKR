import test from 'node:test';
import assert from 'node:assert/strict';

import { FileManager } from '../public/file-manager.js';
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
      return Array.from(images.values());
    },
    clear() {
      this.images = [];
    },
  };
}

function createWidgetConfig(type, overrides = {}) {
  return {
    type,
    imageId: 'image-1',
    x: 40,
    y: 60,
    width: 120,
    height: 32,
    ...overrides,
  };
}

test('WidgetManager continues widget ids after export/import into a fresh runtime', () => {
  const imageManager = createImageManager();
  const sourceManager = new WidgetManager(createLayer(), imageManager, {});

  const firstWidget = sourceManager.create(createWidgetConfig('number-display'));
  const secondWidget = sourceManager.create(createWidgetConfig('text-display', { y: 110 }));

  assert.equal(firstWidget.id, 'widget_number-display_1');
  assert.equal(secondWidget.id, 'widget_text-display_2');

  const importedManager = new WidgetManager(createLayer(), imageManager, {});
  importedManager.importWidgets(sourceManager.exportWidgets(), imageManager);

  const nextWidget = importedManager.create(createWidgetConfig('number-display', { y: 160 }));
  assert.equal(nextWidget.id, 'widget_number-display_3');
});

test('WidgetManager persists label widgets without telemetry bindings', () => {
  const imageManager = createImageManager();
  const manager = new WidgetManager(createLayer(), imageManager, {});

  const label = manager.create(createWidgetConfig('label', {
    text: 'Pump A',
    bindingId: 'pump-1',
    binding: { deviceId: 'pump-1', metric: 'status' },
  }));

  assert.equal(label.id, 'widget_label_1');
  assert.equal(label.isBindable, false);

  const exported = manager.exportWidgets();
  assert.equal(exported.length, 1);
  assert.equal(exported[0].type, 'label');
  assert.equal(exported[0].text, 'Pump A');
  assert.equal(exported[0].bindingId, null);
  assert.equal(exported[0].binding, null);
  assert.equal(exported[0].bindingMetric, null);
  assert.deepEqual(manager.exportBindings(), []);
});

test('WidgetManager persists button commandValue false and numeric presets through layout serialization only', () => {
  const imageManager = createImageManager();
  const sourceManager = new WidgetManager(createLayer(), imageManager, {});

  const falseButton = sourceManager.create(createWidgetConfig('button', {
    text: 'Silence siren',
    commandValue: false,
    bindingId: 'siren',
    bindingMetric: 'actual_state',
    binding: { deviceId: 'siren', metric: 'actual_state' },
  }));
  const numericButton = sourceManager.create(createWidgetConfig('button', {
    y: 110,
    text: 'Valve 50%',
    commandValue: 128,
  }));
  sourceManager.syncWidgetBinding(falseButton, { deviceId: 'siren', metric: 'actual_state' });

  assert.equal(falseButton.commandValue, false);
  assert.equal(numericButton.commandValue, 128);

  const firstExport = sourceManager.exportWidgets();
  const exportedFalseButton = firstExport.find((widget) => widget.id === falseButton.id);
  const exportedNumericButton = firstExport.find((widget) => widget.id === numericButton.id);

  assert.equal(exportedFalseButton.commandValue, false);
  assert.equal(exportedNumericButton.commandValue, 128);

  const widgetBindings = sourceManager.exportBindings();
  assert.deepEqual(widgetBindings, [
    {
      widgetId: falseButton.id,
      deviceId: 'siren',
      metric: 'actual_state',
    },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(widgetBindings[0], 'commandValue'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(widgetBindings[0], 'commandType'), false);

  const importedManager = new WidgetManager(createLayer(), imageManager, {});
  importedManager.importWidgets(firstExport, imageManager);

  const secondExport = importedManager.exportWidgets();
  const reexportedFalseButton = secondExport.find((widget) => widget.id === falseButton.id);
  const reexportedNumericButton = secondExport.find((widget) => widget.id === numericButton.id);

  assert.equal(reexportedFalseButton.commandValue, false);
  assert.equal(reexportedNumericButton.commandValue, 128);
  assert.deepEqual(importedManager.exportBindings(), widgetBindings);
});

test('FileManager layout load resyncs widget counter from mixed widget ids and ignores malformed ids', async () => {
  const layer = createLayer();
  const imageManager = createImageManager();
  const widgetManager = new WidgetManager(layer, imageManager, {});
  const fileManager = new FileManager(
    {
      getLayer: () => layer,
      addGrid() {},
    },
    imageManager,
    {
      importPoints() {},
      exportPoints() {
        return [];
      },
      clear() {},
    },
    {
      importConnections() {},
      exportConnections() {
        return [];
      },
      clear() {},
    },
    widgetManager,
    null,
    {}
  );

  await fileManager.applySerializedLayout(
    {
      widgets: [
        {
          ...createWidgetConfig('number-display'),
          id: 'widget_number-display_7',
        },
        {
          ...createWidgetConfig('text-display', { y: 120, text: 'Status' }),
          id: 'widget_text-display_12',
        },
        {
          ...createWidgetConfig('button', { y: 180, text: 'Start' }),
          id: 'unexpected-id',
        },
      ],
    },
    { clearBeforeApply: false }
  );

  const nextWidget = widgetManager.create(createWidgetConfig('toggle', { y: 220 }));
  assert.equal(nextWidget.id, 'widget_toggle_13');
});
