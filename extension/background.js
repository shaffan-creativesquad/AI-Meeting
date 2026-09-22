// MeetingMind AI - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('MeetingMind AI installed');
});

// Tab change detect karo - meeting page par ho to notify karo
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const meetingUrls = [
      'meet.google.com',
      'zoom.us',
      'teams.microsoft.com'
    ];

    const isMeeting = meetingUrls.some(url => tab.url.includes(url));

    if (isMeeting) {
      // Extension icon highlight karo
      chrome.action.setIcon({
        tabId,
        path: { 48: 'icons/icon48.png' }
      });

      chrome.action.setBadgeText({ tabId, text: 'AI' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#6c63ff' });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  }
});
