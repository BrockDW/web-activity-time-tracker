"use strict";

var tabs;
var timeIntervalList;
var currentTab;
var isNeedDeleteTimeIntervalFromTabs = false;
var activity = new Activity();
var storage = new LocalStorage();
var deferredRestrictionsList;

var setting_black_list;
var setting_restriction_list;
var setting_interval_save;
var setting_interval_inactivity;
var setting_view_in_badge;
var setting_block_deferral;
var setting_dark_mode;
var setting_notification_list;
var setting_notification_message;

var isHasPermissioForYouTube;
var isHasPermissioForNetflix;
var isHasPermissioForNotification;

function updateSummaryTime() {
  setInterval(backgroundCheck, SETTINGS_INTERVAL_CHECK_DEFAULT);
}

function updateStorage() {
  setInterval(backgroundUpdateStorage, SETTINGS_INTERVAL_SAVE_STORAGE_DEFAULT);
}

function backgroundCheck() {
  chrome.windows.getLastFocused({ populate: true }, function (currentWindow) {
    if (currentWindow.focused) {
      var activeTab = currentWindow.tabs.find((t) => t.active === true);
      if (activeTab !== undefined && activity.isValidPage(activeTab)) {
        var activeUrl = extractHostname(activeTab.url);
        var tab = activity.getTab(activeUrl);
        if (tab === undefined) {
          activity.addTab(activeTab);
        }

        if (activity.isInBlackList(activeUrl)) {
          chrome.browserAction.setBadgeBackgroundColor({ color: "#fdb8b8" });
          chrome.browserAction.setBadgeText({
            tabId: activeTab.id,
            text: "n/a",
          });
        } else {
          if (tab !== undefined) {
            if (currentTab !== tab.url) {
              activity.setCurrentActiveTab(tab.url);
            }
            chrome.idle.queryState(
              parseInt(setting_interval_inactivity),
              function (state) {
                if (state === "active") {
                  mainTRacker(activeUrl, tab, activeTab);
                } else checkDOM(state, activeUrl, tab, activeTab);
              }
            );
          }
        }
      }
    } else activity.closeIntervalForCurrentTab();
  });
}

function mainTRacker(activeUrl, tab, activeTab) {
  if (
    activity.isLimitExceeded(activeUrl, tab) &&
    !activity.wasDeferred(activeUrl)
  ) {
    setBlockPageToCurrent(
      activeTab.url,
      tab.days.at(-1).summary,
      tab.days.at(-1).counter
    );
  }
  if (!activity.isInBlackList(activeUrl)) {
    if (activity.isNeedNotifyView(activeUrl, tab)) {
      if (isHasPermissioForNotification) {
        showNotification(activeUrl, tab);
      } else {
        checkPermissionsForNotifications(showNotification, activeUrl, tab);
      }
    }
    tab.incSummaryTime();
  }
  if (setting_view_in_badge === true) {
    chrome.browserAction.setBadgeBackgroundColor({ color: "#e7e7e7" });
    var summary = tab.days.find((s) => s.date === todayLocalDate()).summary;
    chrome.browserAction.setBadgeText({
      tabId: activeTab.id,
      text: String(convertSummaryTimeToBadgeString(summary)),
    });
  } else {
    chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 0, 0] });
    chrome.browserAction.setBadgeText({
      tabId: activeTab.id,
      text: "",
    });
  }
}

function showNotification(activeUrl, tab) {
  chrome.notifications.clear("watt-site-notification", function (wasCleared) {
    if (!wasCleared) {
      console.log("!wasCleared");

      chrome.notifications.create(
        "watt-site-notification",
        {
          type: "basic",
          iconUrl: "icons/128x128.png",
          title: "Web Activity Time Tracker",
          contextMessage:
            activeUrl +
            " " +
            convertShortSummaryTimeToString(tab.getTodayTime()),
          message: setting_notification_message,
        },
        function (notificationId) {
          console.log(notificationId);
          chrome.notifications.clear(
            "watt-site-notification",
            function (wasCleared) {
              if (wasCleared) notificationAction(activeUrl, tab);
            }
          );
        }
      );
    } else {
      notificationAction(activeUrl, tab);
    }
  });
}

function notificationAction(activeUrl, tab) {
  chrome.notifications.create("watt-site-notification", {
    type: "basic",
    iconUrl: "icons/128x128.png",
    title: "Web Activity Time Tracker",
    contextMessage:
      activeUrl + " " + convertShortSummaryTimeToString(tab.getTodayTime()),
    message: setting_notification_message,
  });
}

function setBlockPageToCurrent(currentUrl, summaryTime, counter) {
  var blockUrl =
    chrome.runtime.getURL("block.html") +
    "?url=" +
    currentUrl +
    "&summaryTime=" +
    summaryTime +
    "&counter=" +
    counter;
  chrome.tabs.query({ currentWindow: true, active: true }, function (tab) {
    chrome.tabs.update(tab.id, { url: blockUrl });
  });
}

