// file-manager.js
// Управление файлами (сохранение и загрузка структур и привязок)

class FileManager {
    constructor(canvasManager, imageManager, connectionPointManager, connectionManager, widgetManager = null) {
        this.canvasManager = canvasManager;
        this.imageManager = imageManager;
        this.connectionPointManager = connectionPointManager;
        this.connectionManager = connectionManager;
        this.widgetManager = widgetManager;
        
        this.currentSchemaId = null;
        this.currentSchemaVersion = null;
        this.currentMachineId = null;
    }

    setWidgetManager(widgetManager) {
        this.widgetManager = widgetManager;
    }

    /**
     * Кодирование Konva.Image в Base64
     */
    imageToBase64(konvaImage) {
        if (!konvaImage || !konvaImage.image()) return null;
        const canvas = document.createElement('canvas');
        const img = konvaImage.image();
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
    }

    /**
     * Экспортировать изображения в Base64
     * Асинхронный метод
     */
    async exportImages() {
        const images = this.imageManager.getImages();
        const exported = [];
        
        for (const konvaImg of images) {
            const base64 = this.imageToBase64(konvaImg);
            exported.push({
                imageId: konvaImg.getAttr('imageId'),
                base64: base64,
                x: konvaImg.x(),
                y: konvaImg.y(),
                width: konvaImg.width(),
                height: konvaImg.height(),
                scaleX: konvaImg.scaleX(),
                scaleY: konvaImg.scaleY()
            });
        }
        
        return exported;
    }

    /**
     * Декодирование Base64 в Konva.Image и загрузка на сцену
     */
    async importImages(imagesData) {
        if (!Array.isArray(imagesData)) return;
        
        for (const imgData of imagesData) {
            if (!imgData.base64) continue;
            
            await new Promise((resolve) => {
                const imgObj = new Image();
                imgObj.onload = () => {
                    const layer = this.canvasManager.getLayer();
                    const konvaImg = new Konva.Image({
                        image: imgObj,
                        x: imgData.x || 0,
                        y: imgData.y || 0,
                        scaleX: imgData.scaleX || 1,
                        scaleY: imgData.scaleY || 1,
                        draggable: true
                    });
                    
                    konvaImg._id = imgData.imageId;
                    konvaImg._cp_points = [];
                    konvaImg.setAttr('imageId', imgData.imageId);
                    
                    layer.add(konvaImg);
                    this.imageManager.attachSelectionFrame(konvaImg);
                    this.imageManager.attachContextMenu(konvaImg);
                    this.imageManager.images.push(konvaImg);
                    
                    resolve();
                };
                imgObj.src = imgData.base64;
            });
        }
        
        this.canvasManager.getLayer().batchDraw();
    }

    /**
     * Сохранить структуру схемы (schema-{schemaId}-v{version}.json)
     * Включает: изображения (Base64), точки соединения, соединения, виджеты
     */
    saveScheme() {
        try {
            const schemaId = prompt('Введите ID схемы:', 'boiler-system');
            if (!schemaId) return;
            
            const version = prompt('Введите версию схемы:', '1.0');
            if (!version) return;
            
            this.currentSchemaId = schemaId;
            this.currentSchemaVersion = version;
            
            const scheme = {
                schemaId: schemaId,
                version: version,
                timestamp: new Date().toISOString(),
                images: this.imageManager.getImages().map(konvaImg => ({
                    imageId: konvaImg.getAttr('imageId'),
                    base64: this.imageToBase64(konvaImg),
                    x: konvaImg.x(),
                    y: konvaImg.y(),
                    width: konvaImg.width(),
                    height: konvaImg.height(),
                    scaleX: konvaImg.scaleX(),
                    scaleY: konvaImg.scaleY()
                })),
                connectionPoints: this.connectionPointManager.exportPoints(),
                connections: this.connectionManager.getConnections().map(conn => ({
                    id: conn.getAttr('connection-meta')?.id,
                    fromPinId: conn.getAttr('connection-meta')?.fromPin?.getAttr('cp-id'),
                    toPinId: conn.getAttr('connection-meta')?.toPin?.getAttr('cp-id'),
                    segments: conn.getAttr('connection-meta')?.segments,
                    userModified: conn.getAttr('connection-meta')?.userModified
                })),
                widgets: this.widgetManager ? this.widgetManager.exportWidgets() : []
            };
            
            const jsonString = JSON.stringify(scheme, null, 2);
            this.downloadJSON(jsonString, `schema-${schemaId}-v${version}.json`);
            console.log(`Структура схемы сохранена: ${schemaId} v${version}`);
        } catch (error) {
            console.error('Ошибка при сохранении структуры:', error);
            alert('Ошибка при сохранении структуры схемы');
        }
    }

