// widget-manager.js - Управление виджетами (интерактивными элементами) на изображениях

import { createWidget } from './widget-types.js';

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
  }
  
  getCategory() {
    const displayTypes = ['number-display', 'text-display', 'led', 'gauge'];
    const inputTypes = ['number-input', 'text-input'];
    const controlTypes = ['toggle', 'button', 'slider'];
    
    if (displayTypes.includes(this.type)) return 'display';
    if (inputTypes.includes(this.type)) return 'input';
    if (controlTypes.includes(this.type)) return 'control';
    return 'unknown';
  }
  
  render(layer) {
    throw new Error('render() must be implemented in subclass');
  }
  
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
  }
  
  // Создание нового виджета
  create(config) {
    const image = this.imageManager.getImage(config.imageId);
    if (!image) {
      console.error(`Image ${config.imageId} not found`);
      return null;
    }
    
    const widgetId = `widget_${config.type}_${this.nextWidgetId++}`;
    
    const relativeX = (config.x - image.x) / image.width;
    const relativeY = (config.y - image.y) / image.height;
    
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
  
  // Удаление виджета
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
  
  // Получить виджет по ID
  getWidget(widgetId) {
    return this.widgets.find(w => w.id === widgetId) || null;
  }
  
  // Все виджеты на конкретном изображении
  getWidgetsByImageId(imageId) {
    return this.widgets.filter(w => w.imageId === imageId);
  }
  
  // Применить граничные проверки к координатам
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
  
  // Обновление позиции с граничными проверками
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
  
  // Обновление размера
  updateSize(widgetId, newWidth, newHeight) {
    const widget = this.getWidget(widgetId);
    if (!widget) return false;
    
    const image = this.imageManager.getImage(widget.imageId);
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
    const imgX = image.x();
    const imgY = image.y();
    
    widgets.forEach(widget => {
      let newX = imgX + widget.relativeX * newWidth;
      let newY = imgY + widget.relativeY * newHeight;
      
      const bounded = this._applyBoundaryConstraints(widget, newX, newY);
      
      widget.x = bounded.x;
      widget.y = bounded.y;
      
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
      if (!this.imageManager.getImage(data.imageId)) return;
      
      const widget = createWidget(data.type, data);
      
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
    
    // На dragmove енфорсим границы емедлитно, а не после
    widget.konvaGroup.on('dragmove', () => {
      const newX = widget.konvaGroup.x();
      const newY = widget.konvaGroup.y();
      
      // Применяем границы и сразу наставляем позицию
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
    });
    
    widget.konvaGroup.on('dragend', () => {
      console.log(`Widget ${widget.id} moved from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(widget.x)}, ${Math.round(widget.y)})`);
    });
  }
}
