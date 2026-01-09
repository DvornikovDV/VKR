// connection-updater.js
// Обновление соединений при драге изображений (Iteration 3)
// 
// Когда изображение тащится:
// - Обновляются стартуючая точка первого сегмента (позиция пина)
// - Обновляются последующие стартовые точки (сохраняют пользовательская рмаршрутизация)
// - Все остальные сегменты НЕ изменяются

class ConnectionUpdater {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
    }

    /**
     * Обновить соединения когда пин двигается
     * 
     * @param {Konva.Circle} pin - Пин, который тащится
     * @param {Object} imageMoveData - {deltaX, deltaY} осмещение изображения
     * @param {Array} connections - Массив всех соединений
     * @param {Function} redrawConnection - Калбэк для перерисовки из ConnectionEditor
     */
    updateConnectionsForPin(pin, imageMoveData, connections, redrawConnection) {
        const pinMeta = pin.getAttr('cp-meta');
        if (!pinMeta.connectedTo) return;

        const deltaX = imageMoveData.deltaX || 0;
        const deltaY = imageMoveData.deltaY || 0;

        connections.forEach(connection => {
            const connMeta = connection.getAttr('connection-meta');
            if (!connMeta) return;

            const isFromPin = connMeta.fromPin === pin;
            const isToPin = connMeta.toPin === pin;

            if (!isFromPin && !isToPin) return;

            if (isFromPin) {
                // Обновить первый сегмент (старт находится в пине)
                this.updateFirstSegment(connMeta, deltaX, deltaY);
            } else if (isToPin) {
                // Обновить последний сегмент (конец находится в пине)
                this.updateLastSegment(connMeta, deltaX, deltaY);
            }

            connection.setAttr('connection-meta', connMeta);
            redrawConnection(connection);
        });
    }

    /**
     * Обновить первый сегмент при драге исходящего пина
     * 
     * План:
     * 1. Двигаем старт сегмента (u0442а точка, де пин)
     * 2. Приспосабливаем конец сегмента к дирекции
     *    - Horizontal: двигаем только X, сохраняя оригинальный офсет
     *    - Vertical: двигаем только Y
     * 3. Обновляем старт второго сегмента (сохраняя непрерывность)
     */
    updateFirstSegment(connMeta, deltaX, deltaY) {
        const firstSeg = connMeta.segments[0];
        
        // Обновить старт сегмента (пин двигнулся)
        firstSeg.start.x += deltaX;
        firstSeg.start.y += deltaY;

        // Обновить конец сегмента в соответствии с его дирекцией
        // Остаоьные сегменты сохраняют свои позиции (роутинг не робюдится)
        if (firstSeg.direction === 'H') {
            // Horizontal: меняем только Y конеца, как старт (на одной горизонтали)
            firstSeg.end.y = firstSeg.start.y;
            // X конеца не меняется (u043fрисносабливаются к следующему сегменту)
        } else if (firstSeg.direction === 'V') {
            // Vertical: меняем только X конеца
            firstSeg.end.x = firstSeg.start.x;
        }

        // Обновить старт второго сегмента (u0441охраняя непрерывность)
        if (connMeta.segments.length > 1) {
            const secondSeg = connMeta.segments[1];
            secondSeg.start.x = firstSeg.end.x;
            secondSeg.start.y = firstSeg.end.y;
        }
    }

    /**
     * Обновить последний сегмент при драге доводящего пина
     * 
     * План: аналогичный первому, но для конца
     */
    updateLastSegment(connMeta, deltaX, deltaY) {
        const lastSegIdx = connMeta.segments.length - 1;
        const lastSeg = connMeta.segments[lastSegIdx];

        // Обновить конец сегмента (пин двигнулся)
        lastSeg.end.x += deltaX;
        lastSeg.end.y += deltaY;

        // Обновить старт сегмента в соответствии с его дирекцией
        if (lastSeg.direction === 'H') {
            // Horizontal: меняем только Y старта
            lastSeg.start.y = lastSeg.end.y;
        } else if (lastSeg.direction === 'V') {
            // Vertical: меняем только X старта
            lastSeg.start.x = lastSeg.end.x;
        }

        // Обновить конец предыдущего сегмента (сохраняя непрерывность)
        if (lastSegIdx > 0) {
            const prevSeg = connMeta.segments[lastSegIdx - 1];
            prevSeg.end.x = lastSeg.start.x;
            prevSeg.end.y = lastSeg.start.y;
        }
    }
}

export { ConnectionUpdater };
