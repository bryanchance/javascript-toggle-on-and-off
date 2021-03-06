'use strict';

var badge = false;
var tab;

var app = {
  title: title => {
    chrome.browserAction.setTitle({
      title
    });
  },
  icon: (path = '') => {
    if (chrome.browserAction.setIcon) {
      chrome.browserAction.setIcon({
        path: {
          '19': 'data/icons' + path + '/19.png',
          '38': 'data/icons' + path + '/38.png'
        }
      });
    }
    if (badge && chrome.browserAction.setBadgeText) {
      chrome.browserAction.setBadgeText({
        text: path ? 'd' : ''
      });
    }
  }
};

var refresh = () => chrome.storage.local.get({
  'refresh-enabled': true,
  'refresh-disabled': true,
  'state': true
}, prefs => {
  if (tab && tab.url && tab.url.startsWith('http')) {
    if ((prefs.state && prefs['refresh-enabled']) || (prefs.state === false && prefs['refresh-disabled'])) {
      chrome.tabs.reload(tab.id, {
        bypassCache: true
      });
    }
  }
  tab = null;
});

var getHost = tab => tab.url.split('://')[1].split('/')[0];

var js = {
  whitelist: [],
  blacklist: [],
  whiteListen: d => {
    const hostname = getHost(d);
    for (const h of js.whitelist) {
      if (hostname.endsWith(h)) {
        return;
      }
    }
    const responseHeaders = d.responseHeaders;
    responseHeaders.push({
      'name': 'Content-Security-Policy',
      'value': 'script-src \'none\''
    });
    return {responseHeaders};
  },
  blackListen: d => {
    const hostname = getHost(d);
    for (const h of js.blacklist) {
      if (hostname.endsWith(h)) {
        const responseHeaders = d.responseHeaders;
        responseHeaders.push({
          'name': 'Content-Security-Policy',
          'value': 'script-src \'none\''
        });
        return {responseHeaders};
      }
    }
    return;
  },
  enable: () => {
    chrome.webRequest.onHeadersReceived.removeListener(js.whiteListen);
    chrome.webRequest.onHeadersReceived.addListener(
      js.blackListen,
      {
        'urls': ['*://*/*'],
        'types': [
          'main_frame',
          'sub_frame'
        ]
      },
      ['blocking', 'responseHeaders']
    );
    window.setTimeout(refresh, 10);
    app.icon();
    app.title('Click to disable JavaScript');
  },
  disable: () => {
    chrome.webRequest.onHeadersReceived.removeListener(js.blackListen);
    chrome.webRequest.onHeadersReceived.addListener(
      js.whiteListen,
      {
        'urls': ['*://*/*'],
        'types': [
          'main_frame',
          'sub_frame'
        ]
      },
      ['blocking', 'responseHeaders']
    );
    window.setTimeout(refresh, 10);
    app.icon('/n');
    app.title('Click to enable JavaScript');
  }
};

chrome.storage.local.get({
  state: true,
  badge: false,
  whitelist: [],
  blacklist: []
}, prefs => {
  badge = prefs.badge;
  js.whitelist = prefs.whitelist;
  js.blacklist = prefs.blacklist;
  js[prefs.state ? 'enable' : 'disable']();
});

chrome.storage.onChanged.addListener(prefs => {
  if (prefs.state) {
    js[prefs.state.newValue ? 'enable' : 'disable']();
  }
  if (prefs.whitelist) {
    js.whitelist = prefs.whitelist.newValue;
  }
  if (prefs.blacklist) {
    js.blacklist = prefs.blacklist.newValue;
  }
  if (prefs.badge) {
    badge = prefs.badge.newValue;
  }
});
//
var onClicked = t => {
  tab = t;
  chrome.storage.local.get({
    state: true
  }, prefs => {
    prefs.state = !prefs.state;
    chrome.storage.local.set(prefs);
  });
};
chrome.browserAction.onClicked.addListener(onClicked);
chrome.commands.onCommand.addListener(() => {
  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, tabs => {
    if (tabs && tabs.length) {
      onClicked(tabs[0]);
    }
  });
});
//
if (chrome.contextMenus) {
  chrome.contextMenus.create({
    id: 'open-test-page',
    title: 'Check JavaScript execution',
    contexts: ['browser_action']
  });
  chrome.contextMenus.create({
    id: 'open-settings',
    title: 'Open settings',
    contexts: ['browser_action']
  });
  chrome.contextMenus.create({
    id: 'separator',
    type: 'separator',
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
  chrome.contextMenus.create({
    id: 'whitelist-toggle',
    title: 'Add to or remove from whitelist',
    contexts: ['browser_action'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
  chrome.contextMenus.create({
    id: 'blacklist-toggle',
    title: 'Add to or remove from blacklist',
    contexts: ['browser_action'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });

  chrome.contextMenus.onClicked.addListener((info, t) => {
    if (info.menuItemId === 'open-test-page') {
      chrome.tabs.create({
        url: 'http://tools.add0n.com/check-javascript.html?rand=' + Math.random()
      });
    }
    else if (info.menuItemId === 'open-settings') {
      chrome.runtime.openOptionsPage();
    }
    else if (info.menuItemId === 'whitelist-toggle' || info.menuItemId === 'blacklist-toggle') {
      const hostname = getHost(t);
      const type = info.menuItemId.replace('-toggle', '');
      const index = js[type].indexOf(hostname);
      if (index > -1) {
        js[type].splice(index, 1);
      }
      else {
        js[type].push(hostname);
      }
      chrome.notifications.create({
        title: 'JavaScript Toggle On and Off',
        type: 'basic',
        iconUrl: 'data/icons/48.png',
        message: index > -1 ? `"${hostname}" is removed from the ${type}` : `"${hostname}" is added to the ${type}`
      });
      chrome.storage.local.set({
        [type]: js[type]
      }, () => {
        tab = t;
        refresh();
      });
    }
  });
}
// FAQs & Feedback
chrome.storage.local.get({
  'version': null,
  'faqs': navigator.userAgent.indexOf('Firefox') === -1,
  'last-update': 0,
}, prefs => {
  const version = chrome.runtime.getManifest().version;

  if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
    const now = Date.now();
    const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
    chrome.storage.local.set({
      version,
      'last-update': doUpdate ? Date.now() : prefs['last-update']
    }, () => {
      // do not display the FAQs page if last-update occurred less than 30 days ago.
      if (doUpdate) {
        const p = Boolean(prefs.version);
        chrome.tabs.create({
          url: chrome.runtime.getManifest().homepage_url + '&version=' + version +
            '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
          active: p === false
        });
      }
    });
  }
});

{
  const {name, version} = chrome.runtime.getManifest();
  chrome.runtime.setUninstallURL(
    chrome.runtime.getManifest().homepage_url + '&rd=feedback&name=' + name + '&version=' + version
  );
}
