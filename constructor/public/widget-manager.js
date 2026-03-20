// widget-manager.js
// Расчеты и управление интерактивными виджетами наслоенными на изображения.

import { createWidget } from './widget-types.js';

function normalizeMetric(metric) {
  if (typeof metric !== 'string') {
    return null;
  }
  const trimmedMetric = metric.trim();
  return trimmedMetric.length > 0 ? trimmedMetric : null;
}

function normalizeBindingPayload(binding) {
  if (!binding || typeof binding !== 'object') {
    return null;
  }

  const deviceId = typeof binding.deviceId === 'string' ? binding.deviceId : null;
  const metric = normalizeMetric(binding.metric) || 'value';
  if (!deviceId) {
    return null;
  }

  return { deviceId, metric };
}

function resolveBindingPayload(widget) {
  if (widget && widget.bindingId === null) {
    return null;
  }

  if (typeof widget.bindingId === 'string' && widget.bindingId.length > 0) {
    const fromBindingObject = normalizeBindingPayload(widget.binding);
    return {
      deviceId: widget.bindingId,
      metric:
        normalizeMetric(widget.bindingMetric) ||
        (fromBindingObject ? fromBindingObject.metric : null) ||
        'value',
    };
  }

  const fromBindingObject = normalizeBindingPayload(widget.binding);
  if (fromBindingObject) {
    return fromBindingObject;
  }

  return null;
}

export class Widget {
  constructor(config) {
    this.id = config.id;
    this.type = config.type;
    this.imageId = config.imageId;

    this.x = config.x;
    this.y = config.y;
    this.width = config.width;
    this.height = config.height;

    this.relativeX = config.relativeX || 0;
    this.relativeY = config.relativeY || 0;

    this.fontSize = config.fontSize || 14;
    this.color = config.color || '#000000';
    this.backgroundColor = config.backgroundColor || '#f5f5f5';

    this.konvaGroup = null;

    this.bindingId = config.bindingId || null;
    this.bindingMetric = normalizeMetric(config.bindingMetric) || null;
    this.binding = normalizeBindingPayload(config.binding);
  }

  /** Определение категории виджета.
   * Выход: Категория (String: 'display'|'input'|'control'|'unknown'). */
  getCategory() {
    const displayTypes = ['number-display', 'text-display', 'led', 'gauge'];
    const inputTypes = ['number-input', 'text-input'];
    const controlTypes = ['toggle', 'button', 'slider'];

    if (displayTypes.includes(this.type)) return 'display';
    if (inputTypes.includes(this.type)) return 'input';
    if (controlTypes.includes(this.type)) return 'control';
    return 'unknown';
  }

  /** Отрисовка графических примитивов виджета.
   * Вход: layer (Konva.Layer). */
  render(layer) {
    throw new Error('render() must be implemented in subclass');
  }

  /** Удаление визуальной группы элементов из памяти. */
  destroy() {
    if (this.konvaGroup) {
      this.konvaGroup.destroy();
      this.konvaGroup = null;
    }
  }
}

export class WidgetManager {
  constructor(layer, imageManager, canvasManager) {
    this.layer = layer;
    this.imageManager = imageManager;
    this.canvasManager = canvasManager;
    this.widgets = [];
    this.nextWidgetId = 1;
    this.onWidgetSelected = null; // Callback выбора виджета
    this.onWidgetDragEnd = null; // Callback окончания перемещения
  }

