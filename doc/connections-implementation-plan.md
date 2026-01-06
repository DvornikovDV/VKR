# Connections Implementation Plan

**Version**: 2.0
**Date**: 06.01.2026
**Status**: Development Specification

---

## Overview

Connections are the visual representation of flow paths between devices. They must satisfy three core requirements:

1. **Orthogonality** - All segments are either horizontal (H) or vertical (V) at 0 or 90 degrees
2. **Visibility** - Use minimal segments (2 or 3) with simple routing logic
3. **Manageability** - Connections can be modified through breaks and segment dragging

---

## Terminology Clarification

**Segment**: A straight line connecting exactly two adjacent points in a connection path.

```
Connection path: Point0 -> Point1 -> Point2 -> Point3
                  [Segment 0]  [Segment 1]  [Segment 2]
                  (0 to 1)     (1 to 2)     (2 to 3)

Segment 0: from (x0, y0) to (x1, y1)
Segment 1: from (x1, y1) to (x2, y2)
Segment 2: from (x2, y2) to (x3, y3)
```

All operations (dragging, breaking, updating) work by modifying coordinates of points.

---

## Visual Requirements

### 1. Orthogonality

Every connection consists of connected segments:
- Each segment is strictly horizontal (H) or vertical (V)
- Segments alternate between H and V
- Minimum segments: 2 (direct routing)
- Typical segments: 3 (center-axis routing)
- User can add breaks creating more segments

**Segment Direction Rules**:
- Horizontal (H): start.y == end.y (same Y coordinate)
- Vertical (V): start.x == end.x (same X coordinate)
- Must alternate: H -> V -> H or V -> H -> V

---

### 2. Visibility - Simplified Routing

**Goal**: Use only 2 or 3 segments with deterministic, simple logic.

#### Case 1: Two Segments (L-shape routing)

**When**: Pins are on non-corresponding sides
- LEFT-TOP: pin on left of device A, pin on top of device B
- LEFT-BOTTOM: pin on left of A, pin on bottom of B
- Similar combinations

**Routing**: L-shaped path

```
Example: LEFT-TOP pins
┌─────────┐
│Device A │ pin_L (LEFT)
└─────────┘
|
|V (Vertical segment 1)
|
└────H──────┐ (Horizontal segment 2)
            |
         ┌──┴────┐
         │Device │ pin_T
         │  B    │
         └───────┘

Structure: [V, H]
Calculation:
  Segment 0 (V): from (pinA.x, pinA.y) to (pinA.x, pinB.y)
  Segment 1 (H): from (pinA.x, pinB.y) to (pinB.x, pinB.y)

Formula pseudocode:
  seg0.start = pinA
  seg0.end = (pinA.x, pinB.y)  // Same X as A, Y as B
  seg1.start = seg0.end
  seg1.end = pinB
```

#### Case 2: Three Segments (center-axis with equal ends)

**When**: Pins are on corresponding sides
- LEFT-RIGHT: pin on left of A, pin on right of B
- TOP-BOTTOM: pin on top of A, pin on bottom of B

**Routing**: Center-axis with equal-length end segments

```
Example: LEFT-RIGHT pins
┌─────────┐              ┌─────────┐
│Device A │ pin_R        │Device B │ pin_L
└─────────┘              └─────────┘
pin_R ─H─→ centerX ←─H─ pin_L
           │
           │V
           │

Structure: [H, V, H]
Calculation:
  centerX = (pinA.x + pinB.x) / 2
  centerY = (pinA.y + pinB.y) / 2
  
  Segment 0 (H): from pinA to (centerX, pinA.y)
  Segment 1 (V): from (centerX, pinA.y) to (centerX, centerY)
  Segment 2 (H): from (centerX, centerY) to pinB

Note: Equal-length end segments (both H) due to symmetric center point

Formula pseudocode:
  centerX = (pinA.x + pinB.x) / 2
  centerY = (pinA.y + pinB.y) / 2
  
  seg0.start = pinA
  seg0.end = (centerX, pinA.y)
  
  seg1.start = seg0.end
  seg1.end = (centerX, centerY)
  
  seg2.start = seg1.end
  seg2.end = pinB
```

