// ui-controller.js
// Координатор менеджеров системы.

import { CanvasManager } from './canvas-manager.js';
import { ImageManager } from './image-manager.js';
import { ConnectionPointManager } from './connection-point-manager.js';
import { ConnectionManager } from './connection-manager.js';
import { SelectionManager } from './selection-manager.js';
import { PropertiesPanel } from './properties-panel.js';
import { FileManager } from './file-manager.js';
import { WidgetManager } from './widget-manager.js';
import { ContextMenu } from './context-menu.js';
import { BindingsManager } from './bindings-manager.js';

class UIController {
    constructor() {
        this.canvasManager = null;
        this.imageManager = null;
        this.connectionPointManager = null;
        this.connectionManager = null;
        this.selectionManager = null;
        this.propertiesPanel = null;
        this.fileManager = null;
        this.widgetManager = null;
        this.contextMenu = null;
        this.bindingsManager = null;

        this.isCreateLineMode = false;
        this.isConnectionEditMode = false;
        this.firstPinSelected = null;
        this.previewLine = null;

        this.init();
    }

    async init() {
        this.canvasManager = new CanvasManager();
        await this.canvasManager.ready();

        this.imageManager = new ImageManager(this.canvasManager);
        this.connectionPointManager = new ConnectionPointManager(this.canvasManager);
        this.connectionManager = new ConnectionManager(this.canvasManager);
        this.selectionManager = new SelectionManager(this.canvasManager);
        this.propertiesPanel = new PropertiesPanel(this.canvasManager);
        this.widgetManager = new WidgetManager(
            this.canvasManager.getLayer(),
            this.imageManager,
            this.canvasManager
        );
        this.bindingsManager = new BindingsManager([]);
        this.propertiesPanel.setBindingsManager(this.bindingsManager);
        this.fileManager = new FileManager(
            this.canvasManager,
            this.imageManager,
            this.connectionPointManager,
            this.connectionManager,
            this.widgetManager,
            this.bindingsManager
        );
        this.contextMenu = new ContextMenu();

        await this.loadDevicesRegistry();

        this.setupManagerCallbacks();
        this.setupEventListeners();
        this.setupMachineSelection();
        this.setupBindingsManagerCallback();
    }

    /** Загрузка реестра устройств. */
    async loadDevicesRegistry() {
        try {
            const response = await fetch('devices-registry.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.devices && Array.isArray(data.devices)) {
                this.bindingsManager.allDevices = data.devices;
            }
        } catch (error) {
            console.error('Ошибка загрузки реестра устройств:', error);
        }
    }

    /** Callback для обновления списка при смене контроллера. */
    setupBindingsManagerCallback() {
        this.bindingsManager.onMachineChanged = (newMachineId) => {
            const machineSelect = document.getElementById('machine-select');
            if (machineSelect) {
                machineSelect.value = newMachineId;
                console.log(`UI обновлен: машина изменена на ${newMachineId}`);
            }
        };
    }

    /** Настройка интерфейса выбора контроллера. */
    setupMachineSelection() {
        const machineSelect = document.getElementById('machine-select');

        if (!machineSelect) return;

        machineSelect.addEventListener('change', () => {
            const machineId = machineSelect.value;

            if (!machineId) {
                // Очистка состояния при сбросе выбора
                this.bindingsManager.selectedMachineId = null;
                this.fileManager.currentMachineId = null;
                console.log('Машина не выбрана');
                return;
            }

            // Валидация выбора контроллера
            if (!this.bindingsManager.selectMachine(machineId)) {
                // Сброс списка при отказе
                machineSelect.value = '';
                return;
            }

            this.fileManager.currentMachineId = machineId;
            console.log(`Выбрана машина: ${machineId}`);
        });
    }

