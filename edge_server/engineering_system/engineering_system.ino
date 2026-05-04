#include <DHT.h>
#include <ModbusRTUSlave.h>

#define ENGINEERING_STAND_DEBUG_TEXT_MODE 0

#if ENGINEERING_STAND_DEBUG_TEXT_MODE
#error "Debug text mode must be a separate build/sketch because USB Serial is used by Modbus RTU."
#endif

const uint8_t MODBUS_SLAVE_ID = 1;
const unsigned long MODBUS_BAUD = 9600;

const uint8_t DHT_PIN = 2;
const uint8_t BUTTON_PIN = 4;
const uint8_t PUMP_LED_PIN = 6;
const uint8_t BUZZER_PIN = 7;
const uint8_t RGB_R_PIN = 9;
const uint8_t RGB_G_PIN = 10;
const uint8_t RGB_B_PIN = 11;

const uint16_t REG_INPUT_TEMPERATURE_X10 = 0x00;
const uint16_t REG_INPUT_HUMIDITY_X10 = 0x01;
const uint16_t REG_INPUT_LOCAL_BUTTON_PRESSED = 0x02;
const uint16_t REG_INPUT_PUMP_ACTUAL_STATE = 0x10;
const uint16_t REG_INPUT_SIREN_ACTUAL_STATE = 0x11;
const uint16_t REG_INPUT_VALVE_ACTUAL_VALUE = 0x12;
const uint16_t INPUT_REGISTER_COUNT = 0x13;

const uint16_t REG_HOLDING_PUMP_COMMAND = 0xA0;
const uint16_t REG_HOLDING_SIREN_COMMAND = 0xA1;
const uint16_t REG_HOLDING_VALVE_COMMAND = 0xA2;
const uint16_t HOLDING_REGISTER_COUNT = 0xA3;

#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);
ModbusRTUSlave modbus(Serial);

uint16_t inputRegisters[INPUT_REGISTER_COUNT];
uint16_t holdingRegisters[HOLDING_REGISTER_COUNT];

int temperatureX10 = 0;
int humidityX10 = 0;
int localButtonPressed = 0;

int pumpActualState = 0;
int sirenActualState = 0;
int valveActualValue = 0;

uint16_t lastPumpCommand = 0;
uint16_t lastSirenCommand = 0;
uint16_t lastValveCommand = 0;

bool lastButtonReading = HIGH;
bool stableButtonState = HIGH;
unsigned long lastDebounceMs = 0;
const unsigned long DEBOUNCE_MS = 40;

unsigned long lastDhtReadMs = 0;
const unsigned long DHT_READ_INTERVAL_MS = 1000;

void setup() {
  dht.begin();

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(PUMP_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RGB_R_PIN, OUTPUT);
  pinMode(RGB_G_PIN, OUTPUT);
  pinMode(RGB_B_PIN, OUTPUT);

  syncCommandRegistersFromActualState();
  applyOutputs();
  updateInputRegisters();

  modbus.configureHoldingRegisters(holdingRegisters, HOLDING_REGISTER_COUNT);
  modbus.configureInputRegisters(inputRegisters, INPUT_REGISTER_COUNT);

  Serial.begin(MODBUS_BAUD, SERIAL_8N1);
  modbus.begin(MODBUS_SLAVE_ID, MODBUS_BAUD, SERIAL_8N1);
}

void loop() {
  updateDht();
  handleButton();
  updateInputRegisters();

  modbus.poll();
  applyCommandRegisters();

  applyOutputs();
  updateInputRegisters();
}

void updateDht() {
  if (millis() - lastDhtReadMs < DHT_READ_INTERVAL_MS) {
    return;
  }

  lastDhtReadMs = millis();

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    return;
  }

  temperatureX10 = (int)(temperature * 10.0);
  humidityX10 = (int)(humidity * 10.0);
}

void handleButton() {
  bool reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonReading) {
    lastDebounceMs = millis();
  }

  if ((millis() - lastDebounceMs) > DEBOUNCE_MS) {
    if (reading != stableButtonState) {
      stableButtonState = reading;

      if (stableButtonState == LOW) {
        localButtonPressed = 1;
        pumpActualState = pumpActualState ? 0 : 1;
        syncPumpCommandFromActualState();
      } else {
        localButtonPressed = 0;
      }
    }
  }

  lastButtonReading = reading;
}

void applyCommandRegisters() {
  if (holdingRegisters[REG_HOLDING_PUMP_COMMAND] != lastPumpCommand) {
    pumpActualState = holdingRegisters[REG_HOLDING_PUMP_COMMAND] ? 1 : 0;
    syncPumpCommandFromActualState();
  }

  if (holdingRegisters[REG_HOLDING_SIREN_COMMAND] != lastSirenCommand) {
    sirenActualState = holdingRegisters[REG_HOLDING_SIREN_COMMAND] ? 1 : 0;
    syncSirenCommandFromActualState();
  }

  if (holdingRegisters[REG_HOLDING_VALVE_COMMAND] != lastValveCommand) {
    valveActualValue = constrain((int)holdingRegisters[REG_HOLDING_VALVE_COMMAND], 0, 255);
    syncValveCommandFromActualState();
  }
}

void applyOutputs() {
  digitalWrite(PUMP_LED_PIN, pumpActualState ? HIGH : LOW);

  if (sirenActualState) {
    tone(BUZZER_PIN, 2000);
  } else {
    noTone(BUZZER_PIN);
  }

  analogWrite(RGB_R_PIN, 0);
  analogWrite(RGB_G_PIN, 0);
  analogWrite(RGB_B_PIN, valveActualValue);
}

void updateInputRegisters() {
  inputRegisters[REG_INPUT_TEMPERATURE_X10] = (uint16_t)((int16_t)temperatureX10);
  inputRegisters[REG_INPUT_HUMIDITY_X10] = (uint16_t)humidityX10;
  inputRegisters[REG_INPUT_LOCAL_BUTTON_PRESSED] = (uint16_t)localButtonPressed;
  inputRegisters[REG_INPUT_PUMP_ACTUAL_STATE] = (uint16_t)pumpActualState;
  inputRegisters[REG_INPUT_SIREN_ACTUAL_STATE] = (uint16_t)sirenActualState;
  inputRegisters[REG_INPUT_VALVE_ACTUAL_VALUE] = (uint16_t)valveActualValue;
}

void syncCommandRegistersFromActualState() {
  syncPumpCommandFromActualState();
  syncSirenCommandFromActualState();
  syncValveCommandFromActualState();
}

void syncPumpCommandFromActualState() {
  holdingRegisters[REG_HOLDING_PUMP_COMMAND] = pumpActualState ? 1 : 0;
  lastPumpCommand = holdingRegisters[REG_HOLDING_PUMP_COMMAND];
}

void syncSirenCommandFromActualState() {
  holdingRegisters[REG_HOLDING_SIREN_COMMAND] = sirenActualState ? 1 : 0;
  lastSirenCommand = holdingRegisters[REG_HOLDING_SIREN_COMMAND];
}

void syncValveCommandFromActualState() {
  holdingRegisters[REG_HOLDING_VALVE_COMMAND] = (uint16_t)constrain(valveActualValue, 0, 255);
  lastValveCommand = holdingRegisters[REG_HOLDING_VALVE_COMMAND];
}