#### Case 3: Determining Which Case Applies

```javascript
function getRoutingCase(pinA, pinB) {
  const sameSide = {
    horizontal: pinA.side === "LEFT" && pinB.side === "RIGHT" ||
                 pinA.side === "RIGHT" && pinB.side === "LEFT",
    vertical: pinA.side === "TOP" && pinB.side === "BOTTOM" ||
              pinA.side === "BOTTOM" && pinB.side === "TOP"
  };
  
  if (sameSide.horizontal || sameSide.vertical) {
    return "THREE_SEGMENTS";  // Corresponding sides
  } else {
    return "TWO_SEGMENTS";    // Non-corresponding sides
  }
}
```

#### Visibility Handling

- **Crossing images**: User responsibility (can add breaks to route around)
- **Rendering order**: Connections always drawn ABOVE images
- **Simplicity**: No automatic path finding, always use L-shape or center-axis

---

### 3. Manageability

#### 3.1 Adding Breaks (Segment Division)

**User action**: Click on segment midpoint to add break

**Before**:
```
Segment 0 (H): start=(0, 50), end=(100, 50)
Points: [0, 50, 100, 50]
```

**After** (add break at x=50, y=50):
```
Segment 0 (H): (0, 50) -> (50, 50)
Segment 1 (V): (50, 50) -> (50, 100)  [NEW perpendicular]
Segment 2 (H): (50, 100) -> (100, 50) [NEW back to direction]

Points: [0, 50, 50, 50, 50, 100, 100, 50]
```

**Important**: After break is added, connection structure is LOCKED. No automatic rebuilding on image drag.

#### 3.2 Dragging Segments

**Visual representation**:
- Selected connection shows handles (blue circles, radius 5px) at each segment midpoint
- Handle position: `(segment.start + segment.end) / 2`

**Handle calculation**:
```javascript
handle.x = (segment.start.x + segment.end.x) / 2
handle.y = (segment.start.y + segment.end.y) / 2
```

**Dragging rules**:
```
Vertical segment (x locked):
  - Can move LEFT/RIGHT only
  - delta_x applied, delta_y ignored
  - Update: segment.start.x += delta_x, segment.end.x += delta_x

Horizontal segment (y locked):
  - Can move UP/DOWN only
  - delta_y applied, delta_x ignored
  - Update: segment.start.y += delta_y, segment.end.y += delta_y
```

**Update adjacent segments**:
```javascript
function updateSegmentPosition(connection, segmentIndex, deltaX, deltaY) {
  const segment = connection.segments[segmentIndex];
  
  // Update dragged segment coordinates
  segment.start.x += deltaX;
  segment.start.y += deltaY;
  segment.end.x += deltaX;
  segment.end.y += deltaY;
  
  // Previous segment endpoint must match current segment start
  if (segmentIndex > 0) {
    const prevSeg = connection.segments[segmentIndex - 1];
    prevSeg.end.x = segment.start.x;
    prevSeg.end.y = segment.start.y;
  }
  
  // Next segment startpoint must match current segment end
  if (segmentIndex < connection.segments.length - 1) {
    const nextSeg = connection.segments[segmentIndex + 1];
    nextSeg.start.x = segment.end.x;
    nextSeg.start.y = segment.end.y;
  }
}
```

#### 3.3 Image Dragging Updates

**Rule**: Only first segment changes. Middle and end segments preserve user layout.

```
When image moves by (delta_x, delta_y):

Step 1: Update segment 0 start point (pin location)
  segment0.start.x += delta_x
  segment0.start.y += delta_y

Step 2: Update segment 1 connection
  segment1.start = segment0.end (always connected)
  
  If segments have different directions:
    - No change needed (orthogonality automatic)
    - Segment 1 endpoint unchanged

Step 3+: No further updates
  All other segments remain in place
  (Preserves user's routing decisions)
```

