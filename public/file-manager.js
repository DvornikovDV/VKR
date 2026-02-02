// file-manager.js
// Управление файлами (сохранение и загружение структур и привязок)

class FileManager {
    constructor(canvasManager, imageManager, connectionPointManager, connectionManager, widgetManager = null, bindingsManager = null) {
        this.canvasManager = canvasManager;
        this.imageManager = imageManager;
        this.connectionPointManager = connectionPointManager;
        this.connectionManager = connectionManager;
        this.widgetManager = widgetManager;
        this.bindingsManager = bindingsManager;
        
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
     * Декодирование Base64 в Konva.Image и загружение на сцену
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
     * Вспомогательный метод: открыть системный диалог сохранения и вернуть выбранное имя файла
     * Для совместимости с UX загрузки изображений/схем используем скрытый input[type="file"]
     */
    async pickSaveFileName(defaultName = 'schema.json') {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            // trick: allow user to type имя файла; фактическое сохранение всё равно через downloadJSON
            input.nwsaveas = defaultName;
            input.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }
                resolve(file.name);
            };
            input.click();
        });
    }

    /**
     * Сохранить структуру схемы
     * Название схемы берем из имени файла, id генерируем только для новой схемы, версию заменяем временем сохранения
     */
    async saveScheme() {
        try {
            // 1. Открываем файловый диалог, как для загрузки схемы/изображения
            const suggestedName = this.currentSchemaId ? `${this.currentSchemaId}.json` : 'schema-new.json';
            const fileName = await this.pickSaveFileName(suggestedName);
            if (!fileName) return;

            // 2. Имя файла без расширения = название схемы
            const baseName = fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;
            const now = new Date();
            const timestamp = now.toISOString();
            const timePart = now.toISOString().replace(/[:.]/g, '-');

            // 3. Генерация/сохранение schemaId
            if (!this.currentSchemaId) {
                this.currentSchemaId = `${baseName}-${timePart}`;
            }

            // 4. Версия = время сохранения
            this.currentSchemaVersion = timePart;

            const scheme = {
                schemaId: this.currentSchemaId,
                version: this.currentSchemaVersion,
                name: baseName,
                timestamp: timestamp,
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
                connections: this.connectionManager.exportConnections(),
                widgets: this.widgetManager ? this.widgetManager.exportWidgets() : []
            };
            
            const jsonString = JSON.stringify(scheme, null, 2);
            this.downloadJSON(jsonString, fileName);
            console.log(`Структура схемы сохранена: ${this.currentSchemaId} v${this.currentSchemaVersion}`);
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
                    console.error('Ошибка при загружении структуры:', error);
                    alert('Ошибка при загружении структуры схемы');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * Сохранить привязки (Фаза E)
     * Файл: bindings-{schemaId}-{machineId}.json
     * machineId автоматически добавляется из BindingsManager
     */
    saveBindings() {
        try {
            // Валидация Уровень 3: режим сохранения
            if (!this.currentSchemaId) {
                alert('Сначала сохраните или загрузите структуру схемы!');
                return;
            }
            
            // Валидация Уровень 1: машина выбрана?
            if (!this.bindingsManager || !this.bindingsManager.selectedMachineId) {
                alert('Выберите машину в экране!');
                return;
            }
            
            const machineId = this.bindingsManager.selectedMachineId;
            
            // Собираем привязки от виджетов через WidgetManager, если он есть
            let widgetBindings = [];
            if (this.widgetManager) {
                widgetBindings = this.widgetManager.exportBindings();
            }
            
            const bindings = {
                schemaId: this.currentSchemaId,
                schemaVersion: this.currentSchemaVersion,
                machineId: machineId,
                bindings: widgetBindings,
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
     * Загрузить привязки (Фаза F)
     * Валидация Уровень 3+4: schemaId, version совпадают?
     * Если машина не совпадает - переключить
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
                    
                    // Валидация Уровень 3: schemaId совпадает?
                    if (bindingsData.schemaId !== this.currentSchemaId) {
                        alert(`Ошибка: привязки для "${bindingsData.schemaId}", а загружена "${this.currentSchemaId}"`);
                        return;
                    }
                    
                    if (bindingsData.schemaVersion !== this.currentSchemaVersion) {
                        alert(`Ошибка: версии не совпадают (привязки: ${bindingsData.schemaVersion}, схема: ${this.currentSchemaVersion})`);
                        return;
                    }
                    
                    // Валидация Уровень 4: machineId совпадает?
                    if (bindingsData.machineId !== this.bindingsManager.selectedMachineId) {
                        const msg = `привязки для "${bindingsData.machineId}", ` +
                                    `а выбрана "${this.bindingsManager.selectedMachineId}". Переключить?`;
                        if (!confirm(msg)) return;
                        
                        // Переключить машину
                        this.bindingsManager.selectMachine(bindingsData.machineId);
                        this.currentMachineId = bindingsData.machineId;
                    }
                    
                    // Загрузить привязки в WidgetManager
                    if (this.widgetManager && Array.isArray(bindingsData.bindings)) {
                        this.widgetManager.importBindings(bindingsData.bindings);
                    }
                    this.currentMachineId = bindingsData.machineId;
                    console.log(`Привязки загружены: ${bindingsData.schemaId} для ${bindingsData.machineId}`);
                } catch (error) {
                    console.error('Ошибка при загружении привязок:', error);
                    alert('Ошибка при загружении привязок');
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
        if (this.bindingsManager) {
            this.bindingsManager.bindings = [];
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
