/* ============================================================
 * 02. 掷表引擎：骰子表达式、嵌套表引用、权重、不重复抽取
 * ============================================================ */
(function (RT) {
  'use strict';

  const MAX_DEPTH = 8;

  RT.findTable = function (tables, nameOrId) {
    const key = String(nameOrId == null ? '' : nameOrId).trim().toLowerCase();
    if (!key) return null;
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      if (t.id === nameOrId) return t;
      if (String(t.name).trim().toLowerCase() === key) return t;
    }
    return null;
  };

  /** 骰子表达式：NdM+K / dM / d66；解析失败返回 null */
  RT.rollDice = function (expr, rand) {
    if (!expr) return null;
    const raw = String(expr).trim().toLowerCase().replace(/\s+/g, '');
    if (!raw) return null;

    if (raw === 'd66') {
      const a = 1 + Math.floor(rand() * 6);
      const b = 1 + Math.floor(rand() * 6);
      return { expr: 'd66', total: a * 10 + b, detail: 'd66 → (' + a + ',' + b + ') = ' + (a * 10 + b) };
    }

    const m = raw.match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) return null;

    const n = Math.min(100, Math.max(1, parseInt(m[1] || '1', 10)));
    const faces = Math.min(1000, Math.max(1, parseInt(m[2], 10)));
    const mod = m[3] ? parseInt(m[3], 10) : 0;
    const rolls = [];
    for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(rand() * faces));
    const total = rolls.reduce(function (a, b) { return a + b; }, 0) + mod;
    const modTxt = mod === 0 ? '' : mod > 0 ? ' + ' + mod : ' − ' + -mod;
    return {
      expr: raw,
      total: total,
      detail: raw + ' → ' + rolls.join(' + ') + modTxt + ' = ' + total,
    };
  };

  /** 展开条目文本中的 {表名} / [[表名]]，带深度限制与环检测 */
  /** 表所在的分组路径，如「NPC 人物 / 名字组件」；用于同名表提示 */
  function folderPathOf(table) {
    const set = RT.state && RT.state.set;
    if (!set || !Array.isArray(set.folders) || !table.folderId) return '';
    const byId = {};
    set.folders.forEach(function (f) { byId[f.id] = f; });
    const parts = [];
    let cur = byId[table.folderId];
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId[cur.parentId] : null;
    }
    return parts.join(' / ');
  }

  function countSameName(tables, name) {
    const key = String(name).trim().toLowerCase();
    if (!key) return 0;
    return tables.filter(function (t) {
      return String(t.name).trim().toLowerCase() === key;
    }).length;
  }

  RT.resolveText = function (text, tables, rand, depth, stack, warnings) {
    if (!text) return '';
    if (depth > MAX_DEPTH) {
      warnings.push('嵌套层数超过 ' + MAX_DEPTH + ' 层，已停止展开');
      return text;
    }
    return String(text).replace(/\{([^{}]+)\}|\[\[([^\]]+)\]\]/g, function (full, a, b) {
      const name = String(a || b || '').trim();
      if (!name) return full;
      const t = RT.findTable(tables, name);
      if (!t) return full;

      const sameName = countSameName(tables, name);
      if (sameName > 1) {
        const path = folderPathOf(t);
        warnings.push('「' + name + '」有 ' + sameName + ' 张同名表，本次用的是' +
          (path ? '「' + path + '」' : '未分组') + '里的那张');
      }

      if (stack.indexOf(t.id) >= 0) {
        warnings.push('检测到循环引用：' + t.name);
        return '【循环引用：' + t.name + '】';
      }
      const r = RT.rollEntry(t, tables, rand, depth + 1, stack.concat(t.id), warnings, []);
      return r.text;
    });
  };

  function pickEntry(table, rand, usedIds, warnings) {
    const entries = table.entries;
    if (!entries.length) return { entry: null, dice: null };

    let pool = entries.filter(function (e) { return usedIds.indexOf(e.id) < 0; });
    if (!pool.length) pool = entries;

    if (table.dice && pool.some(function (e) { return e.range; })) {
      const dice = RT.rollDice(table.dice, rand);
      if (dice) {
        const hit = pool.find(function (e) {
          return e.range && dice.total >= e.range[0] && dice.total <= e.range[1];
        });
        if (hit) return { entry: hit, dice: dice };
        let best = null;
        let bestDist = Infinity;
        pool.forEach(function (e) {
          if (!e.range) return;
          const d = dice.total < e.range[0] ? e.range[0] - dice.total : dice.total - e.range[1];
          if (d < bestDist) { bestDist = d; best = e; }
        });
        if (best) {
          warnings.push('骰值 ' + dice.total + ' 没落在任何区间，已取最近的一条');
          return { entry: best, dice: dice };
        }
      } else {
        warnings.push('骰子表达式「' + table.dice + '」无法解析，已改为按权重抽取');
      }
    }

    const weights = pool.map(function (e) { return Math.max(0, Number(e.weight) || 0); });
    const idx = RT.pickWeightedIndex(weights, rand);
    return { entry: pool[idx] || pool[0], dice: null };
  }

  RT.rollEntry = function (table, tables, rand, depth, stack, warnings, usedIds) {
    const picked = pickEntry(table, rand, usedIds || [], warnings);
    if (!picked.entry) {
      return { entry: null, text: '【空表：' + table.name + '】', dice: picked.dice };
    }
    return {
      entry: picked.entry,
      text: RT.resolveText(picked.entry.text, tables, rand, depth, stack, warnings),
      dice: picked.dice,
    };
  };

  /** 掷一张表；times>1 时同轮内尽量不重复 */
  RT.rollTable = function (table, tables, seed, times) {
    const rand = RT.mulberry32(seed >>> 0);
    const warnings = [];
    const n = Math.min(50, Math.max(1, Number(times) || 1));
    const used = [];
    const texts = [];
    let lastEntry = null;
    let lastDice = null;

    for (let i = 0; i < n; i++) {
      const r = RT.rollEntry(table, tables, rand, 0, [table.id], warnings, used);
      if (r.entry) { used.push(r.entry.id); lastEntry = r.entry; }
      if (r.dice) lastDice = r.dice;
      texts.push(r.text);
    }

    return {
      seed: seed,
      texts: texts,
      text: texts.join('\n'),
      dice: lastDice,
      entryId: lastEntry ? lastEntry.id : null,
      warnings: warnings,
    };
  };

  RT.renderComboText = function (combo, values) {
    const tpl = (combo.template || '').trim();
    if (!tpl) {
      return (combo.fields || []).map(function (f) {
        return f.label + '：' + (values[f.label] == null ? '' : values[f.label]);
      }).join('\n');
    }
    return tpl.replace(/\{([^{}]+)\}/g, function (full, key) {
      const k = key.trim();
      return values[k] === undefined ? full : values[k];
    });
  };

  /**
   * 组合掷表。preset 里的字段直接沿用（用于单字段重掷时冻结其它字段）。
   */
  RT.rollCombo = function (combo, tables, seed, preset) {
    const rand = RT.mulberry32(seed >>> 0);
    const warnings = [];
    const values = {};

    (combo.fields || []).forEach(function (f) {
      if (preset && Object.prototype.hasOwnProperty.call(preset, f.label)) {
        values[f.label] = preset[f.label];
        return;
      }
      const t = tables.find(function (x) { return x.id === f.tableId; });
      if (!t) {
        values[f.label] = '【表已删除】';
        warnings.push('字段「' + f.label + '」对应的表不存在');
        return;
      }
      const n = Math.min(20, Math.max(1, Number(f.rolls) || 1));
      const used = [];
      const parts = [];
      for (let i = 0; i < n; i++) {
        const r = RT.rollEntry(t, tables, rand, 0, [t.id], warnings, used);
        if (r.entry) used.push(r.entry.id);
        parts.push(r.text);
      }
      values[f.label] = parts.join(f.sep === undefined ? '、' : f.sep);
    });

    return {
      seed: seed,
      values: values,
      text: RT.renderComboText(combo, values),
      warnings: warnings,
    };
  };

  /* ---------------- CSV ---------------- */

  RT.csv = {
    parse: function (text) {
      const rows = [];
      let row = [];
      let cur = '';
      let quoted = false;
      const src = String(text).replace(/^\uFEFF/, '');
      for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
          if (c === '"') {
            if (src[i + 1] === '"') { cur += '"'; i++; }
            else quoted = false;
          } else cur += c;
        } else if (c === '"') {
          quoted = true;
        } else if (c === ',' || c === '\t') {
          row.push(cur); cur = '';
        } else if (c === '\n') {
          row.push(cur); rows.push(row); row = []; cur = '';
        } else if (c !== '\r') {
          cur += c;
        }
      }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
    },

    stringify: function (rows) {
      return rows.map(function (r) {
        return r.map(function (cell) {
          const s = String(cell == null ? '' : cell);
          return /[",\n\r\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      }).join('\r\n');
    },

    entriesToRows: function (table) {
      const rows = [['文本', '权重', '区间起', '区间止']];
      table.entries.forEach(function (e) {
        rows.push([e.text, e.weight == null ? 1 : e.weight, e.range ? e.range[0] : '', e.range ? e.range[1] : '']);
      });
      return rows;
    },

    rowsToEntries: function (rows) {
      if (!rows.length) return [];
      let start = 0;
      const first = rows[0].map(function (x) { return String(x).trim().toLowerCase(); });
      if (first[0] === '文本' || first[0] === 'text' || first[0] === '内容' || first[0] === '条目') start = 1;
      const out = [];
      for (let i = start; i < rows.length; i++) {
        const r = rows[i];
        const text = String(r[0] == null ? '' : r[0]).trim();
        if (!text) continue;
        const weight = r[1] === undefined || String(r[1]).trim() === '' ? 1 : Number(r[1]);
        const hasRange = r[2] !== undefined && String(r[2]).trim() !== '' && r[3] !== undefined && String(r[3]).trim() !== '';
        out.push(RT.entry(text, isFinite(weight) ? weight : 1, hasRange ? [Number(r[2]), Number(r[3])] : null));
      }
      return out;
    },
  };

})(window.RT = window.RT || {});
