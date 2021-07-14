




const oldTabMap = {}


async function createBaseContextMenus() {
  return Promise.all(
    [
      chrome.contextMenus.create({ title: '❂ 标签去重  (Win: Alt + C | Mac: Option + C)', id: 'settle', documentUrlPatterns: ["<all_urls>"], contexts: ['all'], }),
      chrome.contextMenus.create({ title: '⏎ 切换返回 (Alt + W | Option + W)', id: 'goBack', documentUrlPatterns: ["<all_urls>"], contexts: ['all'], }),
      chrome.contextMenus.create({ id: 'line', type: 'separator', documentUrlPatterns: ["<all_urls>"], contexts: ['all'], }),
    ]
  )
}


chrome.runtime.onInstalled.addListener(createBaseContextMenus);

// ------ tab ---------

chrome.tabs.onActivated.addListener((activeInfo) => {
  doCLUT(activeInfo)
})

chrome.tabs.onUpdated.addListener(async (tabId, { status, }, tab) => {
  if (status === 'complete') {
    if (!oldTabMap[tabId]) {
      oldTabMap[tabId] = true

      await chrome.contextMenus.create({
        title: `${tab.title}`,
        id: String(tabId),
        documentUrlPatterns: ["<all_urls>"],
        contexts: ['all']
      });

    } else {

      await chrome.contextMenus.update(String(tabId), { title: tab.title });
    }
  }
});

chrome.tabs.onCreated.addListener(function (tab) {
  CLUTlog("Tab create event fired with tab(" + tab.id + ")");
  addTabToMRUAtBack(tab.id);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {

  CLUTlog("Tab remove event fired from tab(" + tabId + ")");
  removeTabFromMRU(tabId);

  await chrome.contextMenus.remove(String(tabId))
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await chrome.contextMenus.removeAll()
  await createBaseContextMenus()
  const tabs = await chrome.tabs.query({ currentWindow: true })

  tabs.forEach(async (tab) => {
    await chrome.contextMenus.create({
      title: `${tab.title}`,
      id: String(tab.id),
      documentUrlPatterns: ["<all_urls>"],
      contexts: ['all']
    })
  })

  // chrome.contextMenus.create

})

// ------ contextMenus ---------
chrome.contextMenus.onClicked.addListener(async ({ menuItemId },) => {

  switch (menuItemId) {
    case 'settle':
      await removeDuplicateTabs()
      break;

    case 'goBack':
      await processCommand('alt_switch_fast')
      break;

    case 'line':
      break;

    default:
      chrome.tabs.update(Number(menuItemId), { active: true, highlighted: true });

      break;
  }
})


// ------ 通用方法 ---------
async function removeDuplicateTabs() {
  let tabs = await chrome.tabs.query({ currentWindow: true });
  // 统计
  const statistical = {}
  const removesTabs = []
  const restTabs = []

  tabs.forEach((tab) => {
    const { id, url } = tab

    const urlWithoutHash = `${url}`.split('#')[0]

    if (statistical[urlWithoutHash]) {
      removesTabs.push(id)
    } else {
      statistical[urlWithoutHash] = true

      restTabs.push(tab)
    }
  });


  await chrome.tabs.remove(removesTabs);

  return restTabs
}

// CLUT

var mru = [];
var slowSwitchOngoing = false;
var fastSwitchOngoing = false;
var intSwitchCount = 0;
var lastIntSwitchIndex = 0;
var altPressed = false;
var wPressed = false;

var domLoaded = false
var quickActive = 0;
var slowActive = 0;

var prevTimestamp = 0;
var slowtimerValue = 1500;
var fasttimerValue = 200;
var timer;

var slowswitchForward = false;

var initialized = false;

var loggingOn = false;

var CLUTlog = function (str) {
  if (loggingOn) {
  }
}


var processCommand = async function (command) {
  CLUTlog('Command recd:' + command);
  var fastswitch = true;
  slowswitchForward = false;
  if (command === 'alt_remove_duplicate') {
    await removeDuplicateTabs()
    return
  } else if (command == "alt_switch_fast") {
    fastswitch = true;
    quickSwitchActiveUsage();
  } else if (command == "alt_switch_slow_backward") {
    fastswitch = false;
    slowswitchForward = false;
    slowSwitchActiveUsage();
  } else if (command == "alt_switch_slow_forward") {
    fastswitch = false;
    slowswitchForward = true;
    slowSwitchActiveUsage();
  }

  if (!slowSwitchOngoing && !fastSwitchOngoing) {

    if (fastswitch) {
      fastSwitchOngoing = true;
    } else {
      slowSwitchOngoing = true;
    }
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();

  } else if ((slowSwitchOngoing && !fastswitch) || (fastSwitchOngoing && fastswitch)) {
    CLUTlog("CLUT::DO_INT_SWITCH");
    doIntSwitch();

  } else if (slowSwitchOngoing && fastswitch) {
    endSwitch();
    fastSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();

  } else if (fastSwitchOngoing && !fastswitch) {
    endSwitch();
    slowSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  }

  if (timer) {
    if (fastSwitchOngoing || slowSwitchOngoing) {
      clearTimeout(timer);
    }
  }
  if (fastswitch) {
    timer = setTimeout(function () { endSwitch() }, fasttimerValue);
  } else {
    timer = setTimeout(function () { endSwitch() }, slowtimerValue);
  }

};

chrome.commands.onCommand.addListener(processCommand);

chrome.runtime.onStartup.addListener(function () {
  CLUTlog("on startup");
  initialize();

});

chrome.runtime.onInstalled.addListener(function () {
  CLUTlog("on startup");
  initialize();

});


var doIntSwitch = function () {
  CLUTlog("CLUT:: in int switch, intSwitchCount: " + intSwitchCount + ", mru.length: " + mru.length);
  if (intSwitchCount < mru.length && intSwitchCount >= 0) {
    var tabIdToMakeActive;

    var invalidTab = true;
    var thisWindowId;
    if (slowswitchForward) {
      decrementSwitchCounter();
    } else {
      incrementSwitchCounter();
    }
    tabIdToMakeActive = mru[intSwitchCount];
    chrome.tabs.get(tabIdToMakeActive, function (tab) {
      if (tab) {
        thisWindowId = tab.windowId;
        invalidTab = false;

        chrome.windows.update(thisWindowId, { "focused": true });
        chrome.tabs.update(tabIdToMakeActive, { active: true, highlighted: true });
        lastIntSwitchIndex = intSwitchCount;
        //break;
      } else {
        CLUTlog("CLUT:: in int switch, >>invalid tab found.intSwitchCount: " + intSwitchCount + ", mru.length: " + mru.length);
        removeItemAtIndexFromMRU(intSwitchCount);
        if (intSwitchCount >= mru.length) {
          intSwitchCount = 0;
        }
        doIntSwitch();
      }
    });


  }
}

var endSwitch = function () {
  CLUTlog("CLUT::END_SWITCH");
  slowSwitchOngoing = false;
  fastSwitchOngoing = false;
  var tabId = mru[lastIntSwitchIndex];
  putExistingTabToTop(tabId);
  printMRUSimple();
}

function doCLUT(activeInfo) {
  if (!slowSwitchOngoing && !fastSwitchOngoing) {
    var index = mru.indexOf(activeInfo.tabId);

    if (index == -1) {
      CLUTlog("Unexpected scenario hit with tab(" + activeInfo.tabId + ").")
      addTabToMRUAtFront(activeInfo.tabId)
    } else {
      putExistingTabToTop(activeInfo.tabId);
    }
  }
}


var addTabToMRUAtBack = function (tabId) {

  var index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the end of mru
    mru.splice(-1, 0, tabId);
  }

}

