/* ============================================================
 * 20. 应用装配：渲染、事件、快捷键、命令面板、拖拽导入
 * ============================================================ */
(function (RT) {
  'use strict';

  const S = RT.state;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return RT.esc(s); }

  const app = (RT.app = {});

  /* ---------------- 主题 ---------------- */

  app.applyTheme = function () {
    const pref = S.prefs.theme;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const dark = pref === 'dark' || (pref === 'system' && mql.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.style.setProperty('--font-scale', String(S.prefs.fontScale));
    const btn = qs('#theme-btn');
    if (btn) {
      const label = pref === 'system' ? '跟随系统' : pref === 'dark' ? '暗色' : '亮色';
      btn.innerHTML = RT.icon(pref === 'system' ? 'monitor' : pref === 'dark' ? 'moon' : 'sun', 16);
      btn.title = '主题：' + label + '（点击切换）';
      btn.setAttribute('aria-label', '主题：' + label);
    }
    const fontOut = qs('#font-scale');
    if (fontOut) fontOut.textContent = Math.round(S.prefs.fontScale * 100) + '%';
  };

  function cycleTheme() {
    const order = ['system', 'light', 'dark'];
    const i = order.indexOf(S.prefs.theme);
    RT.actions.setTheme(order[(i + 1) % order.length]);
  }

  /* ---------------- 侧栏 ---------------- */

  const VIEWS = [
    ['tables', '随机表', 'grid'],
    ['combos', '组合', 'layers'],
    ['favorites', '收藏', 'star'],
    ['history', '历史', 'clock'],
    ['rules', '速查', 'book'],
    ['campaign', '战役', 'folder'],
  ];

  function tableItems() {
    const q = S.ui.search.trim().toLowerCase();
    return S.set.tables.filter(function (t) {
      if (!q) return true;
      return (t.name + ' ' + t.tags.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function comboItems() {
    const q = S.ui.search.trim().toLowerCase();
    return S.set.combos.filter(function (c) {
      if (!q) return true;
      return (c.name + ' ' + c.fields.map(function (f) { return f.label; }).join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function syncSidebarClass() {
    document.body.classList.toggle('sidebar-open', !!S.ui.sidebarOpen);
  }

  function sideTableRow(t) {
    return (
      '<div class="side-row' + (t.id === S.ui.tableId ? ' active' : '') + '" draggable="true" data-drag-table="' + t.id + '">' +
      '<button class="side-main" data-act="open-table" data-id="' + t.id + '" title="' + RT.attr(t.name) + '">' +
      '<span class="side-name">' + esc(t.name) + '</span>' +
      '<span class="side-meta">' + t.entries.length + '</span></button>' +
      '<button class="mini side-more" data-act="table-menu" data-id="' + t.id + '" title="更多操作">⋯</button>' +
      '</div>'
    );
  }

  function folderHead(f, count) {
    return (
      '<div class="folder-head" draggable="true" data-drag-folder="' + f.id + '" data-drop-folder="' + f.id + '">' +
      '<button class="folder-toggle" data-act="folder-toggle" data-id="' + f.id + '" title="' + (f.collapsed ? '展开' : '折叠') + '">' +
      RT.icon(f.collapsed ? 'chev-right' : 'chev-down', 13) +
      '<span class="folder-name">' + esc(f.name) + '</span>' +
      '<span class="folder-count">' + count + '</span></button>' +
      '<button class="mini side-more" data-act="folder-menu" data-id="' + f.id + '" title="分组操作">⋯</button>' +
      '</div>'
    );
  }

  /** 分组子树里的表总数（含所有后代分组） */
  function folderTableCount(id) {
    const ids = [id].concat(RT.actions.folderDescendants(id));
    return S.set.tables.filter(function (t) { return ids.indexOf(t.folderId) >= 0; }).length;
  }

  function renderFolderBlock(f) {
    const ownTables = S.set.tables.filter(function (t) { return t.folderId === f.id; });
    const kids = S.set.folders.filter(function (x) { return x.parentId === f.id; });
    return (
      '<div class="folder-block' + (f.collapsed ? ' collapsed' : '') + '">' +
      folderHead(f, folderTableCount(f.id)) +
      '<div class="folder-items">' +
      ownTables.map(sideTableRow).join('') +
      (!ownTables.length && !kids.length ? '<div class="folder-empty">拖表或分组到这里</div>' : '') +
      '</div>' +
      (kids.length ? '<div class="folder-children">' + kids.map(renderFolderBlock).join('') + '</div>' : '') +
      '</div>'
    );
  }

  /** 按树的顺序展平分组，带层级深度 */
  function folderFlatList() {
    const out = [];
    (function walk(parentId, depth) {
      S.set.folders.filter(function (f) { return (f.parentId || null) === (parentId || null); }).forEach(function (f) {
        out.push({ folder: f, depth: depth });
        walk(f.id, depth + 1);
      });
    })(null, 0);
    return out;
  }

  function renderSideList() {
    syncSidebarClass();
    const list = qs('#side-list');
    if (!list) return;
    // 重渲染会重建列表内容，先记住滚动位置，否则每次点选都会跳回顶部
    const keepTop = list.scrollTop;

    if (S.ui.view === 'tables') {
      const searching = !!S.ui.search.trim();
      if (searching) {
        const items = tableItems();
        list.innerHTML = items.length
          ? items.map(sideTableRow).join('')
          : '<div class="side-empty">没有匹配的表</div>';
        list.scrollTop = keepTop;
        return;
      }

      const roots = S.set.folders.filter(function (f) { return !f.parentId; });
      const ungrouped = S.set.tables.filter(function (t) { return !t.folderId; });
      let html = roots.map(renderFolderBlock).join('');

      if (ungrouped.length || !S.set.folders.length) {
        html += '<div class="folder-block folder-flat">' +
          (S.set.folders.length ? '<div class="folder-head plain" data-drop-folder=""><span class="folder-name">未分组</span><span class="folder-count">' + ungrouped.length + '</span></div>' : '') +
          '<div class="folder-items">' + ungrouped.map(sideTableRow).join('') + '</div></div>';
      }

      if (!S.set.tables.length) {
        html += '<div class="side-empty">还没有表</div>';
      }
      list.innerHTML = html;
    } else if (S.ui.view === 'combos') {
      const items = comboItems();
      list.innerHTML = items.length
        ? items.map(function (c) {
            return '<button class="side-item' + (c.id === S.ui.comboId ? ' active' : '') + '" data-act="open-combo" data-id="' + c.id + '">' +
              '<span class="side-name">' + esc(c.name) + '</span>' +
              '<span class="side-meta">' + c.fields.length + '</span></button>';
          }).join('')
        : '<div class="side-empty">' + (S.ui.search ? '没有匹配的组合' : '还没有组合') + '</div>';
    } else if (S.ui.view === 'favorites' || S.ui.view === 'history') {
      list.innerHTML =
        '<div class="side-summary">收藏 <strong>' + S.set.favorites.length + '</strong> 条</div>' +
        '<div class="side-summary">历史 <strong>' + S.set.history.length + '</strong> 次</div>' +
        '<div class="side-tip">收藏与历史会随表组一起导出。</div>';
    } else if (S.ui.view === 'campaign') {
      list.innerHTML = RT.campaignSide ? RT.campaignSide() : '<div class="side-empty">战役模块未加载</div>';
    } else if (S.ui.view === 'rules') {
      list.innerHTML = RT.rulesSide ? RT.rulesSide() : '<div class="side-empty">规则模块未加载</div>';
    }

    list.scrollTop = keepTop;
  }

  function sideScrollTop() {
    const list = qs('#side-list');
    return list ? list.scrollTop : 0;
  }

  function restoreSideScroll(top) {
    if (!top) return;
    const list = qs('#side-list');
    if (!list) return;
    list.scrollTop = top;
    // 布局稳定后再兜一次（折叠/搜索导致高度变化时也能回到原位）
    requestAnimationFrame(function () {
      const again = qs('#side-list');
      if (again && again.scrollTop !== top) again.scrollTop = top;
    });
  }

  app.renderSidebar = function () {
    syncSidebarClass();
    const aside = qs('#sidebar');
    if (!aside) return;
    // 侧栏整体重建会丢掉列表的滚动位置，先存下来
    const keepTop = sideScrollTop();
    const newBtn = S.ui.view === 'combos'
      ? '<button class="side-new" data-act="new-combo">' + RT.icon('plus', 15) + ' 新建组合</button>'
      : S.ui.view === 'tables'
        ? '<div class="side-new-row">' +
          '<button class="side-new" data-act="new-table">' + RT.icon('plus', 15) + ' 新建表</button>' +
          '<button class="side-new compact" data-act="new-folder" title="新建分组">' + RT.icon('plus', 15) + ' 分组</button>' +
          '</div>'
        : S.ui.view === 'campaign'
          ? (RT.campaignNewBtn ? RT.campaignNewBtn() : '')
          : S.ui.view === 'rules'
            ? (RT.rulesNewBtn ? RT.rulesNewBtn() : '')
            : '';

    const showSearch = S.ui.view === 'tables' || S.ui.view === 'combos';

    const treeBar = S.ui.view === 'tables' && S.set.folders.length && !S.ui.search.trim()
      ? '<div class="side-tree-bar">' +
        '<button class="tree-btn" data-act="fold-all" data-mode="expand" title="展开全部分组">' + RT.icon('chev-down', 12) + '展开</button>' +
        '<button class="tree-btn" data-act="fold-all" data-mode="collapse" title="收起全部分组">' + RT.icon('chev-right', 12) + '收起</button>' +
        '</div>'
      : '';

    aside.innerHTML =
      '<div class="side-tabs">' + VIEWS.map(function (v) {
        return '<button class="side-tab' + (S.ui.view === v[0] ? ' active' : '') + '" data-act="view" data-view="' + v[0] + '" title="' + v[1] + '">' +
          RT.icon(v[2], 15) + '<span>' + v[1] + '</span></button>';
      }).join('') + '</div>' +
      (showSearch
        ? '<div class="side-search">' + RT.icon('search', 14) +
          '<input id="side-search-input" data-act="search" placeholder="搜索" value="' + RT.attr(S.ui.search) + '"></div>'
        : '') +
      treeBar +
      '<div class="side-list" id="side-list"></div>' +
      newBtn +
      '<div class="side-foot"><span class="dim">离线存储 · 自动保存</span></div>';

    renderSideList();
    restoreSideScroll(keepTop);

    const tabs = qs('#mobile-tabs');
    if (tabs) {
      tabs.innerHTML = VIEWS.map(function (v) {
        return '<button class="mtab' + (S.ui.view === v[0] ? ' active' : '') + '" data-act="view" data-view="' + v[0] + '">' +
          RT.icon(v[2], 18) + '<span>' + v[1] + '</span></button>';
      }).join('');
    }
  };

  /* ---------------- 主区 ---------------- */

  function renderMain() {
    const main = qs('#main');
    if (!main) return;
    const view = S.ui.view;
    main.className = 'main view-' + view;
    if (view === 'tables') main.innerHTML = RT.viewTable();
    else if (view === 'combos') main.innerHTML = RT.viewCombo();
    else if (view === 'campaign') main.innerHTML = RT.viewCampaign();
    else if (view === 'rules') main.innerHTML = RT.viewRules();
    else main.innerHTML = RT.viewLibrary();
  }

  app.rerender = function (scope) {
    if (scope === 'sidebar') { renderSideList(); return; }
    if (scope === 'main') { renderMain(); return; }
    app.renderSidebar();
    renderMain();
    app.applyTheme();
  };

  /* 视图模块里统一用 RT.rerender */
  RT.rerender = function (scope) { app.rerender(scope); };

  /* ---------------- 事件 ---------------- */

  function tableIdFrom(el) {
    return S.ui.tableId;
  }

  function onInput(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (RT.inputActs && typeof RT.inputActs[act] === 'function') {
      RT.inputActs[act](el, e);
      return;
    }
    const t = RT.currentTable();
    const c = RT.currentCombo();

    switch (act) {
      case 'search':
        RT.actions.setSearch(el.value);
        break;
      case 'table-name': {
        if (!t) break;
        const trimmed = el.value.trim();
        const conflict = !!trimmed && RT.actions.tableNameTaken(trimmed, t.id);
        const msg = !trimmed ? '表名不能为空' : conflict ? '已有同名表，请换一个名字' : '';
        setTableNameError(msg);
        el.classList.toggle('invalid', !!msg);
        if (!msg) {
          RT.actions.updateTable(t.id, { name: trimmed }, { rerender: false });
          RT.rerender('sidebar');
        }
        break;
      }
      case 'table-dice':
        if (t) RT.actions.updateTable(t.id, { dice: el.value });
        break;
      case 'table-tags':
        if (t) RT.actions.updateTable(t.id, {
          tags: el.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean),
        });
        break;
      case 'entry-text':
      case 'entry-weight':
      case 'entry-range-min':
      case 'entry-range-max': {        const row = el.closest('.entry-row');
        if (!t || !row) break;
        const eid = row.getAttribute('data-eid');
        const entry = t.entries.find(function (x) { return x.id === eid; });
        if (!entry) break;
        if (act === 'entry-text') RT.actions.updateEntry(t.id, eid, { text: el.value });
        else if (act === 'entry-weight') {
          const w = parseFloat(el.value);
          RT.actions.updateEntry(t.id, eid, { weight: isFinite(w) ? w : 1 });
        } else {
          const minEl = qs('[data-act="entry-range-min"]', row);
          const maxEl = qs('[data-act="entry-range-max"]', row);
          const min = minEl.value === '' ? NaN : Number(minEl.value);
          const max = maxEl.value === '' ? NaN : Number(maxEl.value);
          const range = isFinite(min) && isFinite(max) ? [min, max] : null;
          RT.actions.updateEntry(t.id, eid, { range: range });
        }
        break;
      }
      case 'table-times': {
        const n = Number(el.value);
        if (isFinite(n)) RT.actions.setTableTimes(n);
        break;
      }
      case 'bulk-text':
        break;
      case 'fav-note': {
        const id = el.getAttribute('data-id');
        if (id) RT.actions.updateFavoriteNote(id, el.value);
        break;
      }
      case 'combo-name':
        if (c) RT.actions.updateCombo(c.id, { name: el.value }, { rerender: false });
        break;
      case 'combo-template':
        if (c) RT.actions.updateCombo(c.id, { template: el.value }, { rerender: false });
        break;
      case 'field-label':
      case 'field-rolls':
      case 'field-sep': {
        const row = el.closest('.field-row');
        if (!c || !row) break;
        const fid = row.getAttribute('data-fid');
        if (act === 'field-label') RT.actions.updateField(c.id, fid, { label: el.value }, { rerender: false });
        else if (act === 'field-rolls') RT.actions.updateField(c.id, fid, { rolls: Math.min(20, Math.max(1, Number(el.value) || 1)) }, { rerender: false });
        else RT.actions.updateField(c.id, fid, { sep: el.value }, { rerender: false });
        break;
      }
      default:
        break;
    }
  }

  function onChange(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (RT.changeActs && typeof RT.changeActs[act] === 'function') {
      RT.changeActs[act](el, e);
      return;
    }
    if (act === 'table-dice') {
      RT.rerender('main');
    } else if (act === 'table-tags') {
      RT.rerender('sidebar');
    } else if (act === 'table-name') {
      const t = RT.currentTable();
      if (!t) return;
      const bad = RT.actions.tableNameTaken(el.value, t.id);
      if (bad) {
        el.value = t.name;
        el.classList.remove('invalid');
        setTableNameError('');
        RT.toast('表名不能为空或重名，已还原', 'warn');
      } else {
        el.value = t.name;
        el.classList.remove('invalid');
        setTableNameError('');
      }
    } else if (act === 'table-folder') {
      const t = RT.currentTable();
      if (t) RT.actions.moveTable(t.id, el.value || null);
    } else if (act === 'field-table') {
      const c = RT.currentCombo();
      const row = el.closest('.field-row');
      if (!c || !row) return;
      const fid = row.getAttribute('data-fid');
      const field = c.fields.find(function (f) { return f.id === fid; });
      const oldTable = field ? S.set.tables.find(function (t) { return t.id === field.tableId; }) : null;
      const newTable = S.set.tables.find(function (t) { return t.id === el.value; });
      const patch = { tableId: el.value };
      if (field && oldTable && newTable && field.label === oldTable.name) patch.label = newTable.name;
      RT.actions.updateField(c.id, fid, patch);
    } else if (act === 'entry-weight' || act === 'table-times') {
      /* 已在 input 里处理 */
    }
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (RT.acts && typeof RT.acts[act] === 'function') {
      RT.acts[act](el, e);
      return;
    }
    const t = RT.currentTable();
    const c = RT.currentCombo();

    switch (act) {
      /* 导航 */
      case 'view': RT.actions.selectView(el.getAttribute('data-view')); return;
      case 'open-table': RT.actions.selectTable(el.getAttribute('data-id')); return;
      case 'open-combo': RT.actions.selectCombo(el.getAttribute('data-id')); return;
      case 'sidebar-toggle': RT.actions.toggleSidebar(); return;

      /* 分组 */
      case 'new-folder':
        RT.dialogs.prompt('新建分组', '', function (name) {
          RT.actions.addFolder(name);
          RT.toast('已新建分组「' + name + '」');
        }, '给分组起个名字，例如「NPC 人物」「环境与事件」。建好后可以把表拖进去。');
        return;
      case 'folder-toggle':
        RT.actions.toggleFolder(el.getAttribute('data-id'));
        return;
      case 'fold-all':
        RT.actions.setAllFoldersCollapsed(el.getAttribute('data-mode') === 'collapse');
        return;
      case 'folder-menu': {
        const folder = S.set.folders.find(function (x) { return x.id === el.getAttribute('data-id'); });
        if (!folder) return;
        const count = folderTableCount(folder.id);
        const kids = RT.actions.folderDescendants(folder.id).length;
        const items = [
          {
            label: '重命名分组', icon: 'edit', onClick: function () {
              RT.dialogs.prompt('重命名分组', folder.name, function (name) {
                RT.actions.renameFolder(folder.id, name);
              });
            },
          },
          {
            label: '新建子分组', icon: 'folder', onClick: function () {
              RT.dialogs.prompt('新建子分组', '', function (name) {
                RT.actions.addFolder(name, folder.id);
                RT.toast('已在「' + folder.name + '」下新建「' + name + '」');
              }, '它会挂在「' + folder.name + '」里面。');
            },
          },
          {
            label: '在这个分组新建表', icon: 'plus', onClick: function () {
              createTableDialog(folder.id);
            },
          },
        ];
        if (folder.parentId) {
          const parent = S.set.folders.find(function (x) { return x.id === folder.parentId; });
          items.push({
            label: '移到上一级' + (parent ? '（' + parent.name + '）' : ''), icon: 'up', onClick: function () {
              RT.actions.moveFolder(folder.id, parent ? parent.parentId : null);
            },
          });
        }
        items.push({ sep: true });
        items.push({
          label: '删除分组', icon: 'trash', danger: true, onClick: function () {
            RT.dialogs.folderDelete(folder, count, kids, function () {
              RT.actions.deleteFolder(folder.id, 'keep');
            }, function () {
              RT.actions.deleteFolder(folder.id, 'delete');
            });
          },
        });
        openMenu(el, items);
        return;
      }
      case 'table-menu': {
        const t = S.set.tables.find(function (x) { return x.id === el.getAttribute('data-id'); });
        if (!t) return;
        const items = [
          {
            label: '打开并重命名', icon: 'edit', onClick: function () {
              if (S.ui.tableId !== t.id) RT.actions.selectTable(t.id);
              focusTableName();
            },
          },
          { sep: true },
          {
            label: '未分组', active: !t.folderId, onClick: function () {
              RT.actions.moveTable(t.id, null);
            },
          },
        ];
        folderFlatList().forEach(function (entry) {
          const indent = entry.depth ? '\u3000'.repeat(entry.depth) + '└ ' : '';
          items.push({
            label: indent + entry.folder.name,
            active: t.folderId === entry.folder.id,
            onClick: function () { RT.actions.moveTable(t.id, entry.folder.id); },
          });
        });
        items.push({ sep: true });
        items.push({ label: '复制表', icon: 'copy', onClick: function () { RT.actions.duplicateTable(t.id); } });
        items.push({
          label: '删除表', icon: 'trash', danger: true, onClick: function () {
            RT.dialogs.confirm('删除表', '确定删除「' + t.name + '」？这张表的 ' + t.entries.length + ' 条内容会一起消失（会先存一份快照）。', function () {
              RT.actions.deleteTable(t.id);
            }, true);
          },
        });
        openMenu(el, items);
        return;
      }

      /* 头部 */
      case 'theme': cycleTheme(); return;
      case 'font-inc': RT.actions.setFontScale(S.prefs.fontScale + 0.05); return;
      case 'font-dec': RT.actions.setFontScale(S.prefs.fontScale - 0.05); return;
      case 'io': RT.dialogs.io('export'); return;
      case 'palette': openPalette(); return;

      /* 表 */
      case 'new-table': {
        createTableDialog(null);
        return;
      }
      case 'load-sample':
        RT.dialogs.confirm('载入核心表包', '当前数据会被「即兴核心包」替换（会先存一份快照）。', function () {
          RT.actions.loadSample();
          RT.toast('已载入即兴核心包');
        });
        return;
      case 'table-duplicate': if (t) RT.actions.duplicateTable(t.id); return;
      case 'table-delete':
        if (t) RT.dialogs.confirm('删除表', '确定删除「' + t.name + '」？这张表的 ' + t.entries.length + ' 条内容会一起消失（会先存一份快照）。', function () {
          RT.actions.deleteTable(t.id);
        }, true);
        return;

      /* 条目 */
      case 'entry-add': {
        if (!t) return;
        RT.actions.addEntry(t.id);
        setTimeout(function () {
          const rows = qsa('.entry-row');
          const last = rows[rows.length - 1];
          if (last) { const inp = qs('.entry-text', last); if (inp) inp.focus(); }
        }, 20);
        return;
      }
      case 'toggle-bulk': {
        const panel = qs('.bulk-panel');
        if (!panel) return;
        const open = panel.getAttribute('data-open') !== 'true';
        panel.setAttribute('data-open', open ? 'true' : 'false');
        if (open) { const ta = qs('[data-act="bulk-text"]'); if (ta) ta.focus(); }
        return;
      }
      case 'bulk-close': {
        const panel = qs('.bulk-panel');
        if (panel) panel.setAttribute('data-open', 'false');
        return;
      }
      case 'bulk-add': {
        if (!t) return;
        const ta = qs('[data-act="bulk-text"]');
        const text = ta ? ta.value : '';
        const entries = parseBulk(text);
        if (!entries.length) { RT.toast('没有解析到条目', 'warn'); return; }
        RT.actions.addEntries(t.id, entries);
        if (ta) ta.value = '';
        RT.toast('已添加 ' + entries.length + ' 条');
        return;
      }
      case 'entry-up': case 'entry-down': {
        const row = el.closest('.entry-row');
        if (!t || !row) return;
        RT.actions.moveEntry(t.id, row.getAttribute('data-eid'), act === 'entry-up' ? -1 : 1);
        return;
      }
      case 'entry-del': {
        const row = el.closest('.entry-row');
        if (!t || !row) return;
        RT.actions.deleteEntry(t.id, row.getAttribute('data-eid'));
        return;
      }
      case 'roll-table': RT.actions.rollTableNow(); return;
      case 'copy-table-result': {
        const r = S.results.table;
        if (r) RT.copyText(r.text);
        return;
      }
      case 'favorite-table-result': RT.actions.favoriteTableResult(); return;

      /* 组合 */
      case 'new-combo': RT.actions.addCombo(); return;
      case 'combo-duplicate': if (c) RT.actions.duplicateCombo(c.id); return;
      case 'combo-delete':
        if (c) RT.dialogs.confirm('删除组合', '确定删除「' + c.name + '」？（不会影响它引用的表）', function () {
          RT.actions.deleteCombo(c.id);
        }, true);
        return;
      case 'field-add': if (c) RT.actions.addField(c.id); return;
      case 'field-del': {
        const row = el.closest('.field-row');
        if (!c || !row) return;
        RT.actions.deleteField(c.id, row.getAttribute('data-fid'));
        return;
      }
      case 'field-up': case 'field-down': {
        const row = el.closest('.field-row');
        if (!c || !row) return;
        RT.actions.moveField(c.id, row.getAttribute('data-fid'), act === 'field-up' ? -1 : 1);
        return;
      }
      case 'insert-token': {
        const ta = qs('[data-act="combo-template"]');
        if (!ta) return;
        const token = el.getAttribute('data-token');
        const start = ta.selectionStart || 0;
        const end = ta.selectionEnd || 0;
        ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
        if (c) RT.actions.updateCombo(c.id, { template: ta.value }, { rerender: false });
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + token.length;
        return;
      }
      case 'roll-combo': RT.actions.rollComboNow(); return;
      case 'chip-lock': if (c) RT.actions.toggleLock(c.id, el.getAttribute('data-field')); return;
      case 'chip-reroll': if (c) RT.actions.rerollField(c.id, el.getAttribute('data-field')); return;
      case 'unlock-all': if (c) RT.actions.unlockAll(c.id); return;
      case 'copy-combo-result': {
        const r = S.results.combo;
        if (r) RT.copyText(r.text);
        return;
      }
      case 'favorite-result': RT.actions.saveFavorite(); return;
      case 'save-result-entry': {
        const r = S.results.combo;
        const sel = qs('[data-act="save-target"]');
        if (!r || !sel) return;
        RT.actions.saveTextAsEntry(sel.value, r.text);
        return;
      }

      /* 收藏 / 历史 */
      case 'fav-copy': RT.copyText(el.getAttribute('data-text')); return;
      case 'fav-save': RT.dialogs.saveEntry(el.getAttribute('data-text')); return;
      case 'fav-del': RT.actions.deleteFavorite(el.getAttribute('data-id')); return;
      case 'history-copy': RT.copyText(el.getAttribute('data-text')); return;
      case 'history-replay': RT.actions.replayHistory(el.getAttribute('data-id')); return;
      case 'clear-history':
        RT.dialogs.confirm('清空历史', '历史记录会全部删除（不影响表和组合）。', function () {
          RT.actions.clearHistory();
        }, true);
        return;
      default:
        return;
    }
  }

  function parseBulk(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean).map(function (line) {
      const parts = line.split('|').map(function (s) { return s.trim(); });
      const body = parts[0];
      let weight = 1;
      let range = null;
      function takeRange(str) {
        const m = String(str).match(/^(-?\d+)\s*-\s*(-?\d+)$/);
        if (m) { range = [Number(m[1]), Number(m[2])]; return true; }
        return false;
      }
      if (parts[1] !== undefined && parts[1] !== '') {
        if (!takeRange(parts[1])) {
          const w = Number(parts[1]);
          if (isFinite(w)) weight = w;
        }
      }
      if (parts[2] !== undefined && parts[2] !== '') takeRange(parts[2]);
      return RT.entry(body, weight, range);
    });
  }

  /* ---------------- 命令面板 ---------------- */

  let paletteEl = null;
  let paletteIndex = 0;
  let paletteItems = [];

  function allItems() {
    const out = [];
    S.set.tables.forEach(function (t) {
      out.push({ kind: 'table', id: t.id, name: t.name, sub: t.entries.length + ' 条', icon: 'grid' });
    });
    S.set.combos.forEach(function (c) {
      out.push({ kind: 'combo', id: c.id, name: c.name, sub: c.fields.length + ' 个字段', icon: 'layers' });
    });
    return out;
  }

  function renderPaletteList(query) {
    const q = String(query || '').trim().toLowerCase();
    paletteItems = allItems().filter(function (it) {
      return !q || (it.name + ' ' + it.sub).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40);
    if (paletteIndex >= paletteItems.length) paletteIndex = 0;
    const list = qs('#palette-list');
    if (!list) return;
    list.innerHTML = paletteItems.length
      ? paletteItems.map(function (it, i) {
          return '<button class="palette-item' + (i === paletteIndex ? ' active' : '') + '" data-pi="' + i + '">' +
            RT.icon(it.icon, 15) +
            '<span class="pi-name">' + esc(it.name) + '</span>' +
            '<span class="pi-sub">' + esc(it.sub) + '</span></button>';
        }).join('')
      : '<div class="palette-empty">没有匹配项</div>';
  }

  function openPalette() {
    if (paletteEl) return;
    paletteEl = document.createElement('div');
    paletteEl.className = 'palette-root';
    paletteEl.innerHTML =
      '<div class="palette-backdrop" data-pclose="1"></div>' +
      '<div class="palette">' +
      '<div class="palette-input">' + RT.icon('search', 16) +
      '<input id="palette-input" placeholder="跳到表或组合…（回车打开）" autocomplete="off"></div>' +
      '<div id="palette-list"></div>' +
      '<div class="palette-foot"><kbd>↑</kbd><kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭</div>' +
      '</div>';
    document.body.appendChild(paletteEl);
    paletteIndex = 0;
    renderPaletteList('');

    const input = qs('#palette-input');
    input.focus();
    input.addEventListener('input', function () { paletteIndex = 0; renderPaletteList(input.value); });

    paletteEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-pclose]')) { closePalette(); return; }
      const item = e.target.closest('[data-pi]');
      if (item) choosePalette(Number(item.getAttribute('data-pi')));
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteItems.length - 1, paletteIndex + 1); renderPaletteList(input.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); renderPaletteList(input.value); }
      else if (e.key === 'Enter') { e.preventDefault(); choosePalette(paletteIndex); }
    });
  }

  function choosePalette(i) {
    const it = paletteItems[i];
    if (!it) return;
    closePalette();
    if (it.kind === 'table') RT.actions.selectTable(it.id);
    else RT.actions.selectCombo(it.id);
  }

  function closePalette() {
    if (!paletteEl) return;
    paletteEl.remove();
    paletteEl = null;
  }

  /* ---------------- 弹出菜单 ---------------- */

  let menuEl = null;

  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  function openMenu(anchor, items) {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'menu-pop';
    el.innerHTML = items.map(function (it, i) {
      if (it.sep) return '<div class="menu-sep"></div>';
      return '<button class="menu-item' + (it.danger ? ' danger' : '') + '" data-mi="' + i + '">' +
        (it.icon ? RT.icon(it.icon, 14) : '<span class="mi-dot"></span>') +
        '<span class="mi-label">' + esc(it.label) + '</span>' +
        (it.active ? RT.icon('check', 13) : '') +
        '</button>';
    }).join('');
    document.body.appendChild(el);

    const rect = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = Math.min(rect.left, window.innerWidth - w - 10);
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 10) top = Math.max(10, rect.top - h - 6);
    el.style.left = Math.max(10, left) + 'px';
    el.style.top = top + 'px';

    el.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-mi]');
      if (!btn) return;
      const it = items[Number(btn.getAttribute('data-mi'))];
      closeMenu();
      if (it && it.onClick) it.onClick();
    });
    menuEl = el;
  }

  function focusTableName() {
    setTimeout(function () {
      const inp = qs('[data-act="table-name"]');
      if (inp) { inp.focus(); inp.select(); }
    }, 40);
  }

  function setTableNameError(msg) {
    const el = qs('#table-name-error');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  /** 新建表弹窗：默认名唯一，重名/空名时禁用确定 */
  function createTableDialog(folderId) {
    const folder = folderId ? S.set.folders.find(function (f) { return f.id === folderId; }) : null;
    const suggested = RT.actions.uniqueTableName('新表 ' + (S.set.tables.length + 1));
    RT.dialogs.prompt(
      '新建表',
      suggested,
      function (name) {
        const created = RT.actions.addTable(name, folderId || null);
        if (created) focusTableName();
      },
      folder ? '会放进「' + folder.name + '」里。表名不能与已有表重复。' : '表名不能与已有表重复。',
      function (name) {
        if (!name) return '表名不能为空';
        return RT.actions.tableNameTaken(name) ? '已有同名表「' + name + '」，请换一个名字' : '';
      }
    );
  }

  /* ---------------- 键盘 / 拖拽 ---------------- */

  function bindGlobal() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);

    document.addEventListener('click', function (e) {
      if (!menuEl) return;
      if (e.target.closest('.menu-pop')) return;
      closeMenu();
    }, true);

    /* 拖动表 / 分组到分组 */
    document.addEventListener('dragstart', function (e) {
      const el0 = e.target instanceof Element ? e.target : null;
      if (!el0) return;

      const folderEl = el0.closest('[data-drag-folder]');
      if (folderEl) {
        e.dataTransfer.setData('text/plain', 'folder:' + folderEl.getAttribute('data-drag-folder'));
        e.dataTransfer.effectAllowed = 'move';
        folderEl.classList.add('dragging-row');
        return;
      }

      const row = el0.closest('[data-drag-table]');
      if (!row) return;
      e.dataTransfer.setData('text/plain', 'table:' + row.getAttribute('data-drag-table'));
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging-row');
    });

    document.addEventListener('dragend', function (e) {
      const el0 = e.target instanceof Element ? e.target : null;
      const row = el0 && (el0.closest('[data-drag-table]') || el0.closest('[data-drag-folder]'));
      if (row) row.classList.remove('dragging-row');
      qsa('.drop-hover').forEach(function (x) { x.classList.remove('drop-hover'); });
    });

    document.addEventListener('dragover', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) return;
      const el0 = e.target instanceof Element ? e.target : null;
      const head = el0 && el0.closest('[data-drop-folder]');
      if (!head) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!head.classList.contains('drop-hover')) {
        qsa('.drop-hover').forEach(function (x) { x.classList.remove('drop-hover'); });
        head.classList.add('drop-hover');
      }
    });

    document.addEventListener('dragleave', function (e) {
      const el0 = e.target instanceof Element ? e.target : null;
      const head = el0 && el0.closest('[data-drop-folder]');
      if (head && !head.contains(e.relatedTarget)) head.classList.remove('drop-hover');
    });

    document.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) return;
      const el0 = e.target instanceof Element ? e.target : null;
      const head = el0 && el0.closest('[data-drop-folder]');
      if (!head) return;
      e.preventDefault();
      e.stopPropagation();
      head.classList.remove('drop-hover');
      const payload = e.dataTransfer.getData('text/plain');
      if (!payload) return;
      const targetId = head.getAttribute('data-drop-folder') || null;
      if (payload.indexOf('folder:') === 0) {
        RT.actions.moveFolder(payload.slice(7), targetId);
      } else {
        RT.actions.moveTable(payload.replace(/^table:/, ''), targetId);
      }
    });

    document.addEventListener('keydown', function (e) {
      const target = e.target;
      const typing = target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.key === 'Escape') {
        if (menuEl) { closeMenu(); return; }
        if (paletteEl) { closePalette(); return; }
        if (RT.dialogs.isOpen()) { RT.dialogs.close(); return; }
      }
      if (e.key === ' ' && !typing && !RT.dialogs.isOpen() && !paletteEl) {
        if (S.ui.view === 'tables') { e.preventDefault(); RT.actions.rollTableNow(); }
        else if (S.ui.view === 'combos') { e.preventDefault(); RT.actions.rollComboNow(); }
      }
    });

    let dragDepth = 0;

    function isFileDrag(e) {
      const dt = e.dataTransfer;
      if (!dt) return false;
      const types = dt.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (types[i] === 'Files') return true;
      }
      return false;
    }

    window.addEventListener('dragenter', function (e) {
      if (!isFileDrag(e)) return;
      dragDepth++;
      document.body.classList.add('dragging');
    });
    window.addEventListener('dragover', function (e) {
      // 只拦住文件拖拽，内部拖动表由分组标题自己处理
      if (isFileDrag(e)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    window.addEventListener('dragleave', function () {
      if (dragDepth <= 0) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) document.body.classList.remove('dragging');
    });
    document.addEventListener('dragend', function () {
      dragDepth = 0;
      document.body.classList.remove('dragging');
    });
    window.addEventListener('drop', function (e) {
      dragDepth = 0;
      document.body.classList.remove('dragging');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      if (!/\.json$/i.test(file.name)) { RT.toast('只支持拖入 .json 表组文件', 'warn'); return; }
      const reader = new FileReader();
      reader.onload = function () {
        RT.dialogs.io('import', String(reader.result || ''));
        RT.toast('已读取「' + file.name + '」');
      };
      reader.readAsText(file, 'utf-8');
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (S.prefs.theme === 'system') app.applyTheme();
    });

    window.addEventListener('beforeunload', function () { RT.saveNow(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') RT.saveNow();
    });
  }

  /* ---------------- 启动 ---------------- */

  app.init = function () {
    RT.loadState();

    /* 战役 / 规则包：把上次的选择对齐到真实数据 */
    const camp = RT.ws.activeCampaign();
    if (camp) {
      RT.ws.setActiveCampaign(camp.id);
      RT.state.ui.campaignId = camp.id;
    } else {
      RT.state.ui.campaignId = null;
    }
    if (!RT.ws.module(RT.state.ui.campaignModule)) {
      RT.state.ui.campaignModule = RT.ws.modules[0] ? RT.ws.modules[0].id : null;
    }
    const rs = RT.ws.rulesState();
    if (RT.state.ui.rulesId && rs.packs.some(function (p) { return p.id === RT.state.ui.rulesId; })) {
      rs.activeId = RT.state.ui.rulesId;
      RT.ws.saveRules(rs);
    } else if (rs.packs[0]) {
      RT.state.ui.rulesId = rs.activeId || rs.packs[0].id;
    }

    app.applyTheme();
    const setname = qs('#setname');
    if (setname) {
      setname.value = S.set.name;
      setname.addEventListener('input', function () { RT.actions.renameSet(setname.value); });
    }

    const search = qs('#side-search-input');
    if (search) search.setAttribute('autocomplete', 'off');

    app.rerender('all');
    bindGlobal();

    if (S.firstRun) {
      setTimeout(function () {
        RT.toast('初次见面：已载入「即兴核心包」（' + S.set.tables.length + ' 张表 / ' + S.set.combos.length + ' 个组合），点侧栏「组合」试试一键生成 NPC');
      }, 600);
    }
    if (S.migratedFromSample) {
      setTimeout(function () {
        RT.toast('旧的内置示例表已清空，替换为「即兴核心包」；旧表在 导入/导出 → 备份 里可找回', 'warn');
      }, 600);
    }
    if (!RT.storage.available) {
      setTimeout(function () {
        RT.toast('浏览器禁止了本地存储，数据只在本次会话有效——记得先导出', 'warn');
      }, 1200);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', app.init);
  } else {
    app.init();
  }

})(window.RT = window.RT || {});
