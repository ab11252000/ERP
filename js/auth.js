(function() {
  'use strict';

  const AUTH_SDK_URLS = [
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js'
  ];
  const AUTH_APP_PREFIX = 'page-auth';
  const pageId = getPageId();
  const roleEmail = buildRoleEmail(pageId);
  let authInstancePromise = null;
  let loginBound = false;
  let isHandlingUnauthorizedUser = false;

  window.getFirebaseAppForCurrentPage = () => {
    if (!window.firebase?.apps?.length) return null;
    const appName = getAuthAppName(pageId);
    return window.firebase.apps.find(app => app.name === appName) || null;
  };

  window.authReady = initAuth();

  function getPageId() {
    const worker = document.body.dataset.worker;
    if (worker) return worker;
    if (document.body.classList.contains('management-page')) return 'management';
    return 'default';
  }

  function getAuthAppName(currentPageId) {
    return `${AUTH_APP_PREFIX}-${currentPageId}`;
  }

  function buildRoleEmail(currentPageId) {
    const projectId = String(window.firebaseConfig?.projectId || 'xiangyue-erp').trim();
    return `${currentPageId}@${projectId}.local`;
  }

  function hasConfiguredFirebase(config) {
    if (!config || typeof config !== 'object') return false;

    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
    return requiredKeys.every(key => {
      const value = String(config[key] || '').trim();
      return value &&
        !value.startsWith('YOUR_') &&
        !value.includes('YOUR_PROJECT') &&
        !value.includes('YOUR_SENDER_ID') &&
        !value.includes('YOUR_APP_ID');
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-auth-sdk-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
          return;
        }

        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.authSdkSrc = src;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureFirebaseAuth() {
    if (pageId === 'default') return null;
    if (!hasConfiguredFirebase(window.firebaseConfig)) {
      throw new Error('Firebase 尚未完成設定。');
    }

    if (!authInstancePromise) {
      authInstancePromise = (async () => {
        for (const src of AUTH_SDK_URLS) {
          await loadScript(src);
        }

        if (!window.firebase) {
          throw new Error('Firebase Authentication SDK 載入失敗。');
        }

        const appName = getAuthAppName(pageId);
        let app = window.firebase.apps.find(item => item.name === appName);
        if (!app) {
          app = window.firebase.initializeApp(window.firebaseConfig, appName);
        }

        const auth = app.auth();
        await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
        return auth;
      })();
    }

    return authInstancePromise;
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

  function shakePinBox() {
    const pinBox = document.querySelector('.pin-box');
    pinBox?.classList.add('shake');
    window.setTimeout(() => pinBox?.classList.remove('shake'), 500);
  }

  function clearPinInputs() {
    document.querySelectorAll('.pin-input').forEach(input => {
      input.value = '';
    });
  }

  function focusFirstInput() {
    document.querySelector('.pin-input')?.focus();
  }

  function getPinValue() {
    const inputs = document.querySelectorAll('.pin-input');
    return Array.from(inputs).map(input => input.value).join('');
  }

  function setLoginMessage(message) {
    const messageEl = document.getElementById('loginMessage');
    if (!messageEl) return;
    messageEl.textContent = message || '';
  }

  function ensureLoginMessage() {
    const overlay = document.getElementById('loginOverlay');
    if (!overlay || document.getElementById('loginMessage')) return;

    const message = document.createElement('div');
    message.id = 'loginMessage';
    message.className = 'login-message';
    overlay.appendChild(message);
  }

  function isAuthorizedForPage(user) {
    if (!user?.email) return false;
    return user.email.trim().toLowerCase() === roleEmail.toLowerCase();
  }

  async function handleLogin() {
    try {
      const auth = await ensureFirebaseAuth();
      const pin = getPinValue();

      if (!/^\d{6}$/.test(pin)) {
        setLoginMessage('請輸入 6 碼密碼');
        shakePinBox();
        clearPinInputs();
        focusFirstInput();
        return;
      }

      setLoginMessage('');
      await auth.signInWithEmailAndPassword(roleEmail, pin);
    } catch (error) {
      const errorCode = error?.code || '';
      let message = '登入失敗，請稍後再試';

      if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password') {
        message = '密碼錯誤';
      } else if (errorCode === 'auth/user-not-found') {
        message = '此頁帳號尚未建立';
      } else if (errorCode === 'auth/too-many-requests') {
        message = '嘗試次數過多，請稍後再試';
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }

      setLoginMessage(message);
      shakePinBox();
      clearPinInputs();
      focusFirstInput();
    }
  }

  function bindLoginEvents() {
    if (loginBound) return;
    loginBound = true;

    const inputs = document.querySelectorAll('.pin-input');
    const loginBtn = document.getElementById('loginBtn');

    inputs.forEach((input, index) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 1);
        setLoginMessage('');

        if (input.value && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }

        if (index === inputs.length - 1 && input.value) {
          handleLogin();
        }
      });

      input.addEventListener('keydown', event => {
        if (event.key === 'Backspace' && !input.value && index > 0) {
          inputs[index - 1].focus();
        }
        if (event.key === 'Enter') {
          handleLogin();
        }
      });

      input.addEventListener('paste', event => {
        event.preventDefault();
        const paste = (event.clipboardData || window.clipboardData).getData('text');
        const digits = paste.replace(/\D/g, '').slice(0, 6);
        digits.split('').forEach((digit, i) => {
          if (inputs[i]) inputs[i].value = digit;
        });
        if (digits.length === 6) handleLogin();
      });
    });

    loginBtn?.addEventListener('click', handleLogin);
    focusFirstInput();
  }

  async function initAuth() {
    if (pageId === 'default') return null;

    showLogin();
    bindLoginEvents();

    const auth = await ensureFirebaseAuth();

    return new Promise(resolve => {
      let didResolve = false;

      auth.onAuthStateChanged(async user => {
        if (user && isAuthorizedForPage(user)) {
          try {
            await user.getIdToken(true);
          } catch (error) {
            console.error('Failed to refresh auth token:', error);
          }

          hideLogin();
          setLoginMessage('');
          if (!didResolve) {
            didResolve = true;
            resolve(user);
          }
          return;
        }

        showLogin();
        setLoginMessage('');

        if (user && !isAuthorizedForPage(user) && !isHandlingUnauthorizedUser) {
          isHandlingUnauthorizedUser = true;
          setLoginMessage('此帳號無法進入這個頁面');
          clearPinInputs();
          focusFirstInput();
          try {
            await auth.signOut();
          } finally {
            isHandlingUnauthorizedUser = false;
          }
          return;
        }

      });
    });
  }
})();
