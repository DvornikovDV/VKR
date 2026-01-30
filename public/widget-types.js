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
    return 'display';
  }
  
  render(layer) {
    throw new Error('render() must be implemented in subclass');
  }
  
  destroy() {
    if (this.konvaGroup) { this.konvaGroup.destroy(); this.konvaGroup = null; }
  }
  
  onValueUpdate(newValue, layer) {
    this.displayValue = newValue;
    this.render(layer);
  }
  
  formatValue(value) {
    return value;
  }
  
  // Вспомогательный метод для рендеринга прямоугольного виджета с текстом
  renderRectWithText(layer, displayText, textConfig = {}) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({ x: this.x, y: this.y, width: this.width, height: this.height });
    
    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      fill: this.backgroundColor,
      stroke: this.borderColor,
      strokeWidth: textConfig.strokeWidth || 1,
      cornerRadius: 3
    });
    
    const text = new Konva.Text({
      x: textConfig.x || 0,
      y: 0,
      width: (textConfig.width !== undefined) ? textConfig.width : this.width,
      height: this.height,
      text: displayText,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: textConfig.fill || this.color,
      align: textConfig.align || 'center',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(text);
    layer.add(this.konvaGroup);
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
    if (this.konvaGroup) { this.konvaGroup.destroy(); this.konvaGroup = null; }
  }
  
  validate(value) {
    throw new Error('validate() must be implemented in subclass');
  }
  
  setValue(value) {
    if (this.validate(value)) { this.currentValue = value; return true; }
    return false;
  }
  
  // Вспомогательный метод для Input виджетов
  renderRectWithText(layer, displayText, textFill) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({ x: this.x, y: this.y, width: this.width, height: this.height });
    
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
    
    const text = new Konva.Text({
      x: 5,
      y: 0,
      width: this.width - 10,
      height: this.height,
      text: displayText,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: textFill,
      align: 'right',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(text);
    layer.add(this.konvaGroup);
  }
}

// Новый базовый класс для Control виджетов (toggle, button, slider)
export class ControlWidget {
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
    this.borderColor = config.borderColor || '#999999';
    
    this.konvaGroup = null;
    this.bindingId = config.bindingId || null;
    this.isReadOnly = false;
  }
  
  getCategory() {
    return 'control';
  }
  
  render(layer) { throw new Error('render() must be implemented in subclass'); }
  
  destroy() { if (this.konvaGroup) { this.konvaGroup.destroy(); this.konvaGroup = null; } }
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
  },
  'toggle': {
    width: 60,
    height: 26,
    fontSize: 12,
    color: '#ffffff',
    backgroundColorOn: '#4caf50',
    backgroundColorOff: '#cccccc',
    borderColor: '#999999',
    labelOn: 'ON',
    labelOff: 'OFF',
    isOn: false,
    readonly: false
  },
  'button': {
    width: 100,
    height: 32,
    fontSize: 14,
    color: '#ffffff',
    backgroundColor: '#007bff',
    borderColor: '#0056b3',
    text: 'Button',
    readonly: false
  },
  'slider': {
    width: 140,
    height: 30,
    fontSize: 12,
    color: '#000000',
    backgroundColor: '#e8e8e8',
    borderColor: '#999999',
    min: 0,
    max: 100,
    step: 1,
    value: 50,
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
    const value = validateNumber(this.displayValue, 0);
    const formattedValue = value.toFixed(this.decimals);
    const displayText = this.unit ? `${formattedValue} ${this.unit}` : formattedValue;
    this.renderRectWithText(layer, displayText);
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
    this.renderRectWithText(layer, this.displayText, { x: 5, width: this.width - 10, align: 'left' });
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
    this.isOn = Boolean(config.isOn ?? false);
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({ x: this.x, y: this.y, width: this.width, height: this.height });
    
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
    const displayText = this.currentValue !== null ? String(this.currentValue) : this.placeholder;
    const textFill = this.currentValue !== null ? this.color : '#999999';
    this.renderRectWithText(layer, displayText, textFill);
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
    const displayText = this.currentValue ? String(this.currentValue) : this.placeholder;
    const textFill = this.currentValue ? this.color : '#999999';
    this.renderRectWithText(layer, displayText, textFill);
  }
}

