// bindings-manager.js
// Управление привязками виджетов/элементов к устройствам конкретной машины

class BindingsManager {
    constructor(devices = []) {
        this.allDevices = Array.isArray(devices) ? devices : [];
        this.selectedMachineId = null;
        this.availableDevices = []; // id устройств выбранной машины
        this.bindings = []; // [{ elementId, deviceId }]
    }

    // Выбор машины с возможным сбросом уже настроенных привязок
    selectMachine(machineId) {
        if (!machineId) return false;

        if (this.bindings.length > 0 && machineId !== this.selectedMachineId) {
            if (!confirm('Привязки сбросятся при смене машины. Продолжить?')) {
                return false;
            }
            this.bindings = [];
        }

        this.selectedMachineId = machineId;
        this.availableDevices = this.allDevices
            .filter(d => d.machineId === machineId)
            .map(d => d.id);

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
