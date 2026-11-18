/* ============================================================
 * 12. 视图：收藏 / 历史
 * ============================================================ */
(function (RT) {
  'use strict';

  RT.viewFavorites = function () {
    const S = RT.state;
    const list = S.set.favorites;
    if (!list.length) {
      return (
        '<div class="empty">' +
        '<div class="empty-mark">' + RT.icon('star', 38) + '</div>' +
        '<h2>收藏夹是空的</h2>' +
        '<p>掷出满意的组合结果后，点「收藏」就会存到这里，随时翻出来用。</p>' +
        '</div>'
      );
    }
    return (
      '<div class="view">' +
      '<div class="view-head"><div class="head-main"><h2 class="page-title">收藏（' + list.length + '）</h2>' +
      '<div class="meta-row"><span class="dim">收藏与表组一起导出，换设备也不会丢</span></div></div></div>' +
      '<div class="fav-list">' + list.map(function (f) {
        const combo = S.set.combos.find(function (c) { return c.id === f.comboId; });
        const source = f.sourceLabel || (combo ? combo.name : '已删除的组合');
        return (
          '<article class="fav-card">' +
          '<div class="fav-text pre">' + RT.esc(f.text) + '</div>' +
          '<textarea class="fav-note" data-act="fav-note" data-id="' + f.id + '" rows="2" placeholder="备注：出现在哪一章、玩家反应、后续打算…">' + RT.esc(f.note || '') + '</textarea>' +
          '<div class="fav-meta"><span>' + RT.esc(source) + '</span><span>' + RT.fmtTime(f.ts) + '</span></div>' +
          '<div class="fav-actions">' +
          '<button class="btn ghost small" data-act="fav-copy" data-text="' + RT.attr(f.text) + '">' + RT.icon('copy', 13) + ' 复制</button>' +
          '<button class="btn ghost small" data-act="fav-save" data-text="' + RT.attr(f.text) + '">存入表</button>' +
          '<button class="btn ghost small" data-act="fav-to-dmtext" data-id="' + f.id + '">加入文本卡库</button>' +
          '<button class="btn ghost small danger" data-act="fav-del" data-id="' + f.id + '">' + RT.icon('trash', 13) + '</button>' +
          '</div></article>'
        );
      }).join('') + '</div></div>'
    );
  };

  RT.viewHistory = function () {
    const S = RT.state;
    const list = S.set.history;
    if (!list.length) {
      return (
        '<div class="empty">' +
        '<div class="empty-mark">' + RT.icon('clock', 38) + '</div>' +
        '<h2>还没有掷过</h2>' +
        '<p>每次掷出都会留下记录，连同种子一起保存，事后可以原样重放。</p>' +
        '</div>'
      );
    }
    return (
      '<div class="view">' +
      '<div class="view-head"><div class="head-main"><h2 class="page-title">历史（' + list.length + '）</h2>' +
      '<div class="meta-row"><span class="dim">保留最近 200 条；点「重放」用同样的种子再跑一遍</span></div></div>' +
      '<div class="head-actions"><button class="btn ghost small danger" data-act="clear-history">清空历史</button></div></div>' +
      '<div class="history-list">' + list.map(function (h) {
        return (
          '<div class="history-row" data-id="' + h.id + '">' +
          '<span class="badge ' + (h.kind === 'combo' ? 'combo' : '') + '">' + (h.kind === 'combo' ? '组合' : '单表') + '</span>' +
          '<div class="history-main">' +
          '<div class="history-top"><strong>' + RT.esc(h.label) + '</strong><span class="dim">' + RT.fmtTime(h.ts) + ' · seed ' + h.seed + '</span></div>' +
          '<div class="history-text pre">' + RT.esc(h.text) + '</div>' +
          '</div>' +
          '<div class="history-actions">' +
          '<button class="mini" data-act="history-copy" data-text="' + RT.attr(h.text) + '" title="复制">' + RT.icon('copy', 13) + '</button>' +
          '<button class="mini" data-act="history-replay" data-id="' + h.id + '" title="用同样的种子重放">' + RT.icon('refresh', 13) + '</button>' +
          '</div></div>'
        );
      }).join('') + '</div></div>'
    );
  };

  RT.viewLibrary = function () {
    return RT.state.ui.view === 'favorites' ? RT.viewFavorites() : RT.viewHistory();
  };

  function plainName(text) {
    const line = String(text || '').trim().split(/\r?\n/)[0] || '';
    return line.replace(/[#>*_`\-\[\]]/g, '').trim().slice(0, 30) || '收藏文本';
  }

  RT.acts = RT.acts || {};

  RT.acts['fav-to-dmtext'] = function (el) {
    if (!RT.dmLib) { RT.toast('卡片库未加载', 'warn'); return; }
    const id = el.getAttribute('data-id');
    const f = RT.state.set.favorites.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    RT.dmLib.addText(plainName(f.text), f.text + (f.note ? '\n\n' + f.note : ''), '收藏');
    RT.toast('已加入文本卡库');
  };

})(window.RT = window.RT || {});
