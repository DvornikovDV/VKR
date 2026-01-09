# Iteration 3 Integration Guide

**Feature**: Image drag updates connections (Iteration 3)
**Status**: API ready, awaiting ui-controller.js integration

---

## Quick Start

ConnectionUpdater is ready to use. You need to integrate it with image drag events in UIController or ImageManager.

---

## Integration Points

### 1. In UIController (or wherever images are managed)

```javascript
// imports at top
import { ConnectionManager } from './connection-manager.js';

class UIController {
    constructor(canvasManager) {
        this.connectionManager = new ConnectionManager(canvasManager);
        // ... other init
    }
}
```

### 2. When Image is Dragged

**Where**: In image drag event handler (probably `onImageDragMove` or similar)

```javascript
image.on('dragmove', () => {
    // Calculate movement
    const currentX = image.x();
    const currentY = image.y();
    
    // Get stored position (from last dragmove or dragstart)
    const imageMeta = image.getAttr('image-meta');
    const lastX = imageMeta.lastX || currentX;
    const lastY = imageMeta.lastY || currentY;
    
    // Calculate delta
    const deltaX = currentX - lastX;
    const deltaY = currentY - lastY;
    
    // Update connected connections
    const imagePins = imageMeta.pins; // Array of pins attached to this image
    for (const pinId in imagePins) {
        const pin = imagePins[pinId];
        this.connectionManager.updateConnectionsForImageDrag(pin, {
            deltaX: deltaX,
            deltaY: deltaY
        });
    }
    
    // Store current position for next dragmove
    imageMeta.lastX = currentX;
    imageMeta.lastY = currentY;
    image.setAttr('image-meta', imageMeta);
});
```

### 3. Reset Position on Drag Start

```javascript
image.on('dragstart', () => {
    const imageMeta = image.getAttr('image-meta');
    imageMeta.lastX = image.x();
    imageMeta.lastY = image.y();
    image.setAttr('image-meta', imageMeta);
});
```

---

## API Reference

### ConnectionManager.updateConnectionsForImageDrag(pin, imageMoveData)

**Parameters**:
- `pin` {Konva.Circle}: The pin being dragged (part of the image)
- `imageMoveData` {Object}:
  - `deltaX` {number}: Horizontal movement in pixels
  - `deltaY` {number}: Vertical movement in pixels

