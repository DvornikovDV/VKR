import { UIController } from './ui-controller.js'

function isStandaloneRoutePath(pathname) {
  if (typeof pathname !== 'string') {
    return false
  }

  return !pathname.startsWith('/hub/') && !pathname.startsWith('/admin/')
}

function canAutoBootstrapStandalone() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false
  }

  if (!isStandaloneRoutePath(window.location.pathname)) {
    return false
  }

  return Boolean(document.getElementById('canvas-container') && document.getElementById('canvas'))
}

export function createConstructorRuntime(options = {}) {
  return new UIController(options)
}

export async function bootstrapStandaloneConstructor(options = {}) {
  const controller = createConstructorRuntime(options)
  await controller.ready()
  return controller
}

if (canAutoBootstrapStandalone()) {
  document.addEventListener('DOMContentLoaded', () => {
    void bootstrapStandaloneConstructor()
  })
}