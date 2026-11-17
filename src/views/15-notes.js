/* ============================================================
 * 15. 战役模块：笔记
 *     清单 / 自由笔记，按战役隔离；支持模板快速建条。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const store = RT.ws.store(RT.ws.KEYS.notes);
  const cache = {};

  /* ---------------- 数据 ---------------- */

  function data(cid) {
    if (!cache[cid]) {
      const d = store.get(cid);
      cache[cid] = d && Array.isArray(d.entries) ? d : { entries: [] };
    }
    return cache[cid];
  }

  function persist(cid, d) {
    cache[cid] = d;
    store.set(cid, d);
    RT.ws.touchCampaign(cid);
  }

  /** 结构改动作与逐字输入都立即落盘：笔记体量小，写一次只有几 KB，
   *  这样侧栏计数与切换视图都不会读到旧数据。 */
  function save(cid, d) {
    persist(cid, d);
  }

  function find(d, id) {
    return d.entries.filter(function (e) { return e.id === id; })[0] || null;
  }

  function doneCount(e) {
    return (e.items || []).filter(function (i) { return i.done; }).length;
  }

  /* ---------------- 模板 ---------------- */

  const TEMPLATES = {
    prep8: {
      label: '备团八步（清单）',
      kind: 'checklist',
      title: '备团八步',
      items: [
        '复习角色：名字、背景、能力，让内容围着角色转',
        '造一个强开场：第一分钟就上动作场面',
        '列出可能出现的场景（不写死顺序）',
        '定 10 条秘密与线索，每条都能指向下一步',
        '发展奇幻地点：好玩的场地与视觉奇观',
        '列出重要 NPC：名字 + 动机 + 他知道的秘密',
        '挑相关怪物：按剧情挑，不按数值空转',
        '选魔法物品奖励：让玩家看得见成长',
      ],
    },
    secrets: {
      label: '秘密与线索（十条清单）',
      kind: 'checklist',
      title: '秘密与线索',
      items: ['', '', '', '', '', '', '', '', '', ''],
    },
    scenes: {
      label: '可能场景（清单）',
      kind: 'checklist',
      title: '可能出现的场景',
      items: ['', '', '', '', ''],
    },
    npc: {
      label: 'NPC 速记',
      kind: 'free',
      title: 'NPC 速记',
      body: '名字：\n一句话动机：\n他知道的秘密：\n与队伍的关系：\n口癖 / 特征：',
    },
    monsters: {
      label: '怪物清单',
      kind: 'checklist',
      title: '可能面对的怪物',
      items: ['', '', ''],
    },
    loot: {
      label: '宝物奖励',
      kind: 'checklist',
      title: '魔法物品奖励',
      items: ['', '', ''],
    },
    free: { label: '空白笔记', kind: 'free', title: '', body: '' },
  };

  function makeEntry(tplKey, title) {
    const tpl = TEMPLATES[tplKey] || TEMPLATES.free;
    return {
      id: RT.ws.uid('nt'),
      kind: tpl.kind,
      title: String(title || '').trim() || tpl.title || '新笔记',
      body: tpl.body || '',
      items: tpl.kind === 'checklist'
        ? (tpl.items || []).map(function (t) { return { id: RT.ws.uid('it'), text: t, done: false }; })
        : [],
      pinned: false,
      ts: Date.now(),
    };
  }

  /* ---------------- 过滤 ---------------- */

  function visible(d) {
    const ui = RT.state.ui;
    const q = String(ui.notesQuery || '').trim().toLowerCase();
    const filter = ui.notesFilter || 'all';
    let list = d.entries.slice();
    if (filter === 'todo') {
      list = list.filter(function (e) { return e.kind === 'checklist' ? doneCount(e) < e.items.length : true; });
    } else if (filter === 'done') {
      list = list.filter(function (e) { return e.kind === 'checklist' && e.items.length && doneCount(e) === e.items.length; });
    } else if (filter === 'pinned') {
      list = list.filter(function (e) { return e.pinned; });
    }
    if (q) {
      list = list.filter(function (e) {
        const hay = (e.title + ' ' + e.body + ' ' + (e.items || []).map(function (i) { return i.text; }).join(' ')).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    return list.sort(function (a, b) {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  /* ---------------- 渲染：主区 ---------------- */

  function itemRow(e, it) {
    return (
      '<li class="note-item' + (it.done ? ' done' : '') + '">' +
      '<input type="checkbox" data-act="note-item-done" data-id="' + e.id + '" data-item="' + it.id + '"' +
      (it.done ? ' checked' : '') + ' aria-label="完成">' +
      '<input class="note-item-text" data-act="note-item-text" data-id="' + e.id + '" data-item="' + it.id +
      '" value="' + RT.attr(it.text) + '" placeholder="写一条…">' +
      '<button class="mini danger" data-act="note-item-del" data-id="' + e.id + '" data-item="' + it.id +
      '" title="删除这条">' + RT.icon('x', 13) + '</button>' +
      '</li>'
    );
  }

  function card(e) {
    const isList = e.kind === 'checklist';
    const done = doneCount(e);
    const total = (e.items || []).length;
    return (
      '<article class="note-card' + (e.pinned ? ' pinned' : '') + '" id="note-' + e.id + '" data-id="' + e.id + '">' +
      '<div class="note-head">' +
      '<input class="note-title" data-act="note-title" data-id="' + e.id + '" value="' + RT.attr(e.title) + '" placeholder="标题">' +
      '<span class="note-kind dim">' + (isList ? '清单 ' + done + '/' + total : '笔记') + '</span>' +
      '<button class="mini' + (e.pinned ? ' active' : '') + '" data-act="note-pin" data-id="' + e.id +
      '" title="置顶">' + RT.icon('star', 13) + '</button>' +
      '<button class="mini" data-act="note-copy" data-id="' + e.id + '" title="复制全文">' + RT.icon('copy', 13) + '</button>' +
      '<button class="mini danger" data-act="note-del" data-id="' + e.id + '" title="删除">' + RT.icon('trash', 13) + '</button>' +
      '</div>' +
      (isList
        ? '<ul class="note-items">' + (e.items || []).map(function (it) { return itemRow(e, it); }).join('') + '</ul>' +
          '<button class="btn ghost small" data-act="note-item-add" data-id="' + e.id + '">' + RT.icon('plus', 13) + ' 加一条</button>'
        : '') +
      '<textarea class="note-body" data-act="note-body" data-id="' + e.id + '" rows="' + (isList ? 2 : 4) +
      '" placeholder="' + (isList ? '备注（可选）' : '写点什么…') + '">' + esc(e.body) + '</textarea>' +
      '</article>'
    );
  }

  RT.viewNotes = function (cid) {
    const d = data(cid);
    const list = visible(d);
    const ui = RT.state.ui;
    const tplOptions = Object.keys(TEMPLATES).map(function (k) {
      return '<option value="' + k + '">' + esc(TEMPLATES[k].label) + '</option>';
    }).join('');
    const filters = [['all', '全部'], ['todo', '未完成'], ['done', '已完成'], ['pinned', '置顶']];

    return (
      '<div class="view notes-view">' +
      '<div class="notes-add">' +
      '<select id="note-template" data-act="note-template" title="模板">' + tplOptions + '</select>' +
      '<input class="grow" id="note-new-title" placeholder="新条目标题（可留空，用模板名）">' +
      '<button class="btn gold small" data-act="note-add">' + RT.icon('plus', 14) + ' 添加</button>' +
      '</div>' +
      '<div class="notes-bar">' +
      filters.map(function (f) {
        return '<button class="chip-btn' + ((ui.notesFilter || 'all') === f[0] ? ' active' : '') +
          '" data-act="note-filter" data-id="' + f[0] + '">' + f[1] + '</button>';
      }).join('') +
      '<input class="notes-search" id="note-search" data-act="note-search" placeholder="搜索标题 / 条目 / 备注" value="' + RT.attr(ui.notesQuery || '') + '">' +
      '<span class="dim grow right">' + list.length + ' / ' + d.entries.length + ' 条</span>' +
      '</div>' +
      (list.length
        ? '<div class="notes-list">' + list.map(card).join('') + '</div>'
        : '<div class="empty small-empty"><h2>' + (d.entries.length ? '没有符合筛选的条目' : '还没有笔记') + '</h2>' +
          '<p>' + (d.entries.length ? '换个筛选或清空搜索试试。' : '选个模板，点「添加」；备团八步是最常用的起点。') + '</p></div>') +
      '</div>'
    );
  };

  /* ---------------- 渲染：侧栏 ---------------- */

  RT.notesSide = function (cid) {
    const d = data(cid);
    const ui = RT.state.ui;
    const list = visible(d);
    const total = d.entries.length;
    const todo = d.entries.reduce(function (n, e) {
      return n + (e.kind === 'checklist' ? Math.max(0, e.items.length - doneCount(e)) : 0);
    }, 0);
    return (
      '<div class="side-summary">笔记 <strong>' + total + '</strong> 条 · 待办 <strong>' + todo + '</strong></div>' +
      (list.length
        ? list.map(function (e) {
          return '<button class="side-row note-side' + (e.pinned ? ' pinned' : '') + '" data-act="note-jump" data-id="' + e.id + '">' +
            '<span class="side-main">' + esc(e.title || '未命名') + '</span>' +
            '<span class="side-meta">' + (e.kind === 'checklist' ? doneCount(e) + '/' + e.items.length : '·') + '</span>' +
            '</button>';
        }).join('')
        : '<div class="side-empty">' + (ui.notesQuery ? '没有匹配' : '还没有条目') + '</div>') +
      '<div class="side-tip">条目按战役存放；换战役就是另一套笔记。</div>'
    );
  };

  RT.notesNewBtn = function () {
    return '<button class="side-new" data-act="note-add">' + RT.icon('plus', 15) + ' 新建条目</button>';
  };

  /* ---------------- 动作 ---------------- */

  function addNote(cid) {
    const d = data(cid);
    const sel = document.querySelector('#note-template');
    const titleEl = document.querySelector('#note-new-title');
    const tpl = sel ? sel.value : 'prep8';
    const e = makeEntry(tpl, titleEl ? titleEl.value : '');
    d.entries.unshift(e);
    save(cid, d);
    RT.rerender('all');
    const card = document.querySelector('#note-' + e.id);
    if (card) {
      card.scrollIntoView({ block: 'center' });
      const t = card.querySelector('.note-title');
      if (t) t.focus();
    }
    return e;
  }

  function cur() {
    const c = RT.ws.activeCampaign();
    return c ? c.id : null;
  }

  RT.acts['note-add'] = function () {
    const cid = cur();
    if (cid) addNote(cid);
  };

  RT.acts['note-del'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const id = el.getAttribute('data-id');
    const d = data(cid);
    const e = find(d, id);
    if (!e) return;
    RT.dialogs.confirm('删除条目', '「' + (e.title || '未命名') + '」会被删除，不能恢复。', function () {
      d.entries = d.entries.filter(function (x) { return x.id !== id; });
      save(cid, d);
      RT.rerender('all');
    }, true);
  };

  RT.acts['note-pin'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    e.pinned = !e.pinned;
    save(cid, d);
    RT.rerender('all');
  };

  RT.acts['note-copy'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    const lines = [e.title];
    (e.items || []).forEach(function (it) {
      lines.push((it.done ? '[x] ' : '[ ] ') + it.text);
    });
    if (e.body) {
      lines.push('');
      lines.push(e.body);
    }
    RT.copyText(lines.join('\n'));
  };

  RT.acts['note-item-add'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    e.items.push({ id: RT.ws.uid('it'), text: '', done: false });
    save(cid, d);
    RT.rerender('all');
    const inputs = document.querySelectorAll('#note-' + e.id + ' .note-item-text');
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  };

  RT.acts['note-item-del'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    const iid = el.getAttribute('data-item');
    e.items = e.items.filter(function (x) { return x.id !== iid; });
    save(cid, d);
    RT.rerender('all');
  };

  RT.acts['note-filter'] = function (el) {
    RT.state.ui.notesFilter = el.getAttribute('data-id');
    RT.scheduleSave();
    RT.rerender('all');
  };

  RT.acts['note-jump'] = function (el) {
    const card = document.querySelector('#note-' + el.getAttribute('data-id'));
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('flash');
    setTimeout(function () { card.classList.remove('flash'); }, 900);
    const t = card.querySelector('.note-title');
    if (t) t.focus();
  };

  RT.inputActs['note-title'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    e.title = el.value;
    e.ts = e.ts || Date.now();
    save(cid, d);
    const side = document.querySelector('.note-side[data-id="' + e.id + '"] .side-main');
    if (side) side.textContent = el.value || '未命名';
  };

  RT.inputActs['note-body'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    e.body = el.value;
    save(cid, d);
  };

  RT.inputActs['note-item-text'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    const it = e.items.filter(function (x) { return x.id === el.getAttribute('data-item'); })[0];
    if (!it) return;
    it.text = el.value;
    save(cid, d);
  };

  RT.inputActs['note-search'] = function (el) {
    RT.state.ui.notesQuery = el.value;
    RT.debouncedNoteFilter = RT.debouncedNoteFilter || RT.debounce(function () {
      RT.rerender('main');
      RT.rerender('sidebar');
    }, 200);
    RT.debouncedNoteFilter();
  };

  RT.changeActs['note-item-done'] = function (el) {
    const cid = cur();
    const d = cid && data(cid);
    if (!d) return;
    const e = find(d, el.getAttribute('data-id'));
    if (!e) return;
    const it = e.items.filter(function (x) { return x.id === el.getAttribute('data-item'); })[0];
    if (!it) return;
    it.done = !!el.checked;
    save(cid, d);
    const li = el.closest('.note-item');
    if (li) li.classList.toggle('done', it.done);
    const kind = document.querySelector('#note-' + e.id + ' .note-kind');
    if (kind) kind.textContent = '清单 ' + doneCount(e) + '/' + e.items.length;
    RT.rerender('sidebar');
  };

  /* ---------------- 导出 / 种子 / 注册 ---------------- */

  function exportMd(cid) {
    const d = data(cid);
    const out = [];
    d.entries.forEach(function (e) {
      out.push('### ' + (e.title || '未命名'));
      if (e.kind === 'checklist') {
        (e.items || []).forEach(function (it) { out.push('- ' + (it.done ? '[x] ' : '[ ] ') + it.text); });
      }
      if (e.body) out.push('', e.body);
      out.push('');
    });
    return out.join('\n');
  }

  RT.ws.register({
    id: 'notes',
    name: '笔记',
    icon: 'file',
    kind: 'campaign',
    key: RT.ws.KEYS.notes,
    unit: '条',
    view: RT.viewNotes,
    side: RT.notesSide,
    newBtn: RT.notesNewBtn,
    count: function (cid) { return data(cid).entries.length; },
    clear: function (cid) { delete cache[cid]; store.del(cid); },
    exportMd: exportMd,
    seed: function (cid) {
      const d = { entries: [makeEntry('prep8', '备团八步')] };
      store.set(cid, d);
    },
  });

})(window.RT = window.RT || {});
