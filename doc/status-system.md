# SCADA Element Status System

**Version**: 1.0
**Date**: 06.01.2026
**Status**: Design Document

---

## Overview

The status system provides operators with real-time visibility into the state of industrial systems through multiple independent status indicators. Each element (device, pipe, cable, valve) can be in a specific state that is visually represented on the mnemonic diagram.

Three independent statuses work together to give a complete picture:

1. **deviceStatus** - Is the equipment operating?
2. **pathStatus** - Is the flow path open?
3. **faultStatus** - Is there a problem?

Additionally, **flowStatus** is calculated from deviceStatus and pathStatus to show if substance/energy is actually flowing.

---

## Three Status Types

### 1. Device Status (for equipment)

**Purpose**: Indicates whether an industrial device is currently operating.

**Values**:
```
ON       - Device is active and operating normally
OFF      - Device is powered off or inactive
STANDBY  - Device is in idle mode (e.g., compressor at full tank pressure)
```

**Applies to**:
- Pumps
- Motors
- Compressors
- Fans
- Heaters
- Chillers
- Any powered equipment

**Example**:
```
Pump 1: deviceStatus = ON      (pump is running)
Pump 2: deviceStatus = OFF     (pump is idle)
Compressor: deviceStatus = STANDBY (waiting for pressure drop)
```

---

### 2. Path Status (for valves and connections)

**Purpose**: Indicates whether the flow path is open or obstructed.

**Values**:
```
OPEN     - Path is fully open, flow can pass through
CLOSED   - Path is fully closed, flow is blocked
PARTIAL  - Path is partially open (throttle position)
```

**Applies to**:
- Control valves
- Check valves
- Gate valves
- Solenoid valves
- Ball valves
- Dampers
- Any controllable flow path

**Example**:
```
Main valve: pathStatus = OPEN      (opens to allow flow)
Bypass valve: pathStatus = CLOSED   (blocks bypass)
Throttle valve: pathStatus = PARTIAL (restricts flow to 50%)
```

---

### 3. Fault Status (for all elements)

**Purpose**: Indicates if there is a problem or abnormal condition.

**Values**:
```
OK            - Normal operation, no problems
WARNING       - Minor issue detected (high temperature, low pressure)
ERROR         - Serious problem requiring attention
LEAK          - Fluid/gas leakage detected
BLOCKAGE      - Path is obstructed or clogged
STUCK         - Valve/device cannot move (mechanical failure)
DISCONNECTED  - Connection is broken (cable, pipe, signal)
```

**Applies to**:
- All devices
- All connections
- All valves
- All paths

**Example**:
```
Pump 1:
  faultStatus = OK           (healthy)
  faultStatus = WARNING      (vibration detected)
  faultStatus = ERROR        (temperature too high)

Water pipe:
  faultStatus = OK           (normal flow)
  faultStatus = LEAK         (moisture sensor triggered)
  faultStatus = BLOCKAGE     (pressure sensor shows low flow)

Electric cable:
  faultStatus = DISCONNECTED (circuit broken)
```

---

### 4. Flow Status (calculated)

**Purpose**: Indicates whether substance or energy is actually flowing through a connection.

**Values**:
```
ACTIVE    - Flow/energy is actively being transferred
INACTIVE  - No flow/energy transfer occurring
PARTIAL   - Reduced flow/energy transfer
```

**Calculation Logic**:
```
flowStatus = ACTIVE when:
  (source.deviceStatus == ON) AND
  (connection.pathStatus == OPEN) AND
  (connection.faultStatus == OK)

flowStatus = PARTIAL when:
  (source.deviceStatus == ON) AND
  (connection.pathStatus == PARTIAL) AND
  (connection.faultStatus == OK)

flowStatus = INACTIVE otherwise
```

**Example**:
```
Scenario: Pump -> Valve -> Pipe -> Tank

Case 1 (Normal):
  Pump ON + Valve OPEN + No faults = Pipe ACTIVE (water flowing)

Case 2 (Pump off)
  Pump OFF + Valve OPEN + No faults = Pipe INACTIVE (no water)

Case 3 (Blockage)
  Pump ON + Valve OPEN + BLOCKAGE fault = Pipe INACTIVE (pump working but water blocked)
  ALERT: Problem detected!

Case 4 (Valve closed)
  Pump ON + Valve CLOSED + No faults = Pipe INACTIVE (intentionally blocked)
  STATUS OK: System is as designed
```

---

## Element Types and Their Statuses

### Active Devices (Pumps, Motors, Compressors)

**Required statuses**:
- deviceStatus: ON | OFF | STANDBY
- faultStatus: OK | ERROR | WARNING

