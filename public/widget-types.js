// widget-types.js - Определение всех типов виджетов и их рендеринг

import { DisplayWidget } from './widget-manager.js';

// Константы по умолчанию для каждого типа
export const WIDGET_DEFAULTS = {
  'number-display': {
    width: 100,
    height: 30,
    fontSize: 16,
    color: '#000000',
    backgroundColor: '#f5f5f5',
    decimals: 1,
    unit: '',
    readonly: true
  },
  'text-display': {
    width: 120,
    height: 25,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#f5f5f5',
    text: 'Label',
    readonly: true
  },
  'led': {
    width: 40,
    height: 40,
    radius: 20,
    colorOff: '#cccccc',
    colorOn: '#4caf50',
    colorBorder: '#999999',
    borderWidth: 2,
    readonly: true
  },
  'gauge': {
    width: 80,
    height: 80,
    min: 0,
    max: 100,
    unit: '',
    readonly: true
  }
};

// Числовой дисплей - показывает число с единицей измерения
export class NumberDisplayWidget extends DisplayWidget {
  constructor(config) {
    super(config);
    this.decimals = config.decimals || 1;
    this.unit = config.unit || '';
    this.displayValue = config.displayValue || 0;
  }
  
  render(layer) {
    // Удалить старую группу
    if (this.konvaGroup) {
      this.konvaGroup.destroy();
    }
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
    // Фон
    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      fill: this.backgroundColor,
      stroke: '#cccccc',
      strokeWidth: 1,
      cornerRadius: 3
    });
    
    // Форматировать число
    const formattedValue = this.displayValue.toFixed(this.decimals);
    const displayText = this.unit ? `${formattedValue} ${this.unit}` : formattedValue;
    
    // Текст
    const text = new Konva.Text({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      text: displayText,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: this.color,
      align: 'center',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(text);
    layer.add(this.konvaGroup);
  }
  
  formatValue(value) {
    return parseFloat(value).toFixed(this.decimals);
  }
}

// Текстовый дисплей - показывает текст (статус, название)
export class TextDisplayWidget extends DisplayWidget {
  constructor(config) {
    super(config);
    this.displayText = config.text || config.displayValue || 'Label';
  }
  
  render(layer) {
    if (this.konvaGroup) {
      this.konvaGroup.destroy();
    }
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
    // Фон
    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      fill: this.backgroundColor,
      stroke: '#cccccc',
      strokeWidth: 1,
      cornerRadius: 3
    });
    
    // Текст
    const text = new Konva.Text({
      x: 5,
      y: 0,
      width: this.width - 10,
      height: this.height,
      text: this.displayText,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: this.color,
      align: 'left',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(text);
    layer.add(this.konvaGroup);
  }
  
  onValueUpdate(newValue, layer) {
    this.displayText = String(newValue);
    this.render(layer);
  }
}

// Светодиод (LED) - индикатор on/off
export class LedWidget extends DisplayWidget {
  constructor(config) {
    super(config);
    this.radius = config.radius || 20;
    this.colorOn = config.colorOn || '#4caf50';
    this.colorOff = config.colorOff || '#cccccc';
    this.colorBorder = config.colorBorder || '#999999';
    this.borderWidth = config.borderWidth || 2;
    this.isOn = config.isOn || false;
  }
  
  render(layer) {
    if (this.konvaGroup) {
      this.konvaGroup.destroy();
    }
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
    // Круг LED
    const led = new Konva.Circle({
      x: this.width / 2,
      y: this.height / 2,
      radius: this.radius,
      fill: this.isOn ? this.colorOn : this.colorOff,
      stroke: this.colorBorder,
      strokeWidth: this.borderWidth
    });
    
    // Добавить эффект свечения при ON
    if (this.isOn) {
      const glow = new Konva.Circle({
        x: this.width / 2,
        y: this.height / 2,
        radius: this.radius + 3,
        fill: this.colorOn,
        opacity: 0.3
      });
      this.konvaGroup.add(glow);
    }
    
    this.konvaGroup.add(led);
    layer.add(this.konvaGroup);
  }
  
  onValueUpdate(newValue, layer) {
    this.isOn = !!newValue;
    this.render(layer);
  }
}

// Манометр (Gauge) - стрелочное отображение значения
export class GaugeWidget extends DisplayWidget {
  constructor(config) {
    super(config);
    this.min = config.min || 0;
    this.max = config.max || 100;
    this.unit = config.unit || '';
    this.displayValue = config.displayValue || this.min;
  }
  
  render(layer) {
    if (this.konvaGroup) {
      this.konvaGroup.destroy();
    }
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.min(this.width, this.height) / 2 - 5;
    
    // Фоновый круг
    const background = new Konva.Circle({
      x: centerX,
      y: centerY,
      radius: radius,
      fill: '#f5f5f5',
      stroke: '#cccccc',
      strokeWidth: 2
    });
    
    // Дуга шкалы (180° от -90° до 90°)
    const arc = new Konva.Arc({
      x: centerX,
      y: centerY,
      innerRadius: radius - 8,
      outerRadius: radius - 2,
      angle: 180,
      rotation: -90,
      fill: '#e0e0e0'
    });
    
    // Рассчитать угол стрелки
    const normalizedValue = (this.displayValue - this.min) / (this.max - this.min);
    const angle = -90 + normalizedValue * 180; // от -90° до 90°
    const angleRad = (angle * Math.PI) / 180;
    
    // Стрелка
    const needleLength = radius - 10;
    const needleEndX = centerX + needleLength * Math.cos(angleRad);
    const needleEndY = centerY + needleLength * Math.sin(angleRad);
    
    const needle = new Konva.Line({
      points: [centerX, centerY, needleEndX, needleEndY],
      stroke: '#d32f2f',
      strokeWidth: 2,
      lineCap: 'round'
    });
    
    // Центральная точка
    const centerDot = new Konva.Circle({
      x: centerX,
      y: centerY,
      radius: 4,
      fill: '#333'
    });
    
    // Текст значения
    const displayText = this.unit ? `${this.displayValue.toFixed(0)} ${this.unit}` : this.displayValue.toFixed(0);
    const valueText = new Konva.Text({
      x: 0,
      y: centerY + radius - 15,
      width: this.width,
      text: displayText,
      fontSize: 10,
      fontFamily: 'Arial',
      fill: '#333',
      align: 'center'
    });
    
    // Мин/Макс метки
    const minText = new Konva.Text({
      x: 5,
      y: centerY + 5,
      text: String(this.min),
      fontSize: 8,
      fill: '#666'
    });
    
    const maxText = new Konva.Text({
      x: this.width - 20,
      y: centerY + 5,
      text: String(this.max),
      fontSize: 8,
      fill: '#666'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(arc);
    this.konvaGroup.add(needle);
    this.konvaGroup.add(centerDot);
    this.konvaGroup.add(valueText);
    this.konvaGroup.add(minText);
    this.konvaGroup.add(maxText);
    layer.add(this.konvaGroup);
  }
}

// Фабрика для создания виджетов по типу
export function createWidget(type, config) {
  const defaults = WIDGET_DEFAULTS[type];
  if (!defaults) {
    console.error(`Unknown widget type: ${type}`);
    return null;
  }
  
  const finalConfig = { ...defaults, ...config };
  
  switch(type) {
    case 'number-display':
      return new NumberDisplayWidget(finalConfig);
    case 'text-display':
      return new TextDisplayWidget(finalConfig);
    case 'led':
      return new LedWidget(finalConfig);
    case 'gauge':
      return new GaugeWidget(finalConfig);
    default:
      console.error(`Unsupported widget type: ${type}`);
      return null;
  }
}
