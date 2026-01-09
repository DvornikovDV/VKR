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
        
        // Коллбэки
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
            if (this.onConnectionSelected) {
                this.onConnectionSelected(connection);
            }
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
     * Обновить соединения на итерации 3: обновление при драге изображения
     */
    updateConnectionsForImageDrag(pin, imageMoveData) {
        this.updater.updateConnectionsForPin(
            pin,
            imageMoveData,
            this.connections,
            (conn) => this.editor.redrawConnection(conn)
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
     * Показать ручки для выделенного соединения
     */
    selectConnection(connection) {
        if (this.selectedConnection) {
            this.hideHandles(this.selectedConnection);
        }
        this.selectedConnection = connection;
        this.editor.addLineEditHandles(connection);
    }

    /**
     * Отселекций выделенного соединения
     */
    deselectConnection() {
        if (this.selectedConnection) {
            this.hideHandles(this.selectedConnection);
            this.selectedConnection = null;
        }
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
