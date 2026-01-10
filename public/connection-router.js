// connection-router.js
// Маршрутизация соединений и вычисление сегментов

class ConnectionRouter {
    /**
     * Определить тип маршрутизации (2 или 3 сегмента)
     */
    static getRoutingCase(pin1, pin2) {
        const side1 = pin1.getAttr('cp-meta').side;
        const side2 = pin2.getAttr('cp-meta').side;

        const side1IsHorizontal = this.isSideHorizontal(side1);
        const side2IsHorizontal = this.isSideHorizontal(side2);

        if (side1IsHorizontal === side2IsHorizontal) {
            return 'THREE_SEGMENTS';
        } else {
            return 'TWO_SEGMENTS';
        }
    }

    /**
     * Вычислить сегменты маршрута
     */
    static calculateSegments(pin1, pin2) {
        const pos1 = pin1.position();
        const pos2 = pin2.position();
        const side1 = pin1.getAttr('cp-meta').side;
        const side2 = pin2.getAttr('cp-meta').side;

        const routingCase = this.getRoutingCase(pin1, pin2);
        const segments = [];

        if (routingCase === 'TWO_SEGMENTS') {
            if (this.isSideHorizontal(side1)) {
                segments.push({
                    index: 0,
                    direction: 'H',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: pos2.x, y: pos1.y }
                });
                segments.push({
                    index: 1,
                    direction: 'V',
                    start: { x: pos2.x, y: pos1.y },
                    end: { x: pos2.x, y: pos2.y }
                });
            } else {
                segments.push({
                    index: 0,
                    direction: 'V',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: pos1.x, y: pos2.y }
                });
                segments.push({
                    index: 1,
                    direction: 'H',
                    start: { x: pos1.x, y: pos2.y },
                    end: { x: pos2.x, y: pos2.y }
                });
            }
        } else {
            if (this.isSideHorizontal(side1)) {
                const centerX = (pos1.x + pos2.x) / 2;
                
                segments.push({
                    index: 0,
                    direction: 'H',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: centerX, y: pos1.y }
                });
                segments.push({
                    index: 1,
                    direction: 'V',
                    start: { x: centerX, y: pos1.y },
                    end: { x: centerX, y: pos2.y }
                });
                segments.push({
                    index: 2,
                    direction: 'H',
                    start: { x: centerX, y: pos2.y },
                    end: { x: pos2.x, y: pos2.y }
                });
            } else {
                const centerY = (pos1.y + pos2.y) / 2;
                
                segments.push({
                    index: 0,
                    direction: 'V',
                    start: { x: pos1.x, y: pos1.y },
                    end: { x: pos1.x, y: centerY }
                });
                segments.push({
                    index: 1,
                    direction: 'H',
                    start: { x: pos1.x, y: centerY },
                    end: { x: pos2.x, y: centerY }
                });
                segments.push({
                    index: 2,
                    direction: 'V',
                    start: { x: pos2.x, y: centerY },
                    end: { x: pos2.x, y: pos2.y }
                });
            }
        }

        return segments;
    }

    /**
     * Проверить, горизонтальная ли сторона
     */
    static isSideHorizontal(side) {
        return side === 'left' || side === 'right';
    }

    /**
     * Перевести сегменты в плоский массив точек
     */
    static segmentsToPoints(segments) {
        const points = [];
        for (let i = 0; i < segments.length; i++) {
            if (i === 0) {
                points.push(segments[i].start.x, segments[i].start.y);
            }
            points.push(segments[i].end.x, segments[i].end.y);
        }
        return points;
    }

    /**
     * Перевести точки в сегменты
     */
    static pointsToSegments(points) {
        const segments = [];
        for (let i = 0; i < points.length - 2; i += 2) {
            const start = { x: points[i], y: points[i + 1] };
            const end = { x: points[i + 2], y: points[i + 3] };
            const direction = (start.x === end.x) ? 'V' : 'H';

            segments.push({
                index: i / 2,
                direction: direction,
                start: start,
                end: end
            });
        }
        return segments;
    }

    /**
     * Валидировать сегменты
     */
    static validateSegments(segments) {
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];

            if (seg.direction === 'H') {
                if (seg.start.y !== seg.end.y) {
                    throw new Error(`Segment ${i}: H-segment Y mismatch`);
                }
            } else if (seg.direction === 'V') {
                if (seg.start.x !== seg.end.x) {
                    throw new Error(`Segment ${i}: V-segment X mismatch`);
                }
            }

            if (i < segments.length - 1) {
                if (seg.end.x !== segments[i + 1].start.x ||
                    seg.end.y !== segments[i + 1].start.y) {
                    throw new Error(`Segment ${i}: discontinuity with segment ${i + 1}`);
                }
            }

            if (i > 0) {
                if (seg.direction === segments[i - 1].direction) {
                    throw new Error(`Segment ${i}: consecutive segments have same direction`);
                }
            }
        }
        return true;
    }

    /**
     * Валидировать целостность соединения
     */
    static validateConnectionIntegrity(connection) {
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        this.validateSegments(segments);

        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const fromPinPos = meta.fromPin.position();
        const toPinPos = meta.toPin.position();

        if (firstSeg.start.x !== fromPinPos.x || firstSeg.start.y !== fromPinPos.y) {
            throw new Error('From pin not attached correctly');
        }

        if (lastSeg.end.x !== toPinPos.x || lastSeg.end.y !== toPinPos.y) {
            throw new Error('To pin not attached correctly');
        }
    }
}

export { ConnectionRouter };
