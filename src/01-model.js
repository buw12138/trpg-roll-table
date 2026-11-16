/* ============================================================
 * 01. 数据模型、默认值、示例表组、导入校验
 * ============================================================ */
(function (RT) {
  'use strict';

  RT.SCHEMA_VERSION = 3;

  RT.uid = function (prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  };

  RT.entry = function (text, weight, range) {
    return {
      id: RT.uid('e'),
      text: String(text == null ? '' : text),
      weight: weight == null ? 1 : Number(weight),
      range: range || null,
    };
  };

  RT.table = function (name, tags, entries, dice) {
    return {
      id: RT.uid('t'),
      name: name || '新表',
      folderId: null,
      tags: tags || [],
      dice: dice || null,
      entries: entries || [],
    };
  };

  RT.emptySet = function () {
    return {
      schemaVersion: RT.SCHEMA_VERSION,
      id: RT.uid('set'),
      name: '我的战役表组',
      updatedAt: new Date().toISOString(),
      contentVersion: null,
      folders: [],
      tables: [],
      combos: [],
      favorites: [],
      history: [],
    };
  };

  /* ---------------- 内置表包：即兴核心包（方案 A） ---------------- */

  /**
   * 首次打开、菜单「载入核心表包」、以及旧示例迁移都走这里。
   * 表内容全部定义在 01a-content.js（RT.contentSet），本文件只留接口。
   */
  RT.sampleSet = function () {
    return RT.contentSet();
  };

  /* ---------------- 导入校验 / 兼容 ---------------- */

  function num(v, dflt) {
    const n = Number(v);
    return isFinite(n) ? n : dflt;
  }

  RT.normalizeSet = function (raw) {
    if (!raw || typeof raw !== 'object') throw new Error('不是有效的 JSON 对象');
    if (!Array.isArray(raw.tables) && !Array.isArray(raw.combos)) {
      throw new Error('缺少 tables 字段，看来不是本工具导出的文件');
    }

    const set = RT.emptySet();
    set.schemaVersion = RT.SCHEMA_VERSION;
    set.id = typeof raw.id === 'string' && raw.id ? raw.id : set.id;
    set.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '导入的表组';
    set.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString();
    // 内容库版本：用于把旧版「示例表组」整包替换成即兴核心包（自定义表组不受影响）
    set.contentVersion = typeof raw.contentVersion === 'string' ? raw.contentVersion : null;

    set.folders = (Array.isArray(raw.folders) ? raw.folders : []).map(function (f) {
      if (!f || typeof f !== 'object') return null;
      return {
        id: typeof f.id === 'string' && f.id ? f.id : RT.uid('fd'),
        name: typeof f.name === 'string' && f.name.trim() ? f.name.trim() : '未命名分组',
        parentId: typeof f.parentId === 'string' && f.parentId ? f.parentId : null,
        collapsed: !!f.collapsed,
      };
    }).filter(Boolean);

    // 清理悬空父级与环（防止导入坏数据导致渲染死循环）
    const folderById = {};
    set.folders.forEach(function (f) { folderById[f.id] = f; });
    set.folders.forEach(function (f) {
      if (!f.parentId) return;
      if (f.parentId === f.id || !folderById[f.parentId]) {
        f.parentId = null;
        return;
      }
      let cur = folderById[f.parentId];
      let guard = 0;
      while (cur && guard++ < 100) {
        if (cur.id === f.id) { f.parentId = null; break; }
        cur = cur.parentId ? folderById[cur.parentId] : null;
      }
    });

    const folderIds = set.folders.map(function (f) { return f.id; });

    set.tables = (Array.isArray(raw.tables) ? raw.tables : []).map(function (t) {
      const table = RT.table(typeof t.name === 'string' ? t.name : '未命名表', [], [], typeof t.dice === 'string' && t.dice.trim() ? t.dice.trim() : null);
      table.id = typeof t.id === 'string' && t.id ? t.id : table.id;
      table.tags = Array.isArray(t.tags) ? t.tags.filter(function (x) { return typeof x === 'string'; }) : [];
      table.folderId = typeof t.folderId === 'string' && folderIds.indexOf(t.folderId) >= 0 ? t.folderId : null;
      table.entries = (Array.isArray(t.entries) ? t.entries : []).map(function (e) {
        if (typeof e === 'string') return RT.entry(e, 1);
        const entry = RT.entry(typeof e.text === 'string' ? e.text : '', num(e.weight, 1), null);
        entry.id = typeof e.id === 'string' && e.id ? e.id : entry.id;
        if (Array.isArray(e.range) && e.range.length === 2) {
          entry.range = [num(e.range[0], 0), num(e.range[1], 0)];
        }
        return entry;
      });
      return table;
    });

    set.combos = (Array.isArray(raw.combos) ? raw.combos : []).map(function (c) {
      const combo = { id: RT.uid('c'), name: typeof c.name === 'string' ? c.name : '未命名组合', fields: [], template: typeof c.template === 'string' ? c.template : '' };
      if (typeof c.id === 'string' && c.id) combo.id = c.id;
      combo.fields = (Array.isArray(c.fields) ? c.fields : []).map(function (f) {
        return {
          id: typeof f.id === 'string' && f.id ? f.id : RT.uid('f'),
          tableId: typeof f.tableId === 'string' ? f.tableId : '',
          label: typeof f.label === 'string' ? f.label : '字段',
          rolls: Math.min(20, Math.max(1, num(f.rolls, 1))),
          sep: typeof f.sep === 'string' ? f.sep : '、',
          locked: !!f.locked,
          lockedValue: typeof f.lockedValue === 'string' ? f.lockedValue : '',
        };
      });
      return combo;
    });

    set.favorites = (Array.isArray(raw.favorites) ? raw.favorites : []).map(function (f) {
      return {
        id: typeof f.id === 'string' && f.id ? f.id : RT.uid('fav'),
        comboId: typeof f.comboId === 'string' ? f.comboId : '',
        sourceLabel: typeof f.sourceLabel === 'string' ? f.sourceLabel : '',
        text: typeof f.text === 'string' ? f.text : '',
        note: typeof f.note === 'string' ? f.note : '',
        ts: num(f.ts, Date.now()),
      };
    });

    set.history = (Array.isArray(raw.history) ? raw.history : []).slice(0, 200).map(function (h) {
      return {
        id: typeof h.id === 'string' && h.id ? h.id : RT.uid('h'),
        ts: num(h.ts, Date.now()),
        kind: h.kind === 'combo' ? 'combo' : 'table',
        refId: typeof h.refId === 'string' ? h.refId : '',
        label: typeof h.label === 'string' ? h.label : '',
        seed: num(h.seed, 0),
        text: typeof h.text === 'string' ? h.text : '',
      };
    });

    return set;
  };

  /** 合并导入：为冲突的表/组合重新分配 id，并同步组合里的引用 */
  RT.mergeSet = function (target, incoming) {
    const tableMap = {};
    const folderMap = {};
    if (Array.isArray(incoming.folders)) {
      incoming.folders.forEach(function (f) {
        if (target.folders.some(function (x) { return x.id === f.id; })) {
          const nid = RT.uid('fd');
          folderMap[f.id] = nid;
          f.id = nid;
        }
        target.folders.push(f);
      });
      incoming.folders.forEach(function (f) {
        if (f.parentId && folderMap[f.parentId]) f.parentId = folderMap[f.parentId];
      });
    }
    incoming.tables.forEach(function (t) {
      if (folderMap[t.folderId]) t.folderId = folderMap[t.folderId];
      if (target.tables.some(function (x) { return x.id === t.id; })) {
        const nid = RT.uid('t');
        tableMap[t.id] = nid;
        t.id = nid;
      }
      target.tables.push(t);
    });
    incoming.combos.forEach(function (c) {
      c.fields.forEach(function (f) {
        if (tableMap[f.tableId]) f.tableId = tableMap[f.tableId];
      });
      if (target.combos.some(function (x) { return x.id === c.id; })) c.id = RT.uid('c');
      target.combos.push(c);
    });
    incoming.favorites.forEach(function (f) {
      if (target.favorites.some(function (x) { return x.id === f.id; })) f.id = RT.uid('fav');
      target.favorites.push(f);
    });
    return target;
  };

})(window.RT = window.RT || {});
