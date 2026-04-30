(function() {
  'use strict';

  const STATUS_EVENT = 'xiangyue-store-status';
  let statusEl = null;
  let tooltipEl = null;

  function ensureStatusElement() {
    if (statusEl) return statusEl;

    statusEl = document.createElement('div');
    statusEl.id = 'cloudStatus';
    statusEl.className = 'cloud-status is-pending';
    statusEl.textContent = '連線中';
    document.body.appendChild(statusEl);

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'cloud-status-tooltip';
    statusEl.appendChild(tooltipEl);

    statusEl.addEventListener('mouseenter', () => {
      if (tooltipEl.textContent) {
        tooltipEl.classList.add('show');
      }
    });
    statusEl.addEventListener('mouseleave', () => {
      tooltipEl.classList.remove('show');
    });

    return statusEl;
  }

  function getErrorReason(info) {
    const error = info.error || '';
    const errorLower = error.toLowerCase();

    if (errorLower.includes('permission') || errorLower.includes('insufficient')) {
      return 'Firestore 規則拒絕存取';
    }
    if (errorLower.includes('network') || errorLower.includes('offline') || errorLower.includes('failed to fetch')) {
      return '網路連線失敗';
    }
    if (errorLower.includes('auth') || errorLower.includes('unauthenticated')) {
      return '未登入或登入過期';
    }
    if (errorLower.includes('config') || errorLower.includes('api key') || errorLower.includes('project')) {
      return 'Firebase 設定錯誤';
    }
    if (error) {
      return error.length > 50 ? error.slice(0, 50) + '...' : error;
    }
    return '';
  }

  function applyStatus(status) {
    const el = ensureStatusElement();
    const info = status || window.erpStoreStatus || {};

    el.classList.remove('is-success', 'is-error', 'is-pending', 'is-syncing');

    if (info.mode === 'firebase' && info.isReady && !info.error) {
      el.classList.add('is-success');
      el.textContent = '已連線';
      tooltipEl.textContent = '登入成功 · 資料同步中';
      return;
    }

    if (info.error) {
      el.classList.add('is-error');
      el.textContent = '連線失敗';
      tooltipEl.textContent = getErrorReason(info);
      return;
    }

    if (info.mode === 'firebase' && !info.isReady) {
      el.classList.add('is-pending');
      el.textContent = '連線中';
      tooltipEl.textContent = '正在連接資料庫...';
      return;
    }

    if (info.mode === 'local') {
      el.classList.add('is-pending');
      el.textContent = '本機模式';
      tooltipEl.textContent = '資料僅存於本機';
      return;
    }

    el.classList.add('is-pending');
    el.textContent = '連線中';
    tooltipEl.textContent = '';
  }

  function initCloudStatus() {
    applyStatus(window.erpStoreStatus);
    window.addEventListener(STATUS_EVENT, event => {
      applyStatus(event.detail);
    });
  }

  document.addEventListener('DOMContentLoaded', initCloudStatus);
})();
