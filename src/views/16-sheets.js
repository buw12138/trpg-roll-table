/* ============================================================
 * 16. 战役模块：记录表（模板驱动）
 *     模板决定结构（内置四张 + 自定义），实例按战役存放。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const store = RT.ws.store(RT.ws.KEYS.sheets);
  const cache = {};

  /* ---------------- 数据 ---------------- */

  function data(cid) {
    if (!cache[cid]) {
      const raw = store.get(cid);
      cache[cid] = RT.sheetTpl.migrate(raw);
    }
    const d = cache[cid];
    if (!Array.isArray(d.custom)) d.custom = [];
    if (!d.activeInstanceId || !d.custom.some(function (i) { return i.id === d.activeInstanceId; })) {
      d.activeInstanceId = d.custom[0] ? d.custom[0].id : null;
    }
    return d;
  }

  function save(cid, d) {
    cache[cid] = d;
    store.set(cid, d);
    RT.ws.touchCampaign(cid);
  }

  function active(d) {
    return d.custom.filter(function (i) { return i.id === d.activeInstanceId; })[0] || null;
  }

  function templateOf(inst) {
    return inst ? RT.sheetTpl.get(inst.templateId) : null;
  }

  /* ---------------- 取值 / 赋值 ---------------- */

  function setPath(obj, path, val) {
    const parts = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const nextIsNum = /^\d+$/.test(parts[i + 1]);
      if (cur[k] == null || typeof cur[k] !== 'object') {
        cur[k] = nextIsNum ? [] : {};
      }
      cur = cur[k];
    }
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      while (cur.length < Number(last)) cur.push({});
      cur[Number(last)] = val;
    } else {
      cur[last] = val;
    }
  }

  function compById(tpl, id) {
    if (!tpl) return null;
    return (tpl.layout || []).filter(function (c) { return c.id === id; })[0] || null;
  }

  /* ---------------- 渲染 ---------------- */

  RT.viewSheets = function (cid) {
    const d = data(cid);
    const inst = active(d);

    if (!inst) {
      return (
        '<div class="empty small-empty">' +
        '<div class="empty-mark">' + RT.icon('layers', 38) + '</div>' +
        '<h2>还没有记录表</h2>' +
        '<p>记录表由模板决定结构：内置四张（会话工作表 / 角色追踪 / NPC 追踪 / 战役规划），也可以自己拖组件搭一张。</p>' +
        '<div class="camp-empty-actions">' +
        '<button class="btn gold" data-act="sheet-instance-new">' + RT.icon('plus', 15) + ' 用模板新建</button>' +
        '<button class="btn ghost" data-act="sheet-tpl-manage">' + RT.icon('grid', 15) + ' 模板管理</button>' +
        '</div></div>'
      );
    }

    const tpl = templateOf(inst);
    return (
      '<div class="view sheets-view">' +
      '<div class="sheet-toolbar">' +
      '<button class="btn ghost small" data-act="sheet-instance-new">' + RT.icon('plus', 13) + ' 用模板新建</button>' +
      '<button class="btn ghost small" data-act="sheet-tpl-manage">' + RT.icon('grid', 13) + ' 模板管理</button>' +
      '<span class="tag">' + esc(tpl ? tpl.name : '模板已删除') + '</span>' +
      '<span class="dim grow right">自动保存 · 按战役隔离</span>' +
      '<button class="btn ghost small" data-act="sheet-dup">' + RT.icon('copy', 13) + ' 复制本份</button>' +
      '<button class="btn ghost small" data-act="sheet-print">' + RT.icon('download', 13) + ' 打印</button>' +
      '<button class="btn ghost small danger" data-act="sheet-inst-del">' + RT.icon('trash', 13) + ' 删除</button>' +
      '</div>' +
      '<input class="sheet-title" data-act="sheet-inst-title" value="' + RT.attr(inst.title || '') + '" placeholder="这份记录的名字">' +
      '<div class="sheet-body">' + (tpl ? RT.sheetTpl.render(tpl, inst.values || {}) :
        '<p class="dim">模板被删除了，这份数据还在，可换一个模板或恢复内置模板。</p>') + '</div>' +
      '</div>'
    );
  };

  RT.sheetsSide = function (cid) {
    const d = data(cid);
    const tpls = RT.sheetTpl.list();
    const groups = {};
    d.custom.forEach(function (inst) {
      const t = tpls.filter(function (x) { return x.id === inst.templateId; })[0];
      const key = t ? t.name : '模板已删除';
      (groups[key] = groups[key] || []).push(inst);
    });
    let html = '<div class="side-summary">记录 <strong>' + d.custom.length + '</strong> 份 · 模板 <strong>' +
      Object.keys(groups).length + '</strong> 类</div>';
    if (!d.custom.length) {
      html += '<div class="side-empty">还没有记录</div>';
    }
    Object.keys(groups).forEach(function (name) {
      html += '<div class="side-toc-head">' + esc(name) + '</div>' + groups[name].map(function (inst) {
        return '<button class="side-row' + (inst.id === d.activeInstanceId ? ' active' : '') +
          '" data-act="sheet-inst-open" data-id="' + inst.id + '">' +
          '<span class="side-main">' + esc(inst.title || '未命名') + '</span></button>';
      }).join('');
    });
    return html;
  };

  RT.sheetsNewBtn = function () {
    return '<button class="side-new" data-act="sheet-instance-new">' + RT.icon('plus', 15) + ' 用模板新建</button>';
  };

  /* ---------------- 动作 ---------------- */

  function cur() {
    const c = RT.ws.activeCampaign();
    return c ? c.id : null;
  }

  function newInstance(cid, templateId) {
    const tpl = RT.sheetTpl.get(templateId);
    if (!tpl) return null;
    const d = data(cid);
    const inst = {
      id: RT.ws.uid('si'),
      templateId: templateId,
      title: tpl.name + ' ' + (d.custom.length + 1),
      values: {},
      ts: Date.now(),
    };
    d.custom.unshift(inst);
    d.activeInstanceId = inst.id;
    save(cid, d);
    RT.rerender('all');
    return inst;
  }

  RT.acts['sheet-instance-new'] = function () {
    const cid = cur();
    if (!cid) return;
    RT.sheetTpl.pickDialog(function (templateId) {
      newInstance(cid, templateId);
    });
  };

  RT.acts['sheet-tpl-manage'] = function () {
    RT.sheetTpl.manage();
  };

  RT.acts['sheet-inst-open'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    d.activeInstanceId = el.getAttribute('data-id');
    save(cid, d);
    RT.rerender('all');
  };

  RT.acts['sheet-inst-del'] = function () {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    const inst = active(d);
    if (!inst) return;
    RT.dialogs.confirm('删除这份记录', '「' + (inst.title || '未命名') + '」的数据会一起删除，模板不受影响。', function () {
      d.custom = d.custom.filter(function (x) { return x.id !== inst.id; });
      d.activeInstanceId = d.custom[0] ? d.custom[0].id : null;
      save(cid, d);
      RT.rerender('all');
    }, true);
  };

  RT.acts['sheet-dup'] = function () {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    const inst = active(d);
    if (!inst) return;
    const copy = JSON.parse(JSON.stringify(inst));
    copy.id = RT.ws.uid('si');
    copy.title = (inst.title || '记录') + '（副本）';
    copy.ts = Date.now();
    d.custom.unshift(copy);
    d.activeInstanceId = copy.id;
    save(cid, d);
    RT.rerender('all');
  };

  RT.acts['sheet-print'] = function () {
    window.print();
  };

  RT.inputActs['sheet-inst-title'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    const inst = active(d);
    if (!inst) return;
    inst.title = el.value;
    save(cid, d);
    const side = document.querySelector('.side-row.active .side-main');
    if (side) side.textContent = el.value || '未命名';
  };

  RT.inputActs['sheet-set'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    const inst = active(d);
    if (!inst) return;
    if (!inst.values) inst.values = {};
    setPath(inst.values, el.getAttribute('data-path'), el.value);
    save(cid, d);
  };

  RT.changeActs['sheet-set-check'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    const inst = active(d);
    if (!inst) return;
    if (!inst.values) inst.values = {};
    setPath(inst.values, el.getAttribute('data-path'), !!el.checked);
    save(cid, d);
  };

  RT.acts['sheet-row-add'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    const inst = active(d);
    if (!inst) return;
    const path = el.getAttribute('data-path');
    const tpl = templateOf(inst);
    const comp = compById(tpl, path);
    if (!inst.values) inst.values = {};
    let arr = RT.sheetTpl.getVal(inst.values, path);
    if (!Array.isArray(arr)) {
      arr = [];
      setPath(inst.values, path, arr);
      arr = RT.sheetTpl.getVal(inst.values, path);
    }
    arr.push(comp && comp.type === 'list' ? { text: '', done: false } : {});
    save(cid, d);
    RT.rerender('main');
  };

  RT.acts['sheet-row-del'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const d = data(cid);
    const inst = active(d);
    if (!inst) return;
    const path = el.getAttribute('data-path');
    const i = Number(el.getAttribute('data-i'));
    const arr = RT.sheetTpl.getVal(inst.values || {}, path);
    if (!Array.isArray(arr) || i < 0 || i >= arr.length) {
      RT.toast('这一行还是空的，没有可删的内容', 'warn');
      return;
    }
    arr.splice(i, 1);
    save(cid, d);
    RT.rerender('main');
  };

  /* ---------------- 导出 / 种子 / 注册 ---------------- */

  function exportMd(cid) {
    const d = data(cid);
    const L = [];
    d.custom.forEach(function (inst) {
      const tpl = templateOf(inst);
      L.push(RT.sheetTpl.instanceMd(tpl, inst));
      L.push('');
    });
    return L.join('\n');
  }

  RT.ws.register({
    id: 'sheets',
    name: '记录表',
    icon: 'layers',
    kind: 'campaign',
    key: RT.ws.KEYS.sheets,
    unit: '份',
    view: RT.viewSheets,
    side: RT.sheetsSide,
    newBtn: RT.sheetsNewBtn,
    count: function (cid) { return data(cid).custom.length; },
    clear: function (cid) { delete cache[cid]; store.del(cid); },
    exportMd: exportMd,
    seed: function (cid) {
      const s = { id: RT.ws.uid('si'), templateId: 'bt_session', title: '第 1 场', values: {}, ts: Date.now() };
      const p = { id: RT.ws.uid('si'), templateId: 'bt_planner', title: '战役规划', values: {}, ts: Date.now() };
      const today = new Date();
      const pad = function (n) { return n < 10 ? '0' + n : String(n); };
      s.values = { c_no: '第 1 场', c_date: today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate()) };
      store.set(cid, { custom: [s, p], activeInstanceId: s.id, migratedToTemplates: true });
    },
  });

})(window.RT = window.RT || {});
