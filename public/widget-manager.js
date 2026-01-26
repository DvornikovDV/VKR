// widget-manager.js - Управление виджетами (интерактивными элементами) на изображениях

import { createWidget } from './widget-types.js';

export class Widget {
  constructor(config) {
    this.id = config.id;
    this.type = config.type;  // 'number-display', 'text-display', 'led', 'gauge'
    this.imageId = config.imageId;
    
    this.x = config.x;
    this.y = config.y;
    this.width = config.width;
    this.height = config.height;
    
    // Относительные координаты для масштабирования
    this.relativeX = config.relativeX || 0;
    this.relativeY = config.relativeY || 0;
    
    // Параметры оформления
    this.fontSize = config.fontSize || 14;
    this.color = config.color || '#000000';
    this.backgroundColor = config.backgroundColor || '#f5f5f5';
    
    // Konva группа (будет создана при render)
    this.konvaGroup = null;
    
    // Привязка к устройству
    this.bindingId = config.bindingId || null;
  }
  
  // Категория виджета (display/input/control)
  getCategory() {
    const displayTypes = ['number-display', 'text-display', 'led', 'gauge'];
    const inputTypes = ['number-input', 'text-input'];
    const controlTypes = ['toggle', 'button', 'slider'];
    
    if (displayTypes.includes(this.type)) return 'display';
    if (inputTypes.includes(this.type)) return 'input';
    if (controlTypes.includes(this.type)) return 'control';
    return 'unknown';
  }
  
  // Отрисовка виджета (переопределяется в подклассах)
  render(layer) {
    throw new Error('render() must be implemented in subclass');
  }
  
  // Удаление из Konva
  destroy() {
    if (this.konvaGroup) {
      this.konvaGroup.destroy();
      this.konvaGroup = null;
    }
  }
}

// Базовый класс для Display виджетов (read-only)
export class DisplayWidget extends Widget {
  constructor(config) {
    super(config);
    this.isReadOnly = true;
    this.displayValue = config.displayValue || null;
  }
  
  // Обновление значения (от устройства)
  onValueUpdate(newValue, layer) {
    this.displayValue = newValue;
    this.render(layer);
  }
  
  // Валидация и форматирование значения
  formatValue(value) {
    return value;
  }
}

export class WidgetManager {
  constructor(layer, imageManager, canvasManager) {
    this.layer = layer;
    this.imageManager = imageManager;
    this.canvasManager = canvasManager;
    this.widgets = [];  // массив всех виджетов
    this.nextWidgetId = 1;
  }
  
  // Создание нового виджета
  create(config) {
    const image = this.imageManager.getImage(config.imageId);
    if (!image) {
      console.error(`Image ${config.imageId} not found`);
      return null;
    }
    
    // Генерировать ID
    const widgetId = `widget_${config.type}_${this.nextWidgetId++}`;
    
    // Рассчитать относительные координаты
    const relativeX = (config.x - image.x) / image.width;
    const relativeY = (config.y - image.y) / image.height;
    
    // Создать виджет через фабрику
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
    
    // Отрисовать на слое
    widget.render(this.layer);
    
    // Привязать обработчики drag
    this.attachDragHandlers(widget);
    
    // Добавить в массив
    this.widgets.push(widget);
    
    console.log(`Widget created: ${widgetId} on image ${config.imageId}`);
    return widget;
  }
  
  // Удаление виджета
  delete(widgetId) {
    const index = this.widgets.findIndex(w => w.id === widgetId);
    if (index === -1) {
      console.error(`Widget ${widgetId} not found`);
      return false;
    }
    
    const widget = this.widgets[index];
    
    // Удалить из Konva
    widget.destroy();
    
    // Удалить из массива
    this.widgets.splice(index, 1);
    
    console.log(`Widget deleted: ${widgetId}`);
    return true;
  }
  
  // Получить виджет по ID
  getWidget(widgetId) {
    return this.widgets.find(w => w.id === widgetId) || null;
  }
  
  // Все виджеты на конкретном изображении
  getWidgetsByImageId(imageId) {
    return this.widgets.filter(w => w.imageId === imageId);
  }
  
  // Применить граничные проверки к координатам (переиспользуемый метод)
  _applyBoundaryConstraints(widget, x, y) {
    const image = this.imageManager.getImage(widget.imageId);
    if (!image) return { x, y };
    
    let boundedX = x;
    let boundedY = y;
    
    // Левая граница
    if (boundedX < image.x) {
      boundedX = image.x;
    }
    // Правая граница
    if (boundedX + widget.width > image.x + image.width) {
      boundedX = image.x + image.width - widget.width;
    }
    // Верхняя граница
    if (boundedY < image.y) {
      boundedY = image.y;
    }
    // Нижняя граница
    if (boundedY + widget.height > image.y + image.height) {
      boundedY = image.y + image.height - widget.height;
    }
    
    return { x: boundedX, y: boundedY };
  }
  
  // Обновление позиции с граничными проверками
  updatePosition(widgetId, newX, newY) {
    const widget = this.getWidget(widgetId);
    if (!widget) return false;
    
    const image = this.imageManager.getImage(widget.imageId);
    if (!image) return false;
    
    // Применить граничные проверки
    const bounded = this._applyBoundaryConstraints(widget, newX, newY);
    
    // Обновить координаты
    widget.x = bounded.x;
    widget.y = bounded.y;
    
    // Пересчитать относительные координаты
    widget.relativeX = (bounded.x - image.x) / image.width;
    widget.relativeY = (bounded.y - image.y) / image.height;
    
    // Обновить на canvas
    if (widget.konvaGroup) {
      widget.konvaGroup.x(bounded.x);
      widget.konvaGroup.y(bounded.y);
      this.layer.batchDraw();
    }
    
    return true;
  }
  
