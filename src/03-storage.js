/* ============================================================
 * 03. 本地存储：localStorage 优先，不可用时退化为内存
 * ============================================================ */
(function (RT) {
  'use strict';

  const memory = {};
  let available = true;

  try {
    const probe = '__rt_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch (e) {
    available = false;
  }

  RT.storage = {
    available: available,

    get: function (key) {
      try {
        if (available) return window.localStorage.getItem(key);
      } catch (e) { /* ignore */ }
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    },

    set: function (key, value) {
      memory[key] = value;
      try {
        if (available) {
          window.localStorage.setItem(key, value);
          return true;
        }
      } catch (e) {
        available = false;
        RT.toast && RT.toast('本地存储写入失败（可能已超出浏览器限额），请立即导出备份', 'warn');
      }
      return false;
    },

    del: function (key) {
      delete memory[key];
      try { if (available) window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
  };

})(window.RT = window.RT || {});