function isVideoPlayedOnPage() {
  var videoElement = document.getElementsByTagName("video")[0];
  if (
    videoElement !== undefined &&
    videoElement.currentTime > 0 &&
    !videoElement.paused &&
    !videoElement.ended &&
    videoElement.readyState > 2
  ) {
    return true;
  } else return false;
}

function checkDOM(state, activeUrl, tab, activeTab) {
  if (state === "idle" && isDomainEquals(activeUrl, "youtube.com")) {
    trackForYT(mainTRacker, activeUrl, tab, activeTab);
  } else if (state === "idle" && isDomainEquals(activeUrl, "netflix.com")) {
    trackForNetflix(mainTRacker, activeUrl, tab, activeTab);
  } else activity.closeIntervalForCurrentTab();
}

function trackForYT(callback, activeUrl, tab, activeTab) {
  if (isHasPermissioForYouTube) {
    executeScriptYoutube(callback, activeUrl, tab, activeTab);
  } else {
    checkPermissionsForYT(
      executeScriptYoutube,
      activity.closeIntervalForCurrentTab,
      callback,
      activeUrl,
      tab,
      activeTab
    );
  }
}

function trackForNetflix(callback, activeUrl, tab, activeTab) {
  if (isHasPermissioForNetflix) {
    executeScriptNetflix(callback, activeUrl, tab, activeTab);
  } else {
    checkPermissionsForNetflix(
      executeScriptNetflix,
      activity.closeIntervalForCurrentTab,
      callback,
      activeUrl,
      tab,
      activeTab
    );
  }
}

function executeScriptYoutube(callback, activeUrl, tab, activeTab) {
  chrome.tabs.executeScript(
    {
      code: "var videoElement = document.getElementsByTagName('video')[0]; (videoElement !== undefined && videoElement.currentTime > 0 && !videoElement.paused && !videoElement.ended && videoElement.readyState > 2);",
    },
    (results) => {
      if (
        results !== undefined &&
        results[0] !== undefined &&
        results[0] === true
      )
        callback(activeUrl, tab, activeTab);
      else activity.closeIntervalForCurrentTab();
    }
  );
}

function executeScriptNetflix(callback, activeUrl, tab, activeTab) {
  chrome.tabs.executeScript(
    {
      code: "var videoElement = document.getElementsByTagName('video')[0]; (videoElement !== undefined && videoElement.currentTime > 0 && !videoElement.paused && !videoElement.ended && videoElement.readyState > 2);",
    },
    (results) => {
      if (
        results !== undefined &&
        results[0] !== undefined &&
        results[0] === true
      ) {
        callback(activeUrl, tab, activeTab);
      } else {
        activity.closeIntervalForCurrentTab();
      }
    }
  );
}

function backgroundUpdateStorage() {
  if (tabs != undefined && tabs.length > 0) storage.saveTabs(tabs);
  if (timeIntervalList != undefined && timeIntervalList.length > 0)
    storage.saveValue(STORAGE_TIMEINTERVAL_LIST, timeIntervalList);
}

function setDefaultSettings() {
  storage.saveValue(
    SETTINGS_INTERVAL_INACTIVITY,
    SETTINGS_INTERVAL_INACTIVITY_DEFAULT
  );
  storage.saveValue(SETTINGS_INTERVAL_RANGE, SETTINGS_INTERVAL_RANGE_DEFAULT);
  storage.saveValue(
    SETTINGS_VIEW_TIME_IN_BADGE,
    SETTINGS_VIEW_TIME_IN_BADGE_DEFAULT
  );
  storage.saveValue(SETTINGS_BLOCK_DEFERRAL, SETTINGS_BLOCK_DEFERRAL_DEFAULT);
  storage.saveValue(SETTINGS_DARK_MODE, SETTINGS_DARK_MODE_DEFAULT);
  storage.saveValue(
    SETTINGS_INTERVAL_SAVE_STORAGE,
    SETTINGS_INTERVAL_SAVE_STORAGE_DEFAULT
  );
  storage.saveValue(
    STORAGE_NOTIFICATION_MESSAGE,
    STORAGE_NOTIFICATION_MESSAGE_DEFAULT
  );
}

function checkSettingsImEmpty() {
  chrome.storage.local.getBytesInUse(["inactivity_interval"], function (item) {
    if (item == 0) {
      setDefaultSettings();
    }
  });
}

function setDefaultValueForNewSettings() {
  loadNotificationMessage();
}

