# Connections Implementation Plan

**Version**: 1.0
**Date**: 06.01.2026
**Status**: Development Specification

---

## Overview

Connections are the visual representation of flow paths between devices. They must satisfy three core requirements:

1. **Orthogonality** - All segments are either horizontal (H) or vertical (V) at 0 or 90 degrees
2. **Visibility** - Connections should avoid crossing images where possible (user responsibility for breaks)
3. **Manageability** - Connections can be modified through breaks and segment dragging

---

## Visual Requirements

### 1. Orthogonality

Every connection consists of connected segments:
- Each segment is strictly horizontal or vertical
- Segments alternate between H and V
- Minimum 2 segments (direct H or V connection)
- Typical 3 segments (center-axis routing)
- User can add breaks creating 3 new segments from 1 existing

### 1.1 Segment Types

**Horizontal Segment (H)**:
```
Start point: (x1, y)
End point:   (x2, y)
Property: y1 == y2 (same Y coordinate)
Movement: Can only move along Y axis (up/down)
Length change: x2 - x1 increases or decreases
```

**Vertical Segment (V)**:
```
Start point: (x, y1)
End point:   (x, y2)
Property: x1 == x2 (same X coordinate)
Movement: Can only move along X axis (left/right)
Length change: y2 - y1 increases or decreases
```

### 1.2 Minimal Segment Counts

**2 segments** (direct connection, pines on corresponding sides):
```
Case 1: Pins on LEFT-RIGHT sides
┌─────┐                 ┌─────┐
│  A  │pin_R ─────H───── pin_L│  B  │
└─────┘                 └─────┘
Segments: [H] - 1 segment, line is visible

Case 2: Pins on TOP-BOTTOM sides
┌─────┐
│  A  │ pin_B
└─────┘
   |
   |V
   |
┌─────┐ pin_T
│  B  │
└─────┘
Segments: [V] - 1 segment
```

**3 segments** (center-axis, most common):
```
Case 1: Pins on perpendicular sides (LEFT-TOP, etc.)
┌─────┐pin_R              ┌─────┐
│  A  │──H──┐             │  B  │ pin_T
└─────┘     │             └─────┘
            │                |
            └────H────┬──V───┘
                      |

Structure: [H, V, H] or [V, H, V]
- First segment: exit from pin A
- Middle segment: turn
- Last segment: enter pin B

Case 2: Using center-axis routing (preferred)
┌─────┐pin_R              ┌─────┐
│  A  │──H─────centerX    │  B  │ pin_T
└─────┘        │          └─────┘
               │V              |
               │               |
               └─H─────centerX─┘

Structure: [H, V, H] or similar
```

**4+ segments** (with breaks, or complex routing):
```
User adds break on segment 2:
┌─────┐                           ┌─────┐
│  A  │──H────┬──V──┬──H─────────│  B  │
└─────┘       │     │            └─────┘
       centerX│     │new break point
              │     │
        (break added here)

Result: Original 3 segments become more complex structure
```

### 2. Visibility

#### Pins on Corresponding Sides (Odd number of segments)

```
Definition: Pins on sides that "face" each other
- LEFT-RIGHT: pins on left side of A and right side of B
- TOP-BOTTOM: pins on top side of A and bottom side of B

Result: Odd number of segments (1, 3, 5, ...)

Example:
┌─────┐pin_R ─────H───── pin_L ┌─────┐
│  A  │                         │  B  │
└─────┘                         └─────┘

Path: 1 segment (H)
No intermediate space needed
```

#### Pins on Non-Corresponding Sides (Even number of segments)

```
Definition: Pins on sides that do NOT "face" each other
- LEFT-TOP: pin on left of A, pin on top of B
- TOP-RIGHT: pin on top of A, pin on right of B

Result: Even number of segments (2, 4, 6, ...)

Example:
┌─────┐pin_B (BOTTOM)      ┌─────┐
│  A  │                    │  B  │ pin_R
└─────┘                    └─────┘
   |
   |V
   |
   └──────H─────────────────┘

Path: 2 segments (V, H)
```

#### Visibility Rule

- **Best effort**: Route connections to avoid images
- **Center-axis routing**: Use midpoint between pins as reference
- **User responsibility**: If images overlap routing path, user can add breaks and adjust
- **Rendering order**: Connections drawn ABOVE images (always visible)

