/* ============================================================
 * 06. 工作区：战役、模块注册表、按战役存储、工作区备份
 *     战役是容器；笔记 / 记录表（及以后新增的模块）都挂在战役下。
 *     规则速查与随机表是全局数据，不进战役。
 * ============================================================ */
(function (RT) {
  'use strict';

  const KEYS = {
    campaigns: 'trpg_rt_campaigns_v1',
    notes: 'trpg_rt_notes_v1',
    sheets: 'trpg_rt_sheets_v1',
    templates: 'trpg_rt_templates_v1',
    sheetTemplates: 'trpg_rt_sheet_templates_v1', // 旧 key，仅用于兼容导入
    dmBoard: 'trpg_rt_dm_board_v1',
    dmLib: 'trpg_rt_dm_lib_v1',
    rules: 'trpg_rt_rules_v1',
  };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function read(key, fallback) {
    try {
      const raw = RT.storage.get(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, val) {
    return RT.storage.set(key, JSON.stringify(val));
  }

  const ws = (RT.ws = {});
  ws.KEYS = KEYS;
  ws.uid = uid;
  ws.modules = [];

  /* ---------------- 战役 ---------------- */

  let campCache = null;

  function campState() {
    if (!campCache) {
      const v = read(KEYS.campaigns, null);
      campCache = v && Array.isArray(v.list) ? v : { activeId: null, list: [] };
      campCache.list = campCache.list.filter(function (c) {
        return c && typeof c.id === 'string' && c.id;
      });
      campCache.list.forEach(function (c) {
        if (!c.name) c.name = '未命名战役';
      });
      if (typeof campCache.activeId !== 'string') campCache.activeId = null;
    }
    return campCache;
  }

  ws.saveCampaigns = function () {
    write(KEYS.campaigns, campState());
  };

  ws.campaigns = function () {
    return campState().list;
  };

  ws.campaign = function (id) {
    return campState().list.filter(function (c) { return c.id === id; })[0] || null;
  };

  ws.activeCampaign = function () {
    const st = campState();
    let c = st.list.filter(function (x) { return x.id === st.activeId; })[0];
    if (!c && st.list.length) {
      c = st.list[0];
      st.activeId = c.id;
    }
    return c || null;
  };

  ws.setActiveCampaign = function (id) {
    const st = campState();
    st.activeId = id || null;
    ws.saveCampaigns();
  };

  ws.addCampaign = function (name, opts) {
    const st = campState();
    const now = new Date().toISOString();
    const c = {
      id: uid('cp'),
      name: String(name || '').trim() || '战役 ' + (st.list.length + 1),
      createdAt: now,
      updatedAt: now,
    };
    st.list.push(c);
    st.activeId = c.id;
    ws.saveCampaigns();
    if (opts && opts.seed === false) return c;
    ws.modules.forEach(function (m) {
      if (typeof m.seed === 'function') {
        try { m.seed(c.id); } catch (e) { console.warn('种子失败', m.id, e); }
      }
    });
    return c;
  };

  ws.renameCampaign = function (id, name) {
    const c = ws.campaign(id);
    if (!c) return false;
    const next = String(name || '').trim();
    if (!next) return false;
    c.name = next;
    c.updatedAt = new Date().toISOString();
    ws.saveCampaigns();
    return true;
  };

  ws.touchCampaign = function (id) {
    const c = ws.campaign(id);
    if (!c) return;
    c.updatedAt = new Date().toISOString();
    ws.saveCampaigns();
  };

  ws.removeCampaign = function (id) {
    const st = campState();
    const i = st.list.findIndex(function (c) { return c.id === id; });
    if (i < 0) return false;
    st.list.splice(i, 1);
    ws.modules.forEach(function (m) {
      if (m.key) deleteKeyData(m.key, id);
      if (typeof m.clear === 'function') {
        try { m.clear(id); } catch (e) { /* ignore */ }
      }
    });
    if (st.activeId === id) st.activeId = st.list[0] ? st.list[0].id : null;
    ws.saveCampaigns();
    return true;
  };

  /** 该战役在各模块下的数据量，用于删除前提示 */
  ws.campaignCounts = function (id) {
    const out = [];
    ws.modules.forEach(function (m) {
      if (typeof m.count !== 'function') return;
      let n = 0;
      try { n = m.count(id) || 0; } catch (e) { n = 0; }
      if (n) out.push({ id: m.id, name: m.name, n: n, unit: m.unit || '条' });
    });
    return out;
  };

  /* ---------------- 按战役存储 ---------------- */

  function readKeyData(key) {
    const v = read(key, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }
  function deleteKeyData(key, cid) {
    const all = readKeyData(key);
    if (!Object.prototype.hasOwnProperty.call(all, cid)) return;
    delete all[cid];
    write(key, all);
  }

  ws.store = function (key) {
    return {
      all: function () {
        return readKeyData(key);
      },
      get: function (cid) {
        return readKeyData(key)[cid] || null;
      },
      set: function (cid, val) {
        const all = readKeyData(key);
        all[cid] = val;
        return write(key, all);
      },
      del: function (cid) {
        deleteKeyData(key, cid);
      },
    };
  };

  /* ---------------- 全局：规则包 ---------------- */

  ws.rulesState = function () {
    const v = read(KEYS.rules, null);
    if (!v || !Array.isArray(v.packs)) return { activeId: null, packs: [] };
    v.packs = v.packs.filter(function (p) { return p && p.id && typeof p.name === 'string'; });
    return v;
  };

  ws.saveRules = function (st) {
    return write(KEYS.rules, st);
  };

  /* ---------------- 模块注册 ---------------- */

  ws.register = function (m) {
    if (!m || !m.id) return null;
    ws.modules.push(m);
    return m;
  };

  ws.module = function (id) {
    return ws.modules.filter(function (m) { return m.id === id; })[0] || null;
  };

  /* ---------------- 工作区备份 ---------------- */

  ws.exportWorkspace = function () {
    const mods = {};
    ws.modules.forEach(function (m) {
      if (m.key) mods[m.key] = readKeyData(m.key);
    });
    return JSON.stringify({
      kind: 'trpg-workspace',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      set: RT.state.set,
      campaigns: campState(),
      modules: mods,
      templates: RT.tpl ? RT.tpl.exportData() : { list: [] },
      dmLib: RT.dmLib ? RT.dmLib.read() : read(KEYS.dmLib, { items: [] }),
      rules: ws.rulesState(),
      prefs: { theme: RT.state.prefs.theme, fontScale: RT.state.prefs.fontScale },
    }, null, 2);
  };

  /** 判断一段 JSON 文本属于哪种文件 */
  ws.detectKind = function (parsed) {
    if (!parsed || typeof parsed !== 'object') return 'unknown';
    if (parsed.kind === 'trpg-workspace') return 'workspace';
    if (Array.isArray(parsed.packs) && !parsed.tables) return 'rules';
    if (Array.isArray(parsed.tables) || Array.isArray(parsed.combos)) return 'set';
    return 'unknown';
  };

  ws.importWorkspace = function (text, strategy) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('JSON 解析失败：' + e.message);
    }
    if (ws.detectKind(parsed) !== 'workspace') throw new Error('这不是工作区备份文件');

    RT.snapshots.push('导入工作区前');
    const replace = strategy === 'replace';
    const st = campState();
    if (replace) {
      st.list = [];
      st.activeId = null;
      ws.modules.forEach(function (m) { if (m.key) write(m.key, {}); });
    }

    // 表组
    if (parsed.set && (Array.isArray(parsed.set.tables) || Array.isArray(parsed.set.combos))) {
      const incoming = RT.normalizeSet(parsed.set);
      if (replace) {
        RT.state.set = incoming;
      } else if (RT.mergeSet) {
        RT.mergeSet(RT.state.set, incoming);
      }
    }

    // 战役
    const idMap = {};
    let addedCamp = 0;
    ((parsed.campaigns && parsed.campaigns.list) || []).forEach(function (c) {
      if (!c || !c.id) return;
      const exist = st.list.filter(function (x) { return x.id === c.id; })[0];
      if (exist) {
        if (!replace && c.name && c.name !== exist.name) exist.name = c.name + '（导入）';
        idMap[c.id] = exist.id;
        return;
      }
      const copy = {
        id: c.id,
        name: c.name || '导入的战役',
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      st.list.push(copy);
      idMap[c.id] = copy.id;
      addedCamp++;
    });
    if (parsed.campaigns && parsed.campaigns.activeId && idMap[parsed.campaigns.activeId]) {
      st.activeId = idMap[parsed.campaigns.activeId];
    } else if (!st.activeId && st.list[0]) {
      st.activeId = st.list[0].id;
    }
    ws.saveCampaigns();

    // 模块数据
    const mods = parsed.modules || {};
    Object.keys(mods).forEach(function (key) {
      const isModuleKey = ws.modules.some(function (m) { return m.key === key; });
      if (!isModuleKey) return;
      const src = mods[key] || {};
      const dst = replace ? {} : readKeyData(key);
      Object.keys(src).forEach(function (cid) {
        const target = idMap[cid];
        if (!target) return;
        dst[target] = src[cid];
      });
      write(key, dst);
    });

    // 模板（记录表 + 卡片）：新格式直接并入；旧工作区的 sheetTemplates 现场转布局
    if (RT.tpl) {
      const incoming = [];
      if (parsed.templates && Array.isArray(parsed.templates.list)) {
        incoming.push.apply(incoming, parsed.templates.list);
      }
      if (parsed.sheetTemplates && Array.isArray(parsed.sheetTemplates.list)) {
        incoming.push.apply(incoming, parsed.sheetTemplates.list);
      }
      incoming.forEach(function (t) {
        if (!t || !t.name) return;
        const isCard = t.kind === 'card';
        const hasTree = t.layout && !Array.isArray(t.layout) && Array.isArray(t.layout.children);
        const layout = hasTree ? t.layout
          : Array.isArray(t.layout) ? RT.tpl.convertV1(t.layout) : null;
        if (!layout) return;
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = uid('st');
        copy.name = t.name + '（导入）';
        copy.builtin = false;
        copy.version = 1;
        copy.layout = layout;
        copy.kind = isCard ? 'card' : 'sheet';
        copy.cardKind = isCard ? (t.cardKind === 'custom' || !t.cardKind ? 'special' : t.cardKind) : null;
        RT.tpl.save(copy);
      });
    }

    // 规则包
    if (parsed.rules && Array.isArray(parsed.rules.packs)) {
      const cur = ws.rulesState();
      const seen = {};
      cur.packs.forEach(function (p) { seen[p.name] = true; });
      parsed.rules.packs.forEach(function (p) {
        if (!p || !p.name) return;
        if (replace || !seen[p.name]) {
          cur.packs.push({
            id: uid('rp'),
            name: p.name,
            source: p.source || '',
            md: typeof p.md === 'string' ? p.md : '',
            ts: Date.now(),
          });
        }
      });
      if (!cur.activeId && cur.packs[0]) cur.activeId = cur.packs[0].id;
      ws.saveRules(cur);
    }

    // DM 库（全局）：按 库 + 名称 去重合并
    if (parsed.dmLib && Array.isArray(parsed.dmLib.items) && RT.dmLib) {
      const seen = {};
      RT.dmLib.read().items.forEach(function (it) { seen[it.lib + '/' + it.name] = true; });
      parsed.dmLib.items.forEach(function (it) {
        if (!it || !it.lib || !it.name) return;
        const key = it.lib + '/' + it.name;
        if (seen[key]) return;
        RT.dmLib.add({
          lib: it.lib,
          tplId: it.tplId || '',
          name: it.name,
          meta: it.meta && typeof it.meta === 'object' ? it.meta : {},
          values: it.values && typeof it.values === 'object' ? it.values : {},
        });
        seen[key] = true;
      });
    }

    RT.touch && RT.touch();
    RT.refresh && RT.refresh('all');
    return { campaigns: addedCamp, total: st.list.length };
  };

  /** 单个战役导出为 Markdown（按模块注册顺序拼接） */
  ws.exportCampaignMd = function (cid) {
    const c = ws.campaign(cid);
    if (!c) return '';
    const L = [];
    L.push('# ' + c.name);
    L.push('');
    L.push('> 导出时间：' + new Date().toLocaleString());
    ws.modules.forEach(function (m) {
      if (typeof m.exportMd !== 'function') return;
      let block = '';
      try { block = m.exportMd(cid) || ''; } catch (e) { block = ''; }
      if (!block.trim()) return;
      L.push('');
      L.push('## ' + m.name);
      L.push('');
      L.push(block.trim());
    });
    L.push('');
    return L.join('\n');
  };

  /* ---------------- 装表包（去重合并） ---------------- */

  ws.installPack = function (pack, opts) {
    const S = RT.state;
    const set = S.set;
    const report = { tables: 0, combos: 0, folders: 0, skippedTables: 0, skippedCombos: 0 };

    const tableByName = {};
    set.tables.forEach(function (t) { tableByName[String(t.name).trim()] = t.id; });
    const comboByName = {};
    set.combos.forEach(function (c) { comboByName[String(c.name).trim()] = c.id; });
    /* 只与「装包前已有的表」去重；包内不同分组允许同名（如 03/04 都有「状态」） */
    const presetTables = {};
    Object.keys(tableByName).forEach(function (k) { presetTables[k] = tableByName[k]; });

    const folderMap = {};
    const folderByName = {};
    set.folders.forEach(function (f) {
      folderByName[(f.parentId || '') + '/' + String(f.name).trim()] = f.id;
    });

    (pack.folders || []).forEach(function (f) {
      const parentKey = f.parentId ? (folderMap[f.parentId] || '') : '';
      const key = parentKey + '/' + String(f.name).trim();
      if (folderByName[key]) {
        folderMap[f.id] = folderByName[key];
        return;
      }
      const nf = {
        id: uid('fd'),
        name: String(f.name).trim(),
        parentId: parentKey || null,
        collapsed: false,
      };
      set.folders.push(nf);
      folderMap[f.id] = nf.id;
      folderByName[key] = nf.id;
      report.folders++;
    });

    const idMap = {};
    (pack.tables || []).forEach(function (t) {
      const name = String(t.name || '').trim();
      if (!name) return;
      if (presetTables[name]) {
        idMap[t.id] = presetTables[name];
        report.skippedTables++;
        return;
      }
      const rows = (t.entries || []).map(function (e) {
        return {
          id: uid('e'),
          text: String(e && e.text != null ? e.text : ''),
          weight: e && e.weight != null ? Number(e.weight) : 1,
          range: e && Array.isArray(e.range) && e.range.length === 2
            ? [Number(e.range[0]), Number(e.range[1])] : null,
        };
      }).filter(function (e) { return e.text.trim(); });

      /* 顺序表（1..N 各占一格且骰面数 = 条目数）：去掉区间，
         让编辑器显示干净，掷法等价于等概率抽一条 */
      let seq = rows.length > 1;
      rows.forEach(function (e, i) {
        if (!e.range || e.range[0] !== i + 1 || e.range[1] !== i + 1) seq = false;
      });
      const faces = (String(t.dice || '').match(/^\d*d(\d+)$/i) || [])[1];
      const dropDice = !!(seq && faces && Number(faces) === rows.length);
      if (dropDice) {
        rows.forEach(function (e) { e.range = null; });
      }

      const nt = {
        id: uid('t'),
        name: name,
        folderId: t.folderId ? (folderMap[t.folderId] || null) : null,
        tags: Array.isArray(t.tags) ? t.tags.slice() : [],
        dice: dropDice ? null : (t.dice || null),
        entries: rows,
      };
      set.tables.push(nt);
      idMap[t.id] = nt.id;
      tableByName[name] = nt.id;
      report.tables++;
    });

    (pack.combos || []).forEach(function (c) {
      const name = String(c.name || '').trim();
      if (!name) return;
      if (comboByName[name]) {
        report.skippedCombos++;
        return;
      }
      const fields = (c.fields || []).map(function (f) {
        const tid = idMap[f.tableId] || null;
        if (!tid) return null;
        return {
          id: uid('f'),
          tableId: tid,
          label: String(f.label || '字段'),
          rolls: Math.min(20, Math.max(1, Number(f.rolls) || 1)),
          sep: typeof f.sep === 'string' ? f.sep : '、',
          locked: !!f.locked,
          lockedValue: '',
        };
      }).filter(Boolean);
      if (!fields.length) {
        report.skippedCombos++;
        return;
      }
      set.combos.push({
        id: uid('c'),
        name: name,
        fields: fields,
        template: typeof c.template === 'string' ? c.template : '',
      });
      comboByName[name] = true;
      report.combos++;
    });

    RT.snapshots.push(opts && opts.label ? opts.label : '装表包');
    if (!S.ui.tableId || !set.tables.some(function (t) { return t.id === S.ui.tableId; })) {
      S.ui.tableId = set.tables[0] ? set.tables[0].id : null;
    }
    if (!S.ui.comboId || !set.combos.some(function (c) { return c.id === S.ui.comboId; })) {
      S.ui.comboId = set.combos[0] ? set.combos[0].id : null;
    }
    RT.touch();
    RT.refresh('all');
    return report;
  };

})(window.RT = window.RT || {});
