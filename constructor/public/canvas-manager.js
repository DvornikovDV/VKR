const GRID_SIZE = 20
const GRID_EXTENT_MULTIPLIER = 20

function isElementNode(value) {
  return Boolean(value && typeof value === 'object' && value.nodeType === 1)
}

class CanvasManager {
  constructor(options = {}) {
    this.rootElement = isElementNode(options.rootElement) ? options.rootElement : document
    this.disableDocumentFallback = options.disableDocumentFallback === true
    this.canvasContainerElement = isElementNode(options.canvasContainerElement)
      ? options.canvasContainerElement
      : this.resolveElementById('canvas-container')
    this.canvasElement = isElementNode(options.canvasElement)
      ? options.canvasElement
      : this.resolveElementById('canvas')
    this.zoomSliderElement = isElementNode(options.zoomSliderElement)
      ? options.zoomSliderElement
      : this.resolveElementById('zoom-slider')
    this.zoomValueElement = isElementNode(options.zoomValueElement)
      ? options.zoomValueElement
      : this.resolveElementById('zoom-value')

    this.stage = null
    this.layer = null
    this.gridGroup = null
    this.zoom = 1
    this.isPanning = false
    this.resizeObserver = null
    this.cleanupCallbacks = []
    this.initTimer = null
    this._destroyed = false
    this._readySettled = false
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })

    this.init()
  }

  resolveElementById(id) {
    if (this.rootElement && this.rootElement !== document) {
      const scopedElement = this.rootElement.querySelector(`#${id}`)
      if (scopedElement) {
        return scopedElement
      }

      if (this.disableDocumentFallback) {
        return null
      }
    }

    return document.getElementById(id)
  }

  ready() {
    return this.readyPromise
  }

  resolveReadyOnce() {
    if (this._readySettled) {
      return
    }

    this._readySettled = true
    if (typeof this.resolveReady === 'function') {
      this.resolveReady()
    }
  }

  rejectReadyOnce(error) {
    if (this._readySettled) {
      return
    }

    this._readySettled = true
    if (typeof this.rejectReady === 'function') {
      this.rejectReady(error instanceof Error ? error : new Error(String(error)))
    }
  }

  init() {
    if (this._destroyed) {
      this.resolveReadyOnce()
      return
    }

    this.initTimer = setTimeout(() => {
      this.initTimer = null
      if (this._destroyed) {
        this.resolveReadyOnce()
        return
      }

      try {
        this.createStage()
        if (this._destroyed) {
          this.resolveReadyOnce()
          return
        }

        this.setupEventListeners()
        this.resolveReadyOnce()
      } catch (error) {
        this.rejectReadyOnce(error)
      }
    }, 100)
  }

  createStage() {
    if (!globalThis.Konva || typeof globalThis.Konva.Stage !== 'function') {
      throw new Error('Konva runtime is not available. Hosted constructor bootstrap failed.')
    }

    const container = this.canvasContainerElement || this.resolveElementById('canvas-container')
    const canvas = this.canvasElement || this.resolveElementById('canvas')

    if (!container || !canvas) {
      throw new Error('Canvas container not found.')
    }

    this.canvasContainerElement = container
    this.canvasElement = canvas

    this.stage = new Konva.Stage({
      container: canvas,
      width: container.offsetWidth,
      height: container.offsetHeight,
    })

    this.layer = new Konva.Layer()
    this.stage.add(this.layer)

    this.addGrid()
  }

  addGrid() {
    if (!this.stage || !this.layer) {
      return
    }

    const width = this.stage.width()
    const height = this.stage.height()
    const extent = Math.max(width, height) * GRID_EXTENT_MULTIPLIER

    this.gridGroup = new Konva.Group({ listening: false })

    for (let x = -extent; x <= width + extent; x += GRID_SIZE) {
      this.gridGroup.add(
        new Konva.Line({
          points: [x, -extent, x, height + extent],
          stroke: '#e0e0e0',
          strokeWidth: 1,
          listening: false,
        }),
      )
    }

    for (let y = -extent; y <= height + extent; y += GRID_SIZE) {
      this.gridGroup.add(
        new Konva.Line({
          points: [-extent, y, width + extent, y],
          stroke: '#e0e0e0',
          strokeWidth: 1,
          listening: false,
        }),
      )
    }

    this.layer.add(this.gridGroup)
    this.layer.draw()
  }

  updateGrid() {
    if (!this.gridGroup || !this.stage) {
      return
    }

    const width = this.stage.width()
    const height = this.stage.height()
    const extent = Math.max(width, height) * GRID_EXTENT_MULTIPLIER

    this.gridGroup.destroyChildren()

    for (let x = -extent; x <= width + extent; x += GRID_SIZE) {
      this.gridGroup.add(
        new Konva.Line({
          points: [x, -extent, x, height + extent],
          stroke: '#e0e0e0',
          strokeWidth: 1,
          listening: false,
        }),
      )
    }

    for (let y = -extent; y <= height + extent; y += GRID_SIZE) {
      this.gridGroup.add(
        new Konva.Line({
          points: [-extent, y, width + extent, y],
          stroke: '#e0e0e0',
          strokeWidth: 1,
          listening: false,
        }),
      )
    }
  }

  resizeStageToContainer() {
    if (!this.stage || !this.canvasContainerElement) {
      return
    }

    this.stage.width(this.canvasContainerElement.offsetWidth)
    this.stage.height(this.canvasContainerElement.offsetHeight)
    this.updateGrid()
    this.stage.draw()
  }

  setupEventListeners() {
    if (!this.stage || this._destroyed) {
      return
    }

    const onResize = () => {
      this.resizeStageToContainer()
    }

    window.addEventListener('resize', onResize)
    this.cleanupCallbacks.push(() => {
      window.removeEventListener('resize', onResize)
    })

    const resizeObserverCtor =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.ResizeObserver === 'function'
        ? globalThis.ResizeObserver
        : typeof window !== 'undefined' && typeof window.ResizeObserver === 'function'
          ? window.ResizeObserver
          : undefined

    if (this.canvasContainerElement && resizeObserverCtor) {
      this.resizeObserver = new resizeObserverCtor(() => {
        this.resizeStageToContainer()
      })
      this.resizeObserver.observe(this.canvasContainerElement)
      this.cleanupCallbacks.push(() => {
        if (this.resizeObserver) {
          this.resizeObserver.disconnect()
          this.resizeObserver = null
        }
      })
    }

    const zoomSlider = this.zoomSliderElement || this.resolveElementById('zoom-slider')
    const zoomValue = this.zoomValueElement || this.resolveElementById('zoom-value')

    if (zoomSlider) {
      const onInput = (event) => {
        const target = event.target
        this.zoom = Number.parseFloat(target.value)
        if (zoomValue) {
          zoomValue.textContent = `${this.zoom.toFixed(1)}x`
        }

        this.zoom = Math.max(0.1, Math.min(10, this.zoom))
        this.stage.scaleX(this.zoom)
        this.stage.scaleY(this.zoom)
        this.stage.draw()
      }

      zoomSlider.addEventListener('input', onInput)
      this.cleanupCallbacks.push(() => {
        zoomSlider.removeEventListener('input', onInput)
      })
    }

    this.stage.on('wheel', (event) => {
      event.evt.preventDefault()

      const scaleBy = 1.1
      const oldScale = this.stage.scaleX()
      const pointer = this.stage.getPointerPosition()
      if (!pointer) {
        return
      }

      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale,
      }
      const direction = event.evt.deltaY > 0 ? 1 : -1
      let newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy
      newScale = Math.max(0.1, Math.min(10, newScale))

      this.stage.scale({ x: newScale, y: newScale })
      this.stage.position({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      })

      this.zoom = newScale
      if (zoomSlider && zoomValue) {
        zoomSlider.value = String(newScale)
        zoomValue.textContent = `${Number.parseFloat(zoomSlider.value).toFixed(1)}x`
      }

      this.stage.batchDraw()
    })

    this.stage.on('mousedown', (event) => {
      if (event.target === this.stage && event.evt.ctrlKey) {
        this.isPanning = true
        this.stage.draggable(true)
      }
    })

    this.stage.on('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false
        this.stage.draggable(false)
      }
    })

    this.stage.on('click', (event) => {
      if (event.target === this.stage) {
        // Reserved for future host callbacks.
      }
    })
  }

  getStage() {
    return this.stage
  }

  getLayer() {
    return this.layer
  }

  destroy() {
    if (this._destroyed) {
      this.resolveReadyOnce()
      return
    }

    this._destroyed = true

    if (this.initTimer) {
      clearTimeout(this.initTimer)
      this.initTimer = null
    }
    this.resolveReadyOnce()

    while (this.cleanupCallbacks.length > 0) {
      const cleanup = this.cleanupCallbacks.pop()
      try {
        cleanup()
      } catch {
        // Ignore cleanup errors.
      }
    }

    if (this.stage) {
      this.stage.off()
      this.stage.destroy()
      this.stage = null
    }

    this.layer = null
    this.gridGroup = null
    this.isPanning = false
  }
}

export { CanvasManager }
