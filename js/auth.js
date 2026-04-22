(function() {
  'use strict';

  const PASSWORDS = {
    yan: '111111',
    yi: '111111',
    you: '111111',
    xiang: '111111',
    management: '111111'
  };

  const AUTH_KEY = 'xiangyue-auth';

  function getPageId() {
    const worker = document.body.dataset.worker;
    if (worker) return worker;
    if (document.body.classList.contains('management-page')) return 'management';
    return 'default';
  }

  function isAuthenticated() {
    const pageId = getPageId();
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    return auth[pageId] === true;
  }

  function setAuthenticated(value) {
    const pageId = getPageId();
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    auth[pageId] = value;
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  }

  function showLogin() {
    const overlay = document.getElementById('loginOverlay');
    const content = document.getElementById('appContent');
    if (overlay) overlay.classList.add('active');
    if (content) content.style.visibility = 'hidden';
  }

  function hideLogin() {
    const overlay = document.getElementById('loginOverlay');
    const content = document.getElementById('appContent');
    if (overlay) overlay.classList.remove('active');
    if (content) content.style.visibility = 'visible';
  }

  function handleLogin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pin = Array.from(inputs).map(input => input.value).join('');
    const pageId = getPageId();
    const correctPin = PASSWORDS[pageId] || '111111';

    if (pin === correctPin) {
      setAuthenticated(true);
      hideLogin();
    } else {
      const pinBox = document.querySelector('.pin-box');
      pinBox?.classList.add('shake');
      setTimeout(() => pinBox?.classList.remove('shake'), 500);
      inputs.forEach(input => input.value = '');
      inputs[0]?.focus();
    }
  }

  function initAuth() {
    if (isAuthenticated()) {
      hideLogin();
      return;
    }

    showLogin();

    const inputs = document.querySelectorAll('.pin-input');
    const loginBtn = document.getElementById('loginBtn');

    inputs.forEach((input, index) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 1);
        if (input.value && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
        if (index === inputs.length - 1 && input.value) {
          handleLogin();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          inputs[index - 1].focus();
        }
        if (e.key === 'Enter') {
          handleLogin();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const digits = paste.replace(/\D/g, '').slice(0, 6);
        digits.split('').forEach((digit, i) => {
          if (inputs[i]) inputs[i].value = digit;
        });
        if (digits.length === 6) handleLogin();
      });
    });

    loginBtn?.addEventListener('click', handleLogin);
    inputs[0]?.focus();
  }

  document.addEventListener('DOMContentLoaded', initAuth);
})();