    /** Настройка callback-функций менеджеров. */
    setupManagerCallbacks() {
        // Обработчики ImageManager
        this.imageManager.onImageSelected = (konvaImg, frame, handle) => {
            if (this.isCreateLineMode) {
                this.toggleLineCreationMode();
            }
            this.setConnectionEditMode(false);
            this.selectionManager.selectElement(konvaImg, frame, handle);
            this.propertiesPanel.showPropertiesForImage(konvaImg);
        };

        this.imageManager.onFrameDoubleClick = (konvaImg, frame) => {
            const pos = this.getPointerStageCoords();
            const sideMeta = this.getNearestSideAndOffsetFromFrame(frame, pos);
            this.connectionPointManager.createConnectionPointOnSide(konvaImg, sideMeta.side, sideMeta.offset);
        };

        // Обновление соединений и виджетов при перемещении изображения
        this.imageManager.onImageMoved = (konvaImg, deltaX, deltaY) => {
            // Обновление соединений
            if (Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach(pin => {
                    this.connectionManager.updateConnectionsForPin(pin, pin.x(), pin.y(), true);
                });
            }

            // Обновление виджетов
            const imageId = konvaImg.getAttr('imageId');
            if (imageId) {
                this.widgetManager.onImageMove(imageId, deltaX, deltaY);
            }
        };

        // Обновление соединений и виджетов при масштабировании изображения
        this.imageManager.onImageScaled = (konvaImg) => {
            // Обновление соединений
            if (Array.isArray(konvaImg._cp_points)) {
                konvaImg._cp_points.forEach(pin => {
                    this.connectionManager.updateConnectionsForPin(pin, pin.x(), pin.y(), true);
                });
            }

            // Обновление виджетов
            const imageId = konvaImg.getAttr('imageId');
            if (imageId) {
                const image = this.imageManager.getImage(imageId);
                if (image) {
                    this.widgetManager.onImageResize(imageId, image.width() * image.scaleX(), image.height() * image.scaleY());
                }
            }
        };

        // Удаление виджетов при удалении изображения
        this.imageManager.onImageDeleted = (imageId) => {
            if (this.widgetManager) {
                this.widgetManager.onImageDelete(imageId);
            }
        };

        // Удаление точек соединения при удалении изображения
        this.imageManager.onPointDeleteRequest = (point) => {
            this.connectionPointManager.deletePoint(point);
        };

        // Отображение контекстного меню
        this.imageManager.onContextMenuRequested = (imageId, konvaImg, pos, clientX, clientY) => {
            const menuItems = [
                {
                    label: 'Добавить виджет',
                    submenu: [
                        { label: '📊 Числовой дисплей', type: 'number-display' },
                        { label: '📝 Текстовый дисплей', type: 'text-display' },
                        { label: '💡 Индикатор', type: 'led' },
                        { label: '🔢 Числовой ввод', type: 'number-input' },
                        { label: '✏️ Текстовый ввод', type: 'text-input' },
                        { label: '🔀 Переключатель', type: 'toggle' },
                        { label: '🔘 Кнопка', type: 'button' },
                        { label: '📏 Слайдер', type: 'slider' }
                    ],
                    onSelect: (type) => {
                        const defaults = {
                            'number-display': { width: 100, height: 30 },
                            'text-display': { width: 120, height: 25 },
                            'led': { width: 40, height: 40 },
                            'number-input': { width: 100, height: 30 },
                            'text-input': { width: 150, height: 30 },
                            'toggle': { width: 60, height: 26 },
                            'button': { width: 100, height: 32 },
                            'slider': { width: 140, height: 30 }
                        };

                        const defaultSize = defaults[type] || { width: 100, height: 30 };
                        const image = this.imageManager.getImage(imageId);
                        if (!image) return;

                        let widgetX = pos.x - defaultSize.width / 2;
                        let widgetY = pos.y - defaultSize.height / 2;

                        const imgX = image.x();
                        const imgY = image.y();
                        const imgWidth = image.width() * image.scaleX();
                        const imgHeight = image.height() * image.scaleY();

                        if (widgetX < imgX) widgetX = imgX;
                        if (widgetX + defaultSize.width > imgX + imgWidth) {
                            widgetX = imgX + imgWidth - defaultSize.width;
                        }
                        if (widgetY < imgY) widgetY = imgY;
                        if (widgetY + defaultSize.height > imgY + imgHeight) {
                            widgetY = imgY + imgHeight - defaultSize.height;
                        }

                        this.widgetManager.create({
                            type,
                            imageId,
                            x: widgetX,
                            y: widgetY,
                            width: defaultSize.width,
                            height: defaultSize.height
                        });
                    }
                }
            ];

            this.contextMenu.show(menuItems, clientX, clientY);
        };

        // Обработчики ConnectionPointManager
        this.connectionPointManager.onPointSelected = (point) => {
            if (!this.isCreateLineMode) {
                this.setConnectionEditMode(false);
                this.selectionManager.clearSelection();
                this.propertiesPanel.showPropertiesForPoint(point);
            }
        };

        this.connectionPointManager.onPointDoubleClick = (point) => {
            if (this.isCreateLineMode) return;
            const meta = point.getAttr('cp-meta');
            if (meta.connectedTo) {
                alert('Нельзя удалить подключенную точку соединения. Сначала удалите соединение.');
                return;
            }
            this.connectionPointManager.deletePoint(point);
            this.propertiesPanel.showDefaultMessage();
        };

        this.connectionPointManager.onPointMoved = (point) => {
            this.connectionManager.updateConnectionsForPin(
                point,
                point.x(),
                point.y(),
                false
            );
        };

        // Каскадное удаление соединений при удалении точки
        this.connectionPointManager.onPointDeleted = (point) => {
            const connections = this.connectionManager.getConnections();
            // Копирование массива для безопасного удаления в процессе итерации
            [...connections].forEach(conn => {
                const meta = conn.getAttr('connection-meta');
                if (meta && (meta.fromPin === point || meta.toPin === point)) {
                    this.connectionManager.deleteConnection(conn);
                }
            });
        };

        // Обработчики ConnectionManager
        this.connectionManager.onConnectionSelected = (connection) => {
            if (this.isCreateLineMode) {
                this.toggleLineCreationMode();
            }
            this.setConnectionEditMode(true);
            this.selectionManager.selectConnection(connection);
            this.propertiesPanel.showPropertiesForConnection(connection);
        };

        // Обработчики SelectionManager
        this.selectionManager.onConnectionSelectRequest = (connection) => {
            this.connectionManager.selectConnection(connection);
        };

        this.selectionManager.onConnectionDeselectRequest = (connection) => {
            this.connectionManager.deselectConnection(connection);
        };

        // Обработчики BindingsManager
        this.bindingsManager.onBindingsClearRequest = () => {
            if (this.widgetManager && Array.isArray(this.widgetManager.widgets)) {
                this.widgetManager.widgets.forEach(w => {
                    w.bindingId = null;
                });
            }
        };

        // Обработчики PropertiesPanel
        this.propertiesPanel.onWidgetUpdated = (widget) => {
            if (this.widgetManager) {
                this.widgetManager.reattachDragHandlers(widget);
            }
        };

        this.propertiesPanel.onWidgetPositionOrSizeChange = (widget, propName, value) => {
            if (this.widgetManager) {
                if (propName === 'x') {
                    this.widgetManager.updatePosition(widget.id, value, widget.y);
                } else if (propName === 'y') {
                    this.widgetManager.updatePosition(widget.id, widget.x, value);
                } else if (propName === 'width') {
                    this.widgetManager.updateSize(widget.id, value, widget.height);
                } else if (propName === 'height') {
                    this.widgetManager.updateSize(widget.id, widget.width, value);
                }
            }
        };

        // Обработчики WidgetManager
        this.widgetManager.onWidgetSelected = (widget) => {
            this.selectionManager.selectWidget(widget);
            this.propertiesPanel.showPropertiesForWidget(widget, this.bindingsManager.allDevices);
        };

        this.widgetManager.onWidgetDragEnd = (widget) => {
            this.propertiesPanel.refreshWidgetProperties(widget);
        };
    }