  /** Инициализация нового экземпляра виджета.
   * Вход: config (Object).
   * Выход: Экземпляр (Widget) или null. */
  create(config) {
    const image = this.imageManager.getImage(config.imageId);
    if (!image) {
      console.error(`Image ${config.imageId} not found`);
      return null;
    }

    const widgetId = `widget_${config.type}_${this.nextWidgetId++}`;

    // Расчет относительных координат с учетом текущего масштаба изображения
    const imgX = image.x();
    const imgY = image.y();
    const imgWidth = image.width() * image.scaleX();
    const imgHeight = image.height() * image.scaleY();

    const relativeX = (config.x - imgX) / imgWidth;
    const relativeY = (config.y - imgY) / imgHeight;

    const widget = createWidget(config.type, {
      ...config,
      id: widgetId,
      relativeX: relativeX,
      relativeY: relativeY
    });

    if (!widget) {
      console.error(`Failed to create widget of type ${config.type}`);
      return null;
    }

    widget.render(this.layer);
    this.attachDragHandlers(widget);
    this.widgets.push(widget);

    console.log(`Widget created: ${widgetId} on image ${config.imageId}`);
    return widget;
  }

  /** Удаление экземпляра виджета из памяти и состояния.
   * Вход: widgetId (String).
   * Выход: Статус выполнения (Boolean). */
  delete(widgetId) {
    const index = this.widgets.findIndex(w => w.id === widgetId);
    if (index === -1) {
      console.error(`Widget ${widgetId} not found`);
      return false;
    }

    const widget = this.widgets[index];
    widget.destroy();
    this.widgets.splice(index, 1);

    console.log(`Widget deleted: ${widgetId}`);
    return true;
  }

  /** Поиск экземпляра виджета по идентификатору.
   * Вход: widgetId (String).
   * Выход: Экземпляр (Widget) или null. */
  getWidget(widgetId) {
    return this.widgets.find(w => w.id === widgetId) || null;
  }

  /** Фильтрация виджетов по идентификатору родительского изображения.
   * Вход: imageId (String).
   * Выход: Массив экземпляров (Array). */
  getWidgetsByImageId(imageId) {
    return this.widgets.filter(w => w.imageId === imageId);
  }

  /** Расчет координат в пределах границ родительского изображения.
   * Вход: widget (Widget), x (Number), y (Number).
   * Выход: Скорректированные координаты (Object {x, y}). */
  _applyBoundaryConstraints(widget, x, y) {
    const image = this.imageManager.getImage(widget.imageId);
    if (!image) return { x, y };

    let boundedX = x;
    let boundedY = y;

    // Обеспечить что виджет полностью остается в пределах изображения
    const imgX = image.x();
    const imgY = image.y();
    const imgWidth = image.width() * image.scaleX();
    const imgHeight = image.height() * image.scaleY();

    if (boundedX < imgX) {
      boundedX = imgX;
    }
    if (boundedX + widget.width > imgX + imgWidth) {
      boundedX = imgX + imgWidth - widget.width;
    }
    if (boundedY < imgY) {
      boundedY = imgY;
    }
    if (boundedY + widget.height > imgY + imgHeight) {
      boundedY = imgY + imgHeight - widget.height;
    }

    return { x: boundedX, y: boundedY };
  }

  /** Обновление координат виджета с учетом границ.
   * Вход: widgetId (String), newX (Number), newY (Number).
   * Выход: Статус обновления (Boolean). */
  updatePosition(widgetId, newX, newY) {
    const widget = this.getWidget(widgetId);
    if (!widget) return false;

    const image = this.imageManager.getImage(widget.imageId);
    if (!image) return false;

    const bounded = this._applyBoundaryConstraints(widget, newX, newY);

    widget.x = bounded.x;
    widget.y = bounded.y;

    const imgX = image.x();
    const imgY = image.y();
    const imgWidth = image.width() * image.scaleX();
    const imgHeight = image.height() * image.scaleY();

    widget.relativeX = (bounded.x - imgX) / imgWidth;
    widget.relativeY = (bounded.y - imgY) / imgHeight;

    if (widget.konvaGroup) {
      widget.konvaGroup.x(bounded.x);
      widget.konvaGroup.y(bounded.y);
      this.layer.batchDraw();
    }

    return true;
  }

