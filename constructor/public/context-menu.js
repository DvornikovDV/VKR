function isElementNode(value) {
  return Boolean(value && typeof value === 'object' && value.nodeType === 1)
}

export class ContextMenu {
  constructor(options = {}) {
    this.rootElement = isElementNode(options.rootElement) ? options.rootElement : document.body
    this.ownerDocument = this.rootElement.ownerDocument || document
    this.menuElement = null
    this.isVisible = false
    this.cleanupCallbacks = []

    this.createMenuElement()
    this.attachGlobalListeners()
  }

  createMenuElement() {
    this.menuElement = this.ownerDocument.createElement('div')
    this.menuElement.className = 'context-menu'
    this.menuElement.style.display = 'none'
    this.menuElement.style.position = this.rootElement === this.ownerDocument.body ? 'fixed' : 'absolute'

    if (this.rootElement !== this.ownerDocument.body) {
      const computedStyle = this.ownerDocument.defaultView?.getComputedStyle(this.rootElement)
      if (computedStyle?.position === 'static') {
        this.rootElement.style.position = 'relative'
      }
      this.rootElement.appendChild(this.menuElement)
      return
    }

    this.ownerDocument.body.appendChild(this.menuElement)
  }

  show(items, x, y) {
    if (!this.menuElement) {
      return
    }

    this.menuElement.innerHTML = ''

    items.forEach((item) => {
      if (item.separator) {
        const separator = this.ownerDocument.createElement('div')
        separator.className = 'context-menu-separator'
        this.menuElement.appendChild(separator)
      } else if (item.submenu) {
        const submenuContainer = this.createSubmenu(item)
        this.menuElement.appendChild(submenuContainer)
      } else {
        const menuItem = this.createMenuItem(item)
        this.menuElement.appendChild(menuItem)
      }
    })

    const { left, top } = this.resolveMenuCoordinates(x, y)
    this.menuElement.style.left = `${left}px`
    this.menuElement.style.top = `${top}px`
    this.menuElement.style.display = 'block'
    this.isVisible = true

    this.adjustPosition()
  }

  resolveMenuCoordinates(clientX, clientY) {
    if (this.rootElement === this.ownerDocument.body) {
      return { left: clientX, top: clientY }
    }

    const rootRect = this.rootElement.getBoundingClientRect()
    return {
      left: clientX - rootRect.left,
      top: clientY - rootRect.top,
    }
  }

  createMenuItem(item) {
    const menuItem = this.ownerDocument.createElement('div')
    menuItem.className = 'context-menu-item'
    menuItem.textContent = item.label

    if (item.disabled) {
      menuItem.classList.add('disabled')
      return menuItem
    }

    const onClick = () => {
      if (item.onClick) {
        item.onClick()
      }
      this.hide()
    }

    menuItem.addEventListener('click', onClick)

    menuItem.addEventListener('mouseenter', () => {
      menuItem.classList.add('hover')
    })

    menuItem.addEventListener('mouseleave', () => {
      menuItem.classList.remove('hover')
    })

    return menuItem
  }

  createSubmenu(item) {
    const container = this.ownerDocument.createElement('div')
    container.className = 'context-menu-item submenu-container'

    const label = this.ownerDocument.createElement('span')
    label.textContent = item.label
    label.className = 'submenu-label'

    const arrow = this.ownerDocument.createElement('span')
    arrow.textContent = '?'
    arrow.className = 'submenu-arrow'

    const submenu = this.ownerDocument.createElement('div')
    submenu.className = 'context-submenu'
    submenu.style.display = 'none'

    item.submenu.forEach((subitem) => {
      const submenuItem = this.ownerDocument.createElement('div')
      submenuItem.className = 'context-menu-item'
      submenuItem.textContent = subitem.label

      submenuItem.addEventListener('click', () => {
        if (item.onSelect) {
          item.onSelect(subitem.type)
        }
        this.hide()
      })

      submenuItem.addEventListener('mouseenter', () => {
        submenuItem.classList.add('hover')
      })

      submenuItem.addEventListener('mouseleave', () => {
        submenuItem.classList.remove('hover')
      })

      submenu.appendChild(submenuItem)
    })

    container.appendChild(label)
    container.appendChild(arrow)
    container.appendChild(submenu)

    container.addEventListener('mouseenter', () => {
      container.classList.add('hover')
      submenu.style.display = 'block'
    })

    container.addEventListener('mouseleave', () => {
      container.classList.remove('hover')
      submenu.style.display = 'none'
    })

    return container
  }

  hide() {
    if (!this.menuElement) {
      return
    }

    this.menuElement.style.display = 'none'
    this.isVisible = false
  }

  adjustPosition() {
    if (!this.menuElement) {
      return
    }

    const menuRect = this.menuElement.getBoundingClientRect()

    if (this.rootElement === this.ownerDocument.body) {
      const viewportWidth = this.ownerDocument.defaultView?.innerWidth ?? menuRect.right
      const viewportHeight = this.ownerDocument.defaultView?.innerHeight ?? menuRect.bottom

      if (menuRect.right > viewportWidth) {
        this.menuElement.style.left = `${Math.max(5, viewportWidth - menuRect.width - 5)}px`
      }

      if (menuRect.bottom > viewportHeight) {
        this.menuElement.style.top = `${Math.max(5, viewportHeight - menuRect.height - 5)}px`
      }

      return
    }

    const rootRect = this.rootElement.getBoundingClientRect()
    const currentLeft = Number.parseFloat(this.menuElement.style.left || '0')
    const currentTop = Number.parseFloat(this.menuElement.style.top || '0')

    const overflowRight = menuRect.right - rootRect.right
    const overflowBottom = menuRect.bottom - rootRect.bottom

    if (overflowRight > 0) {
      this.menuElement.style.left = `${Math.max(0, currentLeft - overflowRight - 5)}px`
    }

    if (overflowBottom > 0) {
      this.menuElement.style.top = `${Math.max(0, currentTop - overflowBottom - 5)}px`
    }
  }

  attachGlobalListeners() {
    const onDocumentClick = (event) => {
      if (!this.isVisible || !this.menuElement) {
        return
      }

      if (!this.menuElement.contains(event.target)) {
        this.hide()
      }
    }

    const onDocumentKeydown = (event) => {
      if (event.key === 'Escape' && this.isVisible) {
        this.hide()
      }
    }

    this.ownerDocument.addEventListener('click', onDocumentClick)
    this.ownerDocument.addEventListener('keydown', onDocumentKeydown)

    this.cleanupCallbacks.push(() => {
      this.ownerDocument.removeEventListener('click', onDocumentClick)
      this.ownerDocument.removeEventListener('keydown', onDocumentKeydown)
    })
  }

  destroy() {
    this.hide()

    while (this.cleanupCallbacks.length > 0) {
      const cleanup = this.cleanupCallbacks.pop()
      try {
        cleanup()
      } catch {
        // Ignore cleanup errors.
      }
    }

    if (this.menuElement?.parentNode) {
      this.menuElement.parentNode.removeChild(this.menuElement)
    }

    this.menuElement = null
  }
}