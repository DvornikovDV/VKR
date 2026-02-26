// diagram-element.js
// Базовый класс графического элемента мнемосхемы.

class DiagramElement {
    constructor(konvaShape) {
        this.shape = konvaShape;
        this.meta = {};
    }

    /** Получение объекта Konva слоя.
     * Выход: Узел (Konva.Node). */
    getShape() {
        return this.shape;
    }

    /** Запись метаданных атрибута узла.
     * Вход: key (String), value (String|Number|Object). */
    setMeta(key, value) {
        this.meta[key] = value;
        this.shape.setAttr(`meta-${key}`, value);
    }

    /** Чтение метаданных атрибута узла.
     * Вход: key (String).
     * Выход: Значение (String|Number|Object). */
    getMeta(key) {
        return this.meta[key];
    }

    /** Удаление узла с графического холста. */
    destroy() {
        this.shape.destroy();
    }

    /** Отображение графического узла. */
    show() {
        this.shape.show();
    }

    /** Скрытие графического узла. */
    hide() {
        this.shape.hide();
    }

    /** Получение координат узла относительно родительского контейнера.
     * Выход: Координаты (Object {x, y}). */
    getPosition() {
        return this.shape.position();
    }

    /** Установка координат узла.
     * Вход: x (Number), y (Number). */
    setPosition(x, y) {
        this.shape.position({ x, y });
    }

    /** Флаг состояния выделения узла.
     * Выход: Статус (Boolean). */
    isSelected() {
        return this.shape.listening && this.shape.opacity() > 0.5;
    }
}

export { DiagramElement };
