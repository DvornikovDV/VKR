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
        this.editor = new ConnectionEditor(canvasManager);
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
     * Обработчик добавления разрыва на соединение (double-click)
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
        console.log(`Break point on segment ${segmentIndex}`);

        this.editor.addBreakPointToSegment(connection, segmentIndex, pointerPos);
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
     * Новые координаты трансмиттируются прямо в ConnectionUpdater
     * 
     * @param {Konva.Circle} pin - Пин, связанный с движением
     * @param {number} newX - Новая X координата пина
     * @param {number} newY - Новая Y координата пина
     * @param {boolean} isImageDrag - true если движение изображения
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

    /**
     * Показать ручки редактирования
     */
    showHandles(connection) {
        this.editor.showHandles(connection);
    }

    /**
     * Скрыть ручки редактирования
     */
    hideHandles(connection) {
        this.editor.hideHandles(connection);
    }

    /**
     * Добавить ручки редактирования
     * Освальзуется selectionManager
     */
    addLineEditHandles(connection) {
        this.editor.addLineEditHandles(connection);
    }

    /**
     * Удалить ручки редактирования
     * Освальзуется selectionManager
     */
    removeLineEditHandles(connection) {
        this.editor.removeLineEditHandles(connection);
    }

    /**
     * Выбрать соединение и показать ручки
     */
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

    /**
     * Снять выделение соединения
     */
    deselectConnection(connection) {
        if (this.selectedConnection === connection) {
            this.hideHandles(connection);
            this.selectedConnection = null;
        }
    }

    /**
     * Установить выбранное соединение (оспальзуется selection-manager)
     */
    setSelectedConnection(connection) {
        this.selectedConnection = connection;
    }

    /**
     * Получить выбранное соединение
     */
    getSelectedConnection() {
        return this.selectedConnection;
    }

    /**
     * Получить все соединения
     */
    getConnections() {
        return this.connections;
    }

    /**
     * Очистить все соединения
     */
    clear() {
        this.connections.forEach(c => c.destroy());
        this.connections = [];
    }

    /**
     * Валидировать целостность соединения
     */
    validateConnectionIntegrity(connection) {
        ConnectionRouter.validateConnectionIntegrity(connection);
    }
}

export { ConnectionManager };