(function() {
  'use strict';

  const STATUS_EVENT = 'xiangyue-store-status';
  let statusEl = null;

  function ensureStatusElement() {
    if (statusEl) return statusEl;

    statusEl = document.createElement('div');
    statusEl.id = 'cloudStatus';
    statusEl.className = 'cloud-status is-pending';
    statusEl.textContent = '連線中';
    document.body.appendChild(statusEl);
    return statusEl;
  }

  function applyStatus(status) {
    const el = ensureStatusElement();
    const info = status || window.erpStoreStatus || {};

    el.classList.remove('is-success', 'is-error', 'is-pending');

    if (info.mode === 'firebase' && info.isReady && !info.error) {
      el.classList.add('is-success');
      el.textContent = '連線成功';
      return;
    }

    if (info.error) {
      el.classList.add('is-error');
      el.textContent = '連線失敗';
      return;
    }

    el.classList.add('is-pending');
    el.textContent = '連線中';
  }

  function initCloudStatus() {
    applyStatus(window.erpStoreStatus);
    window.addEventListener(STATUS_EVENT, event => {
      applyStatus(event.detail);
    });
  }

  document.addEventListener('DOMContentLoaded', initCloudStatus);
})();