**Examples**:

```
Scenario A: Image moves RIGHT along H segment
Connection: Pump (RIGHT) -> Valve (LEFT)
Segment 0: (150,100) -> (300,100) [H]

Image moves RIGHT by 50:
  Segment 0.start.x: 150 + 50 = 200
  Segment 0.start.y: 100 (unchanged)
  Result: (200,100) -> (300,100) [shorter]

Scenario B: Image moves UP perpendicular to H segment
Connection: Pump (RIGHT) -> Valve (TOP)
Segment 0: (150,100) -> (300,100) [H]
Segment 1: (300,100) -> (300,200) [V]

Image moves UP by 30:
  Segment 0.start.x: 150 (unchanged)
  Segment 0.start.y: 100 - 30 = 70
  Segment 0 now: (150,70) -> (300,100)
  
  Segment 1 must reconnect:
    Segment 1.start: (300,100) [unchanged]
    Segment 1.end: (300,200) [unchanged]
  
  Result: Connection has small vertical jog (expected, user can fix with breaks)
```

---

## Data Structure

### Connection Object (in memory)

```javascript
connection = {
  id: "conn_123",
  
  // Connection endpoints
  fromPin: {
    id: "pin_pump_right",
    imageId: "img_pump_1",
    side: "RIGHT",
    x: 150,
    y: 100
  },
  
  toPin: {
    id: "pin_valve_left",
    imageId: "img_valve_1",
    side: "LEFT",
    x: 450,
    y: 100
  },
  
  // Segments: core routing data
  segments: [
    {
      index: 0,
      direction: "H",
      start: { x: 150, y: 100 },
      end: { x: 300, y: 100 }
    },
    {
      index: 1,
      direction: "V",
      start: { x: 300, y: 100 },
      end: { x: 300, y: 150 }
    },
    {
      index: 2,
      direction: "H",
      start: { x: 300, y: 150 },
      end: { x: 450, y: 150 }
    }
  ],
  
  // Rendering
  konvaLine: KonvaLineObject,
  handles: [KonvaCircle, KonvaCircle, KonvaCircle],
  isSelected: false,
  
  // Status
  status: {
    deviceStatus: "ON",
    pathStatus: "OPEN",
    flowStatus: "ACTIVE",
    faultStatus: "OK"
  },
  
  // Metadata
  userModified: false,        // True if user added breaks
  lastModified: "2026-01-06T23:12:00Z"
}
```

### Points Array (for Konva rendering)

```javascript
// Flat array of coordinates for Konva line
connection.points = [
  150, 100,  // Point 0: segment 0 start
  300, 100,  // Point 1: segment 0 end = segment 1 start
  300, 150,  // Point 2: segment 1 end = segment 2 start
  450, 150   // Point 3: segment 2 end
]

// Relationship:
// Segment i uses points[i*2], points[i*2+1] -> points[(i+1)*2], points[(i+1)*2+1]
// Segment 0: points[0,1] -> points[2,3]
// Segment 1: points[2,3] -> points[4,5]
// Segment 2: points[4,5] -> points[6,7]
```

### JSON Schema (for storage - FileManager responsibility)

```json
{
  "connections": [
    {
      "id": "conn_123",
      "fromPin": "pin_pump_right",
      "toPin": "pin_valve_left",
      "points": [150, 100, 300, 100, 300, 150, 450, 150],
      "status": {
        "deviceStatus": "ON",
        "pathStatus": "OPEN",
        "flowStatus": "ACTIVE",
        "faultStatus": "OK"
      },
      "userModified": false,
      "lastModified": "2026-01-06T23:12:00Z"
    }
  ]
}
```

---

## Segment Management

### Converting Points Array to Segments

