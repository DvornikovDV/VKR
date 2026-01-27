// widget-types.js - Определение всех типов виджетов и их рендеринг

// Базовый класс для Display виджетов (read-only)
export class DisplayWidget {
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
    this.isReadOnly = true;
    this.displayValue = config.displayValue || null;
  }
  
  getCategory() {
    const displayTypes = ['number-display', 'text-display', 'led', 'gauge'];
    return 'display';
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
  
  onValueUpdate(newValue, layer) {
    this.displayValue = newValue;
    this.render(layer);
  }
  
  formatValue(value) {
    return value;
  }
}

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
    width: 120,
    height: 120,
    min: 0,
    max: 100,
    unit: '',
    readonly: true
  }
};

// Общая функция валидации и санитизации числовых значений
function validateNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

// Числовой дисплей - показывает число с единицей измерения
export class NumberDisplayWidget extends DisplayWidget {
  constructor(config) {
    super(config);
    this.decimals = config.decimals || 1;
    this.unit = config.unit || '';
    this.displayValue = validateNumber(config.displayValue, 0);
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
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
    
    // Валидируем значение перед toFixed
    const value = validateNumber(this.displayValue, 0);
    const formattedValue = value.toFixed(this.decimals);
    const displayText = this.unit ? `${formattedValue} ${this.unit}` : formattedValue;
    
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
}

// Текстовый дисплей - показывает текст (статус, название)
export class TextDisplayWidget extends DisplayWidget {
  constructor(config) {
    super(config);
    const raw = config.text ?? config.displayValue ?? 'Label';
    this.displayText = String(raw);
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
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
    this.displayText = String(newValue ?? '');
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
    this.isOn = Boolean(config.isOn ?? false);
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
    const led = new Konva.Circle({
      x: this.width / 2,
      y: this.height / 2,
      radius: this.radius,
      fill: this.isOn ? this.colorOn : this.colorOff,
      stroke: this.colorBorder,
      strokeWidth: this.borderWidth
    });
    
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
    this.isOn = Boolean(newValue);
    this.render(layer);
  }
}

// Манометр (Gauge) - стрелочное отображение значения (ПЕРЕДЕЛАНА ВЕРСТКА)
export class GaugeWidget extends DisplayWidget {
  constructor(config) {
    super(config);
    this.min = validateNumber(config.min, 0);
    this.max = validateNumber(config.max, 100);
    if (this.max <= this.min) this.max = this.min + 1;
    this.unit = config.unit || '';
    this.displayValue = validateNumber(config.displayValue, this.min);
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    
    const cX = this.width / 2;
    const cY = this.height / 2;
    const r = (Math.min(this.width, this.height) / 2) - 8;
    
    // 1. Белый фон
    const bg = new Konva.Circle({
      x: cX,
      y: cY,
      radius: r,
      fill: '#ffffff',
      stroke: '#333333',
      strokeWidth: 2
    });
    
    // 2. Шкала (полукольцо внешнее)
    const scale = new Konva.Arc({
      x: cX,
      y: cY,
      innerRadius: r - 10,
      outerRadius: r - 2,
      angle: 180,
      rotation: -90,
      fill: '#d0d0d0'
    });
    
    // 3. Стрелка
    const val = validateNumber(this.displayValue, this.min);
    let norm = 0;
    if (this.max > this.min) norm = (val - this.min) / (this.max - this.min);
    norm = Math.max(0, Math.min(1, norm));
    
    const angle = -90 + norm * 180;
    const rad = (angle * Math.PI) / 180;
    const needleLen = r * 0.7;
    const nX = cX + needleLen * Math.cos(rad);
    const nY = cY + needleLen * Math.sin(rad);
    
    const needle = new Konva.Line({
      points: [cX, cY, nX, nY],
      stroke: '#d32f2f',
      strokeWidth: 3,
      lineCap: 'round'
    });
    
    // 4. Центр
    const dot = new Konva.Circle({
      x: cX,
      y: cY,
      radius: 5,
      fill: '#333333'
    });
    
    // 5. Значение в центре
    const dispVal = val.toFixed(0);
    const dispTxt = this.unit ? `${dispVal}${this.unit}` : dispVal;
    const valText = new Konva.Text({
      x: cX - 30,
      y: cY - 5,
      width: 60,
      text: dispTxt,
      fontSize: 12,
      fontFamily: 'Arial',
      fill: '#333',
      align: 'center',
      fontWeight: 'bold'
    });
    
    // 6. Min - на шкале слева
    const minAngleRad = (-90 * Math.PI) / 180;
    const minR = r - 16;
    const minX = cX + minR * Math.cos(minAngleRad);
    const minY = cY + minR * Math.sin(minAngleRad);
    const minTxt = new Konva.Text({
      x: minX - 10,
      y: minY - 4,
      width: 20,
      text: String(this.min),
      fontSize: 8,
      fontFamily: 'Arial',
      fill: '#666',
      align: 'center'
    });
    
    // 7. Max - на шкале справа
    const maxAngleRad = (90 * Math.PI) / 180;
    const maxR = r - 16;
    const maxX = cX + maxR * Math.cos(maxAngleRad);
    const maxY = cY + maxR * Math.sin(maxAngleRad);
    const maxTxt = new Konva.Text({
      x: maxX - 10,
      y: maxY - 4,
      width: 20,
      text: String(this.max),
      fontSize: 8,
      fontFamily: 'Arial',
      fill: '#666',
      align: 'center'
    });
    
    // Слои: фон → шкала → min/max → стрелка → центр → значение
    this.konvaGroup.add(bg);
    this.konvaGroup.add(scale);
    this.konvaGroup.add(minTxt);
    this.konvaGroup.add(maxTxt);
    this.konvaGroup.add(needle);
    this.konvaGroup.add(dot);
    this.konvaGroup.add(valText);
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
