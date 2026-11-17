/* ============================================================
 * 14. 视图：战役（容器）
 *     先建战役，再在战役下按模块（笔记 / 记录表 / 以后新增的）管理内容。
 *     战役切换在顶部下拉；侧栏留给当前模块自己的列表。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;

  RT.acts = RT.acts || {};
  RT.inputActs = RT.inputActs || {};
  RT.changeActs = RT.changeActs || {};

  function ui() {
    return RT.state.ui;
  }

  function activeModule() {
    const id = ui().campaignModule;
    return RT.ws.module(id) || RT.ws.modules[0] || null;
  }

  function countsText(cid) {
    const parts = RT.ws.campaignCounts(cid).map(function (c) {
      return c.name + ' ' + c.n + c.unit;
    });
    return parts.length ? parts.join(' · ') : '还没有内容';
  }

  function emptyState() {
    return (
      '<div class="empty camp-empty">' +
      '<div class="empty-mark">' + RT.icon('layers', 40) + '</div>' +
      '<h2>先创建一个战役</h2>' +
      '<p>笔记与记录表都挂在战役下面：一个战役 = 一个世界 / 一条故事线，各自独立存放，互不干扰。</p>' +
      '<p class="dim">随机表、组合与规则速查是全局的，不跟着战役走。</p>' +
      '<div class="camp-empty-actions">' +
      '<button class="btn gold" data-act="campaign-new">' + RT.icon('plus', 15) + ' 新建战役</button>' +
      '<button class="btn ghost" data-act="io-workspace">' + RT.icon('upload', 15) + ' 导入工作区</button>' +
      '</div>' +
      '</div>'
    );
  }

  RT.viewCampaign = function () {
    const camp = RT.ws.activeCampaign();
    if (!camp) return emptyState();

    ui().campaignId = camp.id;
    const mod = activeModule();
    const tabs = RT.ws.modules.map(function (m) {
      return '<button class="camp-tab' + (mod && m.id === mod.id ? ' active' : '') +
        '" data-act="campaign-module" data-id="' + m.id + '">' +
        RT.icon(m.icon || 'file', 15) + '<span>' + esc(m.name) + '</span></button>';
    }).join('');

    const options = RT.ws.campaigns().map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === camp.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    return (
      '<div class="view camp-view">' +
      '<div class="camp-head">' +
      '<div class="camp-head-main">' +
      '<div class="camp-switch">' +
      '<label class="dim">战役</label>' +
      '<select id="campaign-select" data-act="campaign-switch" title="切换战役">' + options + '</select>' +
      '<button class="mini" data-act="campaign-new" title="新建战役">' + RT.icon('plus', 15) + '</button>' +
      '<button class="mini" data-act="campaign-rename" title="重命名当前战役">' + RT.icon('edit', 15) + '</button>' +
      '</div>' +
      '<div class="meta-row"><span class="dim">' + countsText(camp.id) + '</span>' +
      '<span class="dim">更新于 ' + RT.fmtTime(new Date(camp.updatedAt || camp.createdAt || Date.now()).getTime()) + '</span></div>' +
      '</div>' +
      '<div class="head-actions">' +
      '<button class="btn ghost small" data-act="campaign-export">' + RT.icon('download', 14) + ' 导出本战役</button>' +
      '<button class="btn ghost small danger" data-act="campaign-delete">' + RT.icon('trash', 14) + ' 删除</button>' +
      '</div>' +
      '</div>' +
      '<div class="camp-tabs">' + tabs + '</div>' +
      '<div class="camp-body">' + (mod ? mod.view(camp.id) : '<p class="dim">还没有注册任何模块。</p>') + '</div>' +
      '</div>'
    );
  };

  RT.campaignSide = function () {
    const camp = RT.ws.activeCampaign();
    if (!camp) {
      return '<div class="side-summary">还没有战役</div><div class="side-tip">点主区的「新建战役」开始。新建会套用备团模板。</div>';
    }
    const mod = activeModule();
    if (!mod || typeof mod.side !== 'function') return '<div class="side-empty">这个模块没有侧栏</div>';
    return '<div class="side-camp">' + esc(camp.name) + '</div>' + mod.side(camp.id);
  };

  RT.campaignNewBtn = function () {
    const camp = RT.ws.activeCampaign();
    const mod = activeModule();
    if (!camp || !mod || typeof mod.newBtn !== 'function') return '';
    return mod.newBtn(camp.id);
  };

  /* ---------------- 动作 ---------------- */

  RT.acts['campaign-new'] = function () {
    RT.dialogs.prompt('新建战役', '', function (name) {
      const c = RT.ws.addCampaign(name);
      RT.state.ui.campaignId = c.id;
      RT.state.ui.campaignModule = RT.ws.modules[0] ? RT.ws.modules[0].id : null;
      RT.toast('已创建「' + c.name + '」，并套用备团模板');
      RT.rerender('all');
    }, '会套用备团模板：一条「备团八步」清单 + 一张空白会话工作表 + 角色 / NPC / 战役规划骨架，之后都可以删改。');
  };

  RT.acts['campaign-rename'] = function () {
    const camp = RT.ws.activeCampaign();
    if (!camp) return;
    RT.dialogs.prompt('重命名战役', camp.name, function (name) {
      if (RT.ws.renameCampaign(camp.id, name)) {
        RT.toast('已重命名');
        RT.rerender('all');
      }
    });
  };

  RT.acts['campaign-export'] = function () {
    const camp = RT.ws.activeCampaign();
    if (!camp) return;
    const md = RT.ws.exportCampaignMd(camp.id);
    RT.download(camp.name + '-' + RT.dateStamp() + '.md', md, 'text/markdown');
  };

  RT.acts['campaign-delete'] = function () {
    const camp = RT.ws.activeCampaign();
    if (!camp) return;
    const counts = RT.ws.campaignCounts(camp.id).map(function (c) {
      return c.name + ' ' + c.n + c.unit;
    }).join('、');
    RT.dialogs.confirm(
      '删除战役「' + camp.name + '」',
      '会连同这个战役下的全部内容一起删除：' + (counts || '（无内容）') + '。此操作不可撤销。',
      function () {
        RT.ws.removeCampaign(camp.id);
        const next = RT.ws.activeCampaign();
        RT.state.ui.campaignId = next ? next.id : null;
        RT.toast('已删除战役');
        RT.rerender('all');
      },
      true
    );
  };

  RT.acts['campaign-module'] = function (el) {
    RT.state.ui.campaignModule = el.getAttribute('data-id');
    RT.scheduleSave();
    RT.rerender('all');
    const main = document.querySelector('#main');
    if (main) main.scrollTop = 0;
  };

  RT.changeActs['campaign-switch'] = function (el) {
    RT.ws.setActiveCampaign(el.value);
    RT.state.ui.campaignId = el.value;
    RT.state.ui.campaignModule = activeModule() ? activeModule().id : null;
    RT.scheduleSave();
    RT.rerender('all');
  };

})(window.RT = window.RT || {});