### 3. Manageability

#### 3.1 Adding Breaks (Segment Division)

**User action**: Click on segment to add break point

**Before**:
```
Segment 1: start=(0, 50), end=(100, 50)
Points array: [0, 50, 100, 50]
```

**After** (add break at midpoint x=50):
```
Segment 1: (0, 50) -> (50, 50)
Break point at (50, 50) with handles for two new segments
Segment 2: (50, 50) -> (50, 150) [NEW: perpendicular]
Segment 3: (50, 150) -> (100, 50) [NEW: back to original]

Points array: [0, 50, 50, 50, 50, 150, 100, 50]
Segments: [S1_H, S2_V, S3_H]
```

#### 3.2 Dragging Segments

**Visual representation**:
- Selected connection shows handles (blue circles) at segment midpoints
- Handles appear ONLY when connection is selected
- Handle radius: 5px, fill: #2196F3, stroke: white

**Handle position**:
```
For segment from (x1, y1) to (x2, y2):
handle.x = (x1 + x2) / 2
handle.y = (y1 + y2) / 2
```

**Dragging behavior**:
```
When user drags handle in direction perpendicular to segment:

Vertical segment (x1==x2, y1!=y2):
  - Can move LEFT/RIGHT only
  - Movement delta: dx (change in X)
  - Update: segment.start.x += dx, segment.end.x += dx
  - Adjacent H segments: update their endpoint X

Horizontal segment (y1==y2, x1!=x2):
  - Can move UP/DOWN only
  - Movement delta: dy (change in Y)
  - Update: segment.start.y += dy, segment.end.y += dy
  - Adjacent V segments: update their endpoint Y
```

**Coordinate transformation** (detailed):

```
Given:
- Segment i with handle being dragged
- delta: movement amount in one direction
- direction: X (horizontal movement) or Y (vertical movement)

Step 1: Validate movement
  - Check if movement is perpendicular to segment direction
  - Vertical segment + X movement = VALID
  - Horizontal segment + Y movement = VALID
  - Horizontal segment + X movement = INVALID (blocked)

Step 2: Update dragged segment
  If segment is VERTICAL:
    segment.start.x += delta
    segment.end.x += delta
    segment.start.y stays same (locked)
    segment.end.y stays same (locked)
  
  If segment is HORIZONTAL:
    segment.start.x stays same (locked)
    segment.end.x stays same (locked)
    segment.start.y += delta
    segment.end.y += delta

Step 3: Update adjacent segments
  Let S = current segment, Si = previous segment, Sj = next segment
  
  If S is VERTICAL (x locked, y locked):
    Si (HORIZONTAL):
      If Si.end point == S.start point:
        Si.end.x = S.start.x (maintain connection)
    
    Sj (HORIZONTAL):
      If Sj.start point == S.end point:
        Sj.start.x = S.end.x (maintain connection)
  
  If S is HORIZONTAL (x locked, y locked):
    Si (VERTICAL):
      If Si.end point == S.start point:
        Si.end.y = S.start.y (maintain connection)
    
    Sj (VERTICAL):
      If Sj.start point == S.end point:
        Sj.start.y = S.end.y (maintain connection)

Step 4: Update handle position
  handle.x = (segment.start.x + segment.end.x) / 2
  handle.y = (segment.start.y + segment.end.y) / 2

Step 5: Redraw
  Rebuild points array from updated segments
  Update Konva line object
  Render
```

#### 3.3 Image Dragging Updates

**Scenario 1: Image moves along segment direction**
```
Connection: Pump (RIGHT pin) -> Valve (LEFT pin)
Segment 1 direction: H (horizontal)

Image move: RIGHT (delta_x = 50)
Segment 1 update:
  - segment.start (pin location) moves RIGHT by 50
  - segment.end (first waypoint) stays same
  - Result: segment becomes shorter

Formula:
  segment.start.x += delta_x
  segment.end.x stays same
```