  /** Обновление габаритов виджета с учетом границ.
   * Вход: widgetId (String), newWidth (Number), newHeight (Number).
   * Выход: Статус обновления (Boolean). */
  updateSize(widgetId, newWidth, newHeight) {
    const widget = this.getWidget(widgetId);
    if (!widget) return false;

    const image = this.imageManager.getImage(widget.imageId);
    if (!image) {
      console.error(`Image ${widget.imageId} not found in updateSize`);
      return false;
    }

    const imgWidth = image.width() * image.scaleX();
    const imgHeight = image.height() * image.scaleY();

    let boundedWidth = Math.min(newWidth, imgWidth);
    let boundedHeight = Math.min(newHeight, imgHeight);

    boundedWidth = Math.max(boundedWidth, 10);
    boundedHeight = Math.max(boundedHeight, 10);

    widget.width = boundedWidth;
    widget.height = boundedHeight;

    const bounded = this._applyBoundaryConstraints(widget, widget.x, widget.y);
    widget.x = bounded.x;
    widget.y = bounded.y;

    const imgX = image.x();
    const imgY = image.y();
    widget.relativeX = (bounded.x - imgX) / imgWidth;
    widget.relativeY = (bounded.y - imgY) / imgHeight;

    widget.render(this.layer);
    this.reattachDragHandlers(widget);
    this.layer.batchDraw();

    return true;
  }

  /** Обработка смещения родительского изображения.
   * Вход: imageId (String), deltaX (Number), deltaY (Number). */
  onImageMove(imageId, deltaX, deltaY) {
    const widgets = this.getWidgetsByImageId(imageId);
    const image = this.imageManager.getImage(imageId);

    widgets.forEach(widget => {
      widget.x += deltaX;
      widget.y += deltaY;

      if (image) {
        const imgX = image.x();
        const imgY = image.y();
        const imgWidth = image.width() * image.scaleX();
        const imgHeight = image.height() * image.scaleY();
        widget.relativeX = (widget.x - imgX) / imgWidth;
        widget.relativeY = (widget.y - imgY) / imgHeight;
      }

      if (widget.konvaGroup) {
        widget.konvaGroup.x(widget.x);
        widget.konvaGroup.y(widget.y);
      }
    });

    if (widgets.length > 0) {
      this.layer.batchDraw();
    }
  }

  /** Обработка изменения габаритов родительского изображения.
   * Вход: imageId (String), newWidth (Number), newHeight (Number). */
  onImageResize(imageId, newWidth, newHeight) {
    const image = this.imageManager.getImage(imageId);
    if (!image) return;

    const widgets = this.getWidgetsByImageId(imageId);
    const imgX = image.x();
    const imgY = image.y();
    const oldWidth = image.width() * image.scaleX();
    const oldHeight = image.height() * image.scaleY();

    widgets.forEach(widget => {
      // Пересчет позиции по относительным координатам
      let newX = imgX + widget.relativeX * newWidth;
      let newY = imgY + widget.relativeY * newHeight;

      const bounded = this._applyBoundaryConstraints(widget, newX, newY);

      widget.x = bounded.x;
      widget.y = bounded.y;

      // Пропорциональное масштабирование габаритов виджета
      if (oldWidth > 0 && oldHeight > 0) {
        const scaleX = newWidth / oldWidth;
        const scaleY = newHeight / oldHeight;
        widget.width *= scaleX;
        widget.height *= scaleY;
      }

      // Актуализация относительных координат относительно новых размеров изображения
      widget.relativeX = (bounded.x - imgX) / newWidth;
      widget.relativeY = (bounded.y - imgY) / newHeight;

      if (widget.konvaGroup) {
        widget.konvaGroup.x(bounded.x);
        widget.konvaGroup.y(bounded.y);
      }
    });

    if (widgets.length > 0) {
      this.layer.batchDraw();
    }
  }

  /** Каскадное удаление всех виджетов родительского изображения.
   * Вход: imageId (String). */
  onImageDelete(imageId) {
    const widgets = this.getWidgetsByImageId(imageId);
    const widgetIds = widgets.map(w => w.id);

    widgetIds.forEach(id => this.delete(id));

    console.log(`Deleted ${widgetIds.length} widgets from image ${imageId}`);
  }

