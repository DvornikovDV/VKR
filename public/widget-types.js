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