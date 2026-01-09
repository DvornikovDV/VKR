# Refactoring ConnectionManager & Iteration 3 Implementation

**Date**: 09.01.2026
**Status**: Completed

---

## Overview

ConnectionManager has been refactored from a single 600+ line monolithic class into 4 focused, specialized modules:

1. **ConnectionRouter** (170 lines) - Routing calculation and segment management
2. **ConnectionEditor** (160 lines) - Segment editing, handle system, visualization
3. **ConnectionUpdater** (110 lines) - Image drag integration (Iteration 3)
4. **ConnectionManager** (140 lines) - CRUD operations and orchestration

**Total**: ~580 lines across 4 files (vs 600+ in one file)

---

## Architecture

### Dependency Graph

```
ConnectionManager (main entry point)
├─ ConnectionRouter (static utilities)
├─ ConnectionEditor (Konva rendering)
└─ ConnectionUpdater (segment updates)
```

### Responsibility Distribution

| Class | Responsibility | Key Methods |
|-------|-----------------|-------------|
| **ConnectionRouter** | Routing logic, segment calculations, validation | `getRoutingCase()`, `calculateSegments()`, `segmentsToPoints()`, `pointsToSegments()`, `validateSegments()`, `validateConnectionIntegrity()` |
| **ConnectionEditor** | Handle creation, segment dragging, rendering | `addLineEditHandles()`, `onHandleDragMove()`, `updateSegmentPosition()`, `redrawConnection()`, `showHandles()`, `hideHandles()`, `removeLineEditHandles()` |
| **ConnectionUpdater** | Image drag updates (Iteration 3) | `updateConnectionsForPin()`, `updateFirstSegment()`, `updateLastSegment()` |
| **ConnectionManager** | CRUD, orchestration, lifecycle | `createConnection()`, `deleteConnection()`, `updateConnectionsForImageDrag()`, `selectConnection()`, `deselectConnection()`, `getConnections()` |

---

## Iteration 3: Image Drag Integration

### Feature Description

When an image is dragged, connections attached to that image update only their first or last segment to maintain visual correspondence with the image's new position. All other segments preserve their positions (user's routing decisions).

### Implementation Details

#### Stage 1: Recognize Segment Updates Are Needed

```javascript
// In UIController or image-manager.js, when image is dragged:
const imageMoveData = { deltaX: 50, deltaY: 0 };
const pin = image.getAttr('image-meta').pins[0];  // Get first pin
connectionManager.updateConnectionsForImageDrag(pin, imageMoveData);
```

#### Stage 2: Update Only First Segment (if image is fromPin)

```
Before drag:
  Segment 0 (H): (100, 50) -> (200, 50)
  Segment 1 (V): (200, 50) -> (200, 100)
  Segment 2 (H): (200, 100) -> (300, 100)  [user's routing]

Image moves by deltaX=50:
  Segment 0 (H): (150, 50) -> (200, 50)  [start moved]
  Segment 1 (V): (200, 50) -> (200, 100)  [unchanged]
  Segment 2 (H): (200, 100) -> (300, 100)  [unchanged]
```

**Logic**:
1. Update segment 0's start point (pin location moved)
2. Update segment 0's end point based on direction:
   - If H: only update Y to match start
   - If V: only update X to match start
3. Update segment 1's start point to maintain continuity (= segment 0's end)
4. All other segments: NO CHANGES

#### Stage 3: Update Only Last Segment (if image is toPin)

Same logic but for last segment:
1. Update segment[n].end point (pin location moved)
2. Update segment[n].start point based on direction
3. Update segment[n-1].end point to maintain continuity
4. All other segments: NO CHANGES

### Code Flow

```javascript
// ConnectionManager.updateConnectionsForImageDrag()
this.updater.updateConnectionsForPin(
    pin,
    imageMoveData,
    this.connections,
    (conn) => this.editor.redrawConnection(conn)  // Callback for rendering
);

// ConnectionUpdater.updateConnectionsForPin()
// For each connection using this pin:
if (isFromPin) {
    this.updateFirstSegment(connMeta, deltaX, deltaY);
} else {
    this.updateLastSegment(connMeta, deltaX, deltaY);
}
```

### Testing Checklist

- [ ] Drag image left/right: first segment H direction updates (start X moves)
- [ ] Drag image up/down: first segment V direction updates (start Y moves)
- [ ] Drag image with multiple connections: all from this pin update
- [ ] Drag image after user added breaks: structure preserved, only endpoints move
- [ ] Drag image with L-shape (2 segments): works correctly
- [ ] Drag image with 3-segment center-axis: works correctly
- [ ] Undo after drag: state restored
- [ ] Middle segments never change position during image drag

### Edge Cases Handled

1. **Multiple connections from same image**
   - updateConnectionsForImageDrag iterates through all connections
   - Checks if pin is fromPin or toPin for each
   - Updates correctly regardless of count

2. **Perpendicular movements**
   - Segment 0 (H): only Y moves with image if image moves vertically
   - Segment 0 (V): only X moves with image if image moves horizontally
   - Prevents distortion of orthogonal structure