// Toggle - переключатель ON/OFF
export class ToggleWidget extends ControlWidget {
  constructor(config) {
    super(config);
    this.isOn = Boolean(config.isOn ?? false);
    this.labelOn = config.labelOn || 'ON';
    this.labelOff = config.labelOff || 'OFF';
    this.backgroundColorOn = config.backgroundColorOn || '#4caf50';
    this.backgroundColorOff = config.backgroundColorOff || '#cccccc';
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({ x: this.x, y: this.y, width: this.width, height: this.height });
    
    const track = new Konva.Rect({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      fill: this.isOn ? this.backgroundColorOn : this.backgroundColorOff,
      cornerRadius: this.height / 2,
      stroke: this.borderColor,
      strokeWidth: 1
    });
    
    const knobRadius = (this.height / 2) - 2;
    const knob = new Konva.Circle({
      x: this.isOn ? this.width - knobRadius - 2 : knobRadius + 2,
      y: this.height / 2,
      radius: knobRadius,
      fill: '#ffffff',
      stroke: this.borderColor,
      strokeWidth: 1
    });
    
    const label = new Konva.Text({
      x: 4,
      y: 0,
      width: this.width - 8,
      height: this.height,
      text: this.isOn ? this.labelOn : this.labelOff,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: '#ffffff',
      align: 'center',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(track);
    this.konvaGroup.add(knob);
    this.konvaGroup.add(label);
    layer.add(this.konvaGroup);
  }
}

// Button - простая кнопка с текстом
export class ButtonWidget extends ControlWidget {
  constructor(config) {
    super(config);
    this.text = config.text || 'Button';
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({ x: this.x, y: this.y, width: this.width, height: this.height });
    
    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      fill: this.backgroundColor,
      stroke: this.borderColor,
      strokeWidth: 1,
      cornerRadius: 4
    });
    
    const label = new Konva.Text({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      text: this.text,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: this.color,
      align: 'center',
      verticalAlign: 'middle'
    });
    
    this.konvaGroup.add(background);
    this.konvaGroup.add(label);
    layer.add(this.konvaGroup);
  }
}

// Slider - ползунок с диапазоном
export class SliderWidget extends ControlWidget {
  constructor(config) {
    super(config);
    this.min = validateNumber(config.min, 0);
    this.max = validateNumber(config.max, 100);
    this.step = validateNumber(config.step, 1);
    this.value = validateNumber(config.value, (this.min + this.max) / 2);
  }
  
  _clampValue(value) {
    let v = validateNumber(value, this.min);
    if (v < this.min) v = this.min;
    if (v > this.max) v = this.max;
    if (this.step > 0) {
      v = Math.round((v - this.min) / this.step) * this.step + this.min;
    }
    return v;
  }
  
  setValue(value) {
    this.value = this._clampValue(value);
  }
  
  render(layer) {
    if (this.konvaGroup) this.konvaGroup.destroy();
    
    this.konvaGroup = new Konva.Group({ x: this.x, y: this.y, width: this.width, height: this.height });
    
    const trackY = this.height / 2;
    const track = new Konva.Rect({
      x: 0,
      y: trackY - 3,
      width: this.width,
      height: 6,
      fill: this.backgroundColor,
      cornerRadius: 3,
      stroke: this.borderColor,
      strokeWidth: 1
    });
    
    const ratio = (this._clampValue(this.value) - this.min) / (this.max - this.min || 1);
    const knobX = 4 + ratio * (this.width - 8);
    const knob = new Konva.Circle({
      x: knobX,
      y: trackY,
      radius: 7,
      fill: '#ffffff',
      stroke: this.borderColor,
      strokeWidth: 1
    });
    
    const textValue = String(this._clampValue(this.value));
    const textMetrics = { width: textValue.length * 8 + 4, height: 20 };
    
    // Белый фон-подложка под текстом значения (увеличена высота, поднято выше)
    const valueBg = new Konva.Rect({
      x: (this.width - textMetrics.width) / 2,
      y: -4,
      width: textMetrics.width,
      height: textMetrics.height,
      fill: '#ffffff',
      cornerRadius: 2,
      opacity: 0.9
    });
    
    const valueText = new Konva.Text({
      x: 0,
      y: -3,
      width: this.width,
      height: this.height / 2,
      text: textValue,
      fontSize: this.fontSize,
      fontFamily: 'Arial',
      fill: this.color,
      align: 'center',
      verticalAlign: 'top'
    });
    
    this.konvaGroup.add(track);
    this.konvaGroup.add(valueBg);
    this.konvaGroup.add(valueText);
    this.konvaGroup.add(knob);
    layer.add(this.konvaGroup);
  }
}

// Фабрика для создания виджетов по типу
export function createWidget(type, config) {
  const defaults = WIDGET_DEFAULTS[type];
  if (!defaults) { console.error(`Unknown widget type: ${type}`); return null; }
  
  const finalConfig = { ...defaults, ...config };
  
  switch(type) {
    case 'number-display': return new NumberDisplayWidget(finalConfig);
    case 'text-display': return new TextDisplayWidget(finalConfig);
    case 'led': return new LedWidget(finalConfig);
    case 'number-input': return new NumberInputWidget(finalConfig);
    case 'text-input': return new TextInputWidget(finalConfig);
    case 'toggle': return new ToggleWidget(finalConfig);
    case 'button': return new ButtonWidget(finalConfig);
    case 'slider': return new SliderWidget(finalConfig);
    default:
      console.error(`Unsupported widget type: ${type}`);
      return null;
  }
}
