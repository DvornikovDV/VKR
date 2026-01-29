// widget-types.js - Определение всех типов виджетов и их рендеринг

// ПЛАНИРУЕМЫЙ НАБОР ВИДЖЕТОВ:
// Display типы:
//   - number-display (текущий) - показывает число с единицей
//   - text-display (текущий) - показывает текст
//   - led (текущий) - индикатор on/off
//   - gauge (ОТЛОЖЕН) - стрелочный манометр (требует рефакторинга)
//   - chart-display (будущее) - простой график
// Input типы (Iteration 3):
//   - number-input - число с валидацией min/max/step
//   - text-input - текстовое поле с валидацией pattern/maxLength
// Control типы (Iteration 4):
//   - toggle - переключатель
//   - button - кнопка управления
//   - slider - ползунок

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
    this.borderColor = config.borderColor || '#cccccc';
    
    this.konvaGroup = null;
    
    this.bindingId = config.bindingId || null;
    this.isReadOnly = true;
    this.displayValue = config.displayValue || null;
  }
  
  getCategory() {
    const displayTypes = ['number-display', 'text-display', 'led'];
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

// Базовый класс для Input виджетов (для ввода данных)
export class InputWidget {
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
    this.backgroundColor = config.backgroundColor || '#ffffff';
    this.borderColor = config.borderColor || '#cccccc';
    
    this.konvaGroup = null;
    
    this.bindingId = config.bindingId || null;
    this.isReadOnly = false;
    this.currentValue = config.currentValue || null;
    this.placeholder = config.placeholder || '';
  }
  
  getCategory() {
    return 'input';
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
  
  validate(value) {
    throw new Error('validate() must be implemented in subclass');
  }
  
  setValue(value) {
    if (this.validate(value)) {
      this.currentValue = value;
      return true;
    }
    return false;
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
    borderColor: '#cccccc',
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
    borderColor: '#cccccc',
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
    borderColor: '#999999',
    borderWidth: 2,
    readonly: true
  },
  'number-input': {
    width: 100,
    height: 30,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#ffffff',
    borderColor: '#999999',
    min: 0,
    max: 100,
    step: 1,
    readonly: false
  },
  'text-input': {
    width: 150,
    height: 30,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#ffffff',
    borderColor: '#999999',
    maxLength: 50,
    pattern: '.*',
    placeholder: 'Ввод текста',
    readonly: false
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
      stroke: this.borderColor,
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
      stroke: this.borderColor,
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
    // Используем borderColor из DisplayWidget базовый класс
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
      stroke: this.borderColor,
      strokeWidth: 2
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

// Числовое поле ввода - с валидацией min/max/step
export class NumberInputWidget extends InputWidget {
  constructor(config) {
    super(config);
    this.min = validateNumber(config.min, 0);
    this.max = validateNumber(config.max, 100);
    this.step = validateNumber(config.step, 1);
    this.currentValue = validateNumber(config.currentValue, this.min);
  }
  
  validate(value) {
    const num = validateNumber(value);
    return num >= this.min && num <= this.max;
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
      stroke: this.borderColor,
      strokeWidth: 2,
      cornerRadius: 3
    });
    
    const displayText = this.currentValue !== null ? String(this.currentValue) : this.placeholder;
    
    const text = new Konva.Text({
      x: 5,
      y: 0,
      width: this.width - 10,
      height: this.height,
      text: displayText,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: this.currentValue !== null ? this.color : '#999999',
      align: 'right',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(text);
    layer.add(this.konvaGroup);
  }
}

// Текстовое поле ввода - с валидацией pattern и maxLength
export class TextInputWidget extends InputWidget {
  constructor(config) {
    super(config);
    this.maxLength = config.maxLength || 50;
    this.pattern = config.pattern || '.*';
    this.currentValue = config.currentValue || '';
    this.placeholder = config.placeholder || 'Ввод текста';
  }
  
  validate(value) {
    if (!value) return true;
    const str = String(value);
    if (str.length > this.maxLength) return false;
    const regex = new RegExp(`^${this.pattern}$`);
    return regex.test(str);
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
      stroke: this.borderColor,
      strokeWidth: 2,
      cornerRadius: 3
    });
    
    const displayText = this.currentValue ? String(this.currentValue) : this.placeholder;
    
    const text = new Konva.Text({
      x: 5,
      y: 0,
      width: this.width - 10,
      height: this.height,
      text: displayText,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: this.currentValue ? this.color : '#999999',
      align: 'left',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(text);
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
    case 'number-input':
      return new NumberInputWidget(finalConfig);
    case 'text-input':
      return new TextInputWidget(finalConfig);
    default:
      console.error(`Unsupported widget type: ${type}`);
      return null;
  }
}