3. **Preserving user breaks**
   - updateConnectionsForPin only touches first/last segments
   - userModified flag unchanged
   - Middle segments with user breaks stay in place

### Integration Points

**In ui-controller.js or image-manager.js** (where image drag happens):

```javascript
// When image dragend fires:
image.on('dragend', () => {
    const imageMoveData = {
        deltaX: image.x() - lastX,
        deltaY: image.y() - lastY
    };
    const imageMeta = image.getAttr('image-meta');
    for (const pinId in imageMeta.pins) {
        const pin = imageMeta.pins[pinId];
        this.connectionManager.updateConnectionsForImageDrag(pin, imageMoveData);
    }
});
```

---

## File Changes Summary

### New Files

1. **public/connection-router.js** (170 lines)
   - Extracted from ConnectionManager
   - Static methods for routing and validation
   - No dependencies

2. **public/connection-editor.js** (160 lines)
   - Extracted from ConnectionManager
   - Depends on ConnectionRouter for conversion functions
   - Imports: `import { ConnectionRouter } from './connection-router.js'`

3. **public/connection-updater.js** (110 lines)
   - New for Iteration 3
   - Implements image drag updates
   - No dependencies beyond canvasManager

### Modified Files

1. **public/connection-manager.js** (140 lines)
   - Reduced from 600+ lines
   - Imports all three new classes
   - CRUD operations only
   - Delegates to specialized classes
   - Imports:
     ```javascript
     import { ConnectionRouter } from './connection-router.js';
     import { ConnectionEditor } from './connection-editor.js';
     import { ConnectionUpdater } from './connection-updater.js';
     ```

### Unchanged Files

- public/index.html (already uses ES modules)
- public/main.js (import path for ConnectionManager unchanged)
- public/ui-controller.js (needs integration for image drag - separate task)

---

## Breaking Changes

**NONE** - API is backward compatible:

```javascript
// Old code still works:
const conn = connectionManager.createConnection(pin1, pin2);
connectionManager.deleteConnection(conn);
const conns = connectionManager.getConnections();

// New methods added:
connectionManager.updateConnectionsForImageDrag(pin, { deltaX, deltaY });
connectionManager.selectConnection(conn);
connectionManager.deselectConnection();
```

---

## Next Steps

### Immediate (same sprint)
1. Integrate image drag in ui-controller.js/image-manager.js
2. Test Iteration 3 functionality end-to-end
3. Handle edge cases (image goes off-screen, etc.)

### Future Iterations

**Iteration 4: Break Points** (Planned)
- Implement `addBreakToSegment()` in a separate **ConnectionBreaker** class
- User clicks on segment midpoint to add perpendicular break
- Sets `userModified = true` to lock structure

**Iteration 5: Advanced Features**
- Break deletion
- Segment splitting
- Automatic routing rebuild option

---

## Benefits of Refactoring

✅ **Separation of Concerns**: Each class has single responsibility
✅ **Testability**: Router can be tested independently of Konva
✅ **Reusability**: Router could be used in other applications
✅ **Maintainability**: Easier to find and fix bugs
✅ **Scalability**: Can grow to ~1000 lines across 5-6 files without becoming unwieldy
✅ **Readability**: 140-170 line classes easier to understand than 600+ line monolith
✅ **Modularity**: ConnectionUpdater can be enabled/disabled independently

---

## Backward Compatibility

All existing code using ConnectionManager continues to work. Import statements for other modules need updating:

```javascript
// Old (won't work anymore):
import { ConnectionManager } from './connection-manager.js';

// New (works, same location):
import { ConnectionManager } from './connection-manager.js';
// (ConnectionRouter, Editor, Updater imported internally)
```

No changes needed to calling code in UIController or other managers.

---

## Performance Implications

- **Module Loading**: 4 files instead of 1 (minor, typically < 50ms total for all)
- **Memory**: Negligible difference (same total code, just split)
- **Runtime**: Identical performance (no behavioral changes)
- **Build**: Minifier handles ES modules efficiently

---

## Testing Strategy

### Unit Tests (would be added)
- ConnectionRouter: Test routing case determination, segment calculations
- ConnectionEditor: Test handle creation, drag events
- ConnectionUpdater: Test segment updates for different pin/segment types

### Integration Tests (would be added)
- Create connection, drag image, verify segments
- Multiple connections from same image
- Undo/redo with image drag

---

## Commits History

1. `refactor: extract routing and segment logic to ConnectionRouter`
2. `refactor: extract segment editing and rendering to ConnectionEditor`
3. `feat: implement ConnectionUpdater for image drag integration (Iteration 3)`
4. `refactor: simplify ConnectionManager, integrate Router/Editor/Updater`

---

## References

- [Original Implementation Plan](./connections-implementation-plan.md) - Iteration 3 spec
- [Architecture Proposal](../connection-architecture.md) - Design discussion
- [Iteration 2 PR](https://github.com/DvornikovDV/VKR/pull/X) - Previous work

---

**Status**: Ready for testing and integration with image drag implementation
