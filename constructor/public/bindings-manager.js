// bindings-manager.js
// Управление привязками графических элементов к устройствам оборудования установки.

class BindingsManager {
    constructor(devices = []) {
        this.allDevices = Array.isArray(devices) ? devices : [];
        this.selectedMachineId = null;
        this.availableDevices = []; // Идентификаторы устройств выбранной установки
        this.bindings = []; // Массив объектов связей [{ elementId, deviceId }]
        this.onMachineChanged = null; // Callback смены активной установки
        this.onBindingsClearRequest = null; // Callback запроса очистки привязок
    }



    /** Установка идентификатора активной установки.
     * Вход: machineId (String), skipConfirm (Boolean).
     * Выход: Статус (Boolean). */
    selectMachine(machineId, skipConfirm = false) {
        if (!machineId) return false;

        if (this.bindings.length > 0 && machineId !== this.selectedMachineId && !skipConfirm) {
            if (!confirm('Привязки сбросятся при смене машины. Продолжить?')) {
                return false;
            }
            this.bindings = [];
            // Запрос очистки привязок через контроллер
            if (this.onBindingsClearRequest) {
                this.onBindingsClearRequest();
            }
        }

        const oldMachineId = this.selectedMachineId;
        this.selectedMachineId = machineId;
        this.availableDevices = this.allDevices
            .filter(d => d.machineId === machineId)
            .map(d => d.id);

        // Оповещение интерфейса при фактической смене установки
        if (oldMachineId !== machineId && this.onMachineChanged) {
            this.onMachineChanged(machineId);
        }

        return true;
    }

    /** Получение списка идентификаторов устройств для выбранной установки.
     * Вход: machineId (String).
     * Выход: Promise с массивом идентификаторов (Array). */
    async fetchDevices(machineId) {
        return this.allDevices
            .filter(d => d.machineId === machineId)
            .map(d => d.id);
    }

    /** Проверка доступности устройства для назначения.
     * Вход: deviceId (String).
     * Выход: Статус доступности (Boolean). */
    canAssignDevice(deviceId) {
        if (!this.selectedMachineId) return false;
        return this.availableDevices.includes(deviceId);
    }

    /** Создание связи графического элемента с устройством.
     * Вход: elementId (String), deviceId (String).
     * Выход: Статус назначения (Boolean). */
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
