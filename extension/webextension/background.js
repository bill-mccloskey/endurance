let testTab = null;
let testWindow = null;
let running = false;
let logEntries = [];
let runKey;
let startDate;

let lastSubmission = Date.now();
let lastMemoryReport = Date.now();
let lastGarbageCollect = Date.now();

let submittedGCLogs = false;

let submissionURL;

function log(...args) {
  console.log(...args);
  logEntries.push(args);
}

function logError(e) {
  console.log("Exception", e);
  log(`Exception: ${e}\n${e.stack}`);
}

async function submit() {
  console.log("begin submit");

  let stats = await browser.runtime.sendMessage({type: "GetStatistics", hangThreshold: 100});

  let data = [];

  data.push([Date.now(), "log(text)", logEntries.join("\n")]);
  logEntries = [];

  for (let key in stats[0]) {
    data.push([Date.now(), key + "-main", stats[0][key]]);
  }
  for (let key in stats[0]) {
    let v = 0;
    for (let i = 1; i < stats.length; i++) {
      v += stats[i][key];
    }
    data.push([Date.now(), key + "-content", v]);
  }

  let encoded = new FormData();
  encoded.append("run_key", runKey);
  encoded.append("start_date", startDate.toISOString());
  encoded.append("data", JSON.stringify(data));

  let xhr = new XMLHttpRequest();
  xhr.open("POST", submissionURL + "/submit", true);
  xhr.send(encoded);

  lastSubmission = Date.now();

  console.log("end submit");

  if (!submittedGCLogs) {
    // If a content process is getting out of control, submit GC/CC
    // logs.
    for (let i = 1; i < stats.length; i++) {
      if (stats[i].residentUnique >= 2 * 1000 * 1000 * 1000 ||
          stats[i].ghostWindows >= 100)
      {
        submitGCLogs();
        submittedGCLogs = true;
      }
    }
  }
}

function submitFile(key, file) {
  let data = new FormData();
  data.append("run_key", runKey);
  data.append("key", key + "(file)");
  data.append("timestamp", Date.now());
  data.append("file", file);

  let xhr = new XMLHttpRequest();
  xhr.open("POST", submissionURL + "/file", true);
  xhr.send(data);
}

async function submitMemoryReport() {
  console.log("begin memory report submit");

  let memReportFile = await browser.runtime.sendMessage({type: "MemoryReport"});
  submitFile("memory-report", memReportFile);

  console.log("end memory report submit");

  lastMemoryReport = Date.now();
}

async function submitGCLogs() {
  console.log("begin GC log submit");

  let dumps = await browser.runtime.sendMessage({type: "GCLogs"});
  dumps.forEach((dump, i) => {
    if (i == 0) {
      submitFile("main-gc-log", dumps[i][0]);
      submitFile("main-cc-log", dumps[i][1]);
    } else {
      submitFile(`content-gc-log-${i}`, dumps[i][0]);
      submitFile(`content-cc-log-${i}`, dumps[i][1]);
    }
  });

  console.log("end GC log submit");
}

// Warning: it seems like something is going wrong with symbolication
// here.
async function submitProfile() {
  console.log("begin profile submit");

  let profile = await browser.runtime.sendMessage({type: "Profile"});
  submitFile("profile", profile);

  console.log("end profile submit");
}

async function loadComplete(tab) {
  let resolveLoad;
  let load = new Promise(resolve => { resolveLoad = resolve; });

  function updateListener(tabId, change, tab) {
    if (change.status == "complete" && tabId == tab.id && tab.url != "about:blank") {
      log("load complete");
      resolveLoad();
    }
  }
  browser.tabs.onUpdated.addListener(updateListener);

  let timeout = new Promise(resolve => setTimeout(resolve, 10000));

  tab = await browser.tabs.get(tab.id);
  if (tab.status != "complete" || tab.url == "about:blank") {
    await Promise.race([load, timeout]);
  } else {
    log("load already complete!");
  }

  browser.tabs.onUpdated.removeListener(updateListener);
}

let urls = [];
let strings = [];

function garbageCollect() {
  log("garbageCollect");

  urls = [
    "http://nytimes.com",
    "http://en.wikipedia.org",
    "http://imdb.com",
    "http://cnn.com",
    "http://foxnews.com",
    "http://youtube.com",
    "http://yahoo.com",
    "http://reddit.com",
  ];

  let newStrings = [];

  for (let i = 0; i < 250; i++) {
    let string = chooseUniform(strings);
    newStrings.push(string);
  }

  strings = newStrings;

  lastGarbageCollect = Date.now();
}

