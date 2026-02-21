// diagram-element.js
// Базовый класс для всех элементов диаграммы

class DiagramElement {
    constructor(konvaShape) {
        this.shape = konvaShape;
        this.meta = {};
    }

    /**
     * Получить Konva-объект
     */
    getShape() {
        return this.shape;
    }

    /**
     * Установить метаданные
     */
    setMeta(key, value) {
        this.meta[key] = value;
        this.shape.setAttr(`meta-${key}`, value);
    }

    /**
     * Получить метаданные
     */
    getMeta(key) {
        return this.meta[key];
    }

    /**
     * Удалить элемент с canvas
     */
    destroy() {
        this.shape.destroy();
    }

    /**
     * Показать элемент
     */
    show() {
        this.shape.show();
    }

    /**
     * Скрыть элемент
     */
    hide() {
        this.shape.hide();
    }

    /**
     * Получить позицию элемента
     */
    getPosition() {
        return this.shape.position();
    }

    /**
     * Установить позицию элемента
     */
    setPosition(x, y) {
        this.shape.position({ x, y });
    }

    /**
     * Проверить, выбран ли элемент
     */
    isSelected() {
        return this.shape.listening && this.shape.opacity() > 0.5;
    }
}

export { DiagramElement };