function addListener() {
  chrome.tabs.onActivated.addListener(function (info) {
    chrome.tabs.get(info.tabId, function (tab) {
      activity.addTab(tab);
    });
  });

  chrome.webNavigation.onCompleted.addListener(function (details) {
    chrome.tabs.get(details.tabId, function (tab) {
      activity.updateFavicon(tab);
    });
  });
  chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "install") {
      storage.saveValue(SETTINGS_SHOW_HINT, SETTINGS_SHOW_HINT_DEFAULT);
      setDefaultSettings();
    }
    if (details.reason == "update") {
      storage.saveValue(SETTINGS_SHOW_HINT, SETTINGS_SHOW_HINT_DEFAULT);
      checkSettingsImEmpty();
      setDefaultValueForNewSettings();
      isNeedDeleteTimeIntervalFromTabs = true;
    }
  });
  chrome.storage.onChanged.addListener(function (changes, namespace) {
    for (var key in changes) {
      if (key === STORAGE_BLACK_LIST) {
        loadBlackList();
      }
      if (key === STORAGE_RESTRICTION_LIST) {
        loadRestrictionList();
      }
      if (key === STORAGE_NOTIFICATION_LIST) {
        loadNotificationList();
      }
      if (key === STORAGE_NOTIFICATION_MESSAGE) {
        loadNotificationMessage();
      }
      if (key === SETTINGS_INTERVAL_INACTIVITY) {
        storage.getValue(SETTINGS_INTERVAL_INACTIVITY, function (item) {
          setting_interval_inactivity = item;
        });
      }
      if (key === SETTINGS_VIEW_TIME_IN_BADGE) {
        storage.getValue(SETTINGS_VIEW_TIME_IN_BADGE, function (item) {
          setting_view_in_badge = item;
        });
      }
      if (key === SETTINGS_BLOCK_DEFERRAL) {
        storage.getValue(SETTINGS_BLOCK_DEFERRAL, function (item) {
          setting_block_deferral = item;
        });
      }
      if (key === SETTINGS_DARK_MODE) {
        storage.getValue(SETTINGS_DARK_MODE, function (item) {
          setting_dark_mode = item;
        });
      }
    }
  });

  chrome.runtime.setUninstallURL(
    "https://docs.google.com/forms/d/e/1FAIpQLSdImHtvey6sg5mzsQwWfAQscgZOOV52blSf9HkywSXJhuQQHg/viewform"
  );
}

function loadTabs() {
  storage.loadTabs(STORAGE_TABS, function (items) {
    tabs = [];
    if (items != undefined) {
      for (var i = 0; i < items.length; i++) {
        tabs.push(
          new Tab(
            items[i].url,
            items[i].favicon,
            items[i].days,
            items[i].summaryTime,
            items[i].counter
          )
        );
      }
      if (isNeedDeleteTimeIntervalFromTabs) deleteTimeIntervalFromTabs();
    }
  });
}

function deleteTimeIntervalFromTabs() {
  tabs.forEach(function (item) {
    item.days.forEach(function (day) {
      if (day.time != undefined) day.time = [];
    });
  });
}

function deleteYesterdayTimeInterval() {
  timeIntervalList = timeIntervalList.filter((x) => x.day == todayLocalDate());
}

function loadBlackList() {
  storage.getValue(STORAGE_BLACK_LIST, function (items) {
    setting_black_list = items;
  });
}

function loadTimeIntervals() {
  storage.getValue(STORAGE_TIMEINTERVAL_LIST, function (items) {
    timeIntervalList = [];
    if (items != undefined) {
      for (var i = 0; i < items.length; i++) {
        timeIntervalList.push(
          new TimeInterval(items[i].day, items[i].domain, items[i].intervals)
        );
      }
      deleteYesterdayTimeInterval();
    }
  });
}

function loadRestrictionList() {
  storage.getValue(STORAGE_RESTRICTION_LIST, function (items) {
    setting_restriction_list = items;
  });
}

function loadNotificationList() {
  storage.getValue(STORAGE_NOTIFICATION_LIST, function (items) {
    setting_notification_list = items;
  });
}

function loadNotificationMessage() {
  storage.getValue(STORAGE_NOTIFICATION_MESSAGE, function (item) {
    setting_notification_message = item;
    if (isEmpty(setting_notification_message)) {
      storage.saveValue(
        STORAGE_NOTIFICATION_MESSAGE,
        STORAGE_NOTIFICATION_MESSAGE_DEFAULT
      );
      setting_notification_message = STORAGE_NOTIFICATION_MESSAGE_DEFAULT;
    }
  });
}

function loadSettings() {
  storage.getValue(SETTINGS_INTERVAL_INACTIVITY, function (item) {
    setting_interval_inactivity = item;
  });
  storage.getValue(SETTINGS_VIEW_TIME_IN_BADGE, function (item) {
    setting_view_in_badge = item;
  });
  storage.getValue(SETTINGS_BLOCK_DEFERRAL, function (item) {
    setting_block_deferral = item;
  });
  storage.getValue(SETTINGS_DARK_MODE, function (item) {
    setting_dark_mode = item;
  });
}