**Scenario 2: Image moves perpendicular to segment direction**
```
Connection: Pump (RIGHT pin) -> Valve (LEFT pin)
Segment 1 direction: H (horizontal)

Image move: UP (delta_y = -30)
Segment 1 update:
  - segment.start.y (pin Y location) changes by delta_y
  - segment.end.y stays same
  - This breaks orthogonality! Need segment 2 adjustment.

Correction:
  After moving pin:
  Segment 2 (V) must connect from new pin location:
    segment2.start = new pin location
    segment2.end.x must match segment2.start.x

Formula:
  # Segment 1 (H) after image move UP
  segment1.start.x += delta_x
  segment1.start.y += delta_y  # Pin moved up
  segment1.end.y stays same      # Maintain orthogonality
  
  # Segment 2 (V) reattachment
  segment2.start.x = segment1.end.x  # Match H segment endpoint
  segment2.start.y = segment1.end.y  # Maintain corner
  segment2.end.x = segment1.end.x    # Vertical: X locked
```

**Scenario 3: Complete update process for image drag**

```
When image moves by (delta_x, delta_y):

Step 1: Update segment 1 (attached to moved image)
  FOR EACH pin on moved image:
    pin.x += delta_x
    pin.y += delta_y
  
  segment1.start = updated pin coordinates
  
  Step 2: Update segment 2 (perpendicular to segment 1)
  segment2.start = segment1.end (connection point)
  segment2.end must maintain its own direction:
    If segment1 is H and segment2 is V:
      segment2.end.x = segment1.end.x (lock X)
      segment2.end.y stays same (unchanged)
    
    If segment1 is V and segment2 is H:
      segment2.end.x stays same (unchanged)
      segment2.end.y = segment1.end.y (lock Y)
  
  Step 3: No further updates needed
  Segments 3+ are not affected by source image movement
  They remain in place (middle of diagram)
```

**Critical rule**: Only first and last segments change on image drag

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
    side: "RIGHT",          // TOP, BOTTOM, LEFT, RIGHT
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
      direction: "H",  // H=horizontal, V=vertical
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
  bindingId: null,
  lastModified: "2026-01-06T23:12:00Z",
  userModified: true  // True if user added breaks
}
```

### Points Array (for Konva rendering)

```javascript
// Internal representation for Konva
connection.points = [
  150, 100,  // Point 0: segment 0 start (pin)
  300, 100,  // Point 1: segment 0 end = segment 1 start
  300, 150,  // Point 2: segment 1 end = segment 2 start
  450, 150   // Point 3: segment 2 end (pin)
]

// Relationship:
// Segment i: points[i*2], points[i*2+1] -> points[i*2+2], points[i*2+3]
// Segment 0: points[0,1] -> points[2,3]
// Segment 1: points[2,3] -> points[4,5]
// etc.
```

### JSON Schema (for storage)

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
      "userModified": true,
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
  
  // Calculate delta
  const startX = (segment.start.x + segment.end.x) / 2;
  const startY = (segment.start.y + segment.end.y) / 2;
  const currentX = handle.x();
  const currentY = handle.y();
  const deltaX = currentX - startX;
  const deltaY = currentY - startY;
  
  // Validate: movement must be perpendicular
  if (segment.direction === "V" && Math.abs(deltaX) > Math.abs(deltaY)) {
    // Vertical segment: allow X movement only
    updateSegmentPosition(connection, segmentIndex, deltaX, 0);
  } else if (segment.direction === "H" && Math.abs(deltaY) > Math.abs(deltaX)) {
    // Horizontal segment: allow Y movement only
    updateSegmentPosition(connection, segmentIndex, 0, deltaY);
  }
  
  redrawConnection(connection);
}
```

---

## Segment Position Update Logic

### Single Segment Movement

```javascript
function updateSegmentPosition(connection, segmentIndex, deltaX, deltaY) {
  const segment = connection.segments[segmentIndex];
  
  // Update dragged segment
  segment.start.x += deltaX;
  segment.start.y += deltaY;
  segment.end.x += deltaX;
  segment.end.y += deltaY;
  
  // Update previous segment connection
  if (segmentIndex > 0) {
    const prevSegment = connection.segments[segmentIndex - 1];
    prevSegment.end.x = segment.start.x;
    prevSegment.end.y = segment.start.y;
  }
  
  // Update next segment connection
  if (segmentIndex < connection.segments.length - 1) {
    const nextSegment = connection.segments[segmentIndex + 1];
    nextSegment.start.x = segment.end.x;
    nextSegment.start.y = segment.end.y;
  }
}
```