```javascript
function pointsToSegments(points) {
  const segments = [];
  
  for (let i = 0; i < points.length - 2; i += 2) {
    const start = { x: points[i], y: points[i + 1] };
    const end = { x: points[i + 2], y: points[i + 3] };
    
    // Determine direction
    const direction = (start.x === end.x) ? "V" : "H";
    
    segments.push({
      index: i / 2,
      direction: direction,
      start: start,
      end: end
    });
  }
  
  return segments;
}
```

### Converting Segments to Points Array

```javascript
function segmentsToPoints(segments) {
  const points = [];
  
  for (let i = 0; i < segments.length; i++) {
    if (i === 0) {
      points.push(segments[i].start.x, segments[i].start.y);
    }
    points.push(segments[i].end.x, segments[i].end.y);
  }
  
  return points;
}
```

### Validating Segments

```javascript
function validateSegments(segments) {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    // Check orthogonality
    if (seg.direction === "H") {
      if (seg.start.y !== seg.end.y) {
        throw new Error(`Segment ${i}: H-segment Y mismatch`);
      }
    } else if (seg.direction === "V") {
      if (seg.start.x !== seg.end.x) {
        throw new Error(`Segment ${i}: V-segment X mismatch`);
      }
    }
    
    // Check continuity with next segment
    if (i < segments.length - 1) {
      if (seg.end.x !== segments[i + 1].start.x ||
          seg.end.y !== segments[i + 1].start.y) {
        throw new Error(`Segment ${i}: discontinuity with segment ${i + 1}`);
      }
    }
    
    // Check alternation
    if (i > 0) {
      if (seg.direction === segments[i - 1].direction) {
        throw new Error(`Segment ${i}: consecutive segments have same direction`);
      }
    }
  }
  
  return true;
}
```

---

## Handle System

### Handle Creation

```javascript
function createHandles(connection, layer) {
  connection.handles = [];
  
  for (let i = 0; i < connection.segments.length; i++) {
    const seg = connection.segments[i];
    const handleX = (seg.start.x + seg.end.x) / 2;
    const handleY = (seg.start.y + seg.end.y) / 2;
    
    const handle = new Konva.Circle({
      x: handleX,
      y: handleY,
      radius: 5,
      fill: "#2196F3",
      stroke: "#fff",
      strokeWidth: 1.5,
      draggable: true,
      visible: false,
      segmentIndex: i
    });
    
    handle.on("dragmove", () => onHandleDragMove(handle, connection));
    handle.on("dragend", () => onHandleDragEnd(handle, connection, layer));
    
    layer.add(handle);
    connection.handles.push(handle);
  }
}
```

### Handle Visibility

```javascript
function showHandles(connection) {
  connection.handles.forEach(handle => handle.visible(true));
}

function hideHandles(connection) {
  connection.handles.forEach(handle => handle.visible(false));
}
```

### Handle Drag Event

```javascript
function onHandleDragMove(handle, connection) {
  const segmentIndex = handle.segmentIndex;
  const segment = connection.segments[segmentIndex];
  
  // Calculate delta from initial position
  const initialX = (segment.start.x + segment.end.x) / 2;
  const initialY = (segment.start.y + segment.end.y) / 2;
  const currentX = handle.x();
  const currentY = handle.y();
  const deltaX = currentX - initialX;
  const deltaY = currentY - initialY;
  
  // Movement must be perpendicular to segment
  if (segment.direction === "V" && Math.abs(deltaX) > Math.abs(deltaY)) {
    updateSegmentPosition(connection, segmentIndex, deltaX, 0);
  } else if (segment.direction === "H" && Math.abs(deltaY) > Math.abs(deltaX)) {
    updateSegmentPosition(connection, segmentIndex, 0, deltaY);
  }
  
  redrawConnection(connection);
}
```

---

## Operations

### Operation 1: Create Connection

**Input**: fromPin, toPin

**Process**:
1. Validate pins on different images
2. Determine routing case (2 or 3 segments)
3. Calculate segment endpoints
4. Create segments array
5. Convert to points array
6. Create Konva line
7. Create handles (hidden by default)

