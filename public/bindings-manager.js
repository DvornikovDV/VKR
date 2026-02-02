// bindings-manager.js
// Управление привязками виджетов/элементов к устройствам конкретной машины

class BindingsManager {
    constructor(devices = []) {
        this.allDevices = Array.isArray(devices) ? devices : [];
        this.selectedMachineId = null;
        this.availableDevices = []; // id устройств выбранной машины
        this.bindings = []; // [{ elementId, deviceId }]
        this.widgetManager = null; // ссылка для очистки привязок при смене машины
        this.onMachineChanged = null; // каллбэк для уведомления UI о смене машины
    }

    // Установить ссылку на WidgetManager
    setWidgetManager(widgetManager) {
        this.widgetManager = widgetManager;
    }

    // Выбор машины с возможным сбросом уже настроенных привязок
    selectMachine(machineId, skipConfirm = false) {
        if (!machineId) return false;

        if (this.bindings.length > 0 && machineId !== this.selectedMachineId && !skipConfirm) {
            if (!confirm('Привязки сбросятся при смене машины. Продолжить?')) {
                return false;
            }
            this.bindings = [];
            // Очистить bindingId у всех виджетов
            if (this.widgetManager && Array.isArray(this.widgetManager.widgets)) {
                this.widgetManager.widgets.forEach(w => {
                    w.bindingId = null;
                });
            }
        }

        const oldMachineId = this.selectedMachineId;
        this.selectedMachineId = machineId;
        this.availableDevices = this.allDevices
            .filter(d => d.machineId === machineId)
            .map(d => d.id);

        // Отдом о UI если машина истинно изменилась
        if (oldMachineId !== machineId && this.onMachineChanged) {
            this.onMachineChanged(machineId);
        }

        return true;
    }

    // Заглушка под будущий API / backend (сейчас используем локальные данные)
    async fetchDevices(machineId) {
        return this.allDevices
            .filter(d => d.machineId === machineId)
            .map(d => d.id);
    }

    // Проверка, можно ли назначать указанный deviceId текущей машине
    canAssignDevice(deviceId) {
        if (!this.selectedMachineId) return false;
        return this.availableDevices.includes(deviceId);
    }

    // Назначить устройству элемент диаграммы/виджет
    assignDeviceToElement(elementId, deviceId) {
        if (!this.selectedMachineId) {
            alert('Сначала выберите машину!');
            return false;
        }

        if (!this.canAssignDevice(deviceId)) {
            alert(`"${deviceId}" не принадлежит машине ${this.selectedMachineId}`);
            return false;
        }

        this.bindings.push({ elementId, deviceId });
        return true;
    }
}

export { BindingsManager };