### Image Movement Update Logic

```javascript
function updateConnectionOnImageDrag(connection, imageMoveData) {
  const { deltaX, deltaY } = imageMoveData;
  
  // Update segment 0 (attached to image)
  const seg0 = connection.segments[0];
  seg0.start.x += deltaX;
  seg0.start.y += deltaY;
  
  if (connection.segments.length > 1) {
    // Update segment 1 connection point
    const seg1 = connection.segments[1];
    seg1.start.x = seg0.end.x;
    seg1.start.y = seg0.end.y;
    
    // Restore orthogonality
    if (seg0.direction === "H" && seg1.direction === "V") {
      seg1.end.x = seg0.end.x;  // Lock X for vertical
    } else if (seg0.direction === "V" && seg1.direction === "H") {
      seg1.end.y = seg0.end.y;  // Lock Y for horizontal
    }
  }
  
  // Segments 2+ remain unchanged
}
```

---

## Operations

### Operation 1: Create Connection

```
Input: fromPin, toPin
Process:
  1. Validate pins on different images
  2. Calculate center-axis waypoints
  3. Create segments array
  4. Create points array from segments
  5. Create Konva line
  6. Create handles
Output: Connection object with all data
Render: Draw connection and add to layer
```

### Operation 2: Add Break to Segment

```
Input: Connection, segmentIndex, breakPoint (coordinates)
Process:
  1. Get segment at index
  2. Split into 3 segments:
     - Segment1: start -> breakPoint (same direction)
     - Segment2: breakPoint -> perpendicular (opposite direction)
     - Segment3: perpendicular point -> end (same as segment1)
  3. Insert into segments array
  4. Rebuild points array
  5. Create new handles for new segments
  6. Preserve user modification flag
Output: Updated connection with more segments
Render: Redraw with new handles
```

### Operation 3: Drag Segment Handle

```
Input: Connection, segmentIndex, deltaX, deltaY
Process:
  1. Get segment
  2. Validate perpendicular movement
  3. Update segment coordinates
  4. Update adjacent segment endpoints
  5. Rebuild points array
  6. Update handle positions
Output: Updated connection
Constraint: No automatic rebuild (preserve user layout)
Render: Redraw connection
```

### Operation 4: Drag Image

```
Input: Connection, imageMoveData (deltaX, deltaY)
Process:
  1. Get first segment (attached to image pin)
  2. Move segment start point
  3. Update adjacent segment endpoints
  4. Maintain orthogonality
  5. Rebuild points array
Output: Updated first segment only
Constraint: Segments 2+ unchanged (preserve layout)
Render: Redraw connection
```

### Operation 5: Load Connection from Storage

```
Input: Connection JSON (points array)
Process:
  1. Parse points array
  2. Convert to segments
  3. Validate segments (orthogonality, continuity)
  4. Create Konva line
  5. Create handles
  6. Restore status data
Output: Connection object ready for editing
Constraint: Must reconstruct exact same routing
Render: Draw on canvas
```

### Operation 6: Save Connection to Storage

```
Input: Connection object
Process:
  1. Extract points array from segments
  2. Extract status data
  3. Create JSON structure
  4. Validate before save
Output: JSON ready for storage
Constraint: Must preserve routing exactly
```

---

## Reliability and Constraints

### No Automatic Rebuilding

**Rule**: Once connection is created with breaks, it is NEVER automatically rebuilt.

**Enforcement**:
- Store `userModified: boolean` flag
- If user added breaks: `userModified = true`
- Never modify segments array structure (only coordinates)
- On image drag: only update first segment
- On segment drag: only update that segment and adjacent connection points

**Example**:
```
User creates connection: A -> B (3 segments)
User adds break on segment 1
User drags image A

Result: First segment position updates, but structure is preserved
- Still 4 segments (3 + 1 break)
- Segment count never changes
- No automatic rerouting
```

### Concurrent Operation Prevention

**Rule**: Cannot simultaneously drag multiple segments or images.

**Enforcement**:
- Track active drag: `connection.isDragging = true/false`
- Track which segment: `connection.activeDragSegment`
- On segment drag start: set flag, disable other handles
- On segment drag end: clear flag, enable all handles

