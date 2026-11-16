/* ============================================================
 * 00. 随机数：可复现的种子随机（mulberry32）
 * ============================================================ */
(function (RT) {
  'use strict';

  RT.hashSeed = function (str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  RT.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  RT.randomSeed = function () {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] >>> 0;
    }
    return (Math.random() * 4294967296) >>> 0;
  };

  /** 按权重取下标；权重全 0 时退化为均匀分布 */
  RT.pickWeightedIndex = function (weights, rand) {
    const n = weights.length;
    if (!n) return -1;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const w = Number(weights[i]);
      total += w > 0 ? w : 0;
    }
    if (total <= 0) return Math.floor(rand() * n);
    let r = rand() * total;
    for (let i = 0; i < n; i++) {
      const w = Number(weights[i]);
      if (w > 0) {
        r -= w;
        if (r < 0) return i;
      }
    }
    return n - 1;
  };

})(window.RT = window.RT || {});
