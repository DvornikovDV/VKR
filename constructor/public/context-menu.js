// context-menu.js
// Управление контекстным меню для создания виджетов и вызова действий.
export class ContextMenu {
  constructor() {
    this.menuElement = null;
    this.isVisible = false;
    this.createMenuElement();
    this.attachGlobalListeners();
  }

  createMenuElement() {
    this.menuElement = document.createElement('div');
    this.menuElement.id = 'context-menu';
    this.menuElement.className = 'context-menu';
    this.menuElement.style.display = 'none';
    document.body.appendChild(this.menuElement);
  }

  /** Отображение контекстного меню.
   * Вход: items (Array), x (Number), y (Number). */
  show(items, x, y) {
    this.menuElement.innerHTML = '';

    items.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'context-menu-separator';
        this.menuElement.appendChild(separator);
      } else if (item.submenu) {
        const submenuContainer = this.createSubmenu(item);
        this.menuElement.appendChild(submenuContainer);
      } else {
        const menuItem = this.createMenuItem(item);
        this.menuElement.appendChild(menuItem);
      }
    });

    // Позиционирование меню
    this.menuElement.style.left = `${x}px`;
    this.menuElement.style.top = `${y}px`;
    this.menuElement.style.display = 'block';
    this.isVisible = true;

    // Коррекция позиции при выходе за пределы экрана
    this.adjustPosition();
  }

  createMenuItem(item) {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';
    menuItem.textContent = item.label;

    if (item.disabled) {
      menuItem.classList.add('disabled');
    } else {
      menuItem.addEventListener('click', () => {
        if (item.onClick) {
          item.onClick();
        }
        this.hide();
      });

      menuItem.addEventListener('mouseenter', () => {
        menuItem.classList.add('hover');
      });

      menuItem.addEventListener('mouseleave', () => {
        menuItem.classList.remove('hover');
      });
    }

    return menuItem;
  }

  createSubmenu(item) {
    const container = document.createElement('div');
    container.className = 'context-menu-item submenu-container';

    const label = document.createElement('span');
    label.textContent = item.label;
    label.className = 'submenu-label';

    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.className = 'submenu-arrow';

    const submenu = document.createElement('div');
    submenu.className = 'context-submenu';
    submenu.style.display = 'none';

    item.submenu.forEach(subitem => {
      const submenuItem = document.createElement('div');
      submenuItem.className = 'context-menu-item';
      submenuItem.textContent = subitem.label;

      submenuItem.addEventListener('click', () => {
        if (item.onSelect) {
          item.onSelect(subitem.type);
        }
        this.hide();
      });

      submenuItem.addEventListener('mouseenter', () => {
        submenuItem.classList.add('hover');
      });

      submenuItem.addEventListener('mouseleave', () => {
        submenuItem.classList.remove('hover');
      });

      submenu.appendChild(submenuItem);
    });

    container.appendChild(label);
    container.appendChild(arrow);
    container.appendChild(submenu);

    // Отображение подменю при наведении
    container.addEventListener('mouseenter', () => {
      container.classList.add('hover');
      submenu.style.display = 'block';
    });

    container.addEventListener('mouseleave', () => {
      container.classList.remove('hover');
      submenu.style.display = 'none';
    });

    return container;
  }

  hide() {
    if (this.menuElement) {
      this.menuElement.style.display = 'none';
      this.isVisible = false;
    }
  }

  adjustPosition() {
    const rect = this.menuElement.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Коррекция по правой границе
    if (rect.right > windowWidth) {
      this.menuElement.style.left = `${windowWidth - rect.width - 5}px`;
    }

    // Коррекция по нижней границе
    if (rect.bottom > windowHeight) {
      this.menuElement.style.top = `${windowHeight - rect.height - 5}px`;
    }
  }

  attachGlobalListeners() {
    // Скрытие меню при клике вне области
    document.addEventListener('click', (e) => {
      if (this.isVisible && !this.menuElement.contains(e.target)) {
        this.hide();
      }
    });

    // Скрытие меню по нажатию Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }
}
