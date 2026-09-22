document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('open-dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:5000' });
  });
});