  // Обновление размера (применяет граничные проверки после изменения размера)
  updateSize(widgetId, newWidth, newHeight) {
    const widget = this.getWidget(widgetId);
    if (!widget) return false;
    
    // Ограничить размер
    let boundedWidth = Math.min(newWidth, this.imageManager.getImage(widget.imageId)?.width || newWidth);
    let boundedHeight = Math.min(newHeight, this.imageManager.getImage(widget.imageId)?.height || newHeight);
    
    // Минимальный размер
    boundedWidth = Math.max(boundedWidth, 10);
    boundedHeight = Math.max(boundedHeight, 10);
    
    widget.width = boundedWidth;
    widget.height = boundedHeight;
    
    // После изменения размера проверить позицию
    const bounded = this._applyBoundaryConstraints(widget, widget.x, widget.y);
    widget.x = bounded.x;
    widget.y = bounded.y;
    
    // Обновить относительные координаты
    const image = this.imageManager.getImage(widget.imageId);
    if (image) {
      widget.relativeX = (bounded.x - image.x) / image.width;
      widget.relativeY = (bounded.y - image.y) / image.height;
    }
    
    // Перерисовать
    widget.render(this.layer);
    this.layer.batchDraw();
    
    return true;
  }
  
  // При движении изображения - сдвинуть виджеты
  onImageMove(imageId, deltaX, deltaY) {
    const widgets = this.getWidgetsByImageId(imageId);
    
    widgets.forEach(widget => {
      widget.x += deltaX;
      widget.y += deltaY;
      
      if (widget.konvaGroup) {
        widget.konvaGroup.x(widget.x);
        widget.konvaGroup.y(widget.y);
      }
    });
    
    if (widgets.length > 0) {
      this.layer.batchDraw();
    }
  }
  
  // При ресайзе изображения - масштабировать виджеты и применить граничные проверки
  onImageResize(imageId, newWidth, newHeight) {
    const image = this.imageManager.getImage(imageId);
    if (!image) return;
    
    const widgets = this.getWidgetsByImageId(imageId);
    
    widgets.forEach(widget => {
      // Пересчитать позицию по относительным координатам
      let newX = image.x + widget.relativeX * newWidth;
      let newY = image.y + widget.relativeY * newHeight;
      
      // ПРИМЕНИТЬ граничные проверки (переиспользование)
      const bounded = this._applyBoundaryConstraints(widget, newX, newY);
      
      widget.x = bounded.x;
      widget.y = bounded.y;
      
      // Обновить относительные координаты с учётом граничных проверок
      widget.relativeX = (bounded.x - image.x) / newWidth;
      widget.relativeY = (bounded.y - image.y) / newHeight;
      
      if (widget.konvaGroup) {
        widget.konvaGroup.x(bounded.x);
        widget.konvaGroup.y(bounded.y);
      }
    });
    
    if (widgets.length > 0) {
      this.layer.batchDraw();
    }
  }
  
  // При удалении изображения - удалить виджеты
  onImageDelete(imageId) {
    const widgets = this.getWidgetsByImageId(imageId);
    const widgetIds = widgets.map(w => w.id);
    
    widgetIds.forEach(id => this.delete(id));
    
    console.log(`Deleted ${widgetIds.length} widgets from image ${imageId}`);
  }
  
  // Очистить все виджеты
  clear() {
    const ids = this.widgets.map(w => w.id);
    ids.forEach(id => this.delete(id));
    console.log('All widgets cleared');
  }
  
  // Экспорт виджетов для сохранения
  exportWidgets() {
    return this.widgets.map(w => ({
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
      bindingId: w.bindingId,
      displayValue: w.displayValue
    }));
  }
  
  // Импорт виджетов из сохраненных данных
  importWidgets(widgetsData) {
    widgetsData.forEach(data => {
      // Проверить, что носитель существует
      if (!this.imageManager.getImage(data.imageId)) return;
      
      const widget = createWidget(data.type, {
        ...data,
        x: data.x,
        y: data.y
      });
      
      if (widget) {
        widget.render(this.layer);
        this.attachDragHandlers(widget);
        this.widgets.push(widget);
      }
    });
    console.log(`Imported ${widgetsData.length} widgets`);
  }
  
  // Привязать обработчики drag'а
  attachDragHandlers(widget) {
    if (!widget.konvaGroup) return;
    
    widget.konvaGroup.draggable(true);
    
    let startX = 0;
    let startY = 0;
    
    widget.konvaGroup.on('dragstart', () => {
      startX = widget.x;
      startY = widget.y;
    });
    
    widget.konvaGroup.on('dragmove', () => {
      const newX = widget.konvaGroup.x();
      const newY = widget.konvaGroup.y();
      
      // Применить граничные проверки
      this.updatePosition(widget.id, newX, newY);
    });
    
    widget.konvaGroup.on('dragend', () => {
      console.log(`Widget ${widget.id} moved from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(widget.x)}, ${Math.round(widget.y)})`);
    });
  }
}