    /** Установка режима редактирования соединения. Вход: value (boolean). */
    setConnectionEditMode(value) {
        if (this.isConnectionEditMode === value) return;

        this.isConnectionEditMode = value;

        const editBtn = document.getElementById('edit-connection-btn');
        if (editBtn) {
            editBtn.classList.toggle('active', value);
        }

        const canvasArea = document.querySelector('.canvas-area');
        if (canvasArea) {
            canvasArea.classList.toggle('edit-mode', value);
        }
    }

    /** Инициализация слушателей событий интерфейса. */
    setupEventListeners() {
        try {
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.forEach(function (tooltipTriggerEl) {
                if (window.bootstrap && bootstrap.Tooltip) new bootstrap.Tooltip(tooltipTriggerEl);
            });
        } catch (_) { }

        const addImageBtn = document.getElementById('add-image-btn');
        if (addImageBtn) {
            addImageBtn.addEventListener('click', () => {
                this.addImage();
            });
        }

        const saveSchemaBtn = document.getElementById('save-schema-btn');
        if (saveSchemaBtn) {
            saveSchemaBtn.addEventListener('click', () => {
                this.fileManager.saveScheme();
            });
        }

        const loadSchemaBtn = document.getElementById('load-schema-btn');
        if (loadSchemaBtn) {
            loadSchemaBtn.addEventListener('click', () => {
                this.fileManager.loadScheme();
            });
        }

        const saveBindingsBtn = document.getElementById('save-bindings-btn');
        if (saveBindingsBtn) {
            saveBindingsBtn.addEventListener('click', () => {
                this.fileManager.saveBindings();
            });
        }

        const loadBindingsBtn = document.getElementById('load-bindings-btn');
        if (loadBindingsBtn) {
            loadBindingsBtn.addEventListener('click', () => {
                this.fileManager.loadBindings();
            });
        }

        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.fileManager.clearCanvas();
            });
        }

        const createLineBtn = document.getElementById('create-line-btn');
        if (createLineBtn) {
            createLineBtn.addEventListener('click', () => {
                this.toggleLineCreationMode();
            });
        }

        const deleteBtn = document.getElementById('delete-selected-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteSelected();
            });
        }

        const stage = this.canvasManager.getStage();
        if (stage) {
            stage.on('click', (e) => {
                if (e.target === stage) {
                    this.setConnectionEditMode(false);
                    this.selectionManager.clearSelection();
                    this.propertiesPanel.showDefaultMessage();
                }
            });
        }
    }

    /** Удаление выбранного элемента. */
    deleteSelected() {
        const selected = this.selectionManager.getSelected();
        if (!selected) return;

        if (selected.widget) {
            this.widgetManager.delete(selected.widget.id);
            this.selectionManager.clearSelection();
            this.propertiesPanel.clear();
            return;
        }

        if (selected.connection) {
            this.connectionManager.deleteConnection(selected.connection);
            this.setConnectionEditMode(false);
            this.selectionManager.clearSelection();
            this.propertiesPanel.showDefaultMessage();
            return;
        }

        if (selected.node) {
            this.imageManager.deleteImage(selected.node);
            this.selectionManager.clearSelection();
            this.propertiesPanel.showDefaultMessage();
        }
    }

    /** Открытие диалога выбора файла. */
    addImage() {
        const fileInput = document.getElementById('file-input');
        if (!fileInput) return;
        fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                this.imageManager.addImageFromBase64(reader.result);
                fileInput.value = '';
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    }

    /** Переключение режима создания соединений. */
    toggleLineCreationMode() {
        this.isCreateLineMode = !this.isCreateLineMode;
        const createLineBtn = document.getElementById('create-line-btn');
        if (createLineBtn) {
            createLineBtn.classList.toggle('active', this.isCreateLineMode);
        }

        if (this.isCreateLineMode) {
            this.setConnectionEditMode(false);
            this.selectionManager.clearSelection();
            this.propertiesPanel.showDefaultMessage();
            this.setupLineCreationMode();
        } else {
            this.teardownLineCreationMode();
        }
    }

    /** Инициализация режима создания соединений. */
    setupLineCreationMode() {
        const points = this.connectionPointManager.getPoints();
        points.forEach(point => {
            point.draggable(false);
            point.listening(true);
            point.off('click');
            point.off('dblclick');
            point.on('pointerdown', (e) => {
                e.evt.stopPropagation();
                this.handlePinClickForLineCreation(point);
            });
        });

        const stage = this.canvasManager.getStage();
        stage.on('mousemove', this.handleMouseMoveForLinePreview.bind(this));

        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();
    }

    /** Деинициализация режима создания соединений. */
    teardownLineCreationMode() {
        const stage = this.canvasManager.getStage();
        stage.off('mousemove');

        const points = this.connectionPointManager.getPoints();
        points.forEach(point => {
            point.draggable(true);
            point.listening(true);
            // Восстановление стандартных обработчиков
            this.connectionPointManager.restoreDefaultEvents(point);
        });

        this.clearPreviewLine();
        this.firstPinSelected = null;
        this.canvasManager.getLayer().batchDraw();
        this.canvasManager.getStage().batchDraw();
    }

    /** Обработка выбора точки для создания соединения. Вход: point (Konva.Circle). */
    handlePinClickForLineCreation(point) {
        const meta = point.getAttr('cp-meta');

        if (meta.connectedTo) {
            return;
        }

        if (!this.firstPinSelected) {
            this.firstPinSelected = point;
            point.fill('#dc3545');
            this.canvasManager.getLayer().batchDraw();
        } else if (this.firstPinSelected === point) {
            this.firstPinSelected.fill('#198754');
            this.firstPinSelected = null;
            this.clearPreviewLine();
        } else {
            this.connectionManager.createConnection(this.firstPinSelected, point);
            this.firstPinSelected = null;
            this.clearPreviewLine();
        }
    }

    /** Обновление координат предварительной линии соединения. Вход: e (событие мыши). */
    handleMouseMoveForLinePreview(e) {
        if (!this.firstPinSelected) return;

        const pos = this.getPointerStageCoords();
        this.updatePreviewLine(this.firstPinSelected.position(), pos);
    }

    /** Отрисовка предварительной линии соединения. Вход: startPos (объект координат), endPos (объект координат). */
    updatePreviewLine(startPos, endPos) {
        if (this.previewLine) {
            this.previewLine.destroy();
        }

        const midX = (startPos.x + endPos.x) / 2;
        const points = [
            startPos.x, startPos.y,
            midX, startPos.y,
            midX, endPos.y,
            endPos.x, endPos.y
        ];

        this.previewLine = new Konva.Line({
            points: points,
            stroke: '#6c757d',
            strokeWidth: 2,
            dash: [5, 5],
            listening: false
        });

        this.canvasManager.getLayer().add(this.previewLine);
        this.canvasManager.getLayer().batchDraw();
    }

    /** Удаление предварительной линии соединения с холста. */
    clearPreviewLine() {
        if (this.previewLine) {
            this.previewLine.destroy();
            this.previewLine = null;
            this.canvasManager.getLayer().batchDraw();
        }
    }

    /** Получение координат указателя в системе координат холста. Выход: объект {x, y}. */
    getPointerStageCoords() {
        const stage = this.canvasManager.getStage();
        const p = stage.getPointerPosition();
        if (!p) return { x: 0, y: 0 };
        return {
            x: (p.x - stage.x()) / stage.scaleX(),
            y: (p.y - stage.y()) / stage.scaleY(),
        };
    }

    /** Расчет ближайшей стороны и смещения относительно рамки. Вход: frame (Konva.Rect), pos (объект координат). Выход: объект {side, offset}. */
    getNearestSideAndOffsetFromFrame(frame, pos) {
        const left = frame.x();
        const top = frame.y();
        const width = frame.width();
        const height = frame.height();
        const right = left + width;
        const bottom = top + height;

        const dTop = Math.abs(pos.y - top);
        const dRight = Math.abs(pos.x - right);
        const dBottom = Math.abs(pos.y - bottom);
        const dLeft = Math.abs(pos.x - left);
        const min = Math.min(dTop, dRight, dBottom, dLeft);

        if (min === dTop) return { side: 'top', offset: Math.min(1, Math.max(0, (pos.x - left) / width)) };
        if (min === dRight) return { side: 'right', offset: Math.min(1, Math.max(0, (pos.y - top) / height)) };
        if (min === dBottom) return { side: 'bottom', offset: Math.min(1, Math.max(0, (pos.x - left) / width)) };
        return { side: 'left', offset: Math.min(1, Math.max(0, (pos.y - top) / height)) };
    }
}

export { UIController };
