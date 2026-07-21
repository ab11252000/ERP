(function() {
  'use strict';

  const categoryLabels = {
    'massage-bed': '指壓床',
    'spa-bed': 'SPA 床',
    'massage-chair': '腳底按摩椅',
    'accessory-only': '配件',
    'repair-bed': '指壓床維修',
    'repair-chair': '腳底按摩椅維修',
    'repair-other': '其他維修'
  };

  const workerLabels = {
    yan: '言',
    yi: '毅',
    you: '祐',
    xiang: '翔'
  };

  const workflowLabels = {
    unprocessed: '未處理',
    queued: '待處理',
    completed: '已完成'
  };

  const stageLabels = {
    InProgress: '進行中',
    ReadyForDelivery: '待出貨',
    Completed: '已完成'
  };

  const pageTitle = document.getElementById('pageTitle');
  const dateDisplay = document.getElementById('dateDisplay');
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const views = document.querySelectorAll('.view');
  const searchInput = document.getElementById('searchInput');
  const btnNewOrder = document.getElementById('btnNewOrder');
  const orderForm = document.getElementById('orderForm');
  const orderModal = document.getElementById('orderModal');
  const closeModal = document.getElementById('closeModal');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const filterCategory = document.getElementById('filterCategory');
  const filterCity = document.getElementById('filterCity');
  const productItemsContainer = document.getElementById('productItemsContainer');
  const btnAddProduct = document.getElementById('btnAddProduct');
  const btnClearOrders = document.getElementById('btnClearOrders');

  let orders = [];
  let materials = {};
  let inventoryItems = {};
  let inventoryMovements = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let unsubscribe = null;
  let unsubscribeMaterials = null;
  let unsubscribeInventory = null;
  let unsubscribeYiStats = null;
  let pendingInventoryAdjustment = null;
  let productCounter = 0;

  async function init() {
    await window.erpStore.ready;
    orders = window.erpStore.loadOrders();
    inventoryItems = await window.erpStore.loadInventory();
    inventoryMovements = await window.erpStore.loadInventoryMovements();
    hydrateCleanupView();
    bindEvents();
    setCurrentDate();
    setDefaultCreatedDate();
    populateCityFilter();
    resetProductItems();
    renderAll();

    unsubscribe = window.erpStore.subscribe(nextOrders => {
      orders = nextOrders;
      populateCityFilter();
      renderAll();
    });

    unsubscribeInventory = window.erpStore.subscribeInventory((nextItems, nextMovements) => {
      inventoryItems = nextItems;
      inventoryMovements = nextMovements;
      renderInventoryAlert();
      renderInventoryView();
    });

    materials = await window.erpStore.loadMaterials();
    renderMaterialsView();
    updateWorkerMaterialBadges();

    await window.erpStore.loadYiStats();
    renderStats();

    unsubscribeYiStats = window.erpStore.subscribeYiStats(() => renderStats());

    unsubscribeMaterials = window.erpStore.subscribeMaterials(nextMaterials => {
      materials = nextMaterials;
      renderMaterialsView();
      updateWorkerMaterialBadges();
    });

    window.addEventListener('beforeunload', () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeMaterials) unsubscribeMaterials();
      if (unsubscribeInventory) unsubscribeInventory();
      if (unsubscribeYiStats) unsubscribeYiStats();
    }, { once: true });
  }

  function bindEvents() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (menuToggle) {
      menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar?.classList.toggle('open');
        sidebarOverlay?.classList.toggle('active');
      });
    }

    sidebarOverlay?.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      sidebarOverlay?.classList.remove('active');
    });

    navItems.forEach(item => {
      item.addEventListener('click', event => {
        event.preventDefault();
        switchView(item.dataset.view);
        sidebar?.classList.remove('open');
        sidebarOverlay?.classList.remove('active');
      });
    });

    btnNewOrder?.addEventListener('click', () => switchView('new-order'));
    btnAddProduct?.addEventListener('click', addProductItem);
    btnClearOrders?.addEventListener('click', handleClearCompletedOrders);
    document.getElementById('btnClearStats')?.addEventListener('click', handleClearStats);
    orderForm?.addEventListener('submit', handleOrderSubmit);

    document.getElementById('btnCancelOrder')?.addEventListener('click', () => {
      orderForm.reset();
      setDefaultCreatedDate();
      resetProductItems();
      switchView('dashboard');
    });

    closeModal?.addEventListener('click', closeOrderModal);
    orderModal?.addEventListener('click', event => {
      if (event.target === orderModal) closeOrderModal();
    });

    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(item => item.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderOrders();
      });
    });

    searchInput?.addEventListener('input', event => {
      currentSearch = String(event.target.value || '').trim().toLowerCase();
      renderOrders();
    });

    filterCategory?.addEventListener('change', renderOrders);
    filterCity?.addEventListener('change', renderOrders);

    document.querySelectorAll('.link-more[data-view]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        switchView(link.dataset.view);
      });
    });

    document.querySelectorAll('.btn-material').forEach(btn => {
      btn.addEventListener('click', event => {
        event.stopPropagation();
        openMaterialModal(btn.dataset.worker);
      });
    });

    document.getElementById('closeMaterialModal')?.addEventListener('click', closeMaterialModal);
    document.getElementById('cancelMaterialModal')?.addEventListener('click', closeMaterialModal);
    document.getElementById('confirmSaveMaterial')?.addEventListener('click', saveMaterialModal);
    document.getElementById('materialModal')?.addEventListener('click', event => {
      if (event.target === document.getElementById('materialModal')) closeMaterialModal();
    });

    document.getElementById('closeInventoryAdjustModal')?.addEventListener('click', closeInventoryAdjustModal);
    document.getElementById('cancelInventoryAdjustModal')?.addEventListener('click', closeInventoryAdjustModal);
    document.getElementById('inventoryAdjustModal')?.addEventListener('click', event => {
      if (event.target === document.getElementById('inventoryAdjustModal')) closeInventoryAdjustModal();
    });
    document.getElementById('inventoryAdjustAmount')?.addEventListener('input', updateInventoryAdjustPreview);
    document.getElementById('inventoryAdjustForm')?.addEventListener('submit', submitInventoryAdjustment);

    document.addEventListener('click', event => {
      const inventoryAction = event.target.closest('[data-inventory-action]');
      if (!inventoryAction) return;
      handleInventoryAction(inventoryAction.dataset.itemId, inventoryAction.dataset.inventoryAction);
    });

    document.addEventListener('change', event => {
      if (!event.target.closest('.inventory-warning-input, .inventory-toggle input')) return;
      saveInventorySettingsFromControl(event.target);
    });
  }

  function setCurrentDate() {
    if (!dateDisplay) return;
    dateDisplay.textContent = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  }

  function setDefaultCreatedDate() {
    const createdDateInput = document.getElementById('createdDate');
    if (createdDateInput) {
      createdDateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  function hydrateCleanupView() {
    const navLabel = document.querySelector('.nav-item[data-view="testing"] span');
    if (navLabel) navLabel.textContent = '清除完成單';

    const title = document.querySelector('#testingView .testing-card-header h3');
    const description = document.querySelector('#testingView .testing-card-header p');
    const warning = document.querySelector('#testingView .testing-warning');
    const button = document.getElementById('btnClearOrders');
    const body = document.querySelector('#testingView .testing-card-body');

    if (title) title.textContent = '清除已完成訂單';
    if (description) description.textContent = '這個頁面只會清除狀態為「已完成」的訂單，不會影響進行中或待出貨訂單。';
    if (warning) {
      warning.innerHTML = '<strong>注意：</strong> 清除後，所有已完成訂單會從目前系統中刪除，且此動作會同步到所有裝置。';
    }
    if (button) {
      button.textContent = '直接清除已完成訂單';
    }

    if (body && button && !document.getElementById('clearCompletedSummary')) {
      const summary = document.createElement('div');
      summary.id = 'clearCompletedSummary';
      summary.className = 'cleanup-summary';
      summary.innerHTML = `
        <span class="cleanup-count" id="clearCompletedCount">0</span>
        <span class="cleanup-label">目前可清除的已完成訂單</span>
      `;
      body.insertBefore(summary, button);
    }
  }

  function getCompletedOrdersCount() {
    return orders.filter(order => order.status.stage === 'Completed').length;
  }

  function updateCleanupSummary() {
    const countEl = document.getElementById('clearCompletedCount');
    if (countEl) {
      countEl.textContent = String(getCompletedOrdersCount());
    }
  }

  function handleClearCompletedOrders() {
    const completedCount = getCompletedOrdersCount();

    if (!completedCount) {
      showToast('目前沒有已完成訂單可清除');
      return;
    }

    const confirmedText = window.prompt(`目前有 ${completedCount} 筆已完成訂單，輸入「確認清除」後直接刪除。`, '');
    if (confirmedText !== '確認清除') {
      showToast('已取消清除');
      return;
    }

    saveYiStatsBeforeClear();

    const nextOrders = orders.filter(order => order.status.stage !== 'Completed');
    window.erpStore.saveOrders(nextOrders);
    orders = nextOrders;
    populateCityFilter();
    renderAll();
    showToast(`已清除 ${completedCount} 筆已完成訂單`);
  }

  function saveYiStatsBeforeClear() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthKey = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;

    const completedOrders = orders.filter(order => order.status.stage === 'Completed');
    const storedStats = getYiStatsFromStorage();

    Object.keys(storedStats).forEach(key => {
      if (key !== currentMonthKey && key !== prevMonthKey) {
        delete storedStats[key];
      }
    });

    completedOrders.forEach(order => {
      if (!window.utils.getRelevantWorkers(order).includes('yi')) return;
      if (window.utils.getWorkflowStatus(order, 'yi') !== 'completed') return;
      const completedDate = window.utils.getWorkerCompletionDate(order, 'yi');
      if (!completedDate || completedDate < prevMonthStart) return;

      const qty = window.utils.orderQuantity(order);
      const category = getYiCategoryLabel(order);
      const monthKey = completedDate >= currentMonthStart ? currentMonthKey : prevMonthKey;

      if (!storedStats[monthKey]) {
        storedStats[monthKey] = { total: 0, categories: {} };
      }
      storedStats[monthKey].total += qty;
      storedStats[monthKey].categories[category] = (storedStats[monthKey].categories[category] || 0) + qty;
    });

    saveYiStatsToStorage(storedStats);
  }

  function handleClearOrders() {
    const confirmedText = window.prompt('這會清空所有工單。請輸入「確定」後繼續：', '');
    if (confirmedText !== '確定') {
      showToast('未清空工單');
      return;
    }

    window.erpStore.saveOrders([]);
    orders = [];
    populateCityFilter();
    renderAll();
    showToast('已清空所有工單');
  }

  function switchView(viewName) {
    const titleMap = {
      dashboard: '總覽',
      orders: '訂單管理',
      'new-order': '新增訂單',
      delivery: '配送規劃',
      stats: '產量統計',
      inventory: '庫存'
    };
    const viewIdMap = {
      dashboard: 'dashboardView',
      orders: 'ordersView',
      'new-order': 'newOrderView',
      delivery: 'deliveryView',
      stats: 'statsView',
      inventory: 'inventoryView'
    };

    titleMap.testing = '清除完成單';
    viewIdMap.testing = 'testingView';
    titleMap.materials = '物料管理';
    viewIdMap.materials = 'materialsView';

    const targetViewId = viewIdMap[viewName] || `${viewName}View`;
    navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('active', view.id === targetViewId));

    if (pageTitle) pageTitle.textContent = titleMap[viewName] || '總覽';
    if (viewName === 'delivery') renderDeliveryGroups();
    if (viewName === 'stats') renderStats();
    if (viewName === 'materials') renderMaterialsView();
    if (viewName === 'inventory') renderInventoryView();
  }

  function getProductItemTemplate(index) {
    const isFirst = index === 0;
    return `
      <div class="product-item" data-product-index="${index}">
        <div class="product-item-header">
          <span class="product-item-title">品項 ${index + 1}</span>
          ${!isFirst ? `
            <button type="button" class="btn-remove-product" data-index="${index}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"></path>
              </svg>
            </button>
          ` : ''}
        </div>

        <div class="form-grid product-main-row">
          <div class="form-group product-chair-mode-group" data-index="${index}" style="display: none;">
            <label class="form-label">模式</label>
            <select class="form-select product-chair-mode" data-index="${index}">
              <option value="固定">固定</option>
              <option value="電動">電動</option>
            </select>
          </div>
          <div class="form-group product-chair-armrest-group" data-index="${index}" style="display: none;">
            <label class="form-label">扶手</label>
            <select class="form-select product-chair-armrest" data-index="${index}">
              <option value="yes">是</option>
              <option value="no">否</option>
            </select>
          </div>
          <div class="form-group product-chair-grid-group" data-index="${index}" style="display: none;">
            <label class="form-label">格子</label>
            <select class="form-select product-chair-grid" data-index="${index}">
              <option value="yes">是</option>
              <option value="no">否</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">產品類別 *</label>
            <select class="form-select product-category" data-index="${index}">
              <option value="">選擇類別</option>
              <option value="massage-bed">指壓床</option>
              <option value="spa-bed">SPA 床</option>
              <option value="massage-chair">腳底按摩椅</option>
              <option value="accessory-only">配件</option>
              <option value="repair-bed">指壓床維修</option>
              <option value="repair-chair">腳底按摩椅維修</option>
              <option value="repair-other">其他維修</option>
            </select>
          </div>
          <div class="form-group product-model-group" data-index="${index}" style="display: none;">
            <label class="form-label">型號</label>
            <select class="form-select product-model" data-index="${index}">
              <option value="">選擇型號</option>
              <option value="一般固定">一般固定</option>
              <option value="羽毛款">羽毛款</option>
              <option value="廠商外包">廠商外包</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">數量</label>
            <input type="number" class="form-input product-quantity" data-index="${index}" value="1" min="1">
          </div>
        </div>

        <div class="form-grid product-dimensions-group" data-index="${index}">
          <div class="form-group">
            <label class="form-label">寬度 (cm)</label>
            <input type="number" class="form-input product-width" data-index="${index}" placeholder="75">
          </div>
          <div class="form-group">
            <label class="form-label">長度 (cm)</label>
            <input type="number" class="form-input product-length" data-index="${index}" placeholder="183">
          </div>
          <div class="form-group">
            <label class="form-label">高度 (cm)</label>
            <input type="number" class="form-input product-height" data-index="${index}" placeholder="65">
          </div>
          <div class="form-group">
            <label class="form-label">主體皮色 *</label>
            <select class="form-select product-main-color" data-index="${index}">
              <option value="黑色" selected>黑色</option>
              <option value="咖啡">咖啡</option>
              <option value="米白">米白</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div class="form-group product-color-other-group" data-index="${index}" style="display: none;">
            <label class="form-label">其他皮色</label>
            <input type="text" class="form-input product-color-other" data-index="${index}" placeholder="請輸入皮色">
          </div>
        </div>

        <div class="form-grid product-chair-color-group" data-index="${index}" style="display: none;">
          <div class="form-group">
            <label class="form-label">按摩椅皮色 *</label>
            <input type="text" class="form-input product-chair-color" data-index="${index}" placeholder="請輸入按摩椅皮色">
          </div>
        </div>

        <div class="accessories-section bed-accessories" data-index="${index}">
          <div class="accessories-inner">
            <div class="accessories-title">床類配件</div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">枕頭選項</label>
                <select class="form-select product-pillow-type" data-index="${index}">
                  <option value="standard">枕頭</option>
                  <option value="large">大枕頭</option>
                  <option value="none">不用</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">配件皮色</label>
                <select class="form-select product-pillow-color" data-index="${index}">
                  <option value="">沿用主體皮色</option>
                  <option value="黑色">黑色</option>
                  <option value="咖啡">咖啡</option>
                  <option value="米白">米白</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div class="form-group product-pillow-color-other-group" data-index="${index}" style="display: none;">
                <label class="form-label">配件其他皮色</label>
                <input type="text" class="form-input product-pillow-color-other" data-index="${index}" placeholder="請輸入皮色">
              </div>
            </div>

            <div class="checkbox-row">
              <label class="checkbox-wrapper">
                <input type="checkbox" class="product-has-hole" data-index="${index}">
                <span class="checkbox">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <path d="M20 6L9 17l-5-5"></path>
                  </svg>
                </span>
                <span>大洞</span>
              </label>
            </div>

            <div class="form-grid product-horseshoe-group" data-index="${index}" style="display: none;">
              <div class="form-group">
                <label class="form-label">馬蹄枕</label>
                <select class="form-select product-horseshoe" data-index="${index}">
                  <option value="yes">要</option>
                  <option value="no">不要</option>
                </select>
              </div>
            </div>

            <div class="accessories-add">
              <span class="form-label">加購配件</span>
              <div class="accessories-buttons">
                <button type="button" class="btn btn-sm btn-secondary accessory-btn" data-accessory="pillow" data-index="${index}">枕頭</button>
                <button type="button" class="btn btn-sm btn-secondary accessory-btn" data-accessory="footrest" data-index="${index}">跨腳枕</button>
                <button type="button" class="btn btn-sm btn-secondary accessory-btn" data-accessory="horseshoe" data-index="${index}">馬蹄枕</button>
                <button type="button" class="btn btn-sm btn-secondary accessory-btn" data-accessory="stool" data-index="${index}">小圓椅</button>
                <button type="button" class="btn btn-sm btn-secondary accessory-btn" data-accessory="shelf" data-index="${index}">層板</button>
              </div>
            </div>

            <div class="added-accessories" data-index="${index}"></div>
          </div>
        </div>

        <div class="accessories-section chair-accessories" data-index="${index}">
          <div class="accessories-inner">
            <div class="accessories-title">按摩椅配件</div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">腳盆</label>
                <select class="form-select product-foot-basin" data-index="${index}">
                  <option value="no">不用</option>
                  <option value="black">加購 - 黑色</option>
                  <option value="white">加購 - 白色</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">小桌子</label>
                <select class="form-select product-small-table" data-index="${index}">
                  <option value="no">不用</option>
                  <option value="default">加購 - 預設尺寸</option>
                  <option value="custom">加購 - 自訂尺寸</option>
                </select>
              </div>
              <div class="form-group product-table-size-group" data-index="${index}" style="display: none;">
                <label class="form-label">桌子尺寸</label>
                <input type="text" class="form-input product-table-dimensions" data-index="${index}" placeholder="長x寬x高">
              </div>
            </div>
          </div>
        </div>

        <div class="accessories-section accessory-only-section" data-index="${index}">
          <div class="accessories-inner">
            <div class="accessories-title">選擇配件</div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">配件類型 *</label>
                <select class="form-select accessory-type" data-index="${index}">
                  <option value="">選擇配件</option>
                  <option value="枕頭">枕頭</option>
                  <option value="大枕頭">大枕頭</option>
                  <option value="層板">層板</option>
                  <option value="馬蹄枕">馬蹄枕</option>
                  <option value="跨腳枕">跨腳枕</option>
                  <option value="小圓椅">小圓椅</option>
                  <option value="跨腳椅">跨腳椅</option>
                  <option value="師傅椅">師傅椅</option>
                  <option value="腳盆">腳盆</option>
                  <option value="小桌子">小桌子</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">數量</label>
                <input type="number" class="form-input accessory-qty" data-index="${index}" value="1" min="1">
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">皮色</label>
                <select class="form-select accessory-color" data-index="${index}">
                  <option value="黑色" selected>黑色</option>
                  <option value="咖啡">咖啡</option>
                  <option value="米白">米白</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div class="form-group accessory-color-other-group" data-index="${index}" style="display: none;">
                <label class="form-label">其他皮色</label>
                <input type="text" class="form-input accessory-color-other" data-index="${index}" placeholder="請輸入皮色">
              </div>
              <div class="form-group">
                <label class="form-label">尺寸</label>
                <input type="text" class="form-input accessory-size" data-index="${index}" placeholder="例：75x183 或 預設">
              </div>
            </div>
          </div>
        </div>

        <div class="accessories-section repair-other-section" data-index="${index}">
          <div class="accessories-inner">
            <div class="accessories-title">維修資料</div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">維修項目 *</label>
                <input type="text" class="form-input repair-item" data-index="${index}" placeholder="請輸入維修項目">
              </div>
              <div class="form-group">
                <label class="form-label">皮色</label>
                <input type="text" class="form-input repair-color" data-index="${index}" placeholder="請輸入皮色">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function addProductItem() {
    if (!productItemsContainer) return;

    const index = productCounter++;
    productItemsContainer.insertAdjacentHTML('beforeend', getProductItemTemplate(index));
    bindProductItemEvents(index);
    updateProductTitles();
  }

  function bindProductItemEvents(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const modelGroup = item.querySelector(`.product-model-group[data-index="${index}"]`);
    const chairModeGroup = item.querySelector(`.product-chair-mode-group[data-index="${index}"]`);
    const armrestGroup = item.querySelector(`.product-chair-armrest-group[data-index="${index}"]`);
    const gridGroup = item.querySelector(`.product-chair-grid-group[data-index="${index}"]`);
    if (modelGroup && chairModeGroup) {
      modelGroup.insertAdjacentElement('afterend', chairModeGroup);
      if (armrestGroup) chairModeGroup.insertAdjacentElement('afterend', armrestGroup);
      if (armrestGroup && gridGroup) armrestGroup.insertAdjacentElement('afterend', gridGroup);
    }

    item.querySelector('.product-category')?.addEventListener('change', () => handleProductCategoryChange(index));
    item.querySelector('.product-model')?.addEventListener('change', () => toggleProductChairMode(index));
    item.querySelector('.product-main-color')?.addEventListener('change', () => toggleProductColorOther(index));
    item.querySelector('.product-pillow-color')?.addEventListener('change', () => toggleProductPillowColorOther(index));
    item.querySelector('.product-has-hole')?.addEventListener('change', () => toggleProductHorseshoe(index));
    item.querySelector('.product-small-table')?.addEventListener('change', () => toggleProductTableSize(index));
    item.querySelector('.btn-remove-product')?.addEventListener('click', () => removeProductItem(index));

    item.querySelectorAll('.accessory-btn').forEach(button => {
      button.addEventListener('click', () => toggleProductAccessory(button, index));
    });

    item.querySelector('.accessory-color')?.addEventListener('change', () => toggleAccessoryColorOther(index));
  }

  function handleProductCategoryChange(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const category = item.querySelector('.product-category')?.value || '';
    const modelGroup = item.querySelector(`.product-model-group[data-index="${index}"]`);
    const chairModeGroup = item.querySelector(`.product-chair-mode-group[data-index="${index}"]`);
    const chairArmrestGroup = item.querySelector(`.product-chair-armrest-group[data-index="${index}"]`);
    const chairGridGroup = item.querySelector(`.product-chair-grid-group[data-index="${index}"]`);
    const dimensionsGroup = item.querySelector(`.product-dimensions-group[data-index="${index}"]`);
    const chairColorGroup = item.querySelector(`.product-chair-color-group[data-index="${index}"]`);
    const bedAccessories = item.querySelector(`.bed-accessories[data-index="${index}"]`);
    const chairAccessories = item.querySelector(`.chair-accessories[data-index="${index}"]`);
    const accessoryOnlySection = item.querySelector(`.accessory-only-section[data-index="${index}"]`);
    const repairOtherSection = item.querySelector(`.repair-other-section[data-index="${index}"]`);
    const quantityGroup = item.querySelector('.product-quantity')?.closest('.form-group');

    if (modelGroup) modelGroup.style.display = 'none';
    if (chairModeGroup) chairModeGroup.style.display = 'none';
    if (chairArmrestGroup) chairArmrestGroup.style.display = 'none';
    if (chairGridGroup) chairGridGroup.style.display = 'none';
    if (dimensionsGroup) dimensionsGroup.style.display = 'grid';
    if (chairColorGroup) chairColorGroup.style.display = 'none';
    if (quantityGroup) quantityGroup.style.display = 'block';
    bedAccessories?.classList.remove('show');
    chairAccessories?.classList.remove('show');
    accessoryOnlySection?.classList.remove('show');
    repairOtherSection?.classList.remove('show');

    if (window.utils.isBedCategory(category)) {
      bedAccessories?.classList.add('show');
    }

    if (category === 'massage-chair' || category === 'repair-chair') {
      if (modelGroup) modelGroup.style.display = 'block';
      if (dimensionsGroup) dimensionsGroup.style.display = 'none';
      if (chairColorGroup) chairColorGroup.style.display = 'grid';
      toggleProductChairMode(index);
    }

    if (category === 'massage-chair') {
      chairAccessories?.classList.add('show');
    }

    if (category === 'accessory-only') {
      if (dimensionsGroup) dimensionsGroup.style.display = 'none';
      if (quantityGroup) quantityGroup.style.display = 'none';
      accessoryOnlySection?.classList.add('show');
    }

    if (category === 'repair-other') {
      if (dimensionsGroup) dimensionsGroup.style.display = 'none';
      if (quantityGroup) quantityGroup.style.display = 'none';
      repairOtherSection?.classList.add('show');
    }
  }

  function toggleProductChairMode(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const model = item.querySelector('.product-model')?.value || '';
    const group = item.querySelector(`.product-chair-mode-group[data-index="${index}"]`);
    if (!group) return;

    const showMode = model === '羽毛款';
    group.style.display = showMode ? 'block' : 'none';

    const armrestGroup = item.querySelector(`.product-chair-armrest-group[data-index="${index}"]`);
    const gridGroup = item.querySelector(`.product-chair-grid-group[data-index="${index}"]`);
    if (armrestGroup) armrestGroup.style.display = showMode ? 'block' : 'none';
    if (gridGroup) gridGroup.style.display = showMode ? 'block' : 'none';
  }

  function toggleProductColorOther(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const select = item.querySelector('.product-main-color');
    const group = item.querySelector(`.product-color-other-group[data-index="${index}"]`);
    if (group) group.style.display = select?.value === '其他' ? 'block' : 'none';
  }

  function toggleProductPillowColorOther(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const select = item.querySelector('.product-pillow-color');
    const group = item.querySelector(`.product-pillow-color-other-group[data-index="${index}"]`);
    if (group) group.style.display = select?.value === '其他' ? 'block' : 'none';
  }

  function toggleProductHorseshoe(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const checkbox = item.querySelector('.product-has-hole');
    const group = item.querySelector(`.product-horseshoe-group[data-index="${index}"]`);
    if (group) group.style.display = checkbox?.checked ? 'block' : 'none';
  }

  function toggleProductTableSize(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const select = item.querySelector('.product-small-table');
    const group = item.querySelector(`.product-table-size-group[data-index="${index}"]`);
    if (group) group.style.display = select?.value === 'custom' ? 'block' : 'none';
  }

  function toggleAccessoryColorOther(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    const select = item.querySelector('.accessory-color');
    const group = item.querySelector(`.accessory-color-other-group[data-index="${index}"]`);
    if (group) group.style.display = select?.value === '其他' ? 'block' : 'none';
  }

  function toggleProductAccessory(button, index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    const container = item?.querySelector(`.added-accessories[data-index="${index}"]`);
    if (!container) return;

    const accessory = button.dataset.accessory;
    const existing = container.querySelector(`[data-accessory="${accessory}"]`);
    if (existing) {
      existing.remove();
      button.classList.remove('selected');
      return;
    }

    const labelMap = {
      pillow: '枕頭',
      footrest: '跨腳枕',
      horseshoe: '馬蹄枕',
      stool: '小圓椅',
      shelf: '層板'
    };

    const accessoryItem = document.createElement('div');
    accessoryItem.className = 'accessory-item';
    accessoryItem.dataset.accessory = accessory;
    accessoryItem.innerHTML = `
      <span>${labelMap[accessory] || accessory}</span>
      <input type="number" class="form-input" data-field="qty" value="1" min="1" style="width: 80px;">
      <input type="text" class="form-input" data-field="color" placeholder="留空沿用主體皮色">
      <button type="button" class="accessory-remove">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"></path>
        </svg>
      </button>
    `;

    button.classList.add('selected');
    container.appendChild(accessoryItem);

    accessoryItem.querySelector('.accessory-remove')?.addEventListener('click', () => {
      accessoryItem.remove();
      button.classList.remove('selected');
    });
  }

  function removeProductItem(index) {
    const item = productItemsContainer?.querySelector(`[data-product-index="${index}"]`);
    if (!item) return;

    item.remove();
    updateProductTitles();
  }

  function updateProductTitles() {
    productItemsContainer?.querySelectorAll('.product-item').forEach((item, index) => {
      const title = item.querySelector('.product-item-title');
      if (title) title.textContent = `品項 ${index + 1}`;
    });
  }

  function resetProductItems() {
    if (!productItemsContainer) return;
    productItemsContainer.innerHTML = '';
    productCounter = 0;
    addProductItem();
  }

  function generateOrderId(offset) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = String(now.getTime()).slice(-4);
    return `${date}${suffix}-${offset}`;
  }

  async function handleOrderSubmit(event) {
    event.preventDefault();

    try {
      const formData = new FormData(orderForm);
      const customerName = String(formData.get('customerName') || '').trim();
      const createdDate = formData.get('createdDate') ? new Date(`${formData.get('createdDate')}T08:00:00`) : new Date();
      const deadline = formData.get('deadline') ? new Date(`${formData.get('deadline')}T08:00:00`) : null;
      const location = {
        city: String(formData.get('city') || '').trim(),
        district: String(formData.get('district') || '').trim(),
        address: String(formData.get('address') || '').trim()
      };
      const notes = String(formData.get('specialRequirements') || '').trim();

      if (!customerName) {
        showToast('請先填寫客戶名稱');
        return;
      }

      const productItems = Array.from(productItemsContainer?.querySelectorAll('.product-item') || []);
      if (!productItems.length) {
        showToast('請至少新增一個品項');
        return;
      }

      const newOrders = [];

      for (let index = 0; index < productItems.length; index += 1) {
        const productData = extractProductData(productItems[index]);

        if (!productData.category) {
          showToast(`第 ${index + 1} 個品項還沒選類別`);
          return;
        }

        if (productData.category === 'accessory-only' && !productData.accessories.length) {
          showToast(`第 ${index + 1} 個品項還沒選配件類型`);
          return;
        }

        if (productData.category === 'repair-other' && !productData.repairItem) {
          showToast(`第 ${index + 1} 個品項還沒填維修項目`);
          return;
        }

        if (productData.category !== 'repair-other' && !productData.mainColor) {
          showToast(`第 ${index + 1} 個品項還沒填皮色`);
          return;
        }

        newOrders.push(window.utils.createOrder({
          orderId: generateOrderId(index + 1),
          customerName,
          quantity: productData.quantity,
          dates: { created: createdDate, deadline },
          location,
          product: {
            category: productData.category,
            model: productData.model,
            operationMode: productData.operationMode,
            hasArmrest: productData.hasArmrest,
            hasGrid: productData.hasGrid,
            dimensions: productData.dimensions,
            mainColor: productData.mainColor,
            colorOption: productData.colorOption,
            repairItem: productData.repairItem
          },
          accessories: {
            items: productData.accessories,
            accessoryColor: productData.pillowColor || null,
            hasHole: productData.hasHole
          },
          repair: buildRepair(productData.category),
          notes,
          status: { stage: 'InProgress' }
        }));
      }

      const reservedOrders = await applyInventoryForNewOrders(newOrders);
      await window.erpStore.saveOrders([...reservedOrders, ...orders]);
      orders = window.erpStore.loadOrders();
      populateCityFilter();
      renderAll();

      const customerLabel = customerName.length > 6 ? customerName.slice(0, 6) + '...' : customerName;
      showToast(`工單已建立：${customerLabel}（${reservedOrders.length} 筆）`);
      orderForm.reset();
      setDefaultCreatedDate();
      resetProductItems();
      switchView('orders');
    } catch (error) {
      console.error(error);
      showToast('新增訂單失敗，請再試一次');
    }
  }

  function extractProductData(item) {
    const category = item.querySelector('.product-category')?.value || '';
    const model = item.querySelector('.product-model')?.value || null;
    const operationMode = item.querySelector('.product-chair-mode')?.value || null;
    const isFeatherChair = (category === 'massage-chair' || category === 'repair-chair') && model === '羽毛款';
    let quantity = Math.max(1, Number(item.querySelector('.product-quantity')?.value) || 1);
    const isOutsourcedChair = category === 'massage-chair' && model === '廠商外包';

    const mainColorSelect = item.querySelector('.product-main-color')?.value || '';
    const mainColorOther = item.querySelector('.product-color-other')?.value?.trim() || '';
    const chairColor = item.querySelector('.product-chair-color')?.value?.trim() || '';

    let mainColor = mainColorSelect === '其他' ? (mainColorOther || '其他') : mainColorSelect;
    let colorOption = mainColorSelect === '其他' ? 'other' : 'standard';

    if (category === 'massage-chair' || category === 'repair-chair') {
      mainColor = chairColor;
      colorOption = 'custom';
    }

    const pillowColorSelect = item.querySelector('.product-pillow-color')?.value || '';
    const pillowColorOther = item.querySelector('.product-pillow-color-other')?.value?.trim() || '';
    const pillowColor = pillowColorSelect === '其他' ? (pillowColorOther || '其他') : pillowColorSelect;
    const hasHole = item.querySelector('.product-has-hole')?.checked || false;

    let dimensions = null;
    if (category !== 'massage-chair' && category !== 'repair-chair' && category !== 'repair-other' && category !== 'accessory-only') {
      const width = Number(item.querySelector('.product-width')?.value) || null;
      const length = Number(item.querySelector('.product-length')?.value) || null;
      const height = Number(item.querySelector('.product-height')?.value) || null;
      if (width || length || height) {
        dimensions = { W: width, L: length, H: height };
      }
    }

    const accessories = [];
    const sizeLabel = dimensions ? window.utils.getDimensionsString(dimensions) : (model ? `${model}型` : '-');
    const chosenColor = pillowColor || mainColor;

    if (window.utils.isBedCategory(category)) {
      const pillowType = item.querySelector('.product-pillow-type')?.value || 'standard';

      if (pillowType === 'standard') {
        accessories.push({ name: '枕頭', qty: 1, size: sizeLabel, color: chosenColor, category: 'bed-pillow', done: false });
      } else if (pillowType === 'large') {
        accessories.push({ name: '大枕頭', qty: 1, size: sizeLabel, color: chosenColor, category: 'bed-pillow', done: false });
      }

      if (hasHole && (item.querySelector('.product-horseshoe')?.value || 'yes') === 'yes') {
        accessories.push({ name: '馬蹄枕', qty: 1, size: sizeLabel, color: chosenColor, category: 'bed-addon', done: false });
      }

      item.querySelectorAll('.added-accessories .accessory-item').forEach(node => {
        const qty = Math.max(1, Number(node.querySelector('[data-field="qty"]')?.value) || 1);
        const color = node.querySelector('[data-field="color"]')?.value?.trim() || chosenColor;
        const nameMap = {
          pillow: '枕頭',
          footrest: '跨腳枕',
          horseshoe: '馬蹄枕',
          stool: '小圓椅',
          shelf: '層板'
        };
        const accessoryName = nameMap[node.dataset.accessory] || node.dataset.accessory;
        accessories.push({
          name: accessoryName,
          qty,
          size: sizeLabel,
          color,
          category: accessoryName === '枕頭' ? 'bed-pillow' : 'bed-addon',
          done: false
        });
      });
    }

    if (category === 'massage-chair' && !isOutsourcedChair) {
      accessories.push({ name: '跨腳椅', qty: quantity, size: sizeLabel, color: null, category: 'chair-standard', done: false });
      accessories.push({ name: '師傅椅', qty: quantity, size: sizeLabel, color: null, category: 'chair-standard', done: false });
    }

    if (category === 'massage-chair') {
      const footBasin = item.querySelector('.product-foot-basin')?.value || 'no';
      if (footBasin === 'black' || footBasin === 'white') {
        const color = footBasin === 'black' ? '黑色' : '白色';
        accessories.push({ name: '腳盆', qty: quantity, size: color, color, category: 'chair-addon', done: false });
      }

      const smallTable = item.querySelector('.product-small-table')?.value || 'no';
      if (smallTable === 'default') {
        accessories.push({ name: '小桌子', qty: quantity, size: '預設尺寸', color: null, category: 'chair-addon', done: false });
      } else if (smallTable === 'custom') {
        const tableSize = item.querySelector('.product-table-dimensions')?.value?.trim() || '客製尺寸';
        accessories.push({ name: '小桌子', qty: quantity, size: tableSize, color: null, category: 'chair-addon', done: false });
      }
    }

    if (category === 'accessory-only') {
      const accessoryType = item.querySelector('.accessory-type')?.value || '';
      const accessoryQty = Math.max(1, Number(item.querySelector('.accessory-qty')?.value) || 1);
      const accessoryColorSelect = item.querySelector('.accessory-color')?.value || '';
      const accessoryColorOther = item.querySelector('.accessory-color-other')?.value?.trim() || '';
      const accessoryColor = accessoryColorSelect === '其他' ? (accessoryColorOther || '其他') : accessoryColorSelect;
      const accessorySize = item.querySelector('.accessory-size')?.value?.trim() || '';

      mainColor = accessoryColor;
      colorOption = accessoryColorSelect === '其他' ? 'other' : 'standard';
      quantity = accessoryQty;

      if (accessoryType) {
        const accessoryCategory = ['跨腳椅', '師傅椅', '腳盆', '小桌子'].includes(accessoryType) ? 'chair-addon' : 'bed-addon';
        accessories.push({
          name: accessoryType,
          qty: accessoryQty,
          size: accessorySize || null,
          color: accessoryColor,
          category: accessoryCategory,
          done: false
        });
      }
    }

    let repairItem = null;
    if (category === 'repair-other') {
      repairItem = item.querySelector('.repair-item')?.value?.trim() || '';
      const repairColor = item.querySelector('.repair-color')?.value?.trim() || '';
      mainColor = repairColor;
      colorOption = 'custom';
      quantity = 1;
    }

    return {
      category,
      model,
      operationMode: isFeatherChair ? operationMode : null,
      hasArmrest: isFeatherChair ? (item.querySelector('.product-chair-armrest')?.value === 'yes') : null,
      hasGrid: isFeatherChair ? (item.querySelector('.product-chair-grid')?.value === 'yes') : null,
      quantity,
      mainColor,
      pillowColor,
      colorOption,
      dimensions,
      hasHole,
      accessories,
      repairItem
    };
  }

  function buildRepair(category) {
    if (category === 'repair-bed') return { approvedToYi: false, assignedTo: null };
    if (category === 'repair-chair') return { approvedToYi: true, assignedTo: 'yi' };
    if (category === 'repair-other') return { approvedToYi: false, assignedTo: null };
    return { approvedToYi: false, assignedTo: null };
  }

  function renderAll() {
    renderDashboardStats();
    renderRecentOrders();
    renderWorkerStats();
    renderOrders();
    renderDeliveryGroups();
    renderStats();
    renderInventoryAlert();
    renderInventoryView();
    updateCleanupSummary();
  }

  function getInventoryList() {
    const preferredOrder = ['footBasin', 'faucet', 'motor'];
    const items = Object.values(inventoryItems || {});
    return items.sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a.id);
      const bIndex = preferredOrder.indexOf(b.id);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }
      return String(a.name).localeCompare(String(b.name), 'zh-Hant');
    });
  }

  function getLowInventoryItems() {
    return getInventoryList().filter(item => item.enabled !== false && item.stock < item.warningQty);
  }

  function renderInventoryAlert() {
    const alert = document.getElementById('inventoryAlert');
    if (!alert) return;

    const lowItems = getLowInventoryItems();
    if (!lowItems.length) {
      alert.classList.add('hidden');
      alert.innerHTML = '';
      return;
    }

    alert.classList.remove('hidden');
    alert.innerHTML = `
      <strong>庫存不足：</strong>
      ${lowItems.map(item => {
        if (item.stock < 0) return `${escapeHtml(item.name)} ${item.stock}，請補貨`;
        return `${escapeHtml(item.name)}剩 ${item.stock}，低於安全量 ${item.warningQty}`;
      }).join('；')}
    `;
  }

  function renderInventoryView() {
    const summary = document.getElementById('inventorySummary');
    const grid = document.getElementById('inventoryItemsGrid');
    const movementList = document.getElementById('inventoryMovementList');
    if (!summary || !grid || !movementList) return;

    const items = getInventoryList();
    const lowItems = getLowInventoryItems();
    const totalStock = items.reduce((sum, item) => sum + Number(item.stock || 0), 0);

    summary.innerHTML = `
      <div class="inventory-summary-card">
        <span class="inventory-summary-label">庫存品項</span>
        <strong>${items.length}</strong>
      </div>
      <div class="inventory-summary-card">
        <span class="inventory-summary-label">低於安全量</span>
        <strong class="${lowItems.length ? 'danger' : 'ok'}">${lowItems.length}</strong>
      </div>
      <div class="inventory-summary-card">
        <span class="inventory-summary-label">總庫存數</span>
        <strong>${totalStock}</strong>
      </div>
    `;

    grid.innerHTML = items.map(item => {
      const isLow = item.enabled !== false && item.stock < item.warningQty;
      return `
        <div class="inventory-card ${isLow ? 'low' : ''}">
          <div class="inventory-card-header">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
            </div>
            <span class="inventory-status ${isLow ? 'danger' : 'ok'}">${isLow ? '需補貨' : '正常'}</span>
          </div>
          <div class="inventory-stock-row">
            <span>目前庫存</span>
            <strong>${item.stock}</strong>
          </div>
          <div class="inventory-settings">
            <label>
              <span>安全量</span>
              <input type="number" min="0" class="form-input inventory-warning-input" data-item-id="${escapeHtml(item.id)}" value="${item.warningQty}">
            </label>
            <label class="inventory-toggle">
              <input type="checkbox" data-item-id="${escapeHtml(item.id)}" ${item.enabled !== false ? 'checked' : ''}>
              <span>啟用提醒</span>
            </label>
          </div>
          <div class="inventory-actions">
            <button type="button" class="btn btn-sm btn-secondary" data-item-id="${escapeHtml(item.id)}" data-inventory-action="in">入庫</button>
            <button type="button" class="btn btn-sm btn-secondary" data-item-id="${escapeHtml(item.id)}" data-inventory-action="out">扣庫</button>
            <button type="button" class="btn btn-sm btn-dark" data-item-id="${escapeHtml(item.id)}" data-inventory-action="set">校正</button>
          </div>
        </div>
      `;
    }).join('');

    if (!inventoryMovements.length) {
      movementList.innerHTML = '<p class="text-muted text-center">尚無庫存異動紀錄</p>';
      return;
    }

    movementList.innerHTML = inventoryMovements.slice(0, 80).map(movement => `
      <div class="inventory-movement">
        <div>
          <strong>${escapeHtml(movement.itemName || movement.itemId)}</strong>
          <span>${escapeHtml(movement.reason || '-')}</span>
          ${movement.sourceOrderId ? `<span class="inventory-source">訂單 ${escapeHtml(movement.sourceOrderId)}</span>` : ''}
          ${movement.note ? `<span class="inventory-source">${escapeHtml(movement.note)}</span>` : ''}
        </div>
        <div class="inventory-movement-right">
          <span class="${movement.delta < 0 ? 'danger' : 'ok'}">${movement.delta > 0 ? '+' : ''}${movement.delta}</span>
          <small>${movement.beforeQty} → ${movement.afterQty}</small>
          <small>${escapeHtml(formatDateTime(movement.createdAt))}</small>
        </div>
      </div>
    `).join('');
  }

  function buildMovement({ item, delta, beforeQty, afterQty, reason, sourceType = 'manual', sourceOrderId = null, ruleId = null, note = '' }) {
    const createdAt = new Date();
    return {
      id: `${createdAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      itemId: item.id,
      itemName: item.name,
      delta,
      beforeQty,
      afterQty,
      reason,
      sourceType,
      sourceOrderId,
      ruleId,
      note,
      createdAt
    };
  }

  async function saveInventoryWithMovements(nextItems, movements) {
    inventoryItems = await window.erpStore.saveInventory(nextItems);
    for (const movement of movements) {
      await window.erpStore.saveInventoryMovement(movement);
    }
    inventoryMovements = await window.erpStore.loadInventoryMovements();
    renderInventoryAlert();
    renderInventoryView();
  }

  async function handleInventoryAction(itemId, action) {
    const item = inventoryItems[itemId];
    if (!item) return;

    openInventoryAdjustModal(item, action);
  }

  async function saveInventorySettingsFromControl(control) {
    const itemId = control?.dataset?.itemId;
    const item = inventoryItems[itemId];
    if (!item) return;

    const card = control.closest('.inventory-card');
    const warningQty = Math.max(0, Number(card?.querySelector('.inventory-warning-input')?.value || 0));
    const enabled = Boolean(card?.querySelector('.inventory-toggle input')?.checked);
    const nextItems = Object.assign({}, inventoryItems, {
      [itemId]: Object.assign({}, item, { warningQty, enabled, updatedAt: new Date() })
    });

    inventoryItems = await window.erpStore.saveInventory(nextItems);
    renderInventoryAlert();
    renderInventoryView();
    showToast(`${item.name} 設定已自動儲存`);
  }

  function getInventoryActionMeta(action) {
    const meta = {
      in: {
        title: '手動入庫',
        label: '入庫數量',
        button: '確認入庫',
        reason: '手動入庫',
        defaultValue: 1
      },
      out: {
        title: '手動扣庫',
        label: '扣庫數量',
        button: '確認扣庫',
        reason: '手動扣庫',
        defaultValue: 1
      },
      set: {
        title: '校正庫存',
        label: '校正後數量',
        button: '確認校正',
        reason: '手動校正',
        defaultValue: null
      }
    };

    return meta[action] || meta.in;
  }

  function calculateInventoryAfterQty(beforeQty, action, amount) {
    if (action === 'set') return amount;
    if (action === 'out') return beforeQty - amount;
    return beforeQty + amount;
  }

  function openInventoryAdjustModal(item, action) {
    const modal = document.getElementById('inventoryAdjustModal');
    const title = document.getElementById('inventoryAdjustTitle');
    const subtitle = document.getElementById('inventoryAdjustSubtitle');
    const currentQty = document.getElementById('inventoryAdjustCurrentQty');
    const amountLabel = document.getElementById('inventoryAdjustAmountLabel');
    const amountInput = document.getElementById('inventoryAdjustAmount');
    const noteInput = document.getElementById('inventoryAdjustNote');
    const confirmBtn = document.getElementById('confirmInventoryAdjust');
    if (!modal || !amountInput) return;

    const meta = getInventoryActionMeta(action);
    const stock = Number(item.stock || 0);
    pendingInventoryAdjustment = { itemId: item.id, action };

    if (title) title.textContent = `${meta.title}：${item.name}`;
    if (subtitle) subtitle.textContent = `目前庫存 ${stock}，異動會寫入庫存紀錄`;
    if (currentQty) currentQty.textContent = String(stock);
    if (amountLabel) amountLabel.textContent = meta.label;
    if (confirmBtn) confirmBtn.textContent = meta.button;

    amountInput.value = String(meta.defaultValue === null ? stock : meta.defaultValue);
    amountInput.min = '0';
    amountInput.select?.();
    if (noteInput) noteInput.value = '';

    updateInventoryAdjustPreview();
    modal.classList.add('active');
    setTimeout(() => {
      amountInput.focus();
      amountInput.select();
    }, 50);
  }

  function closeInventoryAdjustModal() {
    document.getElementById('inventoryAdjustModal')?.classList.remove('active');
    pendingInventoryAdjustment = null;
  }

  function updateInventoryAdjustPreview() {
    const preview = document.getElementById('inventoryAdjustPreview');
    const amountInput = document.getElementById('inventoryAdjustAmount');
    if (!preview || !amountInput || !pendingInventoryAdjustment) return;

    const item = inventoryItems[pendingInventoryAdjustment.itemId];
    if (!item) return;

    const beforeQty = Number(item.stock || 0);
    const amount = Number(amountInput.value);
    const afterQty = Number.isFinite(amount)
      ? calculateInventoryAfterQty(beforeQty, pendingInventoryAdjustment.action, amount)
      : beforeQty;
    const delta = afterQty - beforeQty;
    const deltaText = delta === 0 ? '無變化' : `${delta > 0 ? '+' : ''}${delta}`;

    preview.classList.toggle('negative', afterQty < 0);
    preview.innerHTML = `
      <span>調整後</span>
      <strong>${afterQty}</strong>
      <small>${deltaText}</small>
    `;
  }

  async function submitInventoryAdjustment(event) {
    event.preventDefault();

    if (!pendingInventoryAdjustment) return;

    const item = inventoryItems[pendingInventoryAdjustment.itemId];
    const amountInput = document.getElementById('inventoryAdjustAmount');
    const noteInput = document.getElementById('inventoryAdjustNote');
    if (!item || !amountInput) return;

    const amount = Number(amountInput.value);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast('請輸入有效數量');
      return;
    }

    if (pendingInventoryAdjustment.action !== 'set' && amount <= 0) {
      showToast('入庫或扣庫數量需大於 0');
      return;
    }

    const beforeQty = Number(item.stock || 0);
    const afterQty = calculateInventoryAfterQty(beforeQty, pendingInventoryAdjustment.action, amount);
    const delta = afterQty - beforeQty;
    const nextItem = Object.assign({}, item, { stock: afterQty, updatedAt: new Date() });
    const meta = getInventoryActionMeta(pendingInventoryAdjustment.action);
    const movement = buildMovement({
      item: nextItem,
      delta,
      beforeQty,
      afterQty,
      reason: meta.reason,
      note: String(noteInput?.value || '').trim()
    });

    await saveInventoryWithMovements(Object.assign({}, inventoryItems, { [item.id]: nextItem }), [movement]);
    closeInventoryAdjustModal();
    showToast(`${item.name} 已${meta.title}`);
  }

  function buildInventoryLocks(order) {
    const requirements = window.utils.getInventoryRequirements(order);
    return requirements.reduce((locks, requirement) => {
      if (!locks[requirement.ruleId]) {
        locks[requirement.ruleId] = {
          status: 'reserved',
          completed: false,
          items: []
        };
      }
      locks[requirement.ruleId].items.push({
        itemId: requirement.itemId,
        qty: requirement.qty
      });
      return locks;
    }, {});
  }

  async function applyInventoryForNewOrders(newOrders) {
    const latestItems = await window.erpStore.loadInventory();
    const nextItems = Object.assign({}, latestItems);
    const movements = [];

    const updatedOrders = newOrders.map(order => {
      const updated = window.utils.cloneOrder(order);
      if (updated.inventoryLocks && Object.keys(updated.inventoryLocks).length) {
        return updated;
      }

      const locks = buildInventoryLocks(updated);
      updated.inventoryLocks = locks;

      Object.entries(locks).forEach(([ruleId, lock]) => {
        lock.items.forEach(lockItem => {
          const item = nextItems[lockItem.itemId];
          if (!item) return;
          const beforeQty = Number(item.stock || 0);
          const afterQty = beforeQty - Number(lockItem.qty || 0);
          nextItems[lockItem.itemId] = Object.assign({}, item, {
            stock: afterQty,
            updatedAt: new Date()
          });
          movements.push(buildMovement({
            item: nextItems[lockItem.itemId],
            delta: -Number(lockItem.qty || 0),
            beforeQty,
            afterQty,
            reason: ruleId === 'footBasinSet' ? '腳盆成套扣庫存' : '派單扣庫存',
            sourceType: 'order',
            sourceOrderId: updated.orderId,
            ruleId
          }));
        });
      });

      return updated;
    });

    if (movements.length) {
      await saveInventoryWithMovements(nextItems, movements);
    }

    return updatedOrders;
  }

  async function releaseInventoryForOrder(order, reason = '訂單取消補回') {
    const locks = order?.inventoryLocks || {};
    const activeLocks = Object.entries(locks).filter(([, lock]) => lock?.status === 'reserved');
    if (!activeLocks.length) return;

    const latestItems = await window.erpStore.loadInventory();
    const nextItems = Object.assign({}, latestItems);
    const movements = [];

    activeLocks.forEach(([ruleId, lock]) => {
      if (window.utils.isInventoryLockCompleted(order, ruleId)) {
        (lock.items || []).forEach(lockItem => {
          const item = nextItems[lockItem.itemId];
          if (!item) return;
          movements.push(buildMovement({
            item,
            delta: 0,
            beforeQty: Number(item.stock || 0),
            afterQty: Number(item.stock || 0),
            reason: '完成不補回',
            sourceType: 'order',
            sourceOrderId: order.orderId,
            ruleId
          }));
        });
        return;
      }

      (lock.items || []).forEach(lockItem => {
        const item = nextItems[lockItem.itemId];
        if (!item) return;
        const beforeQty = Number(item.stock || 0);
        const qty = Number(lockItem.qty || 0);
        const afterQty = beforeQty + qty;
        nextItems[lockItem.itemId] = Object.assign({}, item, {
          stock: afterQty,
          updatedAt: new Date()
        });
        movements.push(buildMovement({
          item: nextItems[lockItem.itemId],
          delta: qty,
          beforeQty,
          afterQty,
          reason,
          sourceType: 'order',
          sourceOrderId: order.orderId,
          ruleId
        }));
      });
    });

    if (movements.length) {
      await saveInventoryWithMovements(nextItems, movements);
    }
  }

  function renderDashboardStats() {
    document.getElementById('statInProgress').textContent = orders.filter(order => order.status.stage === 'InProgress').length;
    document.getElementById('statUrgent').textContent = orders.filter(order => order.status.stage === 'InProgress' && window.utils.isUrgent(order.dates.deadline)).length;
    document.getElementById('statReady').textContent = orders.filter(order => order.status.stage === 'ReadyForDelivery').length;
    document.getElementById('statCompleted').textContent = orders.filter(order => order.status.stage === 'Completed').length;
  }

  function renderRecentOrders() {
    const tbody = document.getElementById('recentOrdersBody');
    const recent = orders;

    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 40px;">目前沒有訂單</td></tr>';
      return;
    }

    tbody.innerHTML = recent.map(order => `
      <tr>
        <td data-label="訂單編號"><span class="order-id">${escapeHtml(order.orderId)}</span></td>
        <td data-label="客戶">${escapeHtml(order.customerName)}</td>
        <td data-label="品項">${escapeHtml(getCategoryLabel(order.product.category))}</td>
        <td data-label="規格">${escapeHtml(window.utils.getMainSpecLabel(order))}</td>
        <td data-label="交期" class="order-deadline">${escapeHtml(window.utils.formatDate(order.dates.deadline))}</td>
        <td data-label="狀態"><span class="badge ${window.utils.getStageBadgeClass(order.status.stage)}">${escapeHtml(getStageLabel(order.status.stage))}</span></td>
        <td data-label="進度">${renderProgressPills(order)}</td>
      </tr>
    `).join('');
  }

  function renderWorkerStats() {
    renderWorkerCard('yan', 'yanPending', 'yanUnprocessed');
    renderWorkerCard('yi', 'yiPending', 'yiUnprocessed');
    renderWorkerCard('you', 'youPending', 'youUnprocessed');
    renderWorkerCard('xiang', 'xiangPending', 'xiangUnprocessed');
  }

  function renderWorkerCard(workerId, pendingId, unprocessedId) {
    const visible = orders.filter(order => window.utils.shouldWorkerSeeOrder(order, workerId));
    document.getElementById(pendingId).textContent = visible.filter(order => window.utils.getWorkflowStatus(order, workerId) === 'queued').length;
    document.getElementById(unprocessedId).textContent = visible.filter(order => window.utils.getWorkflowStatus(order, workerId) === 'unprocessed').length;
  }

  function renderOrders() {
    const tbody = document.getElementById('ordersBody');
    const filtered = getFilteredOrders();

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 40px;">查無符合條件的訂單</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(order => `
      <tr data-order-id="${escapeHtml(order.orderId)}"${order.urgentFlag ? ' class="urgent-row"' : ''}>
        <td data-label="訂單編號"><span class="order-id">${escapeHtml(order.orderId)}</span>${order.urgentFlag ? ' <span class="badge badge-urgent">急件</span>' : ''}</td>
        <td data-label="客戶">${escapeHtml(order.customerName)}</td>
        <td data-label="品項">${escapeHtml(getCategoryLabel(order.product.category))}</td>
        <td data-label="規格/數量">${escapeHtml(window.utils.getMainSpecLabel(order))} / ${window.utils.orderQuantity(order)}</td>
        <td data-label="皮色">${escapeHtml(order.product.mainColor || '-')}</td>
        <td data-label="交期">${escapeHtml(window.utils.formatDate(order.dates.deadline))}</td>
        <td data-label="狀態"><span class="badge ${window.utils.getStageBadgeClass(order.status.stage)}">${escapeHtml(getStageLabel(order.status.stage))}</span></td>
        <td data-label="操作"><button class="btn btn-sm btn-dark" onclick="window.viewOrder('${escapeJs(order.orderId)}')">查看</button></td>
      </tr>
    `).join('');
  }

  function getFilteredOrders() {
    const stageMap = {
      'in-progress': 'InProgress',
      ready: 'ReadyForDelivery',
      completed: 'Completed'
    };

    return orders.filter(order => {
      if (currentFilter !== 'all' && order.status.stage !== stageMap[currentFilter]) return false;

      if (filterCategory?.value) {
        if (filterCategory.value === 'repair') {
          if (!window.utils.isRepairCategory(order.product.category)) return false;
        } else if (order.product.category !== filterCategory.value) {
          return false;
        }
      }

      if (filterCity?.value && order.location.city !== filterCity.value) return false;

      if (currentSearch) {
        const haystack = [
          order.orderId,
          order.customerName,
          order.location.city,
          order.location.district,
          getCategoryLabel(order.product.category)
        ].join(' ').toLowerCase();
        if (!haystack.includes(currentSearch)) return false;
      }

      return true;
    });
  }

  function populateCityFilter() {
    if (!filterCity) return;

    const currentValue = filterCity.value;
    const options = Array.from(new Set(orders.map(order => order.location.city).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));

    filterCity.innerHTML = `<option value="">所有城市</option>${options.map(city => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join('')}`;
    filterCity.value = currentValue;
  }

  function renderDeliveryGroups() {
    const container = document.getElementById('deliveryGroups');
    const readyOrders = orders
      .filter(order => order.status.stage === 'ReadyForDelivery')
      .sort(compareOrdersByRoute);

    if (!readyOrders.length) {
      container.innerHTML = '<p class="text-muted text-center">目前沒有待出貨訂單</p>';
      return;
    }

    const grouped = readyOrders.reduce((bucket, order) => {
      const key = `${order.location.city || '未分區'} / ${order.location.district || '未分區'}`;
      if (!bucket[key]) bucket[key] = [];
      bucket[key].push(order);
      return bucket;
    }, {});

    container.innerHTML = Object.entries(grouped).map(([area, areaOrders]) => `
      <div class="delivery-group">
        <div class="delivery-group-header">
          <span class="delivery-group-title">${escapeHtml(area)}</span>
          <span class="delivery-group-count">${areaOrders.length} 單</span>
        </div>
        <div class="delivery-items">
          ${areaOrders.map(order => `
            <div class="delivery-item">
              <div>
                <strong>${escapeHtml(order.orderId)}</strong> - ${escapeHtml(order.customerName)}
                <div class="text-sm text-muted">${escapeHtml(order.location.address || '-')}</div>
              </div>
              <span class="order-deadline">${escapeHtml(window.utils.formatDate(order.dates.deadline))}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function getYiCategoryLabel(order) {
    const category = order.product.category;
    if (category === 'massage-chair') {
      const model = order.product.model;
      return model ? `腳底按摩椅 (${model})` : '腳底按摩椅';
    }
    return getCategoryLabel(category);
  }

  function getYiStatsFromStorage() {
    try {
      const data = localStorage.getItem('yiProductionStats');
      return data ? JSON.parse(data) : {};
    } catch { return {}; }
  }

  function saveYiStatsToStorage(stats) {
    window.erpStore.saveYiStats(stats);
  }

  function handleClearStats() {
    const confirmedText = window.prompt('輸入「確認清除」以清空統計資料', '');
    if (confirmedText !== '確認清除') {
      showToast('已取消清除');
      return;
    }
    window.erpStore.saveYiStats({});
    renderStats();
    showToast('已清空統計資料');
  }

  function renderStats() {
    const currentCategoryChart = document.getElementById('currentCategoryChart');
    const prevCategoryChart = document.getElementById('prevCategoryChart');
    const currentMonthLabel = document.getElementById('currentMonthLabel');
    const currentMonthCount = document.getElementById('currentMonthCount');
    const prevMonthLabel = document.getElementById('prevMonthLabel');
    const prevMonthCount = document.getElementById('prevMonthCount');
    const currentCategoryTitle = document.getElementById('currentCategoryTitle');
    const prevCategoryTitle = document.getElementById('prevCategoryTitle');

    if (!currentCategoryChart || !prevCategoryChart) return;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthKey = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const storedStats = getYiStatsFromStorage();

    const yiCompletedOrders = orders.filter(order => {
      if (!window.utils.getRelevantWorkers(order).includes('yi')) return false;
      if (window.utils.getWorkflowStatus(order, 'yi') !== 'completed') return false;
      const completedDate = window.utils.getWorkerCompletionDate(order, 'yi');
      if (!completedDate) return false;
      return completedDate >= prevMonthStart;
    });

    let currentCount = 0;
    let prevCount = 0;
    const currentByCategory = {};
    const prevByCategory = {};

    yiCompletedOrders.forEach(order => {
      const completedDate = window.utils.getWorkerCompletionDate(order, 'yi');
      const qty = window.utils.orderQuantity(order);
      const category = getYiCategoryLabel(order);

      if (completedDate >= currentMonthStart) {
        currentCount += qty;
        currentByCategory[category] = (currentByCategory[category] || 0) + qty;
      } else {
        prevCount += qty;
        prevByCategory[category] = (prevByCategory[category] || 0) + qty;
      }
    });

    const storedCurrent = storedStats[currentMonthKey] || { total: 0, categories: {} };
    const storedPrev = storedStats[prevMonthKey] || { total: 0, categories: {} };

    currentCount += storedCurrent.total;
    prevCount += storedPrev.total;
    Object.entries(storedCurrent.categories).forEach(([cat, qty]) => {
      currentByCategory[cat] = (currentByCategory[cat] || 0) + qty;
    });
    Object.entries(storedPrev.categories).forEach(([cat, qty]) => {
      prevByCategory[cat] = (prevByCategory[cat] || 0) + qty;
    });

    const currentMonthNum = now.getMonth() + 1;
    const prevMonthNum = now.getMonth() === 0 ? 12 : now.getMonth();

    if (currentMonthLabel) currentMonthLabel.textContent = `${currentMonthNum}月`;
    if (currentMonthCount) currentMonthCount.textContent = currentCount;
    if (prevMonthLabel) prevMonthLabel.textContent = `${prevMonthNum}月`;
    if (prevMonthCount) prevMonthCount.textContent = prevCount;
    if (currentCategoryTitle) currentCategoryTitle.textContent = `${currentMonthNum}月品項`;
    if (prevCategoryTitle) prevCategoryTitle.textContent = `${prevMonthNum}月品項`;

    currentCategoryChart.innerHTML = renderCategoryList(currentByCategory);
    prevCategoryChart.innerHTML = renderCategoryList(prevByCategory);
  }

  function renderCategoryList(byCategory) {
    const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<p class="text-muted text-center">尚無資料</p>';
    return rows.map(([label, count]) => `
      <div class="yi-category-item">
        <span class="label">${escapeHtml(label)}</span>
        <span class="count">${count} 件</span>
      </div>
    `).join('');
  }

  function renderProgressText(order) {
    return getProgressSummary(order).map(item => `${item.workerLabel}:${item.statusLabel}`).join(' / ');
  }

  function renderProgressPills(order) {
    return `
      <div class="management-progress-pills">
        ${getProgressSummary(order).map(item => `
          <span class="management-progress-pill ${escapeHtml(item.status)}">
            ${escapeHtml(item.workerLabel)}:${escapeHtml(item.statusLabel)}
          </span>
        `).join('')}
      </div>
    `;
  }

  function getProgressSummary(order) {
    return window.utils.getRelevantWorkers(order).map(workerId => ({
      workerId,
      workerLabel: getWorkerLabel(workerId),
      status: window.utils.getWorkflowStatus(order, workerId),
      statusLabel: getWorkflowLabel(window.utils.getWorkflowStatus(order, workerId))
    }));
  }

  function compareOrdersByRoute(a, b) {
    const aArea = `${a.location.city || ''}${a.location.district || ''}`;
    const bArea = `${b.location.city || ''}${b.location.district || ''}`;
    if (aArea !== bArea) return aArea.localeCompare(bArea, 'zh-Hant');
    return compareOrdersByDeadline(a, b);
  }

  function compareOrdersByDeadline(a, b) {
    const aTime = a.dates.deadline ? new Date(a.dates.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.dates.deadline ? new Date(b.dates.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }

  function closeOrderModal() {
    orderModal?.classList.remove('active');
  }

  window.viewOrder = function(orderId) {
    const order = orders.find(item => item.orderId === orderId);
    if (!order) return;

    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');
    const progress = getProgressSummary(order);

    modalBody.innerHTML = `
      <div class="order-detail">
        <div class="detail-section">
          <h4>基本資料</h4>
          <div class="detail-grid">
            ${detailItem('訂單編號', order.orderId)}
            ${detailItem('客戶', order.customerName)}
            ${detailItem('品項', getCategoryLabel(order.product.category))}
            ${detailItem('數量', window.utils.orderQuantity(order))}
            ${detailItem('規格', window.utils.getMainSpecLabel(order))}
            ${detailItem('皮色', order.product.mainColor || '-')}
          </div>
        </div>
        <div class="detail-section">
          <h4>分發進度</h4>
          <div class="status-checklist">
            ${progress.map(item => `
              <div class="status-item ${item.status === 'completed' ? 'done' : ''}">
                <span class="status-check">${item.status === 'completed' ? '✓' : ''}</span>
                <span>${escapeHtml(item.workerLabel)} / ${escapeHtml(item.statusLabel)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    modalFooter.innerHTML = `
      <button class="btn btn-danger" onclick="window.cancelOrder('${escapeJs(order.orderId)}')">取消訂單</button>
      <div style="flex: 1;"></div>
      <button class="btn ${order.urgentFlag ? 'btn-urgent-active' : 'btn-urgent'}" onclick="window.toggleUrgentFlag('${escapeJs(order.orderId)}')">${order.urgentFlag ? '取消急件' : '設為急件'}</button>
      <button class="btn btn-secondary" onclick="document.getElementById('orderModal').classList.remove('active')">關閉</button>
      ${order.status.stage !== 'Completed' ? `<button class="btn btn-accent" onclick="window.markComplete('${escapeJs(order.orderId)}')">${order.status.stage === 'ReadyForDelivery' ? '標記為已完成' : '強制完成訂單'}</button>` : ''}
    `;

    orderModal?.classList.add('active');
  };

  function showConfirmDialog({ customerName, onConfirm }) {
    const existing = document.getElementById('confirmDialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirmDialog';
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog" role="dialog" aria-modal="true">
        <div class="confirm-dialog-icon">
          <div class="confirm-dialog-icon-circle">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
        </div>
        <div class="confirm-dialog-body">
          <div class="confirm-dialog-title">確定要取消訂單？</div>
          <div class="confirm-dialog-message">此操作無法復原，訂單將從所有裝置中永久刪除。</div>
          <span class="confirm-dialog-customer">${customerName}</span>
        </div>
        <div class="confirm-dialog-footer">
          <button class="confirm-dialog-cancel-btn">返回</button>
          <button class="confirm-dialog-confirm-btn">確認取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    function close() {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 250);
    }

    overlay.querySelector('.confirm-dialog-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.confirm-dialog-confirm-btn').addEventListener('click', () => {
      close();
      onConfirm();
    });
  }

  window.toggleUrgentFlag = function(orderId) {
    const nextOrders = orders.map(o => {
      if (o.orderId !== orderId) return o;
      const updated = window.utils.cloneOrder(o);
      updated.urgentFlag = !o.urgentFlag;
      return updated;
    });
    window.erpStore.saveOrders(nextOrders);
    orders = nextOrders;
    renderAll();
    window.viewOrder(orderId);
  };

  window.cancelOrder = function(orderId) {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;

    showConfirmDialog({
      customerName: order.customerName,
      onConfirm: async () => {
        await releaseInventoryForOrder(order, '訂單取消補回');
        const nextOrders = orders.filter(o => o.orderId !== orderId);
        await window.erpStore.saveOrders(nextOrders);
        orders = nextOrders;
        closeOrderModal();
        populateCityFilter();
        renderAll();
        showToast(`已取消訂單：${order.customerName}`);
      }
    });
  };

  window.markComplete = async function(orderId) {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;

    const nextOrders = orders.map(o => {
      if (o.orderId !== orderId) return o;
      return window.utils.completeOrder(o);
    });

    await window.erpStore.saveOrders(nextOrders);
    closeOrderModal();
    showToast(`已完成訂單及所有工作單：${order.customerName || orderId}`);
  };

  function detailItem(label, value) {
    return `
      <div class="detail-item">
        <span class="detail-label">${escapeHtml(label)}</span>
        <span class="detail-value">${escapeHtml(String(value))}</span>
      </div>
    `;
  }

  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function getCategoryLabel(category) {
    return categoryLabels[category] || category || '-';
  }

  function getWorkerLabel(workerId) {
    return workerLabels[workerId] || workerId || '-';
  }

  function getWorkflowLabel(status) {
    return workflowLabels[status] || status || '-';
  }

  function getStageLabel(stage) {
    return stageLabels[stage] || stage || '-';
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-TW', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderMaterialsView() {
    const container = document.getElementById('materialsGrid');
    if (!container) return;

    const workers = [
      { id: 'yan', label: '言' },
      { id: 'yi', label: '毅' },
      { id: 'you', label: '祐' },
      { id: 'xiang', label: '翔' }
    ];

    container.innerHTML = workers.map(w => {
      const notes = materials[w.id] || '';
      return `
        <div class="material-card">
          <div class="material-card-header">
            <div class="material-worker-avatar">${escapeHtml(w.label)}</div>
            <div class="material-worker-name">${escapeHtml(w.label)}</div>
            <button class="btn btn-sm btn-secondary btn-edit-material" data-worker="${escapeHtml(w.id)}">編輯需求</button>
          </div>
          <div class="material-notes${notes ? '' : ' empty'}">${notes ? escapeHtml(notes).replace(/\n/g, '<br>') : '尚無備料需求'}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-edit-material').forEach(btn => {
      btn.addEventListener('click', () => openMaterialModal(btn.dataset.worker));
    });
  }

  function openMaterialModal(workerId) {
    const labels = { yan: '言', yi: '毅', you: '祐', xiang: '翔' };
    const modal = document.getElementById('materialModal');
    const title = document.getElementById('materialModalTitle');
    const textarea = document.getElementById('materialModalTextarea');
    if (!modal || !textarea) return;

    title.textContent = `${labels[workerId] || workerId} — 物料需求`;
    textarea.value = materials[workerId] || '';
    modal.dataset.worker = workerId;
    modal.classList.add('active');
    setTimeout(() => textarea.focus(), 50);
  }

  function closeMaterialModal() {
    document.getElementById('materialModal')?.classList.remove('active');
  }

  async function saveMaterialModal() {
    const modal = document.getElementById('materialModal');
    const textarea = document.getElementById('materialModalTextarea');
    if (!modal || !textarea) return;

    const workerId = modal.dataset.worker;
    const notes = textarea.value;
    materials = await window.erpStore.saveMaterial(workerId, notes);
    renderMaterialsView();
    updateWorkerMaterialBadges();
    closeMaterialModal();
    showToast('備料需求已儲存');
  }

  function updateWorkerMaterialBadges() {
    document.querySelectorAll('.btn-material[data-worker]').forEach(btn => {
      btn.classList.toggle('has-notes', Boolean(materials[btn.dataset.worker]));
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJs(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  document.addEventListener('DOMContentLoaded', init);
})();
