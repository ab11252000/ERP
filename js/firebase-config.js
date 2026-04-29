const firebaseConfig = {
  apiKey: 'AIzaSyA_M1J9FnEUZ8Km0MncJViVjSffrNN0U8o',
  authDomain: 'serp-9af4a.firebaseapp.com',
  projectId: 'serp-9af4a',
  storageBucket: 'serp-9af4a.firebasestorage.app',
  messagingSenderId: '496535186119',
  appId: '1:496535186119:web:30119715ed4f3829c02ce2',
  measurementId: 'G-GYME30GBMY'
};

window.firebaseConfig = firebaseConfig;

(function() {
  'use strict';

  const STORAGE_KEY = 'xiangyue-erp-orders-v6';
  const CHANGE_EVENT = 'xiangyue-orders-changed';
  const STANDARD_COLORS = ['黑色', '咖啡', '米白'];
  const CATEGORY_LABELS = {
    'massage-bed': '指壓床',
    'spa-bed': 'SPA 床',
    'massage-chair': '腳底按摩椅',
    'accessory-only': '配件',
    'repair-bed': '指壓床維修',
    'repair-chair': '腳底按摩椅維修',
    'repair-other': '其他維修'
  };
  const WORKER_LABELS = {
    yan: '言',
    yi: '毅',
    you: '祐',
    xiang: '翔'
  };
  const WORKFLOW_LABELS = {
    unprocessed: '未處理',
    queued: '待處理',
    completed: '已完成'
  };
  const STAGE_LABELS = {
    InProgress: '進行中',
    ReadyForDelivery: '待出貨',
    Completed: '已完成'
  };
  const STAGE_BADGES = {
    InProgress: 'badge-warning',
    ReadyForDelivery: 'badge-info',
    Completed: 'badge-success'
  };

  function reviveDate(value) {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    return value instanceof Date ? value : new Date(value);
  }

  function stripTime(value) {
    const date = reviveDate(value);
    if (!date || Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function unique(list) {
    return Array.from(new Set(list.filter(Boolean)));
  }

  const utils = {
    STANDARD_COLORS,

    formatDate(date) {
      const value = reviveDate(date);
      if (!value || Number.isNaN(value.getTime())) return '-';
      return `${value.getMonth() + 1}/${value.getDate()}`;
    },

    formatFullDate(date) {
      const value = reviveDate(date);
      if (!value || Number.isNaN(value.getTime())) return '-';
      return `${value.getFullYear()}/${value.getMonth() + 1}/${value.getDate()}`;
    },

    stripTime,

    isOverdue(deadline) {
      const target = stripTime(deadline);
      const today = stripTime(new Date());
      if (!target || !today) return false;
      return target < today;
    },

    isUrgent(deadline, daysThreshold = 3) {
      const target = stripTime(deadline);
      const today = stripTime(new Date());
      if (!target || !today) return false;
      const diffDays = Math.round((target - today) / 86400000);
      return diffDays >= 0 && diffDays <= daysThreshold;
    },

    orderQuantity(order) {
      return Math.max(1, toNumber(order?.quantity, 1));
    },

    isBedCategory(category) {
      return category === 'massage-bed' || category === 'spa-bed';
    },

    isChairCategory(category) {
      return category === 'massage-chair';
    },

    isOutsourcedChair(order) {
      return order?.product?.category === 'massage-chair' && order?.product?.model === '廠商外包';
    },

    hasChairAddonWork(order) {
      return (order?.accessories?.items || []).some(item => item.name === '腳盆' || item.name === '小桌子');
    },

    hasSmallTable(order) {
      return (order?.accessories?.items || []).some(item => item.name === '小桌子');
    },

    hasYouAccessoryWork(order) {
      return (order?.accessories?.items || []).some(item => item.name !== '跨腳椅' && item.name !== '師傅椅');
    },

    isRepairCategory(category) {
      return category === 'repair-bed' || category === 'repair-chair' || category === 'repair-other';
    },

    getCategoryLabel(category) {
      return CATEGORY_LABELS[category] || category || '-';
    },

    getWorkerLabel(workerId) {
      return WORKER_LABELS[workerId] || workerId || '-';
    },

    getWorkflowLabel(status) {
      return WORKFLOW_LABELS[status] || status || '-';
    },

    getStageLabel(stage) {
      return STAGE_LABELS[stage] || stage || '-';
    },

    getStageBadgeClass(stage) {
      return STAGE_BADGES[stage] || '';
    },

    isStandardColor(color) {
      return STANDARD_COLORS.includes(color);
    },

    getDimensionsString(dimensions) {
      if (!dimensions) return '-';
      const width = dimensions.W ?? dimensions.width ?? null;
      const length = dimensions.L ?? dimensions.length ?? null;
      const height = dimensions.H ?? dimensions.height ?? null;
      const values = [width, length, height].filter(value => value !== null && value !== undefined && value !== '');
      return values.length ? values.join('x') : '-';
    },

    getMainSpecLabel(order) {
      if (order?.product?.category === 'accessory-only') {
        const item = order?.accessories?.items?.[0];
        if (item) {
          const size = item.size && item.size !== '預設' ? item.size : '';
          return `${item.name}${size ? ' ' + size : ''}`.trim();
        }
        return '-';
      }
      if (order?.product?.category === 'repair-other') {
        return order?.product?.repairItem || '-';
      }
      const dimensions = this.getDimensionsString(order?.product?.dimensions);
      if (dimensions !== '-') return dimensions;
      if (order?.product?.model && order?.product?.operationMode) return `${order.product.model} / ${order.product.operationMode}`;
      if (order?.product?.model) return `${order.product.model}型`;
      return '-';
    },

    getAccessoryDisplayColor(order, item) {
      return item?.color || order?.accessories?.accessoryColor || order?.product?.mainColor || '-';
    },

    getAccessoryDisplaySize(order, item) {
      return item?.size || this.getMainSpecLabel(order);
    },

    collectColors(order) {
      const colors = [order?.product?.mainColor, order?.accessories?.accessoryColor];
      (order?.accessories?.items || []).forEach(item => colors.push(item?.color));
      return colors.filter(Boolean);
    },

    isSpecialColor(order) {
      return this.collectColors(order).some(color => !this.isStandardColor(color));
    },

    requiresYanMaterial(order) {
      return order?.product?.category === 'spa-bed' || this.isSpecialColor(order);
    },

    needsYanAction(order) {
      const category = order?.product?.category;
      const isAccessoryWithSmallTable = category === 'accessory-only' && this.hasSmallTable(order);
      return category === 'massage-chair' || this.requiresYanMaterial(order) || this.isRepairCategory(category) || isAccessoryWithSmallTable;
    },

    getRelevantWorkers(order) {
      const category = order?.product?.category;
      const workers = [];

      if (this.needsYanAction(order)) workers.push('yan');

      if (this.isBedCategory(category)) {
        workers.push('yi', 'you');
      }

      if (category === 'massage-chair') {
        if (this.isOutsourcedChair(order)) {
          if (this.hasChairAddonWork(order)) {
            workers.push('you', 'xiang');
          }
        } else {
          workers.push('yi', 'xiang');
          if (this.hasYouAccessoryWork(order)) workers.push('you');
        }
      }

      if (category === 'accessory-only') {
        const items = order?.accessories?.items || [];
        const hasChairAccessory = items.some(item => ['跨腳椅', '師傅椅'].includes(item.name));
        const hasChairAddon = items.some(item => ['腳盆', '小桌子'].includes(item.name));
        const hasBedAccessory = items.some(item => ['枕頭', '大枕頭', '馬蹄枕', '跨腳枕', '小圓椅'].includes(item.name));

        if (hasChairAccessory) workers.push('xiang');
        if (hasChairAddon) workers.push('you', 'xiang');
        if (hasBedAccessory) workers.push('you');
      }

      if (category === 'repair-chair') {
        workers.push('yi');
      }

      if (category === 'repair-bed' && order?.repair?.approvedToYi) {
        workers.push('yi');
      }

      if (category === 'repair-other' && order?.repair?.assignedTo) {
        workers.push(order.repair.assignedTo);
      }

      return unique(workers);
    },

    isReleasedToWorker(order, workerId) {
      if (workerId === 'yan') return this.needsYanAction(order);

      const category = order?.product?.category;

      if (category === 'repair-bed') {
        return workerId === 'yi' && Boolean(order?.repair?.approvedToYi);
      }

      if (category === 'repair-chair') {
        return workerId === 'yi';
      }

      if (category === 'repair-other') {
        return order?.repair?.assignedTo === workerId;
      }

      if (category === 'massage-chair') {
        return true;
      }

      if (category === 'accessory-only') {
        return true;
      }

      if (category === 'spa-bed' && (workerId === 'yi' || workerId === 'you')) {
        return true;
      }

      if (this.requiresYanMaterial(order)) {
        return this.getWorkflowStatus(order, 'yan') === 'completed';
      }

      return true;
    },

    shouldWorkerSeeOrder(order, workerId) {
      if (workerId === 'yan') return this.needsYanAction(order);
      return this.getRelevantWorkers(order).includes(workerId) && this.isReleasedToWorker(order, workerId);
    },

    getWorkflowStatus(order, workerId) {
      return order?.workflow?.[workerId] || 'completed';
    },

    getWorkerCompletionDate(order, workerId) {
      if (this.getWorkflowStatus(order, workerId) !== 'completed') return null;
      return reviveDate(order?.workflowDates?.[workerId] || order?.completedDate);
    },

    getProgressSummary(order) {
      return this.getRelevantWorkers(order).map(workerId => ({
        workerId,
        workerLabel: this.getWorkerLabel(workerId),
        status: this.getWorkflowStatus(order, workerId),
        statusLabel: this.getWorkflowLabel(this.getWorkflowStatus(order, workerId))
      }));
    },

    isAllWorkCompleted(order) {
      return this.getRelevantWorkers(order).every(workerId => this.getWorkflowStatus(order, workerId) === 'completed');
    },

    colorOrderValue(color) {
      const palette = ['黑色', '咖啡', '米白', '白色', '灰色', '深灰', '其他'];
      const index = palette.indexOf(color || '其他');
      return index === -1 ? palette.length : index;
    },

    cloneOrder(order) {
      return this.normalizeOrder(JSON.parse(JSON.stringify(order)));
    },

    normalizeOrder(order) {
      const normalized = order || {};
      normalized.quantity = this.orderQuantity(normalized);

      normalized.dates = normalized.dates || {};
      normalized.dates.created = reviveDate(normalized.dates.created) || new Date();
      normalized.dates.deadline = reviveDate(normalized.dates.deadline);

      normalized.location = Object.assign({ city: '', district: '', address: '' }, normalized.location || {});
      normalized.product = Object.assign({
        category: 'massage-bed',
        model: null,
        operationMode: null,
        dimensions: null,
        mainColor: '米白',
        colorOption: 'standard'
      }, normalized.product || {});

      normalized.accessories = Object.assign({
        items: [],
        accessoryColor: null,
        hasHole: false
      }, normalized.accessories || {});

      normalized.accessories.items = Array.isArray(normalized.accessories.items)
        ? normalized.accessories.items.map(item => ({
            name: item.name,
            qty: Math.max(1, toNumber(item.qty, 1)),
            size: item.size || null,
            color: item.color || null,
            done: Boolean(item.done),
            category: item.category || 'general'
          }))
        : [];

      normalized.repair = Object.assign({
        assignedTo: null,
        approvedToYi: false
      }, normalized.repair || {});

      const legacyCustomGroups = normalized.customGroups || {};
      normalized.customGroups = {};

      ['yan', 'yi', 'you', 'xiang'].forEach(workerId => {
        const workerGroups = legacyCustomGroups?.[workerId];

        if (workerGroups && typeof workerGroups === 'object' && !Array.isArray(workerGroups)) {
          normalized.customGroups[workerId] = {
            unprocessed: workerGroups.unprocessed || '',
            queued: workerGroups.queued || ''
          };
          return;
        }

        normalized.customGroups[workerId] = {
          unprocessed: '',
          queued: typeof workerGroups === 'string' ? workerGroups : ''
        };
      });

      normalized.status = Object.assign({
        stage: 'InProgress'
      }, normalized.status || {});

      normalized.workflow = Object.assign({}, normalized.workflow || {});
      normalized.workflowDates = Object.assign({}, normalized.workflowDates || {});

      ['yan', 'yi', 'you', 'xiang'].forEach(workerId => {
        if (!normalized.workflow[workerId]) {
          normalized.workflow[workerId] = this.getRelevantWorkers(normalized).includes(workerId)
            ? 'unprocessed'
            : 'completed';
        }
      });

      if (!this.needsYanAction(normalized)) {
        normalized.workflow.yan = 'completed';
      }

      ['yan', 'yi', 'you', 'xiang'].forEach(workerId => {
        normalized.workflowDates[workerId] = reviveDate(normalized.workflowDates[workerId]);
      });

      if (!normalized.workflowDates.yan && normalized.workflow.yan === 'completed') {
        normalized.workflowDates.yan = normalized.dates.created;
      }

      if (this.isAllWorkCompleted(normalized) && normalized.status.stage === 'InProgress') {
        normalized.status.stage = 'ReadyForDelivery';
      }

      return normalized;
    },

    createOrder(input) {
      return this.normalizeOrder(input);
    }
  };

  window.utils = utils;

  const defaultOrders = [];
  const FIREBASE_SDK_URLS = [
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js'
  ];
  const FIRESTORE_COLLECTION = 'erpOrders';
  const STORE_STATUS_EVENT = 'xiangyue-store-status';
  const CLOUD_SOURCE_OF_TRUTH = true;

  let cachedOrders = [];
  let storeMode = 'local';
  let firebaseDb = null;
  let firebaseLoaderPromise = null;
  let storeReadyPromise = null;
  let storeStatus = {
    mode: 'local',
    isReady: false,
    isCollaborative: false,
    error: null
  };

  window.getStoreDebugInfo = () => {
    const app = firebaseDb?.app || null;
    const auth = app && typeof app.auth === 'function' ? app.auth() : null;
    const user = auth?.currentUser || null;

    return {
      storeMode,
      status: cloneStatus(),
      firebaseDbReady: Boolean(firebaseDb),
      firestoreAppName: app?.name || null,
      firestoreUserEmail: user?.email || null,
      firestoreUserUid: user?.uid || null,
      configuredProjectId: window.firebaseConfig?.projectId || null
    };
  };

  function normalizeOrders(list) {
    return (Array.isArray(list) ? list : []).map(order => utils.normalizeOrder(order));
  }

  function cloneStatus() {
    return Object.assign({}, storeStatus);
  }

  function emitStoreStatus() {
    window.erpStoreStatus = cloneStatus();
    window.dispatchEvent(new CustomEvent(STORE_STATUS_EVENT, { detail: cloneStatus() }));
  }

  function setStoreStatus(nextStatus) {
    storeStatus = Object.assign({}, storeStatus, nextStatus);
    emitStoreStatus();
  }

  function emitOrdersChanged() {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  function loadLocalRawOrders() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaultOrders;
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : defaultOrders;
    } catch (error) {
      return defaultOrders;
    }
  }

  function loadLocalOrders() {
    return normalizeOrders(loadLocalRawOrders());
  }

  function isCloudConfigured() {
    return hasConfiguredFirebase(window.firebaseConfig);
  }

  function persistLocalOrders(nextOrders) {
    const normalized = normalizeOrders(nextOrders);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function updateCache(nextOrders, options = {}) {
    const normalized = normalizeOrders(nextOrders);
    cachedOrders = normalized;

    if (options.persistLocal !== false) {
      persistLocalOrders(normalized);
    }

    if (options.emitChange !== false) {
      emitOrdersChanged();
    }

    return cachedOrders;
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

  async function waitForAuthGate() {
    while (!window.authReady || typeof window.authReady.then !== 'function') {
      await new Promise(resolve => window.setTimeout(resolve, 25));
    }

    try {
      await window.authReady;
    } catch (error) {
      console.error('Auth gate failed before store initialization:', error);
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-sdk-src="${src}"], script[data-auth-sdk-src="${src}"]`);
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
      script.dataset.sdkSrc = src;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureFirebaseSession(app) {
    if (!app || typeof app.auth !== 'function') return;

    const auth = app.auth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      await currentUser.getIdToken(true);
      await new Promise(resolve => window.setTimeout(resolve, 250));
      return;
    }

    await new Promise(resolve => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubscribe?.();
        resolve();
      }, 5000);

      const unsubscribe = auth.onAuthStateChanged(async user => {
        if (!user || settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        unsubscribe();
        try {
          await user.getIdToken(true);
        } catch (error) {
          console.error('Failed to prepare auth token for Firestore:', error);
        }
        window.setTimeout(resolve, 250);
      });
    });
  }

  async function refreshFirestoreAuth(db) {
    const app = db?.app;
    if (!app || typeof app.auth !== 'function') return false;

    const auth = app.auth();
    const user = auth.currentUser;
    if (!user) return false;

    try {
      await user.getIdToken(true);
      await new Promise(resolve => window.setTimeout(resolve, 400));
      return true;
    } catch (error) {
      console.error('Failed to refresh Firestore auth token:', error);
      return false;
    }
  }

  function isPermissionError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return code.includes('permission') || message.includes('insufficient permissions');
  }

  async function runWithPermissionRetry(action) {
    try {
      return await action();
    } catch (error) {
      if (!isPermissionError(error) || !firebaseDb) {
        throw error;
      }

      const refreshed = await refreshFirestoreAuth(firebaseDb);
      if (!refreshed) {
        throw error;
      }

      return action();
    }
  }

  async function ensureFirebaseDb() {
    if (!hasConfiguredFirebase(window.firebaseConfig)) {
      return null;
    }

    if (firebaseDb) {
      return firebaseDb;
    }

    if (!firebaseLoaderPromise) {
      firebaseLoaderPromise = (async () => {
        for (const src of FIREBASE_SDK_URLS) {
          await loadScript(src);
        }

        if (!window.firebase) {
          throw new Error('Firebase SDK did not initialize correctly.');
        }

        const pageApp = typeof window.getFirebaseAppForCurrentPage === 'function'
          ? window.getFirebaseAppForCurrentPage()
          : null;

        let firebaseApp = pageApp;

        if (!firebaseApp) {
          const hasDefaultApp = window.firebase.apps?.some(app => app.name === '[DEFAULT]');
          firebaseApp = hasDefaultApp
            ? window.firebase.app()
            : window.firebase.initializeApp(window.firebaseConfig);
        }

        await ensureFirebaseSession(firebaseApp);
        firebaseDb = firebaseApp.firestore();
        return firebaseDb;
      })();
    }

    return firebaseLoaderPromise;
  }

  function serializeOrderForRemote(order, sortIndex) {
    const serialized = JSON.parse(JSON.stringify(order));
    serialized.sortIndex = sortIndex;
    serialized.updatedAt = new Date();
    return serialized;
  }

  function deserializeRemoteOrder(doc) {
    const data = doc.data() || {};
    const normalized = Object.assign({}, data, { orderId: data.orderId || doc.id });
    delete normalized.sortIndex;
    delete normalized.updatedAt;
    return normalized;
  }

  async function loadRemoteOrders(db) {
    const snapshot = await runWithPermissionRetry(() => db.collection(FIRESTORE_COLLECTION).get());
    return snapshot.docs
      .slice()
      .sort((a, b) => {
        const aIndex = Number(a.data()?.sortIndex ?? Number.MAX_SAFE_INTEGER);
        const bIndex = Number(b.data()?.sortIndex ?? Number.MAX_SAFE_INTEGER);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return String(a.id).localeCompare(String(b.id));
      })
      .map(deserializeRemoteOrder);
  }

  function watchRemoteOrders(callback) {
    if (!firebaseDb) return () => {};

    let unsubscribe = null;
    let retryCount = 0;
    let disposed = false;

    const attach = () => {
      if (disposed) return;

      unsubscribe = firebaseDb.collection(FIRESTORE_COLLECTION).onSnapshot(snapshot => {
        retryCount = 0;

        const nextOrders = snapshot.docs
          .slice()
          .sort((a, b) => {
            const aIndex = Number(a.data()?.sortIndex ?? Number.MAX_SAFE_INTEGER);
            const bIndex = Number(b.data()?.sortIndex ?? Number.MAX_SAFE_INTEGER);
            if (aIndex !== bIndex) return aIndex - bIndex;
            return String(a.id).localeCompare(String(b.id));
          })
          .map(deserializeRemoteOrder);

        updateCache(nextOrders);
        setStoreStatus({
          mode: 'firebase',
          isReady: true,
          isCollaborative: true,
          error: null
        });

        if (typeof callback === 'function') {
          callback(cachedOrders);
        }
      }, async error => {
        console.error('Firestore subscription failed:', error);

        if (!disposed && retryCount < 1 && isPermissionError(error)) {
          retryCount += 1;
          const refreshed = await refreshFirestoreAuth(firebaseDb);
          if (refreshed) {
            unsubscribe?.();
            window.setTimeout(attach, 400);
            return;
          }
        }

        setStoreStatus({
          mode: 'firebase',
          isReady: true,
          isCollaborative: true,
          error: error.message || String(error)
        });
      });
    };

    attach();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }

  async function persistRemoteOrders(nextOrders, previousOrders = cachedOrders) {
    const db = await ensureFirebaseDb();
    if (!db) return;

    const normalized = normalizeOrders(nextOrders);
    const previousIds = new Set(normalizeOrders(previousOrders).map(order => String(order.orderId || '')).filter(Boolean));
    const nextIds = new Set();
    const batch = db.batch();

    normalized.forEach((order, index) => {
      const orderId = String(order.orderId || '').trim();
      if (!orderId) return;
      nextIds.add(orderId);
      const ref = db.collection(FIRESTORE_COLLECTION).doc(orderId);
      batch.set(ref, serializeOrderForRemote(order, index));
    });

    previousIds.forEach(orderId => {
      if (nextIds.has(orderId)) return;
      const ref = db.collection(FIRESTORE_COLLECTION).doc(orderId);
      batch.delete(ref);
    });

    await runWithPermissionRetry(() => batch.commit());
  }

  async function migrateLocalOrdersToRemote(db, localOrders) {
    if (!localOrders.length) return;
    const remoteOrders = await loadRemoteOrders(db);
    if (remoteOrders.length) return;
    await persistRemoteOrders(localOrders, []);
  }

  async function initializeStore() {
    await waitForAuthGate();
    cachedOrders = loadLocalOrders();

    if (!isCloudConfigured()) {
      updateCache(cachedOrders, { persistLocal: false, emitChange: false });
      setStoreStatus({
        mode: 'local',
        isReady: true,
        isCollaborative: false,
        error: null
      });
      return cachedOrders;
    }

    try {
      storeMode = 'firebase';
      const db = await ensureFirebaseDb();
      await migrateLocalOrdersToRemote(db, cachedOrders);

      const remoteOrders = await loadRemoteOrders(db);
      updateCache(remoteOrders, { emitChange: false });
      storeMode = 'firebase';

      setStoreStatus({
        mode: 'firebase',
        isReady: true,
        isCollaborative: true,
        error: null
      });

      return cachedOrders;
    } catch (error) {
      console.error('Cloud store initialization failed:', error);
      console.error('Cloud store debug snapshot:', window.getStoreDebugInfo?.(), window.getAuthDebugForCurrentPage?.());
      storeMode = 'firebase';
      cachedOrders = CLOUD_SOURCE_OF_TRUTH ? [] : loadLocalOrders();
      setStoreStatus({
        mode: 'firebase',
        isReady: true,
        isCollaborative: true,
        error: CLOUD_SOURCE_OF_TRUTH
          ? '無法連線雲端資料庫，已停用本機備援。'
          : (error.message || String(error))
      });
      return cachedOrders;
    }
  }

  const erpStore = {
    ready: null,

    loadOrders() {
      return normalizeOrders(cachedOrders);
    },

    saveOrders(nextOrders) {
      if (isCloudConfigured() && CLOUD_SOURCE_OF_TRUTH && !firebaseDb) {
        setStoreStatus({
          mode: 'firebase',
          isReady: true,
          isCollaborative: true,
          error: '雲端資料庫尚未就緒，未寫入任何本機資料。'
        });
        return Promise.resolve(this.loadOrders());
      }

      const previousOrders = cachedOrders.slice();
      const normalized = updateCache(nextOrders);

      if (storeMode !== 'firebase') {
        return Promise.resolve(normalized);
      }

      return persistRemoteOrders(normalized, previousOrders).catch(async error => {
      console.error('Failed to save orders to Firestore:', error);
      console.error('Firestore save debug snapshot:', window.getStoreDebugInfo?.(), window.getAuthDebugForCurrentPage?.());
      setStoreStatus({
          mode: 'firebase',
          isReady: true,
          isCollaborative: true,
          error: CLOUD_SOURCE_OF_TRUTH
            ? '寫入雲端失敗，本機變更已回復。'
            : (error.message || String(error))
        });

        if (firebaseDb) {
          try {
            const remoteOrders = await loadRemoteOrders(firebaseDb);
            updateCache(remoteOrders);
          } catch (reloadError) {
            console.error('Failed to reload Firestore orders:', reloadError);
          }
        }

        return cachedOrders;
      });
    },

    reset() {
      return this.saveOrders(defaultOrders);
    },

    subscribe(callback) {
      const handler = () => callback(this.loadOrders());
      const storageHandler = event => {
        if (event.key === STORAGE_KEY) {
          cachedOrders = loadLocalOrders();
          handler();
        }
      };

      let active = true;
      let remoteCleanup = null;

      window.addEventListener(CHANGE_EVENT, handler);
      window.addEventListener('storage', storageHandler);

      Promise.resolve(this.ready).then(() => {
        if (!active || storeMode !== 'firebase') return;
        remoteCleanup = watchRemoteOrders();
      });

      return () => {
        active = false;
        window.removeEventListener(CHANGE_EVENT, handler);
        window.removeEventListener('storage', storageHandler);
        if (typeof remoteCleanup === 'function') {
          remoteCleanup();
        }
      };
    },

    getInfo() {
      return cloneStatus();
    }
  };

  window.erpStore = erpStore;
  window.erpStoreStatus = cloneStatus();

  if (!window.localStorage.getItem(STORAGE_KEY)) {
    persistLocalOrders(defaultOrders);
  }

  storeReadyPromise = initializeStore();
  erpStore.ready = storeReadyPromise;

  storeReadyPromise.then(() => {
    window.mockOrders = erpStore.loadOrders();
    emitOrdersChanged();
  });
})();