**Optional statuses**:
- None (calculated automatically)

**Visual indicators**:
```
ON + OK        -> Green outline with glow
OFF + OK       -> Gray outline
STANDBY + OK   -> Yellow outline with pulse
Any + ERROR    -> Red outline with blink
Any + WARNING  -> Orange outline with pulse
```

**MQTT source**:
```
greenhouse_01/devices/pump        = "ON" or "OFF"
greenhouse_01/sensors/pump_temp   = 45
  if temp > 60 -> faultStatus = ERROR
```

---

### Controllable Paths (Valves, Dampers)

**Required statuses**:
- pathStatus: OPEN | CLOSED | PARTIAL
- faultStatus: OK | STUCK | DISCONNECTED

**Optional statuses**:
- flowStatus (calculated)

**Visual indicators**:
```
OPEN + OK         -> Thick green line
CLOSED + OK       -> Thin gray line
PARTIAL + OK      -> Yellow line (medium)
Any + STUCK       -> Red line with animation
Any + DISCONNECTED -> Red dotted line
```

**MQTT source**:
```
greenhouse_01/devices/valve1         = "open" or "closed"
greenhouse_01/sensors/valve1_current = 50  (mA)
  if current too high -> faultStatus = STUCK
```

---

### Passive Connections (Pipes, Cables)

**Required statuses**:
- faultStatus: OK | LEAK | BLOCKAGE | DISCONNECTED

**Calculated statuses**:
- flowStatus: ACTIVE | INACTIVE | PARTIAL
  (depends on connected source deviceStatus and path pathStatus)

**Visual indicators**:
```
ACTIVE + OK        -> Thick green line
INACTIVE + OK      -> Thin gray line
PARTIAL + OK       -> Yellow line
Any + LEAK         -> Red dashed line
Any + BLOCKAGE     -> Red line with pulse
Any + DISCONNECTED -> Red dotted line
```

**MQTT source**:
```
greenhouse_01/sensors/pipe1_pressure = 2.5
  if pressure < 1.0 -> faultStatus = BLOCKAGE

greenhouse_01/sensors/pipe1_leak     = true
  -> faultStatus = LEAK
```

---

## Visual Representation

### Color Mapping