**Behavior**:
1. Finds all connections using this pin
2. Updates only first segment (if fromPin) or last segment (if toPin)
3. Preserves all middle segments (user's routing decisions)
4. Maintains segment orthogonality and continuity
5. Redraws affected connections

**Example**:
```javascript
const moveData = { deltaX: 50, deltaY: -30 };
connectionManager.updateConnectionsForImageDrag(pin, moveData);
```

---

## Complete Example

```javascript
// In UIController or ImageManager

class ImageManager {
    constructor(canvasManager, connectionManager) {
        this.canvasManager = canvasManager;
        this.connectionManager = connectionManager;
    }

    addImage(imageData) {
        // ... create Konva.Image, pins, etc.
        
        // Attach to image
        const image = new Konva.Image(imageConfig);
        const imageMeta = {
            id: imageId,
            pins: pinMap,  // { 'left': pinObj, 'right': pinObj, ... }
            lastX: imageX,
            lastY: imageY
        };
        image.setAttr('image-meta', imageMeta);
        
        // Setup drag events
        image.on('dragstart', () => this.onImageDragStart(image));
        image.on('dragmove', () => this.onImageDragMove(image));
        image.on('dragend', () => this.onImageDragEnd(image));
        
        this.canvasManager.getLayer().add(image);
        return image;
    }

    onImageDragStart(image) {
        const meta = image.getAttr('image-meta');
        meta.lastX = image.x();
        meta.lastY = image.y();
        image.setAttr('image-meta', meta);
    }

    onImageDragMove(image) {
        const meta = image.getAttr('image-meta');
        const deltaX = image.x() - meta.lastX;
        const deltaY = image.y() - meta.lastY;

        // Update all connections from this image
        for (const pinId in meta.pins) {
            const pin = meta.pins[pinId];
            this.connectionManager.updateConnectionsForImageDrag(pin, {
                deltaX: deltaX,
                deltaY: deltaY
            });
        }

        // Update stored position
        meta.lastX = image.x();
        meta.lastY = image.y();
        image.setAttr('image-meta', meta);
    }

    onImageDragEnd(image) {
        // Optional: Log or validate final state
        console.log('Image drag ended:', image.getAttr('image-meta').id);
    }
}
```

---

## Testing Checklist

### Unit Tests
- [ ] ConnectionUpdater.updateFirstSegment() with H segment
- [ ] ConnectionUpdater.updateFirstSegment() with V segment
- [ ] ConnectionUpdater.updateLastSegment() with H segment
- [ ] ConnectionUpdater.updateLastSegment() with V segment
- [ ] Segment orthogonality maintained after update
- [ ] Continuity between segments maintained

### Integration Tests
- [ ] Create connection, drag image left → first segment updates
- [ ] Create connection, drag image up → first segment updates
- [ ] Image with multiple pins: all connected connections update
- [ ] Drag image after user added breaks → structure preserved
- [ ] Multiple connections from same pin: all update
- [ ] Undo/redo after drag: state restored correctly

### Visual Tests
- [ ] Connection stays visually connected to pin after drag
- [ ] No distortion or strange angles in segments
- [ ] Middle segments don't move when image dragged
- [ ] Speed: no noticeable lag with many connections

---

## Troubleshooting

### Issue: Connection doesn't update when image moves

**Causes**:
1. Pin.cp-meta.connectedTo is null
2. updateConnectionsForImageDrag() not called
3. Image drag handler not implemented

**Solution**:
- Verify pins have valid connectedTo metadata
- Add console.log in drag handler to confirm call
- Check pin is attached to image.image-meta.pins

### Issue: Connection deforms (loses orthogonality)

**Causes**:
1. updateFirstSegment/updateLastSegment not handling direction correctly

**Solution**:
- Verify direction field in segment (H or V)
- Check if-else logic in update methods
- Add validation: ConnectionRouter.validateSegments()

### Issue: Adjacent segments become disconnected

**Causes**:
1. updateFirstSegment not updating segment[1].start
2. updateLastSegment not updating segment[n-1].end

**Solution**:
- Verify continuity update in updateFirstSegment (after updating end)
- Verify continuity update in updateLastSegment (after updating start)
- Test: segment[i].end === segment[i+1].start

---

## Performance Tips

1. **Batch updates**: If dragging multiple images, update all connections in one batch
2. **Deferred drawing**: Use `layer.batchDraw()` instead of individual draws
3. **Memoize**: Store pins map on image for quick access
4. **Throttle**: Consider throttling dragmove events if very frequent

---

## Future Enhancements

1. **Smart routing rebuild** (optional toggle)
   - Automatic recalculation when image moves far
   - Preserve breaks added by user

2. **Connection snapping**
   - Snap connection endpoints to grid
   - Visual feedback when dragging

3. **Connection break handling**
   - Auto-remove breaks if endpoints align again
   - Visual indicators for user-modified connections

---

## API Stability

UpdateConnectionsForImageDrag() is stable and ready for production. No breaking changes expected.

Future methods (in Iteration 4):
- `addBreakToSegment(connection, segmentIndex, position)` - in ConnectionBreaker
- `removeBreak(connection, breakIndex)` - in ConnectionBreaker

---

## References

- Implementation: `public/connection-updater.js`
- Architecture: `doc/refactoring-iteration-3.md`
- Plan: `doc/connections-implementation-plan.md` (Iteration 3 section)

---

**Status**: Ready for implementation
**Next Step**: Integrate with ui-controller.js drag handlers
