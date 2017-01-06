function startup({webExtension}) {
  console.log("startup", webExtension);
  webExtension.startup().then(api => {
    const {browser} = api;
    browser.runtime.onMessage.addListener(msg => {
      //console.log("bootstrap msg", msg);
    });
  });
}

function shutdown() {

}