    /**
     * Загрузить структуру схемы (с автозапоминанием ID и версии)
     */
    loadScheme() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const scheme = JSON.parse(event.target.result);
                    
                    this.currentSchemaId = scheme.schemaId || null;
                    this.currentSchemaVersion = scheme.version || null;
                    
                    this.clearCanvas(false);
                    
                    this.importImages(scheme.images || []).then(() => {
                        this.connectionPointManager.importPoints(scheme.connectionPoints || [], this.imageManager);
                        this.connectionManager.importConnections(scheme.connections || [], this.connectionPointManager);
                        if (this.widgetManager && scheme.widgets) {
                            this.widgetManager.importWidgets(scheme.widgets, this.imageManager);
                        }
                        this.canvasManager.getLayer().batchDraw();
                        console.log(`Структура загружена: ${this.currentSchemaId} v${this.currentSchemaVersion}`);
                    });
                } catch (error) {
                    console.error('Ошибка при загрузке структуры:', error);
                    alert('Ошибка при загрузке структуры схемы');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * Сохранить привязки (bindings-{schemaId}-{machineId}.json)
     * Включает только: schemaId, version, machineId, bindings
     */
    saveBindings() {
        try {
            if (!this.currentSchemaId) {
                alert('Сначала загрузите или сохраните структуру схемы!');
                return;
            }
            
            const machineId = prompt('Введите ID машины:', 'machine-A');
            if (!machineId) return;
            
            this.currentMachineId = machineId;
            
            const bindings = {
                schemaId: this.currentSchemaId,
                schemaVersion: this.currentSchemaVersion,
                machineId: machineId,
                bindings: [],
                timestamp: new Date().toISOString()
            };
            
            const jsonString = JSON.stringify(bindings, null, 2);
            this.downloadJSON(jsonString, `bindings-${this.currentSchemaId}-${machineId}.json`);
            console.log(`Привязки сохранены: ${this.currentSchemaId} для ${machineId}`);
        } catch (error) {
            console.error('Ошибка при сохранении привязок:', error);
            alert('Ошибка при сохранении привязок');
        }
    }

    /**
     * Загрузить привязки с валидацией совместимости
     * Уровень 2 валидации: schemaId + version совпадают?
     */
    loadBindings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const bindingsData = JSON.parse(event.target.result);
                    
                    if (bindingsData.schemaId !== this.currentSchemaId) {
                        alert(`Ошибка: привязки для "${bindingsData.schemaId}", а загружена "${this.currentSchemaId}"`);
                        return;
                    }
                    
                    if (bindingsData.schemaVersion !== this.currentSchemaVersion) {
                        alert(`Ошибка: версии не совпадают (привязки: ${bindingsData.schemaVersion}, схема: ${this.currentSchemaVersion})`);
                        return;
                    }
                    
                    this.currentMachineId = bindingsData.machineId;
                    console.log(`Привязки загружены: ${bindingsData.schemaId} для ${bindingsData.machineId}`);
                } catch (error) {
                    console.error('Ошибка при загрузке привязок:', error);
                    alert('Ошибка при загрузке привязок');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * Очистить canvas (без подтверждения если указан flag)
     */
    clearCanvas(confirm_flag = true) {
        if (confirm_flag && !confirm('Очистить canvas? Все элементы будут удалены.')) {
            return;
        }
        
        this.canvasManager.getLayer().destroyChildren();
        this.canvasManager.addGrid();
        this.imageManager.clear();
        this.connectionPointManager.clear();
        this.connectionManager.clear();
        if (this.widgetManager) {
            this.widgetManager.clear();
        }
        console.log('Canvas очищен');
    }

    /**
     * Вспомогательный метод для скачивания JSON
     */
    downloadJSON(jsonString, filename) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
}

export { FileManager };
