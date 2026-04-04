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
