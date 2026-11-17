/* ============================================================
 * 04. 状态与动作（单一数据源，改动后自动持久化）
 * ============================================================ */
(function (RT) {
  'use strict';

  const KEYS = {
    set: 'trpg_rt_set_v1',
    prefs: 'trpg_rt_prefs_v1',
    ui: 'trpg_rt_ui_v1',
    snaps: 'trpg_rt_snapshots_v1',
  };
  RT.KEYS = KEYS;

  const S = (RT.state = {
    set: RT.emptySet(),
    prefs: { theme: 'system', fontScale: 1 },
    ui: {
      view: 'tables',
      tableId: null,
      comboId: null,
      search: '',
      sidebarOpen: false,
      tableTimes: 1,
      campaignId: null,
      campaignModule: null,
      sheetTab: 'session',
      notesFilter: 'all',
      notesQuery: '',
      rulesId: null,
      rulesQuery: '',
    },
    results: { table: null, combo: null },
    firstRun: false,
    migratedFromSample: false,
  });

  let saveTimer = null;

  function saveNow() {
    RT.storage.set(KEYS.set, JSON.stringify(S.set));
    RT.storage.set(KEYS.prefs, JSON.stringify(S.prefs));
    RT.storage.set(
      KEYS.ui,
      JSON.stringify({
        view: S.ui.view,
        tableId: S.ui.tableId,
        comboId: S.ui.comboId,
        tableTimes: S.ui.tableTimes,
        campaignId: S.ui.campaignId,
        campaignModule: S.ui.campaignModule,
        sheetTab: S.ui.sheetTab,
        notesFilter: S.ui.notesFilter,
        rulesId: S.ui.rulesId,
      })
    );
  }
  RT.saveNow = saveNow;

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  RT.scheduleSave = scheduleSave;

  function touch() {
    S.set.updatedAt = new Date().toISOString();
    scheduleSave();
  }
  RT.touch = touch;

  function refresh(scope) {
    if (RT.app) RT.app.rerender(scope || 'all');
  }
  RT.refresh = refresh;

  RT.snapshots = {
    list: function () {
      try {
        const arr = JSON.parse(RT.storage.get(KEYS.snaps) || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },
    push: function (label) {
      const arr = RT.snapshots.list();
      arr.unshift({ ts: Date.now(), label: label || '自动快照', set: S.set });
      while (arr.length > 3) arr.pop();
      try {
        RT.storage.set(KEYS.snaps, JSON.stringify(arr));
      } catch (e) { /* 超限时忽略 */ }
    },
    restore: function (index) {
      const arr = RT.snapshots.list();
      const snap = arr[index];
      if (!snap) return false;
      RT.snapshots.push('恢复前');
      S.set = RT.normalizeSet(snap.set);
      S.results = { table: null, combo: null };
      S.ui.tableId = S.set.tables[0] ? S.set.tables[0].id : null;
      S.ui.comboId = S.set.combos[0] ? S.set.combos[0].id : null;
      touch();
      refresh('all');
      return true;
    },
  };

  /* ---------------- 初始化 ---------------- */

  RT.loadState = function () {
    let restored = false;

    const rawSet = RT.storage.get(KEYS.set);
    if (rawSet) {
      try {
        S.set = RT.normalizeSet(JSON.parse(rawSet));
        restored = true;
      } catch (e) {
        console.warn('本地数据损坏，已载入核心表包', e);
      }
    }

    // 旧版内置「示例表组」是测试用的临时表：整包换成即兴核心包，并把旧数据存进快照
    if (restored && RT.isLegacySample(S.set)) {
      RT.snapshots.push('替换旧示例表组');
      S.set = RT.sampleSet();
      S.migratedFromSample = true;
    }

    if (!restored) {
      S.set = RT.sampleSet();
      S.firstRun = true;
    }

    const rawPrefs = RT.storage.get(KEYS.prefs);
    if (rawPrefs) {
      try {
        const p = JSON.parse(rawPrefs);
        if (p.theme === 'dark' || p.theme === 'light' || p.theme === 'system') S.prefs.theme = p.theme;
        if (isFinite(p.fontScale)) S.prefs.fontScale = Math.min(1.5, Math.max(0.85, Number(p.fontScale)));
      } catch (e) { /* ignore */ }
    }

    const rawUi = RT.storage.get(KEYS.ui);
    if (rawUi) {
      try {
        const u = JSON.parse(rawUi);
        if (['tables', 'combos', 'favorites', 'history', 'campaign', 'rules'].indexOf(u.view) >= 0) S.ui.view = u.view;
        if (typeof u.tableId === 'string') S.ui.tableId = u.tableId;
        if (typeof u.comboId === 'string') S.ui.comboId = u.comboId;
        if (isFinite(u.tableTimes)) S.ui.tableTimes = Math.min(50, Math.max(1, Number(u.tableTimes)));
        if (typeof u.campaignId === 'string') S.ui.campaignId = u.campaignId;
        if (typeof u.campaignModule === 'string') S.ui.campaignModule = u.campaignModule;
        if (typeof u.sheetTab === 'string') S.ui.sheetTab = u.sheetTab;
        if (typeof u.notesFilter === 'string') S.ui.notesFilter = u.notesFilter;
        if (typeof u.rulesId === 'string') S.ui.rulesId = u.rulesId;
      } catch (e) { /* ignore */ }
    }

    if (!S.ui.tableId || !S.set.tables.some(function (t) { return t.id === S.ui.tableId; })) {
      S.ui.tableId = S.set.tables[0] ? S.set.tables[0].id : null;
    }
    if (!S.ui.comboId || !S.set.combos.some(function (c) { return c.id === S.ui.comboId; })) {
      S.ui.comboId = S.set.combos[0] ? S.set.combos[0].id : null;
    }
    return S;
  };

  /* ---------------- 工具 ---------------- */

  function findTable(id) {
    return S.set.tables.find(function (t) { return t.id === id; }) || null;
  }
  function findCombo(id) {
    return S.set.combos.find(function (c) { return c.id === id; }) || null;
  }
  function currentTable() {
    return findTable(S.ui.tableId);
  }
  function currentCombo() {
    return findCombo(S.ui.comboId);
  }

  function uniqueLabel(combo, base) {
    let label = base;
    let i = 2;
    while (combo.fields.some(function (f) { return f.label === label; })) {
      label = base + i;
      i++;
    }
    return label;
  }

  function pushHistory(item) {
    S.set.history.unshift({
      id: RT.uid('h'),
      ts: Date.now(),
      kind: item.kind,
      refId: item.refId,
      label: item.label,
      seed: item.seed,
      text: item.text,
    });
    if (S.set.history.length > 200) S.set.history.length = 200;
  }

  /* ---------------- 动作 ---------------- */

  RT.actions = {
    /* --- 导航 --- */
    selectView: function (view) {
      S.ui.view = view;
      S.ui.sidebarOpen = false;
      scheduleSave();
      refresh('all');
    },

    toggleSidebar: function (open) {
      S.ui.sidebarOpen = open === undefined ? !S.ui.sidebarOpen : !!open;
      refresh('sidebar');
    },

    selectTable: function (id) {
      S.ui.view = 'tables';
      S.ui.tableId = id;
      S.ui.sidebarOpen = false;
      scheduleSave();
      refresh('all');
    },

    selectCombo: function (id) {
      S.ui.view = 'combos';
      S.ui.comboId = id;
      S.ui.sidebarOpen = false;
      scheduleSave();
      refresh('all');
    },

    setSearch: function (q) {
      S.ui.search = q;
      refresh('sidebar');
    },

    setTableTimes: function (n) {
      S.ui.tableTimes = Math.min(50, Math.max(1, Number(n) || 1));
      scheduleSave();
    },

    /* --- 表组 --- */
    renameSet: function (name) {
      S.set.name = String(name || '').trim() || '未命名表组';
      touch();
      refresh('sidebar');
    },

    newBlankSet: function () {
      RT.snapshots.push('新建空白表组');
      S.set = RT.emptySet();
      S.ui.tableId = null;
      S.ui.comboId = null;
      S.results = { table: null, combo: null };
      touch();
      refresh('all');
    },

    loadSample: function () {
      RT.snapshots.push('载入核心表包');
      S.set = RT.sampleSet();
      S.ui.tableId = S.set.tables[0].id;
      S.ui.comboId = S.set.combos[0].id;
      S.results = { table: null, combo: null };
      S.ui.view = 'tables';
      touch();
      refresh('all');
    },

    /* --- 分组（树状） --- */
    addFolder: function (name, parentId) {
      const parent = parentId && S.set.folders.some(function (f) { return f.id === parentId; }) ? parentId : null;
      const f = {
        id: RT.uid('fd'),
        name: String(name || '').trim() || '分组 ' + (S.set.folders.length + 1),
        parentId: parent,
        collapsed: false,
      };
      S.set.folders.push(f);
      if (parent) {
        const p = S.set.folders.find(function (x) { return x.id === parent; });
        if (p) p.collapsed = false;
      }
      touch();
      refresh('all');
      return f;
    },

    renameFolder: function (id, name) {
      const f = S.set.folders.find(function (x) { return x.id === id; });
      if (!f) return;
      f.name = String(name || '').trim() || f.name;
      touch();
      refresh('all');
    },

    toggleFolder: function (id) {
      const f = S.set.folders.find(function (x) { return x.id === id; });
      if (!f) return;
      f.collapsed = !f.collapsed;
      touch();
      refresh('sidebar');
    },

    /** 一键展开 / 收起整棵分组树 */
    setAllFoldersCollapsed: function (collapsed) {
      if (!S.set.folders.length) return;
      const flag = !!collapsed;
      S.set.folders.forEach(function (f) { f.collapsed = flag; });
      touch();
      refresh('sidebar');
      RT.toast(flag ? '已收起全部分组' : '已展开全部分组');
    },

    /** 某分组的所有后代分组 id（不含自身） */
    folderDescendants: function (id) {
      const out = [];
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift();
        S.set.folders.forEach(function (f) {
          if (f.parentId === cur) {
            out.push(f.id);
            queue.push(f.id);
          }
        });
      }
      return out;
    },

    /** 把分组挂到新父级下；会拒绝挂到自己或自己的后代里 */
    moveFolder: function (folderId, parentId) {
      const f = S.set.folders.find(function (x) { return x.id === folderId; });
      if (!f) return false;
      const target = parentId || null;
      if (target === folderId) {
        RT.toast('不能把分组移到自己里面', 'warn');
        return false;
      }
      if (target && RT.actions.folderDescendants(folderId).indexOf(target) >= 0) {
        RT.toast('不能把分组移到自己的子分组里', 'warn');
        return false;
      }
      if (target && !S.set.folders.some(function (x) { return x.id === target; })) return false;
      f.parentId = target;
      if (target) {
        const p = S.set.folders.find(function (x) { return x.id === target; });
        if (p) p.collapsed = false;
      }
      touch();
      refresh('all');
      return true;
    },

    moveTable: function (tableId, folderId) {
      const t = findTable(tableId);
      if (!t) return;
      t.folderId = folderId && S.set.folders.some(function (f) { return f.id === folderId; }) ? folderId : null;
      if (t.folderId) {
        const f = S.set.folders.find(function (x) { return x.id === t.folderId; });
        if (f) {
          // 展开目标分组及其所有祖先，避免拖进去后"看不见"
          let cur = f;
          let guard = 0;
          while (cur && guard++ < 50) {
            cur.collapsed = false;
            cur = cur.parentId ? S.set.folders.find(function (x) { return x.id === cur.parentId; }) : null;
          }
        }
      }
      touch();
      refresh('all');
    },

    deleteFolder: function (id, mode) {
      const f = S.set.folders.find(function (x) { return x.id === id; });
      if (!f) return;
      const kids = RT.actions.folderDescendants(id);
      const allIds = [id].concat(kids);
      const affectedTables = S.set.tables.filter(function (t) { return allIds.indexOf(t.folderId) >= 0; });
      RT.snapshots.push('删除分组：' + f.name);

      if (mode === 'delete') {
        S.set.tables = S.set.tables.filter(function (t) { return allIds.indexOf(t.folderId) < 0; });
        S.set.folders = S.set.folders.filter(function (x) { return allIds.indexOf(x.id) < 0; });
        if (affectedTables.some(function (t) { return t.id === S.ui.tableId; })) {
          S.ui.tableId = S.set.tables[0] ? S.set.tables[0].id : null;
        }
      } else {
        affectedTables.forEach(function (t) { t.folderId = f.parentId || null; });
        S.set.folders.forEach(function (x) {
          if (x.parentId === id) x.parentId = f.parentId || null;
        });
        S.set.folders = S.set.folders.filter(function (x) { return x.id !== id; });
      }

      touch();
      refresh('all');
      RT.toast(mode === 'delete'
        ? '已删除分组「' + f.name + '」及其 ' + kids.length + ' 个子分组、' + affectedTables.length + ' 张表'
        : '已删除分组「' + f.name + '」，内容已移到上一级');
    },

    /* --- 表名唯一性 --- */
    tableNameTaken: function (name, exceptId) {
      const key = String(name == null ? '' : name).trim().toLowerCase();
      if (!key) return true;
      return S.set.tables.some(function (t) {
        return t.id !== exceptId && String(t.name).trim().toLowerCase() === key;
      });
    },

    uniqueTableName: function (base, exceptId) {
      const root = String(base == null ? '' : base).trim() || '新表';
      if (!RT.actions.tableNameTaken(root, exceptId)) return root;
      let i = 2;
      while (RT.actions.tableNameTaken(root + ' ' + i, exceptId)) i++;
      return root + ' ' + i;
    },

    /* --- 表的 CRUD --- */
    addTable: function (name, folderId) {
      const desired = name && String(name).trim()
        ? String(name).trim()
        : RT.actions.uniqueTableName('新表 ' + (S.set.tables.length + 1));
      if (RT.actions.tableNameTaken(desired)) {
        RT.toast('已有同名表「' + desired + '」，建表前请先改名', 'warn');
        return null;
      }
      const t = RT.table(desired, [], [RT.entry('', 1)]);
      t.folderId = folderId && S.set.folders.some(function (f) { return f.id === folderId; }) ? folderId : null;
      S.set.tables.unshift(t);
      S.ui.view = 'tables';
      S.ui.tableId = t.id;
      touch();
      refresh('all');
      return t;
    },

    updateTable: function (id, patch, opts) {
      const t = findTable(id);
      if (!t) return false;
      if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
        const next = String(patch.name == null ? '' : patch.name).trim();
        if (RT.actions.tableNameTaken(next, id)) return false;
        patch = Object.assign({}, patch, { name: next });
      }
      Object.assign(t, patch);
      touch();
      if (!opts || opts.rerender !== false) refresh('sidebar');
      return true;
    },

    duplicateTable: function (id) {
      const t = findTable(id);
      if (!t) return;
      const copy = JSON.parse(JSON.stringify(t));
      copy.id = RT.uid('t');
      copy.name = RT.actions.uniqueTableName(t.name + ' 副本');
      copy.entries.forEach(function (e) { e.id = RT.uid('e'); });
      S.set.tables.unshift(copy);
      S.ui.tableId = copy.id;
      S.ui.view = 'tables';
      touch();
      refresh('all');
      RT.toast('已复制表「' + t.name + '」');
    },

    deleteTable: function (id) {
      const t = findTable(id);
      if (!t) return;
      RT.snapshots.push('删除表：' + t.name);
      S.set.tables = S.set.tables.filter(function (x) { return x.id !== id; });
      S.ui.tableId = S.set.tables[0] ? S.set.tables[0].id : null;
      touch();
      refresh('all');
      RT.toast('已删除表「' + t.name + '」');
    },

    /* --- 条目 CRUD --- */
    addEntry: function (tableId) {
      const t = findTable(tableId);
      if (!t) return null;
      const e = RT.entry('', 1);
      t.entries.push(e);
      touch();
      refresh('main');
      return e;
    },

    addEntries: function (tableId, entries) {
      const t = findTable(tableId);
      if (!t || !entries.length) return 0;
      t.entries = t.entries.concat(entries);
      touch();
      refresh('all');
      return entries.length;
    },

    updateEntry: function (tableId, entryId, patch) {
      const t = findTable(tableId);
      if (!t) return;
      const e = t.entries.find(function (x) { return x.id === entryId; });
      if (!e) return;
      Object.assign(e, patch);
      touch();
    },

    deleteEntry: function (tableId, entryId) {
      const t = findTable(tableId);
      if (!t) return;
      t.entries = t.entries.filter(function (x) { return x.id !== entryId; });
      touch();
      refresh('main');
    },

    moveEntry: function (tableId, entryId, dir) {
      const t = findTable(tableId);
      if (!t) return;
      const i = t.entries.findIndex(function (x) { return x.id === entryId; });
      const j = i + dir;
      if (i < 0 || j < 0 || j >= t.entries.length) return;
      const tmp = t.entries[i];
      t.entries[i] = t.entries[j];
      t.entries[j] = tmp;
      touch();
      refresh('main');
    },

    /* --- 组合 CRUD --- */
    addCombo: function () {
      const first = S.set.tables[0];
      const combo = {
        id: RT.uid('c'),
        name: '新组合 ' + (S.set.combos.length + 1),
        fields: first
          ? [{ id: RT.uid('f'), tableId: first.id, label: first.name, rolls: 1, sep: '、', locked: false, lockedValue: '' }]
          : [],
        template: '',
      };
      S.set.combos.unshift(combo);
      S.ui.view = 'combos';
      S.ui.comboId = combo.id;
      touch();
      refresh('all');
      return combo;
    },

    updateCombo: function (id, patch, opts) {
      const c = findCombo(id);
      if (!c) return;
      Object.assign(c, patch);
      touch();
      if (!opts || opts.rerender !== false) refresh('main');
    },

    deleteCombo: function (id) {
      const c = findCombo(id);
      if (!c) return;
      RT.snapshots.push('删除组合：' + c.name);
      S.set.combos = S.set.combos.filter(function (x) { return x.id !== id; });
      S.ui.comboId = S.set.combos[0] ? S.set.combos[0].id : null;
      S.results.combo = null;
      touch();
      refresh('all');
      RT.toast('已删除组合「' + c.name + '」');
    },

    duplicateCombo: function (id) {
      const c = findCombo(id);
      if (!c) return;
      const copy = JSON.parse(JSON.stringify(c));
      copy.id = RT.uid('c');
      copy.name = c.name + ' 副本';
      copy.fields.forEach(function (f) { f.id = RT.uid('f'); });
      S.set.combos.unshift(copy);
      S.ui.comboId = copy.id;
      S.ui.view = 'combos';
      touch();
      refresh('all');
    },

    addField: function (comboId) {
      const c = findCombo(comboId);
      if (!c) return;
      const first = S.set.tables[0];
      c.fields.push({
        id: RT.uid('f'),
        tableId: first ? first.id : '',
        label: uniqueLabel(c, first ? first.name : '字段'),
        rolls: 1,
        sep: '、',
        locked: false,
        lockedValue: '',
      });
      touch();
      refresh('main');
    },

    updateField: function (comboId, fieldId, patch, opts) {
      const c = findCombo(comboId);
      if (!c) return;
      const f = c.fields.find(function (x) { return x.id === fieldId; });
      if (!f) return;
      Object.assign(f, patch);
      touch();
      if (!opts || opts.rerender !== false) refresh('main');
    },

    deleteField: function (comboId, fieldId) {
      const c = findCombo(comboId);
      if (!c) return;
      c.fields = c.fields.filter(function (x) { return x.id !== fieldId; });
      touch();
      refresh('main');
    },

    moveField: function (comboId, fieldId, dir) {
      const c = findCombo(comboId);
      if (!c) return;
      const i = c.fields.findIndex(function (x) { return x.id === fieldId; });
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.fields.length) return;
      const tmp = c.fields[i];
      c.fields[i] = c.fields[j];
      c.fields[j] = tmp;
      touch();
      refresh('main');
    },

    /* --- 掷 --- */
    rollTableNow: function (times) {
      const t = currentTable();
      if (!t) return;
      if (!t.entries.length) {
        RT.toast('这张表还是空的，先加几条吧', 'warn');
        return;
      }
      const n = Math.min(50, Math.max(1, Number(times || S.ui.tableTimes) || 1));
      const seed = RT.randomSeed();
      const res = RT.rollTable(t, S.set.tables, seed, n);
      S.results.table = {
        tableId: t.id,
        seed: seed,
        texts: res.texts,
        text: res.text,
        dice: res.dice,
        warnings: res.warnings,
        ts: Date.now(),
      };
      pushHistory({ kind: 'table', refId: t.id, label: t.name, seed: seed, text: res.text });
      touch();
      refresh('main');
    },

    rollComboNow: function () {
      const c = currentCombo();
      if (!c) return;
      if (!c.fields.length) {
        RT.toast('这个组合还没有字段', 'warn');
        return;
      }
      const preset = {};
      c.fields.forEach(function (f) {
        if (f.locked && f.lockedValue) preset[f.label] = f.lockedValue;
      });
      const seed = RT.randomSeed();
      const res = RT.rollCombo(c, S.set.tables, seed, preset);
      S.results.combo = {
        comboId: c.id,
        seed: seed,
        values: res.values,
        text: res.text,
        warnings: res.warnings,
        ts: Date.now(),
      };
      pushHistory({ kind: 'combo', refId: c.id, label: c.name, seed: seed, text: res.text });
      touch();
      refresh('main');
    },

    rerollField: function (comboId, fieldId) {
      const c = findCombo(comboId);
      const cur = S.results.combo;
      if (!c || !cur || cur.comboId !== c.id) return;
      const field = c.fields.find(function (f) { return f.id === fieldId; });
      if (!field) return;

      const preset = {};
      c.fields.forEach(function (f) {
        if (f.id !== fieldId && cur.values[f.label] !== undefined) preset[f.label] = cur.values[f.label];
      });
      const seed = RT.randomSeed();
      const res = RT.rollCombo(c, S.set.tables, seed, preset);
      if (field.locked) field.lockedValue = res.values[field.label] || '';
      S.results.combo = {
        comboId: c.id,
        seed: seed,
        values: res.values,
        text: res.text,
        warnings: res.warnings,
        ts: Date.now(),
      };
      pushHistory({ kind: 'combo', refId: c.id, label: c.name + '（单字段重掷）', seed: seed, text: res.text });
      touch();
      refresh('main');
    },

    toggleLock: function (comboId, fieldId) {
      const c = findCombo(comboId);
      const cur = S.results.combo;
      if (!c) return;
      const f = c.fields.find(function (x) { return x.id === fieldId; });
      if (!f) return;
      if (f.locked) {
        f.locked = false;
        f.lockedValue = '';
      } else {
        f.locked = true;
        f.lockedValue = cur && cur.comboId === c.id && cur.values[f.label] ? cur.values[f.label] : '';
      }
      touch();
      refresh('main');
    },

    unlockAll: function (comboId) {
      const c = findCombo(comboId);
      if (!c) return;
      c.fields.forEach(function (f) { f.locked = false; f.lockedValue = ''; });
      touch();
      refresh('main');
    },

    /* --- 收藏 / 历史 --- */
    addFavorite: function (payload) {
      const p = payload || {};
      const fav = {
        id: RT.uid('fav'),
        comboId: p.comboId || '',
        sourceLabel: p.sourceLabel || '',
        text: String(p.text || ''),
        note: '',
        ts: Date.now(),
      };
      if (!fav.text) return null;
      S.set.favorites.unshift(fav);
      touch();
      refresh('main');
      RT.toast('已加入收藏，可在收藏夹写备注');
      return fav;
    },

    saveFavorite: function () {
      const cur = S.results.combo;
      if (!cur) return;
      const c = findCombo(cur.comboId);
      RT.actions.addFavorite({
        comboId: cur.comboId,
        sourceLabel: c ? c.name : '组合',
        text: cur.text,
      });
    },

    favoriteTableResult: function () {
      const cur = S.results.table;
      if (!cur) return;
      const t = findTable(cur.tableId);
      RT.actions.addFavorite({
        sourceLabel: t ? t.name : '随机表',
        text: cur.text,
      });
    },

    updateFavoriteNote: function (id, note) {
      const f = S.set.favorites.find(function (x) { return x.id === id; });
      if (!f) return;
      f.note = String(note == null ? '' : note);
      touch();
    },

    deleteFavorite: function (id) {
      S.set.favorites = S.set.favorites.filter(function (f) { return f.id !== id; });
      touch();
      refresh('main');
    },

    saveTextAsEntry: function (tableId, text) {
      const t = findTable(tableId);
      if (!t) return;
      t.entries.push(RT.entry(text, 1));
      touch();
      RT.toast('已存入表「' + t.name + '」');
    },

    replayHistory: function (id) {
      const h = S.set.history.find(function (x) { return x.id === id; });
      if (!h) return;
      if (h.kind === 'table') {
        const t = findTable(h.refId);
        if (!t) { RT.toast('原表已被删除', 'warn'); return; }
        S.ui.view = 'tables';
        S.ui.tableId = t.id;
        const res = RT.rollTable(t, S.set.tables, h.seed, 1);
        S.results.table = { tableId: t.id, seed: h.seed, texts: res.texts, text: res.text, dice: res.dice, warnings: res.warnings, ts: Date.now() };
      } else {
        const c = findCombo(h.refId);
        if (!c) { RT.toast('原组合已被删除', 'warn'); return; }
        S.ui.view = 'combos';
        S.ui.comboId = c.id;
        const res = RT.rollCombo(c, S.set.tables, h.seed, {});
        S.results.combo = { comboId: c.id, seed: h.seed, values: res.values, text: res.text, warnings: res.warnings, ts: Date.now() };
      }
      refresh('all');
    },

    clearHistory: function () {
      S.set.history = [];
      touch();
      refresh('main');
    },

    /* --- 导入导出 --- */
    exportJSON: function () {
      return JSON.stringify(S.set, null, 2);
    },

    importJSON: function (text, strategy) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error('JSON 解析失败：' + e.message);
      }
      const incoming = RT.normalizeSet(parsed);
      RT.snapshots.push('导入前');
      if (strategy === 'replace') {
        S.set = incoming;
      } else if (strategy === 'new') {
        incoming.id = RT.uid('set');
        incoming.name = incoming.name + '（导入）';
        S.set = incoming;
      } else {
        RT.mergeSet(S.set, incoming);
      }
      S.ui.tableId = S.set.tables[0] ? S.set.tables[0].id : null;
      S.ui.comboId = S.set.combos[0] ? S.set.combos[0].id : null;
      S.results = { table: null, combo: null };
      touch();
      refresh('all');
      return { tables: incoming.tables.length, combos: incoming.combos.length };
    },

    exportCSV: function (tableId) {
      const t = findTable(tableId);
      if (!t) return '';
      return RT.csv.stringify(RT.csv.entriesToRows(t));
    },

    importCSV: function (tableId, text, replace) {
      const t = findTable(tableId);
      if (!t) return 0;
      const entries = RT.csv.rowsToEntries(RT.csv.parse(text));
      if (!entries.length) return 0;
      if (replace) {
        RT.snapshots.push('CSV 覆盖：' + t.name);
        t.entries = entries;
      } else {
        t.entries = t.entries.concat(entries);
      }
      touch();
      refresh('all');
      return entries.length;
    },

    /* --- 偏好 --- */
    setTheme: function (theme) {
      S.prefs.theme = theme;
      RT.storage.set(KEYS.prefs, JSON.stringify(S.prefs));
      if (RT.app) RT.app.applyTheme();
      refresh('all');
    },

    setFontScale: function (scale) {
      S.prefs.fontScale = Math.min(1.5, Math.max(0.85, Number(scale) || 1));
      RT.storage.set(KEYS.prefs, JSON.stringify(S.prefs));
      if (RT.app) RT.app.applyTheme();
    },
  };

  RT.currentTable = currentTable;
  RT.currentCombo = currentCombo;

})(window.RT = window.RT || {});
