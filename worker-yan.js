document.addEventListener('DOMContentLoaded', function() {
  window.WorkerApp.init({
    workerId: 'yan',
    scopes: [
      { id: 'yan', label: '言' },
      { id: 'you', label: '祐' },
      { id: 'yi', label: '毅' },
      { id: 'xiang', label: '翔' },
      { id: 'all', label: '全部' }
    ],
    defaultScope: 'yan'
  });
});
