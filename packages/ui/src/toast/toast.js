/**
 * @file packages/ui/src/toast/toast.js
 * @description Safe toast notification utility and component.
 */
import { setText, createElement } from '@civicneuro/security-web';

let toastContainer = null;

function ensureContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'cn-toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    toastContainer.setAttribute('role', 'region');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a toast notification safely.
 * @param {string} message
 * @param {{ type?: 'info'|'success'|'error'|'warning', duration?: number }} [opts]
 */
export function showToast(message, opts = {}) {
  const container = ensureContainer();
  const type = opts.type || 'info';
  const duration = opts.duration || 4000;

  const toast = createElement('div', {
    cls: ['cn-toast', `cn-toast--${type}`],
    text: message
  });

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 200);
  }, duration);
}
