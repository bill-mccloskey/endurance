function choose(weights) {
  let sum = [...weights].reduce(((acc, [k, v]) => acc + v), 0);
  let n = Math.random() * sum;
  for (let [k, v] of weights) {
    n -= v;
    if (n <= 0) {
      return k;
    }
  }
}

function chooseUniform(items) {
  let index = Math.floor(Math.random() * items.length);
  return items[index];
}
