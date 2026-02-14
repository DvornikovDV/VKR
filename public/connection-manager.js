// connection-manager.js
// Главный менеджер соединений
// CRUD операции и орхестрация функционала

import { ConnectionRouter } from './connection-router.js';
import { ConnectionEditor } from './connection-editor.js';
import { ConnectionUpdater } from './connection-updater.js';

class ConnectionManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.connections = [];
        this.router = new ConnectionRouter();
        this.editor = new ConnectionEditor(canvasManager, this);
        this.updater = new ConnectionUpdater(canvasManager);
        
        this.onConnectionCreated = null;
        this.onConnectionSelected = null;
        this.onConnectionDeleted = null;
        this.activeDragConnection = null;
        this.selectedConnection = null;
    }

    /**
     * Создать соединение между двумя пинами
     */
    createConnection(pin1, pin2) {
        const meta1 = pin1.getAttr('cp-meta');
        const meta2 = pin2.getAttr('cp-meta');

        const segments = ConnectionRouter.calculateSegments(pin1, pin2);
        const points = ConnectionRouter.segmentsToPoints(segments);

        const connection = new Konva.Line({
            points: points,
            stroke: '#000',
            strokeWidth: 2,
            listening: true,
            hitStrokeWidth: 10
        });

        connection.setAttr('connection-meta', {
            id: 'conn_' + Date.now(),
            fromPin: pin1,
            toPin: pin2,
            segments: segments,
            handles: [],
            isDragging: false,
            userModified: false,
            lastModified: new Date().toISOString(),
            highlightLine: null
        });

        connection.on('click', (e) => {
            e.cancelBubble = true;
            this.selectConnection(connection);
            if (this.onConnectionSelected) {
                this.onConnectionSelected(connection);
            }
        });

        connection.on('dblclick', (e) => {
            e.cancelBubble = true;
            this.handleBreakPoint(connection);
        });

        meta1.connectedTo = meta2.id;
        meta2.connectedTo = meta1.id;
        pin1.setAttr('cp-meta', meta1);
        pin2.setAttr('cp-meta', meta2);

        pin1.fill('#dc3545');
        pin2.fill('#dc3545');

        this.canvasManager.getLayer().add(connection);
        this.connections.push(connection);
        this.canvasManager.getLayer().batchDraw();

        if (this.onConnectionCreated) {
            this.onConnectionCreated(connection);
        }

        console.log(`Создано соединение между ${meta1.id} и ${meta2.id}`);
        return connection;
    }

    /**
     * Обработчик добавления разрыва (double-click)
     * Найти ближайший сегмент к клику и вставить 2 новые точки
     */
    handleBreakPoint(connection) {
        const pointerPos = this.canvasManager.getStage().getPointerPosition();
        const meta = connection.getAttr('connection-meta');
        const segments = meta.segments;

        if (!segments || segments.length === 0) {
            console.warn('No segments in connection');
            return;
        }

        const nearestSegment = ConnectionRouter.findNearestSegment(segments, pointerPos, 30);
        if (!nearestSegment) {
            console.log('Click too far from any segment');
            return;
        }

        const segmentIndex = nearestSegment.segmentIndex;
        const prevCount = segments.length;
        
        this.editor.addBreakPointToSegment(connection, segmentIndex, pointerPos);
        
        const newCount = meta.segments.length;
        console.log(`Added break point: ${prevCount} segments → ${newCount} segments`);
        this.selectConnection(connection);
    }

    /**
     * Удалить соединение
     */
    deleteConnection(connection) {
        const meta = connection.getAttr('connection-meta');

        const fromPinMeta = meta.fromPin.getAttr('cp-meta');
        const toPinMeta = meta.toPin.getAttr('cp-meta');

        fromPinMeta.connectedTo = null;
        toPinMeta.connectedTo = null;
        meta.fromPin.setAttr('cp-meta', fromPinMeta);
        meta.toPin.setAttr('cp-meta', toPinMeta);

        meta.fromPin.fill('#198754');
        meta.toPin.fill('#198754');

        this.editor.removeLineEditHandles(connection);

        if (meta.highlightLine) {
            meta.highlightLine.destroy();
        }

        const index = this.connections.indexOf(connection);
        if (index > -1) {
            this.connections.splice(index, 1);
        }

        connection.destroy();
        this.canvasManager.getLayer().batchDraw();

        if (this.onConnectionDeleted) {
            this.onConnectionDeleted(connection);
        }

        console.log(`Удалено соединение ${meta.id}`);
    }

    /**
     * Унифицированный метод обновления соединений
     */
    updateConnectionsForPin(pin, newX, newY, isImageDrag = false) {
        const oldX = pin.x();
        const oldY = pin.y();
        
        pin.position({ x: newX, y: newY });
        
        this.updater.updateConnections(
            pin,
            newX,
            newY,
            oldX,
            oldY,
            isImageDrag,
            this.connections,
            (conn) => {
                this.editor.redrawConnection(conn);
                const connMeta = conn.getAttr('connection-meta');
                if (connMeta && connMeta.highlightLine) {
                    connMeta.highlightLine.points(conn.points());
                }
            }
        );
    }

    showHandles(connection) {
        this.editor.showHandles(connection);
    }

    hideHandles(connection) {
        this.editor.hideHandles(connection);
    }

    addLineEditHandles(connection) {
        this.editor.addLineEditHandles(connection);
    }

    removeLineEditHandles(connection) {
        this.editor.removeLineEditHandles(connection);
    }

    selectConnection(connection) {
        if (this.selectedConnection === connection) {
            return;
        }

        if (this.selectedConnection && this.selectedConnection !== connection) {
            this.hideHandles(this.selectedConnection);
        }

        this.selectedConnection = connection;
        this.addLineEditHandles(connection);
    }

    deselectConnection(connection) {
        if (this.selectedConnection === connection) {
            this.hideHandles(connection);
            this.selectedConnection = null;
        }
    }

    setSelectedConnection(connection) {
        this.selectedConnection = connection;
    }

    getSelectedConnection() {
        return this.selectedConnection;
    }

    getConnections() {
        return this.connections;
    }

    /**
     * Экспорт соединений для сохранения схемы
     */
    exportConnections() {
        return this.connections.map(conn => {
            const meta = conn.getAttr('connection-meta') || {};
            const fromMeta = meta.fromPin ? meta.fromPin.getAttr('cp-meta') || {} : {};
            const toMeta = meta.toPin ? meta.toPin.getAttr('cp-meta') || {} : {};
            return {
                id: meta.id,
                fromPinId: fromMeta.id,
                toPinId: toMeta.id,
                segments: meta.segments || [],
                userModified: !!meta.userModified
            };
        });
    }

    /**
     * Импорт соединений из сохраненной схемы
     * Восстанавливает соединения между пинами по их ID
     */
    importConnections(connectionsData, connectionPointManager) {
        this.clear();
        if (!Array.isArray(connectionsData)) return;

        const pointsMap = {};
        connectionPointManager.getPoints().forEach(point => {
            const meta = point.getAttr('cp-meta') || {};
            pointsMap[meta.id] = point;
        });

        connectionsData.forEach(data => {
            const fromPin = pointsMap[data.fromPinId];
            const toPin = pointsMap[data.toPinId];
            
            if (!fromPin || !toPin) {
                console.warn(`importConnections: pin not found (${data.fromPinId} -> ${data.toPinId})`);
                return;
            }

            const segments = data.segments && Array.isArray(data.segments) ? data.segments : ConnectionRouter.calculateSegments(fromPin, toPin);
            const points = ConnectionRouter.segmentsToPoints(segments);

            const connection = new Konva.Line({
                points: points,
                stroke: '#000',
                strokeWidth: 2,
                listening: true,
                hitStrokeWidth: 10
            });

            const fromPinMeta = fromPin.getAttr('cp-meta');
            const toPinMeta = toPin.getAttr('cp-meta');

            connection.setAttr('connection-meta', {
                id: data.id,
                fromPin: fromPin,
                toPin: toPin,
                segments: segments,
                handles: [],
                isDragging: false,
                userModified: data.userModified || false,
                lastModified: new Date().toISOString(),
                highlightLine: null
            });

            connection.on('click', (e) => {
                e.cancelBubble = true;
                this.selectConnection(connection);
                if (this.onConnectionSelected) {
                    this.onConnectionSelected(connection);
                }
            });

            connection.on('dblclick', (e) => {
                e.cancelBubble = true;
                this.handleBreakPoint(connection);
            });

            fromPinMeta.connectedTo = toPinMeta.id;
            toPinMeta.connectedTo = fromPinMeta.id;
            fromPin.setAttr('cp-meta', fromPinMeta);
            toPin.setAttr('cp-meta', toPinMeta);

            fromPin.fill('#dc3545');
            toPin.fill('#dc3545');

            this.canvasManager.getLayer().add(connection);
            this.connections.push(connection);
        });

        this.canvasManager.getLayer().batchDraw();
        console.log(`Загружено ${connectionsData.length} соединений`);
    }

    clear() {
        this.connections.forEach(c => c.destroy());
        this.connections = [];
    }

    validateConnectionIntegrity(connection) {
        ConnectionRouter.validateConnectionIntegrity(connection);
    }
}

export { ConnectionManager };