| Color | Meaning | Status |
|-------|---------|--------|
| Green (#00ff00) | Operating normally, flow active | deviceStatus=ON, flowStatus=ACTIVE, faultStatus=OK |
| Gray (#999999) | Off or inactive | deviceStatus=OFF, flowStatus=INACTIVE, faultStatus=OK |
| Yellow (#ffff00) | Standby or partial | deviceStatus=STANDBY, flowStatus=PARTIAL, faultStatus=OK |
| Orange (#ff9900) | Warning condition | faultStatus=WARNING |
| Red (#ff0000) | Error or fault | faultStatus=ERROR/LEAK/BLOCKAGE/STUCK/DISCONNECTED |

### Line Styles

| Style | Meaning |
|-------|----------|
| Thick solid | Full flow, path open |
| Medium solid | Partial flow, path partially open |
| Thin solid | No flow, path closed |
| Dashed | Leak detected |
| Dotted | Disconnected or broken |
| Pulsing/Blinking | Active fault condition |

### Effects

| Effect | Meaning |
|--------|----------|
| Glow | Device actively operating |
| Pulse | Standby mode or warning |
| Blink | Error or critical fault |
| Highlight border | Element selected |

---

## Data Structure

### In Schema.json (Structure)

```json
{
  "images": [
    {
      "id": "img_pump_1",
      "x": 100,
      "y": 200,
      "status": {
        "deviceStatus": "ON",
        "faultStatus": "OK",
        "lastUpdate": "2026-01-06T21:40:00Z"
      }
    }
  ],
  "connections": [
    {
      "id": "conn_1",
      "fromPin": {...},
      "toPin": {...},
      "status": {
        "pathStatus": "OPEN",
        "flowStatus": "ACTIVE",
        "faultStatus": "OK",
        "lastUpdate": "2026-01-06T21:40:00Z"
      }
    }
  ]
}
```

### Real-time Updates (MQTT)

```
Topic: greenhouse_01/devices/pump
Value: "ON"
  -> Updates: image.status.deviceStatus = "ON"
  -> Recalculates: connected connections flowStatus
  -> Broadcasts to Dashboard

Topic: greenhouse_01/sensors/pressure
Value: 0.8
  -> Threshold check: if < 1.0 -> connection.faultStatus = "BLOCKAGE"
  -> Broadcasts alert to Dashboard
```

---

## Data Flow: MQTT -> Backend -> Dashboard

```
1. Physical sensors/devices send MQTT messages
   greenhouse_01/devices/pump = "ON"
   greenhouse_01/sensors/pressure = 2.5

2. Backend receives and processes
   schema-loader.js: updateElementStatus()
   Checks thresholds, sets fault conditions
   Recalculates dependent flowStatus values
   Broadcasts WebSocket updates

3. Dashboard receives and renders
   dashboard-renderer.js: onStatusUpdate()
   Updates element colors and visual effects
   Displays operator alerts for faults
   Animates flow through connections

4. Operator sees complete state picture
   Green lines = active flow
   Red = fault detected
   Yellow = warning
   Gray = off/inactive
```

---

## Implementation Phases

### Phase 1: Basic (Week 1)

**Goal**: Show ON/OFF with color change

Implement:
- deviceStatus: ON | OFF
- Single color per device (green/gray)
- Update on MQTT message

```javascript
deviceStatus = value;
color = value === "ON" ? "green" : "gray";
```

**Visual result**: Device icon changes color based on power state

---

### Phase 2: Faults (Week 2)

**Goal**: Add fault detection with visual alerts

Implement:
- faultStatus: OK | ERROR | WARNING
- Red color for faults
- Blinking animation for alerts
- Orange for warnings

```javascript
if (sensorValue > threshold) {
    faultStatus = "ERROR";
    color = "red";
    startBlinking();
}
```

**Visual result**: Faults are immediately visible and draw attention

---

### Phase 3: Flow Status (Week 3)

**Goal**: Show actual flow through connections

Implement:
- pathStatus: OPEN | CLOSED | PARTIAL
- flowStatus (calculated)
- Line thickness based on flow
- Recalculate when source changes

```javascript
flowStatus = sourceOn && pathOpen && !fault ? "ACTIVE" : "INACTIVE";
lineWidth = flowStatus === "ACTIVE" ? 3 : 1;
```

**Visual result**: Operator can trace where substance/energy is flowing

---

### Phase 4: Advanced (Later)

**Goal**: Add numerical data and history

Optional features:
- Display actual values (pressure, temperature) on connections
- Animation showing flow direction
- Historical graphs of status changes
- Predictive warnings (sensor trending)

---

## Operator Experience

### What the operator sees

```
Greenhouse control panel:

Pump 1: [Green outline]  = Running normally (ON, OK)
Pump 2: [Gray outline]   = Currently off (OFF, OK)
Pump 3: [Red blink]      = ERROR - high temperature!

Valve A: Thick green line = Open, water flowing
Valve B: Thin gray line   = Closed, no flow
Valve C: Red line         = Blockage detected!

Pipe 1:  Thick green     = Active (pump on, valve open)
Pipe 2:  Thin gray       = Inactive (pump off)
Pipe 3:  Red dashed      = LEAK detected!
```

### What the operator does

1. **At a glance**: Sees system state (green = good, red = problem)
2. **On alert**: Clicks red element to see fault details
3. **For diagnosis**: Traces flow path from pump to endpoint
4. **To troubleshoot**: Checks each connection status
   - If pump ON but pipe gray = check valve
   - If valve open but pipe gray = check pump
   - If all green but flow should happen = check sensor

---

## Integration with Bindings System

Status data comes from MQTT through tagged elements:

```json
{
  "elementId": "img_pump_1",
  "tagId": "greenhouse_01.devices.pump",
  "type": "sensor",
  "statusMapping": {
    "deviceStatus": "greenhouse_01/devices/pump",
    "faultStatus": {
      "source": "greenhouse_01/sensors/pump_temp",
      "condition": "value > 60 ? 'ERROR' : 'OK'"
    }
  }
}
```

---

## Checklist for Implementation

**Phase 1 (Basic)**:
- [ ] Add status field to DiagramElement base class
- [ ] Add updateDeviceVisuals() to ImageManager
- [ ] Add MQTT message handler for deviceStatus
- [ ] Test color change on ON/OFF toggle

**Phase 2 (Faults)**:
- [ ] Add faultStatus to status object
- [ ] Implement threshold checking in backend
- [ ] Add blinking/pulsing animation in CSS
- [ ] Test fault visualization

**Phase 3 (Flow)**:
- [ ] Add pathStatus to Connection
- [ ] Implement flowStatus calculation
- [ ] Add updatePathVisuals() to ConnectionManager
- [ ] Recalculate flows when source changes
- [ ] Test flow path visualization

**Phase 4 (Advanced)**:
- [ ] Add numerical value display
- [ ] Implement flow animation
- [ ] Add historical tracking
- [ ] Implement predictive alerts

---

**Document Status**: Ready for development
**Next Step**: Implement Phase 1 in connection-manager.js and image-manager.js
