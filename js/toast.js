/**
 * Toast notification system for BookSwipe.
 * Provides undo toasts, error messages, and general feedback.
 */

const _activeToasts = [];
let _toastContainer = null;

function ensureContainer() {
  if (_toastContainer) return _toastContainer;
  _toastContainer = document.getElementById('toast-container');
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'toast-container';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

export function showToast(message, options = {}) {
  const {
    duration = 3000,
    action = null,
    actionLabel = 'UNDO',
    onAction = null,
    type = 'info',
  } = options;

  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  let html = `<span class="toast-message">${escapeHtml(message)}</span>`;
  if (action) {
    html += `<button class="toast-action" type="button">${escapeHtml(actionLabel)}</button>`;
  }
  toast.innerHTML = html;

  container.appendChild(toast);
  _activeToasts.push(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  if (action) {
    toast.querySelector('.toast-action').addEventListener('click', () => {
      dismissToast(toast);
      if (onAction) onAction();
    });
  }

  const timer = setTimeout(() => dismissToast(toast), duration);
  toast._timer = timer;

  return {
    dismiss: () => dismissToast(toast),
  };
}

export function dismissToast(toast) {
  clearTimeout(toast._timer);
  toast.classList.remove('visible');
  setTimeout(() => {
    toast.remove();
    const idx = _activeToasts.indexOf(toast);
    if (idx >= 0) _activeToasts.splice(idx, 1);
  }, 400);
}

export function clearAllToasts() {
  [..._activeToasts].forEach(dismissToast);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