function loadAddDataFromStorage() {
  loadTabs();
  loadTimeIntervals();
  loadBlackList();
  loadRestrictionList();
  loadNotificationList();
  loadNotificationMessage();
  loadSettings();
}

function loadPermissions() {
  checkPermissionsForYT();
  checkPermissionsForNetflix();
  checkPermissionsForNotifications();
}

function checkPermissionsForYT(callbackIfTrue, callbackIfFalse, ...props) {
  chrome.permissions.contains(
    {
      permissions: ["tabs"],
      origins: ["https://www.youtube.com/*"],
    },
    function (result) {
      if (callbackIfTrue != undefined && result) callbackIfTrue(...props);
      if (callbackIfFalse != undefined && !result) callbackIfFalse();
      isHasPermissioForYouTube = result;
    }
  );
}

function checkPermissionsForNetflix(callbackIfTrue, callbackIfFalse, ...props) {
  chrome.permissions.contains(
    {
      permissions: ["tabs"],
      origins: ["https://www.netflix.com/*"],
    },
    function (result) {
      if (callbackIfTrue != undefined && result) callbackIfTrue(...props);
      if (callbackIfFalse != undefined && !result) callbackIfFalse();
      isHasPermissioForNetflix = result;
    }
  );
}

function checkPermissionsForNotifications(callback, ...props) {
  chrome.permissions.contains(
    {
      permissions: ["notifications"],
    },
    function (result) {
      if (callback != undefined && result) callback(...props);
      isHasPermissioForNotification = result;
    }
  );
}

function createFile(data, type, fileName) {
  var file = new Blob([data], { type: type });
  var downloadLink;
  downloadLink = document.createElement("a");
  downloadLink.download = fileName;
  downloadLink.href = window.URL.createObjectURL(file);
  downloadLink.style.display = "none";
  document.body.appendChild(downloadLink);
  downloadLink.click();
}

function toCsv(tabsData) {
  var str = "domain,date,time(sec)\r\n";
  for (var i = 0; i < tabsData.length; i++) {
    for (var y = 0; y < tabsData[i].days.length; y++) {
      var line =
        tabsData[i].url +
        "," +
        new Date(tabsData[i].days[y].date).toLocaleDateString() +
        "," +
        tabsData[i].days[y].summary;
      str += line + "\r\n";
    }
  }

  createFile(str, "text/csv", "domains.csv");
}

function exportToCSV() {
  storage.getValue(STORAGE_TABS, function (item) {
    toCsv(item);
  });
}

storage.getValue("SETTINGS_PERIODIC_HOUR_DOWNLOAD", function (hour) {
  storage.getValue("SETTINGS_PERIODIC_MINUTE_DOWNLOAD", function (minute) {
    if (typeof hour !== "number" || typeof minute !== "number") {
      return;
    } else {
      autoDownloadCsv(hour, minute);
    }
  });
});

function autoDownloadCsv(hour, minute) {
  var now = new Date();
  var triggerTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0
  );

  if (triggerTime < now) {
    triggerTime.setDate(triggerTime.getDate() + 1);
  }
  chrome.alarms.create("periodic_Download", {
    when: triggerTime.getTime(),
    periodInMinutes: 1440, // 24 hours
  });
  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === "periodic_Download") {
      exportToCSV();
    }
  });
}

loadPermissions();
addListener();
loadAddDataFromStorage();
updateSummaryTime();
updateStorage();

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log("chrome listener triggered in background.js");
  if (request.action === "sendBrowserActivityData") {
    console.log("triggering sendBrowserActivityData function");
    sendBrowserActivityData();
  }
});

// background.js

async function sendBrowserActivityData() {
  // const tabsData = getTabsData();
  const currentDate = new Date().toLocaleDateString("en-US"); // Get the current date in mm/dd/yyyy format
  const dailyActivities = [];

  // Iterate through the tabsData and create DailyActivity objects
  for (const tabData of tabs) {
    for (const day of tabData.days) {
      console.log(day.date, currentDate);
      if (day.date === currentDate) {
        console.log("triggered");
        dailyActivities.push({
          url: tabData.url,
          date: currentDate,
          seconds: day.summary,
        });
      }
    }
  }

  const baseUrl = 'http://3.92.212.148:8094/api/v1/dailyActivity/addActivities';

  const param1 = "computer1"

  const urlWithParams = `${baseUrl}?computer=${encodeURIComponent(param1)}`;

  // Send the dailyActivities list to the backend
  const response = await fetch(urlWithParams, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dailyActivities),
  });

  // Parse the response as JSON
  const responseData = await response.json();

  console.log(responseData);

  // Send the message back to the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'updateBackendMessage', message: responseData.message });
  });
}