async function queryTabs(filter = {}) {
  filter.windowId = testWindow.id;
  let tabs = await browser.tabs.query(filter);
  return tabs.filter(tab => tab.url.startsWith("http"));
}

async function clickLinkAction() {
  let tabs = await browser.tabs.query({active: true, windowId: testWindow.id});
  let tab = tabs[0];
  log("clickLinkAction", tab.url);
  browser.tabs.sendMessage(tab.id, {type: "click"});

  await new Promise(resolve => setTimeout(resolve, 50));
  await loadComplete(tab);

  log("clickLinkAction complete");
}

async function scrollAction() {
  let amt = choose([[5, 1], [10, 1], [20, 10], [50, 10], [100, 20], [500, 10], [1000, 5]]);
  let direction = chooseUniform([1, -1]);
  amt *= direction;

  let tabs = await browser.tabs.query({active: true, windowId: testWindow.id});
  let tab = tabs[0];
  log("scrollAction", tab.url);
  browser.tabs.executeScript(tab.id, {code: `window.scrollBy(0, ${amt});`});
  log("scrollAction complete");
}

async function switchTabAction() {
  let tabs = await queryTabs();
  let tab = chooseUniform(tabs);
  log("switchTabAction", tab.url);
  await browser.tabs.update(tab.id, {active: true});
}

async function openTabAction() {
  let url = chooseUniform(urls);
  log("openTabAction", url);

  let tab = await browser.tabs.create({url: url, active: true, windowId: testWindow.id});
  await loadComplete(tab);

  log("openTabAction complete");
}

async function searchAction() {
  let string = chooseUniform(strings);
  let url = `https://www.google.com/search?q=${encodeURIComponent(string)}`;
  log("searchAction", url);
  let tab = await browser.tabs.create({url: url, active: true, windowId: testWindow.id});
  await loadComplete(tab);
  log("searchAction complete");
}

async function closeTabAction() {
  let tabs = await queryTabs({pinned: false});
  let tab = chooseUniform(tabs);
  log("Closing tab", tab.url);
  await browser.tabs.remove(tab.id);
}

function isLoggedIn(tab) {
  return tab.url.includes("facebook.com") || tab.url.includes("mail.google.com");
}

async function act() {
  log("act!");

  let options = [
    [scrollAction, 75],
    [switchTabAction, 10],
  ];

  let active = await browser.tabs.query({active: true, windowId: testWindow.id});
  if (!active[0].pinned && !isLoggedIn(active[0])) {
    options.push([clickLinkAction, 10]);
  }

  let tabs = await queryTabs({pinned: false});
  if (tabs.length > 1) {
    options.push([closeTabAction, 1]);
  }
  if (tabs.length < 5) {
    options.push([openTabAction, 1]);
    options.push([searchAction, 1]);
  }

  let option = choose(options);

  try {
    await option();
  } catch (e) {
    logError(e);
    await submit();
  }

  if (running) {
    if (Date.now() - lastSubmission > 60 * 1000) {
      await submit();
    }

    if (Date.now() - lastMemoryReport > 10 * 60 * 1000) {
      await submitMemoryReport();
    }

    if (Date.now() - lastGarbageCollect > 5 * 60 * 1000) {
      garbageCollect();
    }

    setTimeout(act, 100);
  }
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (sender.tab.windowId != testWindow.id) {
    return;
  }

  if (msg.type == "links") {
    for (let [href, string] of msg.links) {
      urls.push(href);
      strings.push(string);
    }
  }
});

browser.browserAction.onClicked.addListener(() => {
  testTab = browser.tabs.create({url: "ui.html"});
});

async function startTesting() {
  if (!testWindow) {
    startDate = new Date();

    testWindow = await browser.windows.create({url: [
      "https://gmail.com",
      "https://facebook.com",
      "http://nytimes.com",
      "http://en.wikipedia.org",
      "http://imdb.com",
    ]});
    let tabs = await browser.tabs.query({windowId: testWindow.id});
    for (let i = 0; i < 2; i++) {
      await browser.tabs.update(tabs[i].id, {pinned: true});
      log("awaiting tab", tabs[i]);
      await loadComplete(tabs[i]);
    }
  }

  log("finished loading new window");

  log("links", urls);
  log("strings", strings);

  running = true;
  act();
}

function stopTesting() {
  running = false;
}

function isRunning() {
  return running;
}

async function startup() {
  let config = await browser.runtime.sendMessage({type: "GetConfiguration"});
  submissionURL = config.serverUrl;
  runKey = config.runKey;

  if (config.autostart) {
    startTesting();
  }
}

startup();