**Output**: Connection object

```
Example calculation for 3-segment center-axis:
  centerX = (150 + 450) / 2 = 300
  centerY = (100 + 100) / 2 = 100
  
  segments:
    [0]: (150,100) -> (300,100) [H]
    [1]: (300,100) -> (300,100) [V]
    [2]: (300,100) -> (450,100) [H]
```

### Operation 2: Add Break to Segment

**Input**: Connection, segmentIndex, position along segment

**Process**:
1. Get segment at index
2. Calculate break point coordinates (perpendicular to segment)
3. Split segment into 3 parts:
   - Part 1: original start -> break point
   - Part 2: break point -> perpendicular end
   - Part 3: perpendicular point -> original end
4. Insert new segments into array
5. Update indices
6. Rebuild points array
7. Create handles for new segments
8. Set `userModified = true`

**Output**: Updated connection

**Key**: Connection structure now locked - no automatic rebuilds on image drag

### Operation 3: Drag Segment Handle

**Input**: Connection, segmentIndex, dragDelta (deltaX, deltaY)

**Process**:
1. Get segment
2. Validate perpendicular movement (V-seg can move X, H-seg can move Y)
3. Update segment coordinates
4. Update adjacent segment endpoints (maintain continuity)
5. Rebuild points array
6. Update handle positions
7. Redraw

**Output**: Updated connection