var addTabToMRUAtFront = function (tabId) {

  var index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the front of mru
    mru.splice(0, 0, tabId);
  }

}
var putExistingTabToTop = function (tabId) {
  var index = mru.indexOf(tabId);
  if (index != -1) {
    mru.splice(index, 1);
    mru.unshift(tabId);
  }
}

var removeTabFromMRU = function (tabId) {
  var index = mru.indexOf(tabId);
  if (index != -1) {
    mru.splice(index, 1);
  }
}

var removeItemAtIndexFromMRU = function (index) {
  if (index < mru.length) {
    mru.splice(index, 1);
  }
}

var incrementSwitchCounter = function () {
  intSwitchCount = (intSwitchCount + 1) % mru.length;
}

var decrementSwitchCounter = function () {
  if (intSwitchCount == 0) {
    intSwitchCount = mru.length - 1;
  } else {
    intSwitchCount = intSwitchCount - 1;
  }
}

var initialize = function () {

  if (!initialized) {
    initialized = true;
    chrome.windows.getAll({ populate: true }, function (windows) {
      windows.forEach(function (window) {
        window.tabs.forEach(function (tab) {
          mru.unshift(tab.id);
        });
      });
      CLUTlog("MRU after init: " + mru);
    });
  }
}

var printTabInfo = function (tabId) {
  var info = "";
  chrome.tabs.get(tabId, function (tab) {
    info = "Tabid: " + tabId + " title: " + tab.title;
  });
  return info;
}

var str = "MRU status: \n";
var printMRU = function () {
  str = "MRU status: \n";
  for (var i = 0; i < mru.length; i++) {
    chrome.tabs.get(mru[i], function (tab) {

    });
  }
  CLUTlog(str);
}

var printMRUSimple = function () {
  CLUTlog("mru: " + mru);
}

var generatePrintMRUString = function () {
  chrome.tabs.query(function () {

  });
  str += (i + " :(" + tab.id + ")" + tab.title);
  str += "\n";

}

initialize();

var quickSwitchActiveUsage = function () {

  if (domLoaded) {
    if (quickActive == -1) {
      return;
    } else if (quickActive < 5) {
      quickActive++;
    } else if (quickActive >= 5) {
      _gaq.push(['_trackEvent', 'activeUsage', 'quick']);
      quickActive = -1;
    }
  }
}

var slowSwitchActiveUsage = function () {

  if (domLoaded) {
    if (slowActive == -1) {
      return;
    } else if (slowActive < 5) {
      slowActive++;
    } else if (slowActive >= 5) {
      _gaq.push(['_trackEvent', 'activeUsage', 'slow']);
      slowActive = -1;
    }
  }
}