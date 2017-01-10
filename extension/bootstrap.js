const {utils: Cu, interfaces: Ci, classes: Cc} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["File"]);

let version, processScriptURL;

function getStatistics(hangThreshold) {
  let resolve;
  let promise = new Promise(r => { resolve = r; });

  let count = Services.ppmm.childCount;
  let results = [null];
  let listener;
  listener = pmsg => {
    if (pmsg.target == Services.ppmm.getChildAt(0)) {
      results[0] = pmsg.data;
    } else {
      results.push(pmsg.data);
    }
    count--;
    if (count == 0) {
      Services.ppmm.removeMessageListener("Endurance:Statistics", listener);
      resolve(results);
    }
  };
  Services.ppmm.addMessageListener("Endurance:Statistics", listener);
  Services.ppmm.broadcastAsyncMessage("Endurance:GetStatistics", {hangThreshold});

  return promise;
}

function memoryReport() {
  let file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append("endurance-mem-report.json.gz");
  file.createUnique(file.NORMAL_FILE_TYPE, 0o600);

  return new Promise(resolve => {
    let finishDumping = () => {
      let domFile = File.createFromNsIFile(file);
      resolve(domFile);
    };

    let dumper = Cc["@mozilla.org/memory-info-dumper;1"]
        .getService(Ci.nsIMemoryInfoDumper);
    dumper.dumpMemoryReportsToNamedFile(file.path, finishDumping, null, false);
  });
}

function gcLogs() {
  let dumper = Cc["@mozilla.org/memory-info-dumper;1"]
      .getService(Ci.nsIMemoryInfoDumper);

  return new Promise(resolve => {
    let dumps = [null];

    let sink = {
      onDump(gcLog, ccLog, isParent) {
        gcLog = File.createFromNsIFile(gcLog);
        ccLog = File.createFromNsIFile(ccLog);

        if (isParent) {
          dumps[0] = [gcLog, ccLog];
        } else {
          dumps.push([gcLog, ccLog]);
        }
      },

      onFinish() {
        resolve(dumps);
      },

      QueryInterface: XPCOMUtils.generateQI([Ci.nsIDumpGCAndCCLogsCallback])
    };

    dumper.dumpGCAndCCLogsToFile("", true, true, sink);
  });
}

async function profile() {
  let profiler = Cc["@mozilla.org/tools/profiler;1"]
      .getService(Ci.nsIProfiler);
  profiler.StartProfiler(1000000, 10,
                         ["js", "leaf", "stackwalk", "threads"], 4,
                         ["GeckoMain", "Compositor"], 2);

  let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  await new Promise(resolve => {
    timer.initWithCallback(resolve, 10 * 1000, timer.TYPE_ONE_SHOT);
  });

  let file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append("endurance-profile.json");
  file.createUnique(file.NORMAL_FILE_TYPE, 0o600);

  profiler.dumpProfileToFile(file.path);

  return File.createFromNsIFile(file);
}

function startup(data) {
  let {resourceURI} = data;
  version = Math.random();
  processScriptURL = resourceURI.resolve("processScript.js");
  Services.ppmm.loadProcessScript(processScriptURL, true);
  Services.ppmm.broadcastAsyncMessage("Endurance:Startup", version);

  let {webExtension} = data;
  webExtension.startup().then(api => {
    const {browser} = api;
    browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type == "GetStatistics") {
        getStatistics(msg.hangThreshold).then(result => sendResponse(result));
        return true;
      } else if (msg.type == "MemoryReport") {
        memoryReport().then(domFile => sendResponse(domFile));
        return true;
      } else if (msg.type == "GCLogs") {
        gcLogs().then(dumps => sendResponse(dumps));
        return true;
      } else if (msg.type == "Profile") {
        profile().then(profile => sendResponse(profile));
        return true;
      }
    });
  });
}

function shutdown() {
  Services.ppmm.broadcastAsyncMessage("Endurance:Shutdown", version);
  Services.ppmm.removeDelayedProcessScript(processScriptURL, true);
}