  /** Очистка массива всех виджетов приложения. */
  clear() {
    const ids = this.widgets.map(w => w.id);
    ids.forEach(id => this.delete(id));
    console.log('All widgets cleared');
  }

  syncWidgetBinding(widget, binding) {
    const normalizedBinding = normalizeBindingPayload(binding);
    if (!widget) {
      return;
    }

    if (!normalizedBinding) {
      widget.binding = null;
      widget.bindingMetric = null;
      widget.bindingId = null;
      return;
    }

    widget.binding = { ...normalizedBinding };
    widget.bindingMetric = normalizedBinding.metric;
    widget.bindingId = normalizedBinding.deviceId;
  }

  /** Экспорт конфигураций всех виджетов для сериализации мнемосхемы.
   * Выход: Массив конфигураций (Array). */
  exportWidgets() {
    return this.widgets.map(w => {
      const base = {
        id: w.id,
        type: w.type,
        imageId: w.imageId,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        relativeX: w.relativeX,
        relativeY: w.relativeY,
        fontSize: w.fontSize,
        color: w.color,
        backgroundColor: w.backgroundColor,
        borderColor: w.borderColor || '#cccccc',
        bindingId: w.bindingId || null
      };

      const binding = resolveBindingPayload(w);
      if (binding) {
        base.binding = binding;
        base.bindingMetric = binding.metric;
      } else {
        base.binding = null;
        base.bindingMetric = null;
      }

      // Display виджеты
      if (w.type === 'number-display') {
        return { ...base, decimals: w.decimals, unit: w.unit, displayValue: w.displayValue };
      }
      if (w.type === 'text-display') {
        return { ...base, text: w.text ?? '' };
      }
      if (w.type === 'led') {
        return { ...base, radius: w.radius, colorOn: w.colorOn, colorOff: w.colorOff, isOn: w.isOn };
      }

      // Input виджеты
      if (w.type === 'number-input') {
        return { ...base, min: w.min, max: w.max, step: w.step, currentValue: w.currentValue, placeholder: w.placeholder };
      }
      if (w.type === 'text-input') {
        return { ...base, maxLength: w.maxLength, pattern: w.pattern, currentValue: w.currentValue, placeholder: w.placeholder };
      }

      // Control виджеты
      if (w.type === 'toggle') {
        return { ...base, isOn: w.isOn, labelOn: w.labelOn, labelOff: w.labelOff, backgroundColorOn: w.backgroundColorOn, backgroundColorOff: w.backgroundColorOff };
      }
      if (w.type === 'button') {
        return { ...base, text: w.text };
      }
      if (w.type === 'slider') {
        return { ...base, min: w.min, max: w.max, step: w.step, value: w.value };
      }

      return base;
    });
  }

  /** Экспорт матрицы связей элементов с устройствами.
   * Выход: Массив связей (Array). */
  exportBindings() {
    return this.widgets
      .map(w => {
        const binding = resolveBindingPayload(w);
        if (!binding) {
          return null;
        }
        return {
          widgetId: w.id,
          deviceId: binding.deviceId,
          metric: binding.metric
        };
      })
      .filter(Boolean);
  }

  /** Десериализация связей и установка их к созданным виджетам.
   * Вход: bindings (Array). */
  importBindings(bindings) {
    if (!Array.isArray(bindings)) return;
    bindings.forEach(b => {
      const widgetId = b.widgetId || b.elementId;
      const widget = this.getWidget(widgetId);
      if (widget) {
        this.syncWidgetBinding(widget, {
          deviceId: b.deviceId,
          metric: b.metric
        });
      }
    });
    console.log(`Bindings imported for ${bindings.length} elements`);
  }

