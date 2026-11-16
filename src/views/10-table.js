/* ============================================================
 * 10. 视图：随机表
 * ============================================================ */
(function (RT) {
  'use strict';

  function warningsHtml(list) {
    if (!list || !list.length) return '';
    const uniq = [];
    list.forEach(function (w) { if (uniq.indexOf(w) < 0) uniq.push(w); });
    return '<div class="warnings">' + uniq.map(function (w) {
      return '<div class="warning">' + RT.icon('x', 13) + '<span>' + RT.esc(w) + '</span></div>';
    }).join('') + '</div>';
  }
  RT.warningsHtml = warningsHtml;

  function emptyState() {
    return (
      '<div class="empty">' +
      '<div class="empty-mark">' + RT.icon('dice', 40) + '</div>' +
      '<h2>还没有任何随机表</h2>' +
      '<p>先建一张表，比如「当前行为」，把想到的条目一行一条贴进去。</p>' +
      '<div class="empty-actions">' +
      '<button class="btn gold" data-act="new-table">' + RT.icon('plus', 15) + ' 新建一张表</button>' +
      '<button class="btn ghost" data-act="load-sample">载入核心表包</button>' +
      '</div></div>'
    );
  }

  function resultCard(t) {
    const S = RT.state;
    const r = S.results.table;
    if (!r || r.tableId !== t.id) {
      return (
        '<section class="result-card placeholder">' +
        '<div class="result-head"><span class="result-title">' + RT.icon('wand', 14) + ' 掷出结果</span></div>' +
        '<div class="result-empty">按下「掷！」或空格键<br><span class="dim">结果会显示在这里，可一键复制</span></div>' +
        '</section>'
      );
    }

    const lines = r.texts.length > 1
      ? '<ol class="result-list">' + r.texts.map(function (x) { return '<li>' + RT.esc(x) + '</li>'; }).join('') + '</ol>'
      : '<div class="result-text">' + RT.esc(r.text) + '</div>';

    return (
      '<section class="result-card">' +
      '<div class="result-head">' +
      '<span class="result-title">' + RT.icon('wand', 14) + ' 掷出结果</span>' +
      '<span class="seed" title="同一种子可以复现同样的结果">seed ' + r.seed + '</span>' +
      '</div>' +
      '<div class="result-body">' + lines + '</div>' +
      (r.dice ? '<div class="dice-detail">' + RT.icon('dice', 13) + ' ' + RT.esc(r.dice.detail) + '</div>' : '') +
      warningsHtml(r.warnings) +
      '<div class="result-actions">' +
      '<button class="btn ghost small" data-act="copy-table-result">' + RT.icon('copy', 14) + ' 复制</button>' +
      '<button class="btn ghost small" data-act="favorite-table-result">' + RT.icon('star', 14) + ' 收藏</button>' +
      '<button class="btn ghost small" data-act="roll-table">' + RT.icon('refresh', 14) + ' 再掷</button>' +
      '</div></section>'
    );
  }

  RT.viewTable = function () {
    const S = RT.state;
    const t = RT.currentTable();
    if (!t) return emptyState();

    const hasDice = !!(t.dice && String(t.dice).trim());
    const folderOptions = '<option value="">未分组</option>' + S.set.folders.map(function (f) {
      return '<option value="' + f.id + '"' + (t.folderId === f.id ? ' selected' : '') + '>' + RT.esc(f.name) + '</option>';
    }).join('');
    const rows = t.entries.map(function (e, i) {
      return (
        '<div class="entry-row' + (hasDice ? ' data-dice' : '') + '" data-eid="' + e.id + '">' +
        '<span class="entry-idx">' + (i + 1) + '</span>' +
        '<input class="entry-text" data-act="entry-text" value="' + RT.attr(e.text) + '" placeholder="条目内容，可用 {表名} 引用其它表">' +
        '<input class="entry-weight" type="number" min="0" step="0.5" data-act="entry-weight" value="' + RT.attr(e.weight) + '" title="权重：越大越容易被抽到">' +
        (hasDice
          ? '<span class="range-wrap">' +
            '<input class="entry-range" type="number" data-act="entry-range-min" value="' + (e.range ? e.range[0] : '') + '" placeholder="起">' +
            '<span class="dash">–</span>' +
            '<input class="entry-range" type="number" data-act="entry-range-max" value="' + (e.range ? e.range[1] : '') + '" placeholder="止">' +
            '</span>'
          : '') +
        '<span class="row-actions">' +
        '<button class="mini" data-act="entry-up" title="上移">' + RT.icon('up', 13) + '</button>' +
        '<button class="mini" data-act="entry-down" title="下移">' + RT.icon('down', 13) + '</button>' +
        '<button class="mini danger" data-act="entry-del" title="删除这条">' + RT.icon('trash', 13) + '</button>' +
        '</span></div>'
      );
    }).join('');

    return (
      '<div class="view">' +
      '<div class="view-head">' +
      '<div class="head-main">' +
      '<input class="title-input" data-act="table-name" value="' + RT.attr(t.name) + '" placeholder="表名">' +
      '<div class="field-error" id="table-name-error" hidden></div>' +
      '<div class="meta-row">' +
      '<label class="meta-field"><span>骰子</span><input data-act="table-dice" value="' + RT.attr(t.dice || '') + '" placeholder="如 1d100（可留空）"></label>' +
      '<label class="meta-field"><span>分组</span><select data-act="table-folder">' + folderOptions + '</select></label>' +
      '<label class="meta-field grow"><span>标签</span><input data-act="table-tags" value="' + RT.attr(t.tags.join(', ')) + '" placeholder="NPC, 姓名"></label>' +
      '<span class="count">' + t.entries.length + ' 条</span>' +
      '</div></div>' +
      '<div class="head-actions">' +
      '<button class="btn ghost small" data-act="table-duplicate">' + RT.icon('copy', 14) + ' 复制</button>' +
      '<button class="btn ghost small danger" data-act="table-delete">' + RT.icon('trash', 14) + ' 删除</button>' +
      '</div></div>' +

      '<div class="toolbar">' +
      '<button class="btn small" data-act="entry-add">' + RT.icon('plus', 14) + ' 添加条目</button>' +
      '<button class="btn ghost small" data-act="toggle-bulk">批量粘贴</button>' +
      '<div class="spacer"></div>' +
      '<label class="inline-field">掷 <input type="number" min="1" max="50" data-act="table-times" value="' + S.ui.tableTimes + '"> 次</label>' +
      '<button class="btn gold" data-act="roll-table">' + RT.icon('dice', 15) + ' 掷！<kbd>空格</kbd></button>' +
      '</div>' +

      '<div class="bulk-panel" data-open="false">' +
      '<div class="bulk-head"><strong>批量粘贴</strong><span class="dim">一行一条；支持 <code>文本|权重</code> 与 <code>文本|起-止</code>（需先填骰子表达式）</span></div>' +
      '<textarea class="textarea" data-act="bulk-text" rows="6" placeholder="艾德温·灰堡&#10;莉安·银溪|3&#10;独眼商贩|1-5"></textarea>' +
      '<div class="bulk-actions">' +
      '<button class="btn gold small" data-act="bulk-add">追加到表尾</button>' +
      '<button class="btn ghost small" data-act="bulk-close">收起</button>' +
      '</div></div>' +

      '<div class="split">' +
      '<div class="split-main">' +
      (t.entries.length
        ? '<div class="entry-list">' + rows + '</div>'
        : '<div class="empty small-empty"><p>这张表还没有条目。</p><button class="btn ghost small" data-act="entry-add">添加第一条</button></div>') +
      '<div class="hint">' +
      (hasDice
        ? '骰子模式：先掷 ' + RT.esc(t.dice) + '，再按「起–止」区间取条目；区间外的骰值会取最近的一条。'
        : '权重模式：权重越大越容易被抽到；在条目里写 <code>{另一张表}</code> 可以在掷出时套用那张表。') +
      '</div>' +
      '</div>' +
      '<aside class="split-side">' + resultCard(t) + '</aside>' +
      '</div></div>'
    );
  };

})(window.RT = window.RT || {});
