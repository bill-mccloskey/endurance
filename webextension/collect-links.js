let links = document.querySelectorAll("a");
links = [...links].filter(link => link.href && link.href.startsWith("http") && link.innerText);

let windowWidth = window.innerWidth;
let minX = windowWidth * 0.25;
let maxX = windowWidth * 0.75;

links = links.filter(link => {
  let r = link.getBoundingClientRect();
  return r.width != 0 & r.height != 0 && r.x + r.width > minX && r.x < maxX;
});

let results = [];
for (let link of links) {
  results.push([link.href, link.innerText]);
}

browser.runtime.sendMessage({type: "links", links: results});

browser.runtime.onMessage.addListener(msg => {
  if (msg.type == "click") {
    let index = Math.floor(Math.random() * links.length);
    let link = links[index];

    if (link) {
      link.click();
    }
  }
});
