window.WorkerApp = (function() {
  'use strict';

  function ensureToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast(message) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function openTextInputDialog({ title, label, placeholder = '', defaultValue = '', submitText = '完成', onSubmit }) {
    const overlay = document.createElement('div');
    overlay.className = 'input-dialog-overlay';

    const dialog = document.createElement('form');
    dialog.className = 'input-dialog';
    dialog.innerHTML = `
      <div class="input-dialog-header">
        <h3>${title}</h3>
      </div>
      <label class="input-dialog-field">
        <span>${label}</span>
        <input type="text" class="input-dialog-input" maxlength="20" placeholder="${placeholder}" autocomplete="off">
      </label>
      <div class="input-dialog-actions">
        <button type="button" class="input-dialog-btn input-dialog-cancel">取消</button>
        <button type="submit" class="input-dialog-btn input-dialog-submit">${submitText}</button>
      </div>
    `;

    const input = dialog.querySelector('.input-dialog-input');
    const close = () => overlay.remove();

    input.value = defaultValue;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => input.focus());
    input.select();

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });

    dialog.querySelector('.input-dialog-cancel')?.addEventListener('click', close);
    dialog.addEventListener('submit', event => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return;
      }
      onSubmit(value);
      close();
    });

    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
  }

  let config = null;
  let currentTab = 'unprocessed';
  let currentScope = 'all';
  let orders = [];
  let customGroups = { unprocessed: [], queued: [] };
  let expandedGroups = { unprocessed: [], queued: [] };
  let completedGroupBy = 'category';
  let unsubscribe = null;
  const GROUP_STORAGE_KEY = 'xiangyue-worker-groups-v1';
  const GROUPABLE_STATUSES = ['unprocessed', 'queued'];

  function loadCustomGroups() {
    try {
      const key = `${GROUP_STORAGE_KEY}-${config.workerId}`;
      const stored = localStorage.getItem(key);
      if (!stored) return { unprocessed: [], queued: [] };
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return { unprocessed: [], queued: parsed };
      }
      return {
        unprocessed: Array.isArray(parsed?.unprocessed) ? parsed.unprocessed : [],
        queued: Array.isArray(parsed?.queued) ? parsed.queued : []
      };
    } catch (e) {
      return { unprocessed: [], queued: [] };
    }
  }

  function saveCustomGroups() {
    const key = `${GROUP_STORAGE_KEY}-${config.workerId}`;
    localStorage.setItem(key, JSON.stringify(customGroups));
  }

  function getGroupsForStatus(status) {
    if (!GROUPABLE_STATUSES.includes(status)) return [];
    return customGroups[status] || [];
  }

  function getExpandedGroups(status) {
    if (!GROUPABLE_STATUSES.includes(status)) return [];
    return expandedGroups[status] || [];
  }

  function isGroupExpanded(status, groupId) {
    return getExpandedGroups(status).includes(groupId);
  }

  function setGroupExpanded(status, groupId, shouldExpand) {
    if (!GROUPABLE_STATUSES.includes(status)) return;
    const next = new Set(getExpandedGroups(status));
    if (shouldExpand) {
      next.add(groupId);
    } else {
      next.delete(groupId);
    }
    expandedGroups[status] = Array.from(next);
  }

  function resetExpandedGroups(status) {
    if (!GROUPABLE_STATUSES.includes(status)) return;
    expandedGroups[status] = [];
  }

  function getOrderGroup(order, status) {
    return order.customGroups?.[config.workerId]?.[status] || '';
  }

  function setOrderGroup(orderId, status, groupId) {
    const workerId = config.workerId;
    const nextOrders = orders.map(order => {
      if (order.orderId !== orderId) return order;
      const updated = window.utils.cloneOrder(order);
      updated.customGroups[workerId][status] = groupId;
      return updated;
    });
    window.erpStore.saveOrders(nextOrders);
  }

  function addCustomGroup(status, name) {
    const id = 'g-' + Date.now();
    getGroupsForStatus(status).push({ id, name });
    saveCustomGroups();
    return id;
  }

  function renameCustomGroup(status, groupId, newName) {
    const group = getGroupsForStatus(status).find(g => g.id === groupId);
    if (group) {
      group.name = newName;
      saveCustomGroups();
    }
  }

  function deleteCustomGroup(status, groupId) {
    customGroups[status] = getGroupsForStatus(status).filter(g => g.id !== groupId);
    saveCustomGroups();
    const nextOrders = orders.map(order => {
      if (getOrderGroup(order, status) !== groupId) return order;
      const updated = window.utils.cloneOrder(order);
      updated.customGroups[config.workerId][status] = '';
      return updated;
    });
    window.erpStore.saveOrders(nextOrders);
  }

  async function init(workerConfig) {
    config = workerConfig;
    currentScope = config.defaultScope || (config.scopes?.[0]?.id || 'all');
    await window.erpStore.ready;
    orders = window.erpStore.loadOrders();
    customGroups = loadCustomGroups();

    bindEvents();
    renderScopeTabs();
    updateTabLabels();
    renderEverything();

    unsubscribe = window.erpStore.subscribe(nextOrders => {
      orders = nextOrders;
      renderEverything();
    });

    window.addEventListener('beforeunload', () => {
      if (unsubscribe) unsubscribe();
    }, { once: true });
  }

  function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach(button => {
      button.addEventListener('click', () => {
        if (currentTab !== button.dataset.tab) {
          resetExpandedGroups(currentTab);
        }
        document.querySelectorAll('.tab-btn').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        currentTab = button.dataset.tab;
        switchTab();
      });
    });

    const refreshButton = document.getElementById('refreshBtn');
    refreshButton?.addEventListener('click', () => {
      refreshButton.classList.add('spinning');
      orders = window.erpStore.loadOrders();
      renderEverything();
      setTimeout(() => refreshButton.classList.remove('spinning'), 500);
    });

    document.getElementById('drawerClose')?.addEventListener('click', closeDrawer);
    document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
  }

  function updateTabLabels() {
    const unprocessedTab = document.querySelector('.tab-btn[data-tab="unprocessed"]');
    if (!unprocessedTab) return;
    unprocessedTab.textContent = '未處理';
  }

  function renderScopeTabs() {
    const container = document.getElementById('workerScope');
    if (!container) return;

    if (!config.scopes || !config.scopes.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = config.scopes.map(scope => `
      <button class="scope-btn ${scope.id === currentScope ? 'active' : ''}" data-scope="${scope.id}">
        ${scope.label}
      </button>
    `).join('');

    container.querySelectorAll('.scope-btn').forEach(button => {
      button.addEventListener('click', () => {
        currentScope = button.dataset.scope;
        orders = window.erpStore.loadOrders();
        renderScopeTabs();
        updateTabLabels();
        renderEverything();
      });
    });
  }

  function switchTab() {
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `${currentTab}Panel`);
    });
    loadTabContent();
  }

  function renderEverything() {
    updateHeaderCount();
    switchTab();
  }

  function loadTabContent() {
    if (currentTab === 'summary') renderSummary();
    if (currentTab === 'unprocessed') {
      renderStatusList('unprocessed', 'unprocessedList', '目前沒有未處理工單');
    }
    if (currentTab === 'queued') renderStatusList('queued', 'queuedList', '目前沒有待處理工單');
    if (currentTab === 'completed') renderCompleted();
  }

  function getPerspectiveWorker() {
    if (config.workerId !== 'yan') return config.workerId;
    if (currentScope === 'all') return 'all';
    return currentScope;
  }

  function getVisibleOrders() {
    const perspective = getPerspectiveWorker();
    if (config.workerId === 'yan' && perspective === 'all') {
      return [...orders];
    }
    return orders.filter(order => window.utils.shouldWorkerSeeOrder(order, perspective));
  }

  function getOrdersByWorkflow(status) {
    const perspective = getPerspectiveWorker();
    const visibleOrders = getVisibleOrders();

    if (config.workerId === 'yan' && perspective === 'all') {
      if (status === 'completed') {
        return visibleOrders.filter(order =>
          window.utils.getRelevantWorkers(order).length > 0 &&
          window.utils.isAllWorkCompleted(order)
        );
      }

      return visibleOrders.filter(order =>
        window.utils.getRelevantWorkers(order).some(workerId => window.utils.getWorkflowStatus(order, workerId) === status)
      );
    }

    return visibleOrders.filter(order => window.utils.getWorkflowStatus(order, perspective) === status);
  }

  function updateHeaderCount() {
    const pending = getOrdersByWorkflow('queued').length;
    const el = document.getElementById('pendingCount');
    if (el) el.textContent = `${pending} 待處理`;
  }

  function renderSummary() {
    const container = document.getElementById('summaryList');
    const sections = buildSummarySections();

    if (!sections.length) {
      container.innerHTML = renderEmptyState('待處理工單才會進統整');
      return;
    }

    container.innerHTML = sections.map(renderSummarySection).join('');
    container.querySelectorAll('.summary-order-row').forEach(row => {
      row.addEventListener('click', () => openDrawer(row.dataset.orderId));
    });
  }

  function buildSummarySections() {
    const queuedOrders = getOrdersByWorkflow('queued');
    const perspective = getPerspectiveWorker();

    if (config.workerId === 'yan' && perspective === 'all') {
      const yiOrders = queuedOrders.filter(order => window.utils.shouldWorkerSeeOrder(order, 'yi'));
      const youOrders = queuedOrders.filter(order => window.utils.shouldWorkerSeeOrder(order, 'you'));
      const xiangOrders = queuedOrders.filter(order => window.utils.shouldWorkerSeeOrder(order, 'xiang'));
      return [
        ...buildYanSections(queuedOrders, '言統整'),
        ...buildYiSections(yiOrders, '毅統整'),
        ...buildYouSections(youOrders, '祐統整'),
        ...buildXiangSections(xiangOrders, '翔統整')
      ];
    }

    if (perspective === 'yan') return buildYanSections(queuedOrders);
    if (perspective === 'yi') return buildYiSections(queuedOrders);
    if (perspective === 'you') return buildYouSections(queuedOrders);
    if (perspective === 'xiang') return buildXiangSections(queuedOrders);
    return [];
  }

  function buildYanSections(orderList, prefix = '') {
    const section = groupMainOrders(orderList.filter(order => window.utils.needsYanAction(order)), {
      title: prefix || '言統整',
      keyBuilder(order) {
        return `${order.product.category}|${order.product.mainColor || '-'}|${window.utils.getMainSpecLabel(order)}`;
      },
      metaBuilder(order) {
        return {
          category: window.utils.getCategoryLabel(order.product.category),
          spec: window.utils.getMainSpecLabel(order),
          tag: order.product.mainColor || '-'
        };
      },
      sortFn(a, b) {
        const diff = window.utils.colorOrderValue(a.tag) - window.utils.colorOrderValue(b.tag);
        if (diff !== 0) return diff;
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-Hant');
        return a.spec.localeCompare(b.spec, 'zh-Hant');
      }
    });

    return section.groups.length ? [section] : [];
  }

  function buildYiSections(orderList, prefix = '') {
    const woodOrders = orderList.filter(order => window.utils.isBedCategory(order.product.category));

    const leatherOrders = orderList.filter(order =>
      window.utils.isBedCategory(order.product.category) || order.product.category === 'repair-bed'
    );

    const otherOrders = orderList.filter(order =>
      !window.utils.isBedCategory(order.product.category) && order.product.category !== 'repair-bed'
    );

    const sections = [];
    const woodSection = groupMainOrders(woodOrders, {
      title: prefix ? `${prefix} / 木工區` : '木工區',
      keyBuilder(order) {
        return `${order.product.category}|${window.utils.getMainSpecLabel(order)}`;
      },
      metaBuilder(order) {
        return {
          category: window.utils.getCategoryLabel(order.product.category),
          spec: window.utils.getMainSpecLabel(order),
          tag: ''
        };
      },
      sortFn(a, b) {
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-Hant');
        return a.spec.localeCompare(b.spec, 'zh-Hant');
      }
    });
    if (woodSection.groups.length) sections.push(woodSection);

    const leatherSection = groupMainOrders(leatherOrders, {
      title: prefix ? `${prefix} / 裁皮區` : '裁皮區',
      keyBuilder(order) {
        return `${order.product.category}|${window.utils.getMainSpecLabel(order)}|${order.product.mainColor}`;
      },
      metaBuilder(order) {
        return {
          category: window.utils.getCategoryLabel(order.product.category),
          spec: window.utils.getMainSpecLabel(order),
          tag: order.product.mainColor || '-'
        };
      },
      sortFn(a, b) {
        const diff = window.utils.colorOrderValue(a.tag) - window.utils.colorOrderValue(b.tag);
        if (diff !== 0) return diff;
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-Hant');
        return a.spec.localeCompare(b.spec, 'zh-Hant');
      }
    });
    if (leatherSection.groups.length) sections.push(leatherSection);

    const otherSection = groupMainOrders(otherOrders, {
      title: prefix ? `${prefix} / 其他` : '其他',
      keyBuilder(order) {
        return `${order.product.category}|${window.utils.getMainSpecLabel(order)}`;
      },
      metaBuilder(order) {
        return {
          category: window.utils.getCategoryLabel(order.product.category),
          spec: window.utils.getMainSpecLabel(order),
          tag: order.product.mainColor || '-'
        };
      },
      sortFn(a, b) {
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-Hant');
        return a.spec.localeCompare(b.spec, 'zh-Hant');
      }
    });
    if (otherSection.groups.length) sections.push(otherSection);

    return sections;
  }

  function buildYouSections(orderList, prefix = '') {
    const section = groupAccessoryOrders(orderList, {
      title: prefix || '祐統整',
      itemFilter(order, item) {
        return item.name !== '跨腳椅' && item.name !== '師傅椅';
      },
      keyBuilder(order, item) {
        return `${item.name}|${window.utils.getAccessoryDisplayColor(order, item)}`;
      },
      metaBuilder(order, item) {
        return {
          category: item.name,
          spec: '',
          tag: window.utils.getAccessoryDisplayColor(order, item)
        };
      },
      sortFn(a, b) {
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-Hant');
        return window.utils.colorOrderValue(a.tag) - window.utils.colorOrderValue(b.tag);
      }
    });
    return section.groups.length ? [section] : [];
  }

  function buildXiangSections(orderList, prefix = '') {
    const section = groupAccessoryOrders(orderList, {
      title: prefix || '翔統整',
      keyBuilder(order, item) {
        return `${item.name}|${window.utils.getAccessoryDisplaySize(order, item)}`;
      },
      metaBuilder(order, item) {
        return {
          category: item.name,
          spec: window.utils.getAccessoryDisplaySize(order, item),
          tag: ''
        };
      },
      sortFn(a, b) {
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-Hant');
        return a.spec.localeCompare(b.spec, 'zh-Hant');
      }
    });
    return section.groups.length ? [section] : [];
  }

  function groupMainOrders(sourceOrders, options) {
    const groups = new Map();

    sourceOrders.forEach(order => {
      const key = options.keyBuilder(order);
      if (!groups.has(key)) {
        groups.set(key, {
          ...options.metaBuilder(order),
          totalQty: 0,
          rows: []
        });
      }

      const group = groups.get(key);
      group.totalQty += window.utils.orderQuantity(order);
      group.rows.push({
        orderId: order.orderId,
        customer: order.customerName,
        quantity: window.utils.orderQuantity(order),
        color: order.product.mainColor || '-',
        spec: window.utils.getMainSpecLabel(order),
        deadline: order.dates.deadline
      });
    });

    return {
      title: options.title,
      groups: Array.from(groups.values()).sort(options.sortFn)
    };
  }

  function groupAccessoryOrders(sourceOrders, options) {
    const groups = new Map();

    sourceOrders.forEach(order => {
      (order.accessories.items || []).forEach(item => {
        if (options.itemFilter && !options.itemFilter(order, item)) return;
        const key = options.keyBuilder(order, item);
        if (!groups.has(key)) {
          groups.set(key, {
            ...options.metaBuilder(order, item),
            totalQty: 0,
            rows: []
          });
        }

        const group = groups.get(key);
        group.totalQty += item.qty;
        group.rows.push({
          orderId: order.orderId,
          customer: order.customerName,
          quantity: item.qty,
          color: window.utils.getAccessoryDisplayColor(order, item),
          spec: window.utils.getAccessoryDisplaySize(order, item),
          deadline: order.dates.deadline
        });
      });
    });

    return {
      title: options.title,
      groups: Array.from(groups.values()).sort(options.sortFn)
    };
  }

  function renderSummarySection(section) {
    return `
      <div class="summary-section">
        <div class="summary-section-title">${section.title}</div>
        ${section.groups.map(group => `
          <details class="summary-group">
            <summary class="summary-group-header">
              <div class="summary-spec">
                <span class="summary-category">${group.category}</span>
                ${group.spec ? `<span class="summary-dims">${group.spec}</span>` : ''}
                ${group.tag ? `<span class="summary-color">${group.tag}</span>` : ''}
              </div>
              <div class="summary-count">
                <span class="count-num">${Number(group.totalQty)}</span>
                <span class="count-unit">件</span>
              </div>
            </summary>
            <div class="summary-orders">
              ${group.rows.map(row => `
                <div class="summary-order-row" data-order-id="${row.orderId}">
                  <span class="row-id">${row.orderId}</span>
                  <span class="row-customer">${row.customer} x${row.quantity}</span>
                  <span class="row-deadline">${window.utils.formatDate(row.deadline)}</span>
                </div>
              `).join('')}
            </div>
          </details>
        `).join('')}
      </div>
    `;
  }

  function renderStatusList(status, containerId, emptyMessage) {
    const container = document.getElementById(containerId);
    const list = getOrdersByWorkflow(status).sort(compareOrdersByDeadline);

    if (!GROUPABLE_STATUSES.includes(status)) {
      if (!list.length) {
        container.innerHTML = renderEmptyState(emptyMessage);
        return;
      }

      container.innerHTML = list.map(order => renderOrderCard(order, status)).join('');
      bindOrderCardEvents(container);
      return;
    }

    const groupsForStatus = getGroupsForStatus(status);
    const uncategorized = list.filter(order => !getOrderGroup(order, status));
    const grouped = groupsForStatus.map(group => ({
      ...group,
      orders: list.filter(order => getOrderGroup(order, status) === group.id)
    }));

    let html = '';

    html += `
      <details class="order-group" data-group-key="uncategorized" ${isGroupExpanded(status, 'uncategorized') ? 'open' : ''}>
        <summary class="order-group-header">
          <span class="group-name">未分類</span>
          <span class="group-count${uncategorized.length > 0 ? ' group-count-has-items' : ''}">${uncategorized.length}</span>
        </summary>
        <div class="order-group-body">
          ${uncategorized.length ? uncategorized.map(order => renderOrderCard(order, status)).join('') : `<div class="empty-group">${emptyMessage}</div>`}
        </div>
      </details>
    `;

    grouped.forEach(group => {
      html += `
        <details class="order-group" data-group-key="${group.id}" ${isGroupExpanded(status, group.id) ? 'open' : ''}>
          <summary class="order-group-header">
            <span class="group-name" data-status="${status}" data-group-id="${group.id}">${group.name}</span>
            <span class="group-count${group.orders.length > 0 ? ' group-count-has-items' : ''}">${group.orders.length}</span>
            <button class="group-delete-btn" data-group-id="${group.id}" title="刪除分類">×</button>
          </summary>
          <div class="order-group-body">
            ${group.orders.length ? group.orders.map(order => renderOrderCard(order)).join('') : '<div class="empty-group">沒有訂單</div>'}
          </div>
        </details>
      `;
    });

    html += `
      <button class="add-group-btn" data-status="${status}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14m-7-7h14"/>
        </svg>
        新增分類
      </button>
    `;

    container.innerHTML = html;
    bindOrderCardEvents(container);
    bindGroupEvents(container);
    bindGroupToggleEvents(container, status);
  }

  function bindGroupEvents(container) {
    const groupStatus = container.id === 'unprocessedList' ? 'unprocessed' : 'queued';

    container.querySelectorAll('.add-group-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openTextInputDialog({
          title: '新增分類',
          label: '分類名稱',
          submitText: '新增',
          onSubmit(name) {
            addCustomGroup(groupStatus, name);
            renderEverything();
          }
        });
      });
    });

    container.querySelectorAll('.group-name[data-group-id]').forEach(el => {
      el.addEventListener('dblclick', () => {
        const groupId = el.dataset.groupId;
        const group = getGroupsForStatus(groupStatus).find(g => g.id === groupId);
        if (!group) return;
        openTextInputDialog({
          title: '重新命名分類',
          label: '分類名稱',
          defaultValue: group.name,
          submitText: '儲存',
          onSubmit(newName) {
            renameCustomGroup(groupStatus, groupId, newName);
            renderEverything();
          }
        });
      });
    });

    container.querySelectorAll('.group-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = btn.dataset.groupId;
        if (confirm('確定要刪除此分類？訂單會移回未分類。')) {
          deleteCustomGroup(groupStatus, groupId);
          renderEverything();
        }
      });
    });
  }

  function bindGroupToggleEvents(container, status) {
    container.querySelectorAll('.order-group[data-group-key]').forEach(group => {
      group.addEventListener('toggle', () => {
        setGroupExpanded(status, group.dataset.groupKey, group.open);
      });
    });
  }

  function renderCompleted() {
    const container = document.getElementById('completedList');
    const list = getOrdersByWorkflow('completed');

    if (!list.length) {
      container.innerHTML = renderEmptyState('近兩個月沒有已完成紀錄');
      return;
    }

    const toggleHtml = `
      <div class="completed-toggle">
        <button class="toggle-btn ${completedGroupBy === 'category' ? 'active' : ''}" data-group="category">按產品</button>
        <button class="toggle-btn ${completedGroupBy === 'date' ? 'active' : ''}" data-group="date">按日期</button>
      </div>
    `;

    let groupedHtml = '';

    if (completedGroupBy === 'category') {
      const grouped = list.reduce((bucket, order) => {
        const key = window.utils.getCategoryLabel(order.product.category);
        if (!bucket[key]) bucket[key] = [];
        bucket[key].push(order);
        return bucket;
      }, {});

      const categories = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

      groupedHtml = categories.map(category => `
        <div class="completed-group">
          <div class="completed-date">${category}</div>
          <div class="completed-orders">
            ${grouped[category].map(order => {
              const completedDate = window.utils.getWorkerCompletionDate(order, getEffectiveStatusWorker(order));
              const dateStr = completedDate ? window.utils.formatDate(completedDate) : '';
              return `
                <div class="completed-row" data-order-id="${order.orderId}">
                  <span class="row-id">${order.orderId}</span>
                  <span class="row-customer">${order.customerName} x${window.utils.orderQuantity(order)}</span>
                  <span class="row-date">${dateStr}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('');
    } else {
      const grouped = list.reduce((bucket, order) => {
        const date = window.utils.getWorkerCompletionDate(order, getEffectiveStatusWorker(order));
        const key = window.utils.formatFullDate(date || new Date());
        if (!bucket[key]) bucket[key] = [];
        bucket[key].push(order);
        return bucket;
      }, {});

      const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

      groupedHtml = dates.map(date => `
        <div class="completed-group">
          <div class="completed-date">${date}</div>
          <div class="completed-orders">
            ${grouped[date].map(order => `
              <div class="completed-row" data-order-id="${order.orderId}">
                <span class="row-id">${order.orderId}</span>
                <span class="row-customer">${order.customerName} x${window.utils.orderQuantity(order)}</span>
                <span class="row-category">${window.utils.getCategoryLabel(order.product.category)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    }

    container.innerHTML = toggleHtml + groupedHtml;

    container.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        completedGroupBy = btn.dataset.group;
        renderCompleted();
      });
    });

    container.querySelectorAll('.completed-row').forEach(row => {
      row.addEventListener('click', () => openDrawer(row.dataset.orderId));
    });
  }

  function compareOrdersByDeadline(a, b) {
    const aTime = a.dates.deadline ? new Date(a.dates.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.dates.deadline ? new Date(b.dates.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }

  function renderGroupSelect(orderId, status, currentGroup) {
    return `
      <div class="group-select-section">
        <select class="group-select" data-order-id="${orderId}" data-status="${status}">
          <option value="" ${!currentGroup ? 'selected' : ''}>移到分類...</option>
          ${getGroupsForStatus(status).map(g => `
            <option value="${g.id}" ${currentGroup === g.id ? 'selected' : ''}>${g.name}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  function getAccessoryItemsForWorker(order, workerId) {
    if (workerId === 'you' && order.product.category === 'massage-chair') {
      return (order.accessories.items || []).filter(item => item.name !== '跨腳椅' && item.name !== '師傅椅');
    }
    return order.accessories.items || [];
  }

  function renderOrderSpecs(order, workerId) {
    if (workerId === 'you' || workerId === 'xiang') {
      return renderAccessoryFocusedSpecs(order, workerId);
    }

    const isAccessoryOnly = order.product.category === 'accessory-only';
    const categoryLabel = isAccessoryOnly ? '' : window.utils.getCategoryLabel(order.product.category);
    const mainSpec = [categoryLabel, window.utils.getMainSpecLabel(order)].filter(Boolean).join(' ');

    return `
      <div class="order-specs">
        <span class="spec-tag primary">${mainSpec}</span>
        <div class="spec-meta-row">
          <span class="spec-tag quantity">數量: ${window.utils.orderQuantity(order)}</span>
          ${order.product.mainColor ? `<span class="spec-tag color">皮色: ${order.product.mainColor}</span>` : ''}
          ${order.product.model ? `<span class="spec-tag">${order.product.model}型</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderAccessoryFocusedSpecs(order, workerId) {
    const accessorySummary = getAccessoryItemsForWorker(order, workerId)
      .map(item => `${item.name}X${item.qty}`)
      .join(' ');

    return `
      <div class="order-specs accessory-focused">
        <span class="spec-tag primary accessory-primary">${accessorySummary || '配件'}</span>
        ${order.product.mainColor ? `<span class="spec-tag color">皮色: ${order.product.mainColor}</span>` : ''}
        ${order.product.model ? `<span class="spec-tag">${order.product.model}型</span>` : ''}
      </div>
    `;
  }

  function renderOrderCard(order, listStatus = currentTab) {
    const perspective = getPerspectiveWorker();
    const editable = !(config.workerId === 'yan' && perspective === 'all');
    const workerForStatus = getEffectiveStatusWorker(order);
    const displayWorker = perspective === 'all' ? workerForStatus : perspective;
    const status = editable ? window.utils.getWorkflowStatus(order, workerForStatus) : '';
    const progress = window.utils.getProgressSummary(order);
    const canDispatch = config.workerId === 'yan' && (currentScope === 'all' || currentScope === 'yan' || currentScope === 'yi');
    const currentGroup = GROUPABLE_STATUSES.includes(listStatus) ? getOrderGroup(order, listStatus) : '';
    const showGroupSelect = editable && GROUPABLE_STATUSES.includes(listStatus) && getGroupsForStatus(listStatus).length > 0;

    return `
      <div class="order-card ${window.utils.isUrgent(order.dates.deadline) || window.utils.isOverdue(order.dates.deadline) ? 'urgent' : ''}" data-order-id="${order.orderId}">
        <div class="order-card-header">
          <div class="order-meta">
            <span class="order-id">${order.orderId}</span>
            <span class="order-customer">${order.customerName}</span>
          </div>
          <div class="order-deadline">
            <span class="deadline-label">交期</span>
            <span class="deadline-date ${window.utils.isOverdue(order.dates.deadline) ? 'overdue' : ''}">${window.utils.formatDate(order.dates.deadline)}</span>
          </div>
        </div>
        <div class="order-card-body">
          ${renderOrderSpecs(order, displayWorker)}
          ${renderOrderHighlights(order, workerForStatus)}
          ${editable ? renderStatusActions(order, status, workerForStatus) : renderProgressPills(progress)}
          ${getAccessoryItemsForWorker(order, displayWorker).length ? renderAccessoryPreview(order, displayWorker) : ''}
          ${canDispatch ? renderDispatchActions(order) : ''}
          ${showGroupSelect ? renderGroupSelect(order.orderId, listStatus, currentGroup) : ''}
        </div>
      </div>
    `;
  }

  function renderOrderHighlights(order, workerId) {
    const isChairType = order.product.category === 'massage-chair' || order.product.category === 'repair-chair';
    const showsLeatherReadiness = isChairType || order.product.category === 'spa-bed';

    if (workerId === 'yi' && showsLeatherReadiness) {
      const leatherReady = window.utils.getWorkflowStatus(order, 'yan') === 'completed';
      const leatherStatusClass = leatherReady ? 'completed' : 'unprocessed';
      const leatherStatusLabel = leatherReady ? '皮:已完成' : '皮:未完成';
      return `
        <div class="progress-pills">
          <span class="progress-pill ${leatherStatusClass} material-ready-pill">${leatherStatusLabel}</span>
        </div>
      `;
    }

    if (workerId === 'you' && order.product.category === 'massage-chair') {
      const frameReady = window.utils.getWorkflowStatus(order, 'xiang') === 'completed';
      const frameStatusClass = frameReady ? 'completed' : 'unprocessed';
      const frameStatusLabel = frameReady ? '木框:已完成' : '木框:未完成';
      return `
        <div class="progress-pills">
          <span class="progress-pill ${frameStatusClass} material-ready-pill">${frameStatusLabel}</span>
        </div>
      `;
    }

    return '';
  }

  function renderStatusActions(order, status, workerId) {
    return `
      <div class="workflow-actions">
        ${renderWorkflowButton('unprocessed', '未處理', status)}
        ${renderWorkflowButton('queued', '待處理', status)}
        ${renderWorkflowButton('completed', '已完成', status)}
      </div>
    `;
  }

  function renderWorkflowButton(statusId, label, currentStatus) {
    return `<button class="workflow-btn ${currentStatus === statusId ? 'active' : ''}" data-status="${statusId}">${label}</button>`;
  }

  function renderStatusActions(order, status, workerId) {
    return `
      <div class="workflow-actions">
        <select class="workflow-select" data-current-status="${status}">
          <option value="unprocessed" ${status === 'unprocessed' ? 'selected' : ''}>未處理</option>
          <option value="queued" ${status === 'queued' ? 'selected' : ''}>待處理</option>
          <option value="completed" ${status === 'completed' ? 'selected' : ''}>已完成</option>
        </select>
      </div>
    `;
  }

  function renderProgressPills(progress) {
    return `
      <div class="progress-pills">
        ${progress.map(item => `
          <span class="progress-pill ${item.status}">
            ${item.workerLabel} ${item.statusLabel}
          </span>
        `).join('')}
      </div>
    `;
  }

  function renderAccessoryPreview(order, workerId = '') {
    return `
      <div class="accessory-list">
        ${getAccessoryItemsForWorker(order, workerId).slice(0, 4).map(item => {
          const sizeDisplay = item.size && item.size !== '預設' && item.size !== '-' ? item.size : '';
          const colorDisplay = window.utils.getAccessoryDisplayColor(order, item);
          const detail = sizeDisplay || colorDisplay;
          return `
          <div class="accessory-row">
            <span class="accessory-bullet"></span>
            <span class="accessory-name">${item.name} x${item.qty}${detail ? ' / ' + detail : ''}</span>
          </div>
        `}).join('')}
      </div>
    `;
  }

  function renderDispatchActions(order) {
    if (order.product.category === 'repair-bed' && !order.repair?.approvedToYi) {
      return `
        <div class="dispatch-section">
          <button class="dispatch-btn" data-action="approve-bed">派發給毅</button>
        </div>
      `;
    }

    if (order.product.category === 'repair-other' && !order.repair?.assignedTo) {
      return `
        <div class="dispatch-section repair-assign">
          <button class="dispatch-btn" data-action="assign-repair" data-worker="yi">派給毅</button>
          <button class="dispatch-btn" data-action="assign-repair" data-worker="you">派給祐</button>
          <button class="dispatch-btn" data-action="assign-repair" data-worker="xiang">派給翔</button>
        </div>
      `;
    }

    return '';
  }

  function bindOrderCardEvents(container) {
    container.querySelectorAll('.order-card').forEach(card => {
      card.addEventListener('click', event => {
        if (event.target.closest('.workflow-btn') || event.target.closest('.dispatch-btn') || event.target.closest('.group-select')) return;
        openDrawer(card.dataset.orderId);
      });
    });

    container.querySelectorAll('.workflow-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const orderId = button.closest('.order-card').dataset.orderId;
        const nextStatus = button.dataset.status;
        if (nextStatus === 'completed') {
          const confirmed = window.confirm('確認要將這張工單移到已完成嗎？');
          if (!confirmed) return;
        }
        setWorkflowStatus(orderId, nextStatus);
      });
    });

    container.querySelectorAll('.dispatch-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const orderId = button.closest('.order-card').dataset.orderId;
        handleDispatch(orderId, button.dataset.action, button.dataset.worker || null);
      });
    });

    container.querySelectorAll('.group-select').forEach(select => {
      select.addEventListener('click', event => {
        event.stopPropagation();
      });
      select.addEventListener('change', event => {
        event.stopPropagation();
        const orderId = select.dataset.orderId;
        const status = select.dataset.status;
        const groupId = select.value;
        setOrderGroup(orderId, status, groupId);
        renderEverything();
      });
    });
  }

  function bindOrderCardEvents(container) {
    container.querySelectorAll('.order-card').forEach(card => {
      card.addEventListener('click', event => {
        if (event.target.closest('.workflow-select') || event.target.closest('.dispatch-btn') || event.target.closest('.group-select')) return;
        openDrawer(card.dataset.orderId);
      });
    });

    container.querySelectorAll('.workflow-select').forEach(select => {
      select.addEventListener('click', event => {
        event.stopPropagation();
      });

      select.addEventListener('change', event => {
        event.stopPropagation();
        const orderId = select.closest('.order-card').dataset.orderId;
        const currentStatus = select.dataset.currentStatus || 'unprocessed';
        const nextStatus = select.value;

        if (nextStatus === currentStatus) return;

        if (nextStatus === 'completed') {
          const confirmed = window.confirm('確認要將這筆工單移到已完成嗎？');
          if (!confirmed) {
            select.value = currentStatus;
            return;
          }
        }

        setWorkflowStatus(orderId, nextStatus);
      });
    });

    container.querySelectorAll('.dispatch-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const orderId = button.closest('.order-card').dataset.orderId;
        handleDispatch(orderId, button.dataset.action, button.dataset.worker || null);
      });
    });

    container.querySelectorAll('.group-select').forEach(select => {
      select.addEventListener('click', event => {
        event.stopPropagation();
      });
      select.addEventListener('change', event => {
        event.stopPropagation();
        const orderId = select.dataset.orderId;
        const status = select.dataset.status;
        const groupId = select.value;
        setOrderGroup(orderId, status, groupId);
        renderEverything();
      });
    });
  }

  function getEffectiveStatusWorker(order) {
    const perspective = getPerspectiveWorker();
    if (perspective !== 'all') return perspective;
    const progress = window.utils.getProgressSummary(order);
    const firstOpen = progress.find(item => item.status !== 'completed');
    return firstOpen?.workerId || progress[0]?.workerId || 'yi';
  }

  function setWorkflowStatus(orderId, nextStatus) {
    const order = orders.find(o => o.orderId === orderId);
    const workerId = getEffectiveStatusWorker(order);
    const nextOrders = orders.map(o => {
      if (o.orderId !== orderId) return o;
      const updated = window.utils.cloneOrder(o);
      updated.workflow[workerId] = nextStatus;
      updated.workflowDates[workerId] = nextStatus === 'completed' ? new Date() : null;

      if (workerId === 'yi' && updated.product.category === 'repair-bed' && nextStatus !== 'completed') {
        updated.status.stage = 'InProgress';
      }

      if (window.utils.isAllWorkCompleted(updated)) {
        updated.status.stage = 'ReadyForDelivery';
      } else if (updated.status.stage === 'ReadyForDelivery') {
        updated.status.stage = 'InProgress';
      }

      return updated;
    });

    window.erpStore.saveOrders(nextOrders);

    const statusLabels = { unprocessed: '未處理', queued: '待處理', completed: '已完成' };
    showToast(`${order?.customerName || orderId}：${statusLabels[nextStatus] || nextStatus}`);
  }

  function handleDispatch(orderId, action, workerId) {
    const order = orders.find(o => o.orderId === orderId);
    const workerLabels = { yi: '毅', you: '祐', xiang: '翔' };

    const nextOrders = orders.map(o => {
      if (o.orderId !== orderId) return o;
      const updated = window.utils.cloneOrder(o);

      if (action === 'approve-bed') {
        updated.repair.approvedToYi = true;
        updated.workflow.yan = 'completed';
        updated.workflowDates.yan = new Date();
        if (!updated.workflow.yi || updated.workflow.yi === 'completed') {
          updated.workflow.yi = 'unprocessed';
        }
      }

      if (action === 'assign-repair' && workerId) {
        updated.repair.assignedTo = workerId;
        updated.workflow.yan = 'completed';
        updated.workflowDates.yan = new Date();
        updated.workflow[workerId] = 'unprocessed';
      }

      return updated;
    });

    window.erpStore.saveOrders(nextOrders);

    if (action === 'approve-bed') {
      showToast(`已派工給毅：${order?.customerName || orderId}`);
    } else if (action === 'assign-repair' && workerId) {
      showToast(`已派工給${workerLabels[workerId] || workerId}：${order?.customerName || orderId}`);
    }
  }

  function openDrawer(orderId) {
    const order = orders.find(item => item.orderId === orderId);
    if (!order) return;

    const progressRows = window.utils.getProgressSummary(order).map(item => detailRow(
      `${item.workerLabel}進度`,
      item.statusLabel
    ));

    const showProgress = config.workerId === 'yan';

    document.getElementById('drawerTitle').textContent = `訂單 ${order.orderId}`;
    document.getElementById('drawerBody').innerHTML = `
      <div class="detail-block">
        <div class="detail-block-title">工單資訊</div>
        ${detailRow('客戶', order.customerName)}
        ${detailRow('品項', window.utils.getCategoryLabel(order.product.category))}
        ${detailRow('規格', window.utils.getMainSpecLabel(order))}
        ${detailRow('主色', order.product.mainColor || '-')}
        ${detailRow('數量', window.utils.orderQuantity(order))}
        ${detailRow('交期', window.utils.formatFullDate(order.dates.deadline))}
      </div>
      ${(order.accessories.items || []).length ? `
        <div class="detail-block">
          <div class="detail-block-title">配件</div>
          ${order.accessories.items.map(item => detailRow(
            item.name,
            `x${item.qty} / ${item.size || '-'} / ${window.utils.getAccessoryDisplayColor(order, item)}`
          )).join('')}
        </div>
      ` : ''}
      ${showProgress ? `
        <div class="detail-block">
          <div class="detail-block-title">進度</div>
          ${progressRows.join('')}
        </div>
      ` : ''}
    `;

    document.getElementById('drawerOverlay').classList.add('active');
    document.getElementById('orderDrawer').classList.add('active');
  }

  function detailRow(label, value) {
    return `
      <div class="detail-row">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${value}</span>
      </div>
    `;
  }

  function closeDrawer() {
    document.getElementById('drawerOverlay')?.classList.remove('active');
    document.getElementById('orderDrawer')?.classList.remove('active');
  }

  function renderEmptyState(message) {
    return `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
          <rect x="9" y="3" width="6" height="4" rx="1"></rect>
        </svg>
        <span>${message}</span>
      </div>
    `;
  }

  return { init };
})();