**Code**:
```javascript
function onHandleDragStart(handle, connection) {
  if (connection.isDragging) return; // Already dragging
  connection.isDragging = true;
  connection.activeDragSegment = handle.segmentIndex;
  disableOtherHandles(connection, handle.segmentIndex);
}

function onHandleDragEnd(handle, connection) {
  connection.isDragging = false;
  connection.activeDragSegment = null;
  enableAllHandles(connection);
}
```

### Data Integrity

**Validation checklist for every operation**:
- [ ] All segments maintain orthogonality
- [ ] All segments maintain continuity (end of seg N = start of seg N+1)
- [ ] No duplicate points (unless intentional break)
- [ ] Segments alternate direction (H-V-H or V-H-V)
- [ ] Points array matches segments
- [ ] From pin = segment[0].start
- [ ] To pin = segment[last].end

**Validation function**:
```javascript
function validateConnectionIntegrity(connection) {
  const checks = {
    orthogonal: () => validateSegments(connection.segments),
    continuous: () => checkSegmentContinuity(connection.segments),
    alternating: () => checkDirectionAlternation(connection.segments),
    pinMatch: () => {
      return connection.segments[0].start.x === connection.fromPin.x &&
             connection.segments[0].start.y === connection.fromPin.y;
    },
    pointsMatch: () => {
      const recalculated = segmentsToPoints(connection.segments);
      return JSON.stringify(recalculated) === 
             JSON.stringify(connection.points);
    }
  };
  
  for (const [check, fn] of Object.entries(checks)) {
    if (!fn()) throw new Error(`Integrity check failed: ${check}`);
  }
}
```

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
  
  // Redraw layer
  layer.draw();
}
```

### Connection Layer Order

```
Layer stack (bottom to top):
1. Images (bottom)
2. Connections (middle) <- Always visible above images
3. Handles (top, only when selected)
4. Selection indicators (top)
```

---

## Implementation Phases

### Phase 1: Basic Structure (Week 1)

**Deliverables**:
- Connection data structure
- Points array management
- Segments validation
- Konva line rendering
- Load/save JSON

**Files**: `connection-manager.js`, `connection-path-finder.js`

### Phase 2: Segment Dragging (Week 2)

**Deliverables**:
- Handle creation and positioning
- Handle drag event handlers
- Segment position update logic
- Adjacent segment coordinate updates
- Orthogonality maintenance

**Files**: `connection-manager.js` (update)

### Phase 3: Image Drag Integration (Week 3)

**Deliverables**:
- Image move callback
- First segment update logic
- Orthogonality restoration
- Preserve middle segments

**Files**: `image-manager.js` (update), `connection-manager.js` (update)

### Phase 4: Break Points (Week 4)

**Deliverables**:
- Click to add break
- Segment split logic
- Triple segment creation
- Handle management

**Files**: `connection-manager.js` (update)

---

## Testing Checklist

- [ ] Create connection with direct routing (2 segments)
- [ ] Create connection with center-axis routing (3 segments)
- [ ] Select connection and verify handles appear
- [ ] Drag vertical segment handle LEFT - verify movement
- [ ] Drag vertical segment handle RIGHT - verify movement
- [ ] Drag horizontal segment handle UP - verify movement
- [ ] Drag horizontal segment handle DOWN - verify movement
- [ ] Verify adjacent segments update coordinates
- [ ] Verify orthogonality maintained after drag
- [ ] Add break to horizontal segment - verify 3 new segments created
- [ ] Add break to vertical segment - verify 3 new segments created
- [ ] Drag image left - verify first segment shortens
- [ ] Drag image right - verify first segment lengthens
- [ ] Drag image up - verify pin Y changes and segment 2 adjusts
- [ ] Verify middle segments unchanged on image drag
- [ ] Load connection from JSON - verify exact routing restored
- [ ] Save connection to JSON - verify points array correct
- [ ] Verify connection renders above images
- [ ] Concurrent drag prevention - try dragging 2 segments
- [ ] Validate data integrity after each operation

---

**Status**: Ready for Phase 1 implementation
**Next Step**: Create ConnectionManager class with data structure