**Constraint**: Preserve user modifications (don't rebuild structure)

### Operation 4: Drag Image

**Input**: Connection, imageMoveData (deltaX, deltaY)

**Process**:
1. Get first segment (attached to image pin)
2. Update segment start point (pin location):
   - segment.start.x += deltaX
   - segment.start.y += deltaY
3. Update second segment start (maintain continuity):
   - segment[1].start = segment[0].end
4. Rebuild points array
5. Redraw

**Output**: Updated first segment only

**Constraint**: All other segments unchanged (preserve user layout)

---

## Reliability and Constraints

### No Automatic Rebuilding

**Rule**: Once user adds breaks, connection structure is NEVER automatically changed.

**Enforcement**:
- Store `userModified: boolean` flag
- When user adds break: set to `true`
- Only update coordinates of points, never change segment count
- On image drag: only first segment updates
- On segment drag: only that segment and adjacent connection points update

**Guarantee**: User's routing decisions are preserved

### Concurrent Operation Prevention

**Rule**: Cannot simultaneously drag multiple segments or images.

**Enforcement**:
- Track active drag state: `connection.isDragging`
- When handle drag starts: set flag to true
- When handle drag ends: set flag to false
- Prevent new drags while flag is true

```javascript
function onHandleDragStart(handle, connection) {
  if (connection.isDragging) return;
  connection.isDragging = true;
}

function onHandleDragEnd(handle, connection) {
  connection.isDragging = false;
}
```

### Data Integrity

**Validation checklist for every operation**:
- [ ] All segments maintain orthogonality (H or V, not diagonal)
- [ ] All segments maintain continuity (end of N = start of N+1)
- [ ] Segments alternate direction (no consecutive same direction)
- [ ] Points array matches segments
- [ ] fromPin = segment[0].start
- [ ] toPin = segment[last].end

**Validation function**:
```javascript
function validateConnectionIntegrity(connection) {
  validateSegments(connection.segments);
  
  // Check pin attachment
  if (connection.segments[0].start.x !== connection.fromPin.x ||
      connection.segments[0].start.y !== connection.fromPin.y) {
    throw new Error("From pin not attached correctly");
  }
  
  const lastSeg = connection.segments[connection.segments.length - 1];
  if (lastSeg.end.x !== connection.toPin.x ||
      lastSeg.end.y !== connection.toPin.y) {
    throw new Error("To pin not attached correctly");
  }
}
```

---

## File Management Note

**Save/Load functionality**: Handled by separate FileManager

**Why separate**:
- FileManager orchestrates all managers during save/load
- ConnectionManager exports only what's needed: `toJSON()` method
- ConnectionManager imports from JSON: `fromJSON(data)` method
- FileManager handles complete file format and validation

**Integration**:
- Each manager implements `toJSON()` and `fromJSON()`
- FileManager calls these methods for each manager
- Single source of truth for file format in FileManager

---

## Rendering

### Drawing Connection

```javascript
function drawConnection(connection, layer) {
  // Update Konva line with current points
  connection.konvaLine.points(connection.points);
  
  // Update handle positions
  for (let i = 0; i < connection.segments.length; i++) {
    const seg = connection.segments[i];
    const handle = connection.handles[i];
    handle.x((seg.start.x + seg.end.x) / 2);
    handle.y((seg.start.y + seg.end.y) / 2);
  }
  
  layer.draw();
}
```

### Connection Layer Order

```
Layer stack (bottom to top):
1. Images (bottom)
2. Connections (always above images)
3. Handles (top, only when connection selected)
4. Selection indicators (top)
```

---

## Lab Work Iterations

### Iteration 1: Data Structure and Basic Rendering (Week 1)

**Objectives**: Implement core data structures and basic rendering

**Tasks**:
- [ ] Create Connection class with segments array
- [ ] Implement pointsToSegments() conversion function
- [ ] Implement segmentsToPoints() conversion function
- [ ] Implement validateSegments() validation function
- [ ] Create basic Konva line rendering
- [ ] Implement getRoutingCase() to determine 2 or 3 segment routing
- [ ] Test: Create connection with 2 segments (non-corresponding sides)
- [ ] Test: Create connection with 3 segments (corresponding sides)
- [ ] Test: Validate segment orthogonality
- [ ] Test: Validate segment continuity

**Files to create**:
- `public/js/connection-manager.js` - Main class
- `public/js/connection-path-finder.js` - Routing calculation

**Deliverable**: Connection objects can be created and rendered with proper segment structure

**Testing**:
```javascript
// Test: 2-segment L-shape
const conn = createConnection(pinA_LEFT, pinB_TOP);
assert(conn.segments.length === 2);
assert(conn.segments[0].direction === "V");
assert(conn.segments[1].direction === "H");

// Test: 3-segment center-axis
const conn = createConnection(pinA_LEFT, pinB_RIGHT);
assert(conn.segments.length === 3);
assert(conn.segments[0].direction === "H");
assert(conn.segments[1].direction === "V");
assert(conn.segments[2].direction === "H");
```

---

### Iteration 2: Segment Dragging Mechanics (Week 2)

**Objectives**: Implement handle system and segment dragging

**Tasks**:
- [ ] Implement createHandles() function
- [ ] Implement showHandles() and hideHandles() functions
- [ ] Implement perpendicular movement validation
- [ ] Implement updateSegmentPosition() logic
- [ ] Implement handle drag event handlers
- [ ] Implement coordinate locking (V-segment X-only, H-segment Y-only)
- [ ] Implement adjacent segment update logic
- [ ] Test: Drag vertical segment left/right
- [ ] Test: Drag horizontal segment up/down
- [ ] Test: Adjacent segments update their endpoints
- [ ] Test: Orthogonality maintained after drag
- [ ] Test: Drag validation prevents invalid movements

**Files to modify**:
- `public/js/connection-manager.js` - Add handle and drag logic
- `public/js/selection-manager.js` - Show handles on selection

**Deliverable**: Handles visible on selected connections, dragging updates segments correctly

**Testing**:
```javascript
// Test: Vertical segment drag
dragSegmentHandle(conn, 1, 30, 0);  // Move right
assert(conn.segments[1].start.x === initialX + 30);
assert(conn.segments[1].end.x === initialX + 30);
assert(conn.segments[2].start.x === initialX + 30);  // Adjacent updates

// Test: Movement validation
dragSegmentHandle(conn, 1, 0, 20);  // Try to move up (invalid for V-seg)
assert(conn.segments[1].start.x === initialX);  // No change
```

---

### Iteration 3: Image Drag Integration (Week 3)

**Objectives**: Update connections when images are dragged

**Tasks**:
- [ ] Create ConnectionImageObserver to listen for image drag events
- [ ] Implement updateConnectionOnImageDrag() function
- [ ] Update only first segment start point (pin location)
- [ ] Update second segment start point (maintain continuity)
- [ ] Preserve all other segments (no rebuilding)
- [ ] Test: Drag image left/right - first segment changes
- [ ] Test: Drag image up/down - first segment and connection point update
- [ ] Test: Middle segments unchanged after drag
- [ ] Test: Multiple connections from same image all update correctly
- [ ] Test: Preserve user modifications (breaks) after image drag

**Files to modify**:
- `public/js/connection-manager.js` - Add image drag listener
- `public/js/image-manager.js` - Trigger connection update events

**Deliverable**: Connections update when images move, preserving user routing decisions

**Testing**:
```javascript
// Test: Image drag along segment
conn.segments[0] = { direction: "H", start: {x:150, y:100}, end: {x:300, y:100} };
updateConnectionOnImageDrag(conn, {deltaX: 50, deltaY: 0});
assert(conn.segments[0].start.x === 200);
assert(conn.segments[0].start.y === 100);
assert(conn.segments[1].start === conn.segments[0].end);

// Test: Image drag perpendicular
updateConnectionOnImageDrag(conn, {deltaX: 0, deltaY: -30});
assert(conn.segments[0].start.y === 70);
assert(conn.segments[1].start.y === 100);  // Unchanged
```

---

### Iteration 4: Break Points and Refinement (Week 4)

**Objectives**: Implement break points and finalize routing

**Tasks**:
- [ ] Implement addBreakToSegment() function
- [ ] Calculate break point perpendicular to segment
- [ ] Split segment into 3 new segments
- [ ] Update segment indices after break
- [ ] Set userModified flag to true
- [ ] Ensure structure locked (no automatic rebuilds)
- [ ] Implement click-to-add-break UI interaction
- [ ] Test: Add break to horizontal segment
- [ ] Test: Add break to vertical segment
- [ ] Test: Break creates proper 3-segment structure
- [ ] Test: Image drag doesn't rebuild after break
- [ ] Test: Can add multiple breaks to same connection
- [ ] Integration: All four operations work together
- [ ] Edge case: Cannot drag segment that would collapse

**Files to modify**:
- `public/js/connection-manager.js` - Add break logic
- `public/js/ui-controller.js` - Wire up break interaction

**Deliverable**: Full routing system with breaks, dragging, image updates all working correctly

**Testing**:
```javascript
// Test: Add break
addBreakToSegment(conn, 0, {x: 225, y: 100});
assert(conn.segments.length === 4);
assert(conn.segments[1].direction === "V");  // Perpendicular

// Test: Structure locked
assert(conn.userModified === true);
updateConnectionOnImageDrag(conn, {deltaX: 20, deltaY: 0});
assert(conn.segments.length === 4);  // Still 4, not rebuilt

// Test: Drag after break
dragSegmentHandle(conn, 1, 30, 0);
assert(conn.segments[1].start.x === newX + 30);
assert(conn.segments[2].start.x === newX + 30);  // Adjacent updates
```

---

## Implementation Timeline

| Week | Iteration | Focus | Deliverable |
|------|-----------|-------|-------------|
| 1 | Data Structure | Create, segments, rendering | Working connection rendering |
| 2 | Dragging | Handles, segment movement | Full segment drag system |
| 3 | Image Integration | Image drag updates | Connections follow images |
| 4 | Breaks | Break points, refinement | Complete routing system |

---

**Status**: Ready for Iteration 1 implementation
**Next Step**: Create ConnectionManager class with data structure and basic rendering
