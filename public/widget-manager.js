// widget-manager.js - Менеджер виджетов (интерактивных элементов) на изображениях

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
  
  // Креание нового виджета
  create(config) {
    const image = this.imageManager.getImage(config.imageId);
    if (!image) {
      console.error(`Image ${config.imageId} not found`);
      return null;
    }
    
    const widgetId = `widget_${config.type}_${this.nextWidgetId++}`;
    
    // Важно: относительные координаты считаем с учетом текущего масштаба изображения
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
    this.reattachDragHandlers(widget);
    this.layer.batchDraw();
    
    return true;
  }
  
  // При движении изображения - сдвинуть виджеты и обновить относительные координаты
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
  
  // При ресайзе изображения - масштабировать виджеты, обновить размер и применить граничные проверки
  onImageResize(imageId, newWidth, newHeight) {
    const image = this.imageManager.getImage(imageId);
    if (!image) return;
    
    const widgets = this.getWidgetsByImageId(imageId);
    const imgX = image.x();
    const imgY = image.y();
    const oldWidth = image.width() * image.scaleX();
    const oldHeight = image.height() * image.scaleY();
    
    widgets.forEach(widget => {
      // Пересчитать позицию по относительным координатам
      let newX = imgX + widget.relativeX * newWidth;
      let newY = imgY + widget.relativeY * newHeight;
      
      const bounded = this._applyBoundaryConstraints(widget, newX, newY);
      
      widget.x = bounded.x;
      widget.y = bounded.y;
      
      // Масштабирование размеров виджета пропорционально изменению размера изображения
      if (oldWidth > 0 && oldHeight > 0) {
        const scaleX = newWidth / oldWidth;
        const scaleY = newHeight / oldHeight;
        widget.width *= scaleX;
        widget.height *= scaleY;
      }
      
      // После граничной проверки пересчитываем относительные координаты относительно новых размеров изображения
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
      displayValue: w.displayValue,
      radius: w.radius,
      colorOn: w.colorOn,
      colorOff: w.colorOff
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
  
  // Привязать обработчики drag и click (НОВОЕ: отделено для переиспользования)
  attachDragHandlers(widget) {
    if (!widget.konvaGroup) return;
    
    widget.konvaGroup.draggable(true);
    
    let startX = 0;
    let startY = 0;

    // Обработчик клика - выбрать виджет
    const clickHandler = (e) => {
      e.cancelBubble = true;
      if (window.onWidgetSelected) {
        window.onWidgetSelected(widget);
      }
    };
    
    const dragstartHandler = () => {
      startX = widget.x;
      startY = widget.y;
    };
    
    // На dragmove енфорсим границы немедлитно
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
      if (window.onWidgetDragEnd) {
        window.onWidgetDragEnd(widget);
      }
    };
    
    // Сохранить ссылки для переприсоединения
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
  
  // Переприсоединить обработчики событий (используется после render())
  reattachDragHandlers(widget) {
    if (!widget.konvaGroup) return;
    
    // Удалить старые обработчики если они есть
    if (widget._eventHandlers) {
      widget.konvaGroup.off('click', widget._eventHandlers.click);
      widget.konvaGroup.off('dragstart', widget._eventHandlers.dragstart);
      widget.konvaGroup.off('dragmove', widget._eventHandlers.dragmove);
      widget.konvaGroup.off('dragend', widget._eventHandlers.dragend);
    }
    
    // Переприсоединить как новые
    this.attachDragHandlers(widget);
  }
}
