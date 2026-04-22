const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
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
      return category === 'massage-chair' || this.requiresYanMaterial(order) || this.isRepairCategory(category);
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

  function loadRawOrders() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaultOrders;
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : defaultOrders;
    } catch (error) {
      return defaultOrders;
    }
  }

  const erpStore = {
    loadOrders() {
      return loadRawOrders().map(order => utils.normalizeOrder(order));
    },

    saveOrders(nextOrders) {
      const normalized = nextOrders.map(order => utils.normalizeOrder(order));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    },

    reset() {
      this.saveOrders(defaultOrders);
    },

    subscribe(callback) {
      const handler = () => callback(this.loadOrders());
      const storageHandler = event => {
        if (event.key === STORAGE_KEY) handler();
      };

      window.addEventListener(CHANGE_EVENT, handler);
      window.addEventListener('storage', storageHandler);

      return () => {
        window.removeEventListener(CHANGE_EVENT, handler);
        window.removeEventListener('storage', storageHandler);
      };
    }
  };

  window.erpStore = erpStore;

  if (!window.localStorage.getItem(STORAGE_KEY)) {
    erpStore.saveOrders(defaultOrders);
  }

  window.mockOrders = erpStore.loadOrders();
})();
