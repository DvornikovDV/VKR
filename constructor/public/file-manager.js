// file-manager.js
// Менеджер файловых операций (сохранение и загрузка мнемосхем и аппаратных привязок).

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

    /** Безопасный парсер JSON для предотвращения prototype pollution.
     * Вход: key (String), value (String|Number|Object).
     * Выход: value (String|Number|Object). */
    _safeReviver(key, value) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new Error('Unsafe JSON key detected: ' + key);
        }
        return value;
    }

    /** Кодирование графического объекта в Base64.
     * Вход: konvaImage (Konva.Image).
     * Выход: Base64-строка (String) или null. */
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

    /** Асинхронный экспорт графических ресурсов в формат Base64.
     * Выход: Promise, разрешающийся массивом объектов (Array). */
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

    /** Асинхронное декодирование Base64 и добавление изображений на холст.
     * Вход: imagesData (Array).
     * Выход: Promise. */
    async importImages(imagesData) {
        if (!Array.isArray(imagesData)) return;

        for (const imgData of imagesData) {
            if (!imgData.base64) continue;
            // Валидация формата Base64 для безопасности
            if (!imgData.base64.startsWith('data:image/')) {
                console.warn('Skipping suspicious image data:', imgData.imageId);
                continue;
            }

            await new Promise((resolve) => {
                const imgObj = new Image();
                let isResolved = false;

                const finish = () => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve();
                    }
                };

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

                    finish();
                };

                imgObj.onerror = () => {
                    console.error('Failed to load image:', imgData.imageId);
                    finish(); // Resolve anyway to continue loading other images
                };

                imgObj.src = imgData.base64;

                // Защита от зависания по таймауту
                setTimeout(() => {
                    if (!isResolved) {
                        console.warn('Image load timed out:', imgData.imageId);
                        finish();
                    }
                }, 5000);
            });
        }

        this.canvasManager.getLayer().batchDraw();
    }

    /** Вызов диалогового окна запроса имени схемы.
     * Вход: defaultName (String).
     * Выход: имя схемы (String) или null. */
    async pickSchemeName(defaultName = 'schema-new') {
        const name = prompt('Введите название схемы:', defaultName);
        if (!name || name.trim() === '') {
            return null;
        }
        // Санитизация строки: разрешение только букв, цифр, дефисов и подчеркиваний
        return name.trim().replace(/[^a-zA-Z0-9\-_]/g, '_');
    }

    /** Программная инициация скачивания JSON-файла с гарантиями готовности Blob.
     * Вход: jsonString (String), filename (String).
     * Выход: Promise. */
    async downloadJSON(jsonString, filename) {
        return new Promise((resolve) => {
            // Создание Blob с MIME-типом application/json
            const blob = new Blob([jsonString], { type: 'application/json' });

            // Ожидание чтения Blob в память для гарантии готовности
            const reader = new FileReader();
            reader.onload = () => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;

                // Асинхронный вызов клика через EventLoop
                setTimeout(() => {
                    link.click();
                    // Освобождение ресурсов URL Object
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                        resolve();
                    }, 100);
                }, 0);
            };

            // Принудительное чтение Blob в ArrayBuffer
            reader.readAsArrayBuffer(blob);
        });
    }

    /** Сохранение текущей структуры мнемосхемы в файл.
     * Выход: Promise. */
    async saveScheme() {
        try {
            // Запрос имени схемы
            const suggestedName = this.currentSchemaId ? this.currentSchemaId.split('-').slice(0, -1).join('-') : 'schema-new';
            const schemeName = await this.pickSchemeName(suggestedName);
            if (!schemeName) return;

            const now = new Date();
            const timestamp = now.toISOString();
            const timePart = now.toISOString().replace(/[:.]/g, '-');

            // Генерация schemaId для новой схемы
            if (!this.currentSchemaId) {
                this.currentSchemaId = `${schemeName}-${timePart}`;
            }

            // Использование временной метки как версии
            this.currentSchemaVersion = timePart;

            const scheme = {
                schemaId: this.currentSchemaId,
                version: this.currentSchemaVersion,
                name: schemeName,
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
            // Процесс финализации файла
            const fileName = this.currentSchemaId.endsWith('.json') ? this.currentSchemaId : `${this.currentSchemaId}.json`;
            await this.downloadJSON(jsonString, fileName);
            console.log(`Структура схемы сохранена: ${this.currentSchemaId} v${this.currentSchemaVersion}`);
        } catch (error) {
            console.error('Ошибка при сохранении структуры:', error);
            alert('Ошибка при сохранении структуры схемы');
        }
    }

    /** Загрузка структуры мнемосхемы из файла с автовосстановлением связей. */
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
                    const fileContent = event.target.result;

                    // Валидация содержимого файла на пустоту
                    if (!fileContent || fileContent.trim() === '') {
                        alert('Ошибка: файл пустой или повреждён');
                        return;
                    }

                    const scheme = JSON.parse(fileContent, this._safeReviver);

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
                    console.error('Ошибка при загужении структуры:', error);
                    alert('Ошибка при загужении структуры схемы: ' + error.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /** Сохранение файлов аппаратных привязок.
     * Выход: Promise. */
    async saveBindings() {
        try {
            // Наличие схемы
            if (!this.currentSchemaId) {
                alert('Сначала сохраните или загрузите структуру схемы!');
                return;
            }

            // Наличие контроллера
            if (!this.bindingsManager || !this.bindingsManager.selectedMachineId) {
                alert('Выберите машину в экране!');
                return;
            }

            const machineId = this.bindingsManager.selectedMachineId;

            // Сбор привязок активных виджетов
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
            const fileName = `bindings-${this.currentSchemaId}-${machineId}.json`;
            await this.downloadJSON(jsonString, fileName);
            console.log(`Привязки сохранены: ${this.currentSchemaId} для ${machineId}`);
        } catch (error) {
            console.error('Ошибка при сохранении привязок:', error);
            alert('Ошибка при сохранении привязок');
        }
    }

    /** Загрузка файла аппаратных привязок с жесткой валидацией (Фаза F). */
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
                    const fileContent = event.target.result;

                    // Валидация содержимого файла на пустоту
                    if (!fileContent || fileContent.trim() === '') {
                        alert('Ошибка: файл пустой или повреждён');
                        return;
                    }

                    const bindingsData = JSON.parse(fileContent, this._safeReviver);

                    // Соответствие schemaId
                    if (bindingsData.schemaId !== this.currentSchemaId) {
                        alert(`Ошибка: привязки для "${bindingsData.schemaId}", а загружена "${this.currentSchemaId}"`);
                        return;
                    }

                    if (bindingsData.schemaVersion !== this.currentSchemaVersion) {
                        alert(`Ошибка: версии не совпадают (привязки: ${bindingsData.schemaVersion}, схема: ${this.currentSchemaVersion})`);
                        return;
                    }

                    // Соответствие machineId
                    if (bindingsData.machineId !== this.bindingsManager.selectedMachineId) {
                        const msg = `привязки для "${bindingsData.machineId}", ` +
                            `а выбрана "${this.bindingsManager.selectedMachineId}". Переключить?`;
                        if (!confirm(msg)) return;

                        // Принудительное переключение контроллера при несовпадении
                        this.bindingsManager.selectMachine(bindingsData.machineId, true);
                        this.currentMachineId = bindingsData.machineId;
                    }

                    // Трансляция привязок в менеджер виджетов
                    if (this.widgetManager && Array.isArray(bindingsData.bindings)) {
                        this.widgetManager.importBindings(bindingsData.bindings);
                    }
                    this.currentMachineId = bindingsData.machineId;
                    console.log(`Привязки загружены: ${bindingsData.schemaId} для ${bindingsData.machineId}`);
                } catch (error) {
                    console.error('Ошибка при загужении привязок:', error);
                    alert('Ошибка при загужении привязок: ' + error.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /** Очистка холста и сброс состояния всех менеджеров.
     * Вход: confirm_flag (Boolean). */
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
}

export { FileManager };