  /** Десериализация и инициализация виджетов из сохраненных данных.
   * Вход: widgetsData (Array), imageManager (Object). */
  importWidgets(widgetsData, imageManager) {
    if (!widgetsData || !Array.isArray(widgetsData)) {
      console.warn('importWidgets: invalid data provided');
      return;
    }

    widgetsData.forEach(data => {
      if (!imageManager.getImage(data.imageId)) {
        console.warn(`importWidgets: image ${data.imageId} not found, skipping widget`);
        return;
      }

      const widget = createWidget(data.type, data);

      if (widget) {
        if (data && typeof data === 'object') {
          const bindingFromData = normalizeBindingPayload(data.binding);
          if (bindingFromData) {
            this.syncWidgetBinding(widget, bindingFromData);
          } else if (typeof data.bindingId === 'string' && data.bindingId.length > 0) {
            this.syncWidgetBinding(widget, {
              deviceId: data.bindingId,
              metric: data.bindingMetric
            });
          } else {
            this.syncWidgetBinding(widget, null);
          }
        }

        widget.render(this.layer);
        this.attachDragHandlers(widget);
        this.widgets.push(widget);
      }
    });
    console.log(`Imported ${widgetsData.length} widgets`);
  }

  /** Привязка обработчиков перемещения и выделения к графическому узлу.
   * Вход: widget (Widget). */
  attachDragHandlers(widget) {
    if (!widget.konvaGroup) return;

    widget.konvaGroup.draggable(true);

    let startX = 0;
    let startY = 0;

    // Выделение виджета
    const clickHandler = (e) => {
      e.cancelBubble = true;
      if (this.onWidgetSelected) {
        this.onWidgetSelected(widget);
      }
    };

    const dragstartHandler = () => {
      startX = widget.x;
      startY = widget.y;
    };

    // Применение ограничений границ при ручном перемещении
    const dragmoveHandler = () => {
      const newX = widget.konvaGroup.x();
      const newY = widget.konvaGroup.y();

      const bounded = this._applyBoundaryConstraints(widget, newX, newY);

      widget.x = bounded.x;
      widget.y = bounded.y;
      widget.konvaGroup.x(bounded.x);
      widget.konvaGroup.y(bounded.y);

      const image = this.imageManager.getImage(widget.imageId);
      if (image) {
        const imgX = image.x();
        const imgY = image.y();
        const imgWidth = image.width() * image.scaleX();
        const imgHeight = image.height() * image.scaleY();
        widget.relativeX = (bounded.x - imgX) / imgWidth;
        widget.relativeY = (bounded.y - imgY) / imgHeight;
      }

      this.layer.batchDraw();
    };

    const dragendHandler = () => {
      console.log(`Widget ${widget.id} moved from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(widget.x)}, ${Math.round(widget.y)})`);
      if (this.onWidgetDragEnd) {
        this.onWidgetDragEnd(widget);
      }
    };

    // Хранение ссылок для переподключения событий
    widget._eventHandlers = {
      click: clickHandler,
      dragstart: dragstartHandler,
      dragmove: dragmoveHandler,
      dragend: dragendHandler
    };

    widget.konvaGroup.on('click', clickHandler);
    widget.konvaGroup.on('dragstart', dragstartHandler);
    widget.konvaGroup.on('dragmove', dragmoveHandler);
    widget.konvaGroup.on('dragend', dragendHandler);
  }

  /** Переподключение обработчиков событий (применяется после render).
   * Вход: widget (Widget). */
  reattachDragHandlers(widget) {
    if (!widget.konvaGroup) return;

    // Удаление предыдущих подписок
    if (widget._eventHandlers) {
      widget.konvaGroup.off('click', widget._eventHandlers.click);
      widget.konvaGroup.off('dragstart', widget._eventHandlers.dragstart);
      widget.konvaGroup.off('dragmove', widget._eventHandlers.dragmove);
      widget.konvaGroup.off('dragend', widget._eventHandlers.dragend);
    }

    // Подключение новых подписок
    this.attachDragHandlers(widget);
  }
}
