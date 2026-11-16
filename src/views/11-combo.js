/* ============================================================
 * 11. 视图：组合表（一次分别从多张表取值）
 * ============================================================ */
(function (RT) {
  'use strict';

  function comboResult(combo) {
    const S = RT.state;
    const r = S.results.combo;
    const tables = S.set.tables;

    if (!r || r.comboId !== combo.id) {
      return (
        '<section class="result-card placeholder">' +
        '<div class="result-head"><span class="result-title">' + RT.icon('layers', 14) + ' 组合结果</span></div>' +
        '<div class="result-empty">按下「掷出组合」<br><span class="dim">每个字段会各自从对应的表里取一次</span></div>' +
        '</section>'
      );
    }

    const chips = combo.fields.map(function (f) {
      const v = r.values[f.label];
      const locked = !!f.locked;
      return (
        '<div class="chip' + (locked ? ' locked' : '') + '">' +
        '<span class="chip-label">' + RT.esc(f.label) + '</span>' +
        '<span class="chip-value">' + RT.esc(v == null ? '—' : v) + '</span>' +
        '<span class="chip-actions">' +
        '<button class="mini" data-act="chip-lock" data-field="' + f.id + '" title="' + (locked ? '解锁' : '锁定这个值，整组重掷时保持不变') + '">' +
        RT.icon(locked ? 'lock' : 'unlock', 13) + '</button>' +
        '<button class="mini" data-act="chip-reroll" data-field="' + f.id + '" title="只重掷这个字段">' + RT.icon('refresh', 13) + '</button>' +
        '</span></div>'
      );
    }).join('');

    const lockedCount = combo.fields.filter(function (f) { return f.locked; }).length;

    return (
      '<section class="result-card">' +
      '<div class="result-head">' +
      '<span class="result-title">' + RT.icon('layers', 14) + ' 组合结果</span>' +
      '<span class="seed">seed ' + r.seed + '</span>' +
      '</div>' +
      '<div class="result-body"><div class="result-text pre">' + RT.esc(r.text) + '</div></div>' +
      '<div class="chips">' + chips + '</div>' +
      RT.warningsHtml(r.warnings) +
      '<div class="result-actions wrap">' +
      '<button class="btn ghost small" data-act="copy-combo-result">' + RT.icon('copy', 14) + ' 复制</button>' +
      '<button class="btn ghost small" data-act="favorite-result">' + RT.icon('star', 14) + ' 收藏</button>' +
      '<button class="btn ghost small" data-act="roll-combo">' + RT.icon('refresh', 14) + ' 整组重掷</button>' +
      (lockedCount ? '<button class="btn ghost small" data-act="unlock-all">解锁 ' + lockedCount + ' 项</button>' : '') +
      '</div>' +
      '<div class="save-entry">' +
      '<span class="dim">把结果存进表：</span>' +
      '<select data-act="save-target">' + tables.map(function (t) {
        return '<option value="' + t.id + '">' + RT.esc(t.name) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn ghost small" data-act="save-result-entry">存入</button>' +
      '</div>' +
      '</section>'
    );
  }

  RT.viewCombo = function () {
    const S = RT.state;
    const combo = RT.currentCombo();
    if (!combo) {
      return (
        '<div class="empty">' +
        '<div class="empty-mark">' + RT.icon('layers', 40) + '</div>' +
        '<h2>还没有组合</h2>' +
        '<p>组合能让一次掷出同时生成姓名、外貌、性格——拼出一个完整 NPC。</p>' +
        '<div class="empty-actions"><button class="btn gold" data-act="new-combo">' + RT.icon('plus', 15) + ' 新建组合</button></div>' +
        '</div>'
      );
    }

    const tableOptions = function (selected) {
      if (!S.set.tables.length) return '<option value="">（先去建一张表）</option>';
      const opt = function (t) {
        return '<option value="' + t.id + '"' + (t.id === selected ? ' selected' : '') + '>' + RT.esc(t.name) + '</option>';
      };
      if (!S.set.folders.length) return S.set.tables.map(opt).join('');

      const out = [];
      const walk = function (parentId, prefix) {
        S.set.folders.filter(function (f) { return (f.parentId || null) === (parentId || null); }).forEach(function (f) {
          const label = prefix ? prefix + ' / ' + f.name : f.name;
          const items = S.set.tables.filter(function (t) { return t.folderId === f.id; });
          if (items.length) {
            out.push('<optgroup label="' + RT.esc(label) + '">' + items.map(opt).join('') + '</optgroup>');
          }
          walk(f.id, label);
        });
      };
      walk(null, '');

      const ungrouped = S.set.tables.filter(function (t) { return !t.folderId; });
      if (ungrouped.length) out.push('<optgroup label="未分组">' + ungrouped.map(opt).join('') + '</optgroup>');
      return out.join('') || S.set.tables.map(opt).join('');
    };

    const fieldRows = combo.fields.map(function (f, i) {
      return (
        '<div class="field-row" data-fid="' + f.id + '">' +
        '<span class="field-idx">' + (i + 1) + '</span>' +
        '<select data-act="field-table" title="从哪张表取值">' + tableOptions(f.tableId) + '</select>' +
        '<input data-act="field-label" value="' + RT.attr(f.label) + '" placeholder="字段名，如 姓名">' +
        '<input class="narrow" type="number" min="1" max="20" data-act="field-rolls" value="' + f.rolls + '" title="抽取条数">' +
        '<input class="narrow" data-act="field-sep" value="' + RT.attr(f.sep) + '" title="多条之间的分隔符">' +
        '<span class="row-actions">' +
        '<button class="mini" data-act="field-up" title="上移">' + RT.icon('up', 13) + '</button>' +
        '<button class="mini" data-act="field-down" title="下移">' + RT.icon('down', 13) + '</button>' +
        '<button class="mini danger" data-act="field-del" title="删除字段">' + RT.icon('trash', 13) + '</button>' +
        '</span></div>'
      );
    }).join('');

    const tokens = combo.fields.map(function (f) {
      return '<button class="token" data-act="insert-token" data-token="{'+ RT.attr(f.label) +'}">{' + RT.esc(f.label) + '}</button>';
    }).join('');

    return (
      '<div class="view">' +
      '<div class="view-head">' +
      '<div class="head-main">' +
      '<input class="title-input" data-act="combo-name" value="' + RT.attr(combo.name) + '" placeholder="组合名">' +
      '<div class="meta-row"><span class="count">' + combo.fields.length + ' 个字段 · ' + combo.fields.reduce(function (a, f) { return a + (Number(f.rolls) || 1); }, 0) + ' 次抽取</span></div>' +
      '</div>' +
      '<div class="head-actions">' +
      '<button class="btn ghost small" data-act="combo-duplicate">' + RT.icon('copy', 14) + ' 复制</button>' +
      '<button class="btn ghost small danger" data-act="combo-delete">' + RT.icon('trash', 14) + ' 删除</button>' +
      '</div></div>' +

      '<div class="split">' +
      '<div class="split-main">' +
      '<div class="panel">' +
      '<div class="panel-head"><strong>字段</strong><span class="dim">每个字段从一张表里取值</span></div>' +
      '<div class="field-list">' + (fieldRows || '<div class="dim pad">还没有字段</div>') + '</div>' +
      '<button class="btn ghost small" data-act="field-add">' + RT.icon('plus', 14) + ' 添加字段</button>' +
      '</div>' +

      '<div class="panel">' +
      '<div class="panel-head"><strong>成品模板</strong><span class="dim">用 {字段名} 拼出整段文字，留空则按「字段：值」列出</span></div>' +
      '<div class="tokens">' + tokens + '</div>' +
      '<textarea class="textarea" rows="5" data-act="combo-template" placeholder="例：{姓名}，{外貌}。性格{性格}。">' + RT.esc(combo.template) + '</textarea>' +
      '</div>' +

      '<div class="toolbar">' +
      '<button class="btn gold" data-act="roll-combo">' + RT.icon('layers', 15) + ' 掷出组合<kbd>空格</kbd></button>' +
      '</div>' +
      '</div>' +

      '<aside class="split-side">' + comboResult(combo) + '</aside>' +
      '</div></div>'
    );
  };

})(window.RT = window.RT || {});
