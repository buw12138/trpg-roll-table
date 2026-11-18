/* ============================================================
 * 21. 战役模块：DM 追踪面板（白板）
 *     左侧敌人库 / 右侧环境库，中间是可缩放、可平移、完全自由摆放的白板。
 *     白板内容按战役存；库与卡片模板是全局的。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const KEY = RT.ws.KEYS.dmBoard;
  const store = RT.ws.store(KEY);
  const cache = {};

  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2;

  /* ---------------- 数据 ---------------- */

  function uid(p) { return RT.ws.uid(p || 'dmb'); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function num(v, d) {
    const n = Number(v);
    return isFinite(n) ? n : d;
  }

  function normalize(d) {
    const b = d && typeof d === 'object' ? d : {};
    if (!Array.isArray(b.items)) b.items = [];
    b.items = b.items.filter(function (it) { return it && it.id && (it.type === 'card' || it.type === 'counter'); });
    if (!b.view || typeof b.view !== 'object') b.view = {};
    const v = b.view;
    v.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, num(v.zoom, 1)));
    v.scrollX = Math.max(0, num(v.scrollX, 0));
    v.scrollY = Math.max(0, num(v.scrollY, 0));
    if (!v.panels || typeof v.panels !== 'object') v.panels = { left: true };
    if (typeof v.panels.left !== 'boolean') v.panels.left = true;
    delete v.libs;
    delete v.panels.right;
    /* v1 面板默认卡宽 280 偏大；只迁移那个旧默认值，用户自己调过的不动 */
    if (!b.v) {
      if (num(b.cardWidth, 0) === 280) b.cardWidth = 220;
      b.v = 2;
    }
    b.cardWidth = Math.min(520, Math.max(150, num(b.cardWidth, 220)));
    if (!b.dice || typeof b.dice !== 'object') b.dice = { mode: 'normal', expr: '1d20', adv: 'normal', mod: 0, last: null };
    if (b.dice.mode !== 'duality') b.dice.mode = 'normal';
    if (['normal', 'adv', 'dis'].indexOf(b.dice.adv) < 0) b.dice.adv = 'normal';
    if (!isFinite(Number(b.dice.mod))) b.dice.mod = 0;
    b.dice.mod = Math.max(-999, Math.min(999, Number(b.dice.mod) || 0));
    if (typeof b.dice.expr !== 'string' || !b.dice.expr.trim()) b.dice.expr = '1d20';
    b.items.forEach(function (it) {
      it.x = Math.max(0, num(it.x, 40));
      it.y = Math.max(0, num(it.y, 40));
      it.z = num(it.z, 1);
      if (it.type === 'card') {
        it.w = Math.min(520, Math.max(150, num(it.w, b.cardWidth)));
        if (!it.values || typeof it.values !== 'object') it.values = {};
      } else {
        it.w = Math.min(420, Math.max(150, num(it.w, it.kind === 'advanced' ? 240 : 180)));
        it.value = num(it.value, 0);
        if (it.kind === 'advanced') {
          it.max = Math.max(1, Math.min(99, num(it.max, 6)));
          it.value = Math.min(it.max, it.value);
          it.note = typeof it.note === 'string' ? it.note : '';
        }
      }
    });
    return b;
  }

  function data(cid) {
    if (!cache[cid]) cache[cid] = normalize(store.get(cid));
    return cache[cid];
  }

  function persist(cid) {
    store.set(cid, cache[cid]);
    RT.ws.touchCampaign(cid);
  }

  let saveTimer = null;
  function persistSoon(cid) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { persist(cid); }, 300);
  }

  function cur() {
    const c = RT.ws.activeCampaign();
    return c ? c.id : null;
  }

  function viewCid() {
    const view = document.querySelector('.dmb-view');
    return view ? view.getAttribute('data-cid') : null;
  }

  function itemById(b, id) {
    return b.items.filter(function (it) { return it.id === id; })[0] || null;
  }

  function nextZ(b) {
    let z = 0;
    b.items.forEach(function (it) { z = Math.max(z, num(it.z, 0)); });
    return z + 1;
  }

  /* ---------------- 布局 / 视口 ---------------- */

  function bounds(b) {
    let w = 1600;
    let h = 1100;
    b.items.forEach(function (it) {
      w = Math.max(w, it.x + (it.w || 300) + 500);
      h = Math.max(h, it.y + 500);
    });
    return { w: w, h: h };
  }

  function sizesToDom(cid) {
    const b = data(cid);
    const paper = document.getElementById('dmb-paper');
    const canvas = document.getElementById('dmb-canvas');
    if (!paper || !canvas) return;
    const bd = bounds(b);
    const z = b.view.zoom;
    paper.style.width = Math.round(bd.w * z) + 'px';
    paper.style.height = Math.round(bd.h * z) + 'px';
    canvas.style.width = bd.w + 'px';
    canvas.style.height = bd.h + 'px';
    canvas.style.transform = 'scale(' + z + ')';
    canvas.style.transformOrigin = '0 0';
    const label = document.getElementById('dmb-zoom-val');
    if (label) label.textContent = Math.round(z * 100) + '%';
  }

  function restoreView(cid) {
    const b = data(cid);
    sizesToDom(cid);
    const stage = document.getElementById('dmb-stage');
    if (!stage) return;
    stage.scrollLeft = b.view.scrollX;
    stage.scrollTop = b.view.scrollY;
  }

  function stageCenter(cid, w) {
    const stage = document.getElementById('dmb-stage');
    const b = data(cid);
    const z = b.view.zoom;
    if (!stage) return { x: 60, y: 60 };
    const r = stage.getBoundingClientRect();
    return {
      x: Math.max(10, Math.round((stage.scrollLeft + r.width / 2) / z - (w || b.cardWidth) / 2)),
      y: Math.max(10, Math.round((stage.scrollTop + r.height / 2) / z - 80)),
    };
  }

  function zoomAt(cid, factor, px, py) {
    const b = data(cid);
    const stage = document.getElementById('dmb-stage');
    if (!stage) return;
    const oldZ = b.view.zoom;
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldZ * factor));
    if (Math.abs(nz - oldZ) < 0.001) return;
    const r = stage.getBoundingClientRect();
    const cx = px == null ? r.width / 2 : px;
    const cy = py == null ? r.height / 2 : py;
    const mx = (stage.scrollLeft + cx) / oldZ;
    const my = (stage.scrollTop + cy) / oldZ;
    b.view.zoom = nz;
    sizesToDom(cid);
    stage.scrollLeft = Math.max(0, mx * nz - cx);
    stage.scrollTop = Math.max(0, my * nz - cy);
    b.view.scrollX = stage.scrollLeft;
    b.view.scrollY = stage.scrollTop;
    persistSoon(cid);
  }

  function fitView(cid) {
    const b = data(cid);
    const stage = document.getElementById('dmb-stage');
    if (!stage || !b.items.length) {
      b.view.zoom = 1;
      b.view.scrollX = 0;
      b.view.scrollY = 0;
      sizesToDom(cid);
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
      persistSoon(cid);
      return;
    }
    let maxX = 0;
    let maxY = 0;
    b.items.forEach(function (it) {
      maxX = Math.max(maxX, it.x + (it.w || 300));
      maxY = Math.max(maxY, it.y + 320);
    });
    const r = stage.getBoundingClientRect();
    const z = Math.min(1.4, Math.max(ZOOM_MIN, Math.min((r.width - 60) / Math.max(320, maxX), (r.height - 60) / Math.max(260, maxY))));
    b.view.zoom = z;
    sizesToDom(cid);
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    b.view.scrollX = 0;
    b.view.scrollY = 0;
    persistSoon(cid);
  }

  /* ---------------- 卡片库（敌人 / 环境 / 文本合并） ---------------- */

  const filter = { q: '', lib: '', source: '', tier: '', kind: '', sort: 'name' };

  const LIB_LABEL = { enemy: '敌人', env: '环境', pc: '玩家', text: '文本', special: '特殊' };

  function filteredCards() {
    let arr = RT.dmLib.all();
    if (filter.lib) arr = arr.filter(function (it) { return it.lib === filter.lib; });
    if (filter.q) {
      const q = filter.q.toLowerCase();
      arr = arr.filter(function (it) {
        return (it.name + ' ' + JSON.stringify(it.meta || {}) + ' ' + (it.values && it.values.intro ? it.values.intro : '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    if (filter.source) arr = arr.filter(function (it) { return (it.meta || {}).source === filter.source; });
    if (filter.tier) arr = arr.filter(function (it) { return String((it.meta || {}).tier || '') === filter.tier; });
    if (filter.kind) arr = arr.filter(function (it) { return (it.meta || {}).kind === filter.kind; });
    const sort = filter.sort || 'name';
    arr = arr.slice().sort(function (a, b) {
      if (sort === 'lib') return String(LIB_LABEL[a.lib] || '').localeCompare(String(LIB_LABEL[b.lib] || ''), 'zh') || a.name.localeCompare(b.name, 'zh');
      if (sort === 'tier') return (num((a.meta || {}).tier, 99) - num((b.meta || {}).tier, 99)) || a.name.localeCompare(b.name, 'zh');
      if (sort === 'kind') return String((a.meta || {}).kind || '').localeCompare(String((b.meta || {}).kind || ''), 'zh') || a.name.localeCompare(b.name, 'zh');
      if (sort === 'source') return String((a.meta || {}).source || '').localeCompare(String((b.meta || {}).source || ''), 'zh') || a.name.localeCompare(b.name, 'zh');
      return a.name.localeCompare(b.name, 'zh');
    });
    return arr;
  }

  function optionsOf(field) {
    const seen = {};
    RT.dmLib.all().forEach(function (it) {
      const v = String((it.meta || {})[field] || '').trim();
      if (v) seen[v] = true;
    });
    return Object.keys(seen).sort(function (a, b) {
      return field === 'tier' ? num(a, 99) - num(b, 99) : a.localeCompare(b, 'zh');
    });
  }

  function selectHtml(act, value, options, allLabel) {
    return '<select data-act="' + act + '">' +
      '<option value="">' + allLabel + '</option>' +
      options.map(function (o) {
        return '<option value="' + RT.attr(o) + '"' + (String(value) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select>';
  }

  function paintLibList() {
    const host = document.getElementById('dmb-lib-list');
    if (!host) return;
    const total = RT.dmLib.count();
    const items = filteredCards();
    host.innerHTML = items.length
      ? items.map(libRow).join('')
      : '<div class="dmb-lib-empty">' + (total
        ? '没有符合条件的条目'
        : '卡片库还是空的。<br>点「导入」载入 敌人数据库.json / 环境数据库.json，<br>也可以「新建」文本卡。') + '</div>';
  }

  function libRow(it) {
    const meta = it.meta || {};
    const tpl = it.lib === 'special' ? RT.tpl.get(it.tplId) : null;
    const badges = [LIB_LABEL[it.lib] || '', tpl ? tpl.name : '', meta.source, meta.tier ? ('位阶 ' + meta.tier) : '', meta.kind]
      .filter(Boolean)
      .map(function (b) { return '<span class="dmb-badge">' + esc(b) + '</span>'; }).join('');
    return '<div class="dmb-lib-row" draggable="true" data-act="dmb-lib-place" data-id="' + it.id + '">' +
      '<span class="dmb-lib-name">' + esc(it.name) + '</span>' +
      '<span class="dmb-lib-badges">' + badges + '</span>' +
      '<button class="mini" data-act="dmb-lib-menu" data-id="' + it.id + '" title="更多">⋯</button>' +
      '</div>';
  }

  function cardLibPanelHtml() {
    const total = RT.dmLib.count();
    const items = filteredCards();
    const sortSelect = '<select data-act="dmb-lib-sort">' +
      [['name', '名称'], ['lib', '类型'], ['tier', '位阶'], ['kind', '种类'], ['source', '来源']].map(function (o) {
        return '<option value="' + o[0] + '"' + (filter.sort === o[0] ? ' selected' : '') + '>排序:' + o[1] + '</option>';
      }).join('') + '</select>';
    const typeSelect = '<select data-act="dmb-lib-type">' +
      [['', '全部类型'], ['enemy', '敌人'], ['env', '环境'], ['pc', '玩家'], ['text', '文本'], ['special', '特殊']].map(function (o) {
        return '<option value="' + o[0] + '"' + (filter.lib === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>';

    return '<div class="dmb-side-lib">' +
      '<div class="dmb-lib-head"><strong class="dmb-lib-title">卡片库</strong>' +
      '<span class="dmb-lib-count">(' + total + ')</span>' + sortSelect + '</div>' +
      '<div class="dmb-lib-tools">' +
      '<button class="dmb-mini" data-act="dmb-lib-new">新建</button>' +
      '<button class="dmb-mini" data-act="dmb-lib-import">导入</button>' +
      '<button class="dmb-mini" data-act="dmb-lib-export-json">导出json</button>' +
      '<button class="dmb-mini" data-act="dmb-lib-export-txt">导出TXT</button>' +
      '<button class="dmb-mini" data-act="tpl-manage">模板管理</button>' +
      '</div>' +
      '<input class="dmb-lib-search" data-act="dmb-lib-search" placeholder="搜索名称 / 简介 / 标签…" value="' + RT.attr(filter.q) + '">' +
      '<div class="dmb-lib-filters">' +
      typeSelect +
      selectHtml('dmb-lib-source', filter.source, optionsOf('source'), '来源') +
      selectHtml('dmb-lib-tier', filter.tier, optionsOf('tier'), '位阶') +
      selectHtml('dmb-lib-kind', filter.kind, optionsOf('kind'), '种类') +
      '</div>' +
      '<div class="dmb-lib-list" id="dmb-lib-list">' +
      (items.length
        ? items.map(libRow).join('')
        : '<div class="dmb-lib-empty">' + (total
          ? '没有符合条件的条目'
          : '卡片库还是空的。<br>点「导入」载入 敌人数据库.json / 环境数据库.json，<br>也可以「新建」文本卡。') + '</div>') +
      '</div>' +
      '<div class="dmb-lib-foot">点条目或拖到白板上 · 显示 ' + items.length + ' / ' + total + '</div>' +
      '</div>';
  }

  /* ---------------- 白板内容 ---------------- */

  function templateOf(card) {
    return RT.tpl.get(card.tplId) || card.tplSnapshot || null;
  }

  function cardHtml(card) {
    const tpl = templateOf(card);
    let face = '';
    if (tpl) {
      face = RT.dmCard.renderFace(tpl, card.values || {});
    } else {
      face = '<p class="dim">模板已删除，数据仍保留。</p>';
    }
    const kindName = tpl ? tpl.name : '模板已删除';
    return '<div class="dmb-card' + (card.collapsed ? ' collapsed' : '') + (card.locked ? ' locked' : '') +
      '" data-dmid="' + card.id + '" data-dmtype="card" style="left:' + card.x + 'px;top:' + card.y +
      'px;width:' + card.w + 'px;z-index:' + (100 + card.z) + '">' +
      '<div class="dmb-card-head" data-dm-drag="' + card.id + '">' +
      '<span class="dmb-grip">⠿</span>' +
      '<span class="dmb-card-title" data-dm-rename="' + card.id + '" title="双击重命名">' +
      esc(card.title || '未命名') + '</span>' +
      '<span class="dmb-card-kind">' + esc(kindName) + '</span>' +
      '<button class="mini" data-act="dmb-card-collapse" data-id="' + card.id + '" title="折叠 / 展开">' +
      (card.collapsed ? '▾' : '▴') + '</button>' +
      '<button class="mini" data-act="dmb-card-menu" data-id="' + card.id + '" title="更多">⋯</button>' +
      '<button class="mini danger" data-act="dmb-card-close" data-id="' + card.id + '" title="移除">×</button>' +
      '</div>' +
      '<div class="dmb-card-body">' + face + '</div>' +
      '<span class="dmb-card-resize" data-dm-resize="' + card.id + '" title="拖我改宽度"></span>' +
      '</div>';
  }

  function counterHtml(it) {
    const adv = it.kind === 'advanced';
    const max = Math.max(1, num(it.max, 1));
    const val = Math.max(0, num(it.value, 0));
    const pct = adv ? Math.max(0, Math.min(100, (val / max) * 100)) : 0;
    return '<div class="dmb-card dmb-counter' + (adv ? ' advanced' : '') + (it.locked ? ' locked' : '') +
      '" data-dmid="' + it.id + '" data-dmtype="counter" style="left:' + it.x + 'px;top:' + it.y +
      'px;width:' + it.w + 'px;z-index:' + (100 + it.z) + '">' +
      '<div class="dmb-card-head" data-dm-drag="' + it.id + '">' +
      '<span class="dmb-grip">⠿</span>' +
      '<span class="dmb-card-title" data-dm-rename="' + it.id + '" title="双击重命名">' +
      esc(it.label || '计数') + '</span>' +
      '<button class="mini" data-act="dmb-counter-menu" data-id="' + it.id + '" title="更多">⋯</button>' +
      '<button class="mini danger" data-act="dmb-card-close" data-id="' + it.id + '" title="移除">×</button>' +
      '</div>' +
      '<div class="dmb-counter-row">' +
      '<button class="dmb-step" data-act="dmb-counter-step" data-id="' + it.id + '" data-d="-1">−</button>' +
      '<input class="dmb-counter-val" data-act="dm-counter-val" data-id="' + it.id + '" value="' + val + '" inputmode="numeric">' +
      (adv
        ? '<span class="dmb-counter-of">/</span><input class="dmb-counter-max" data-act="dm-counter-max" data-id="' + it.id +
        '" value="' + max + '" inputmode="numeric">'
        : '') +
      '<button class="dmb-step" data-act="dmb-counter-step" data-id="' + it.id + '" data-d="1">＋</button>' +
      '</div>' +
      (adv
        ? '<div class="dmb-bar"><i style="width:' + pct + '%"></i></div>' +
        '<textarea class="dmb-counter-note" rows="2" data-act="dm-counter-note" data-id="' + it.id +
        '" placeholder="备注（可选）">' + esc(it.note || '') + '</textarea>'
        : '') +
      '</div>';
  }

  function itemsHtml(b) {
    return b.items.map(function (it) {
      return it.type === 'card' ? cardHtml(it) : counterHtml(it);
    }).join('');
  }

  function repaintCanvas(cid) {
    const b = data(cid);
    const canvas = document.getElementById('dmb-canvas');
    if (!canvas) return;
    const stage = document.getElementById('dmb-stage');
    const keep = stage ? { left: stage.scrollLeft, top: stage.scrollTop } : null;
    canvas.innerHTML = itemsHtml(b);
    sizesToDom(cid);
    const hint = document.querySelector('.dmb-hint');
    if (hint) hint.classList.toggle('hidden', b.items.length > 0);
    if (stage && keep) {
      stage.scrollLeft = keep.left;
      stage.scrollTop = keep.top;
      requestAnimationFrame(function () {
        stage.scrollLeft = keep.left;
        stage.scrollTop = keep.top;
      });
    }
  }

  /* ---------------- 主视图 ---------------- */

  function toolbarHtml(b) {
    const duality = b.dice.mode === 'duality';
    const adv = b.dice.adv || 'normal';
    return '<div class="dmb-toolbar">' +
      '<label class="dmb-width" title="新放入卡片的默认宽度（150–520px）。只影响之后放的卡；已有卡片拖右边缘改宽，计数器不受影响。按战役保存。">' +
      '<span class="dim">宽度</span>' +
      '<input type="number" min="150" max="520" data-act="dmb-width" value="' + b.cardWidth +
      '" title="新放入卡片的默认宽度。只影响之后放的卡；已有卡片拖右边缘改宽。"></label>' +
      '<div class="dmb-dicebar">' +
      '<select data-act="dmb-dice-mode" title="骰子类型">' +
      '<option value="normal"' + (duality ? '' : ' selected') + '>通用骰</option>' +
      '<option value="duality"' + (duality ? ' selected' : '') + '>二元骰</option>' +
      '</select>' +
      '<select data-act="dmb-dice-adv" title="优势 / 劣势">' +
      '<option value="normal"' + (adv === 'normal' ? ' selected' : '') + '>普通</option>' +
      '<option value="adv"' + (adv === 'adv' ? ' selected' : '') + '>优势</option>' +
      '<option value="dis"' + (adv === 'dis' ? ' selected' : '') + '>劣势</option>' +
      '</select>' +
      (duality
        ? '<span class="dmb-dice-fixed">2d12（希望 / 恐惧）' + (adv !== 'normal' ? ' + ' + (adv === 'adv' ? '1d6' : '−1d6') : '') + '</span>' +
        '<label class="dmb-dice-modwrap" title="调整值，会计入合计"><span class="dim">调整</span>' +
        '<input class="dmb-dice-mod" type="number" step="1" min="-999" max="999" data-act="dmb-dice-mod" value="' +
        RT.attr(b.dice.mod || 0) + '"></label>'
        : '<input class="dmb-dice-input" data-act="dmb-dice-expr" value="' + RT.attr(b.dice.expr) +
        '" placeholder="1d20+1d6+8 / 4d6kh3 / (1d8+2)*2" spellcheck="false" aria-label="骰子公式">') +
      '<button class="btn gold small" data-act="dmb-dice-roll">掷</button>' +
      '<button class="dmb-dice-help" data-act="dmb-dice-help" title="骰式说明">?</button>' +
      '<span class="dmb-dice-result" id="dmb-dice-result">' + diceResultHtml(b.dice.last) + '</span>' +
      '</div>' +
      '<button class="btn ghost small" data-act="dmb-export">导出面板</button>' +
      '<button class="btn ghost small" data-act="dmb-import">导入面板</button>' +
      '<button class="btn ghost small danger" data-act="dmb-clear">清空</button>' +
      '</div>';
  }

  function diceResultHtml(last) {
    if (!last) return '<span class="dim">未掷</span>';
    if (last.kind === 'duality') {
      const cls = last.outcome === '希望' ? 'hope' : last.outcome === '恐惧' ? 'fear' : 'crit';
      return '<span class="dc-die hope">希望 ' + esc(String(last.hope)) + '</span>' +
        '<span class="dc-die fear">恐惧 ' + esc(String(last.fear)) + '</span>' +
        (last.bonus ? '<span class="dc-die bonus">' + (last.bonus > 0 ? '+' : '') + esc(String(last.bonus)) + '</span>' : '') +
        (last.mod ? '<span class="dc-die mod">调整 ' + (last.mod > 0 ? '+' : '') + esc(String(last.mod)) + '</span>' : '') +
        '<b class="dc-die-out ' + cls + '">' + esc(last.outcome || '') + '</b>' +
        '<span class="dim">合计 ' + esc(String(last.total)) + '</span>';
    }
    return '<b class="dmb-dice-total">' + esc(String(last.total)) + '</b>' +
      '<span class="dmb-dice-detail">' + esc(last.text || '') + '</span>';
  }

  function stageHtml(cid, b) {
    return '<div class="dmb-stage-wrap">' +
      '<div class="dmb-stage" id="dmb-stage">' +
      '<div class="dmb-paper" id="dmb-paper">' +
      '<div class="dmb-canvas" id="dmb-canvas" style="transform:scale(' + b.view.zoom + ')">' + itemsHtml(b) + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="dmb-hint' + (b.items.length ? ' hidden' : '') + '">' +
      '<p>点左侧「卡片库」，点条目或把卡片拖到此处</p>' +
      '<p>右键卡片改数据 · 拖空白平移 · Ctrl+滚轮缩放</p>' +
      '</div>' +
      '<div class="dmb-zoom">' +
      '<button data-act="dmb-zoom" data-zoom="out" title="缩小">−</button>' +
      '<button data-act="dmb-zoom" data-zoom="reset" title="重置为 100%"><span id="dmb-zoom-val">' +
      Math.round(b.view.zoom * 100) + '%</span></button>' +
      '<button data-act="dmb-zoom" data-zoom="in" title="放大">＋</button>' +
      '<button data-act="dmb-zoom" data-zoom="fit" title="适应内容">适应</button>' +
      '</div>' +
      '</div>';
  }

  RT.viewDmBoard = function (cid) {
    const b = data(cid);
    setTimeout(function () { restoreView(cid); }, 0);
    return '<div class="view dmb-view" data-cid="' + cid + '">' +
      toolbarHtml(b) +
      '<div class="dmb-body">' + stageHtml(cid, b) + '</div>' +
      '</div>';
  };

  RT.dmBoardSide = function () {
    return cardLibPanelHtml();
  };

  RT.dmBoardNewBtn = function () {
    return '<button class="side-new" data-act="dmb-lib-new">＋ 新建卡片</button>';
  };

  /* ---------------- 添加内容 ---------------- */

  function addCardFromLib(cid, libItemId, at) {
    const item = RT.dmLib.get(libItemId);
    if (!item) return null;
    const tpl = RT.tpl.get(item.tplId) || RT.tpl.get(RT.dmLib.libMeta(item.lib).tplId);
    if (!tpl) { RT.toast('模板不见了，先去模板库看下', 'warn'); return null; }
    const b = data(cid);
    const values = RT.dmCard.defaultValues(tpl);
    Object.keys(item.values || {}).forEach(function (k) { values[k] = clone(item.values[k]); });
    const pos = at || stageCenter(cid, b.cardWidth);
    const card = {
      id: uid('dmc'),
      type: 'card',
      tplId: tpl.id,
      tplSnapshot: {
        name: tpl.name, accent: tpl.accent || '', width: tpl.width || 0,
        responsive: tpl.responsive || 'stack', layout: clone(tpl.layout),
      },
      title: item.name,
      x: pos.x,
      y: pos.y,
      w: b.cardWidth,
      z: nextZ(b),
      locked: false,
      collapsed: false,
      values: values,
      ts: Date.now(),
    };
    b.items.push(card);
    persist(cid);
    repaintCanvas(cid);
    return card;
  }

  function addTextCard(cid, at) {
    const tpl = RT.tpl.get('bt_text');
    if (!tpl) return null;
    const b = data(cid);
    const pos = at || stageCenter(cid, b.cardWidth);
    const values = RT.dmCard.defaultValues(tpl);
    const card = {
      id: uid('dmc'),
      type: 'card',
      tplId: tpl.id,
      tplSnapshot: {
        name: tpl.name, accent: tpl.accent || '', width: tpl.width || 0,
        responsive: tpl.responsive || 'stack', layout: clone(tpl.layout),
      },
      title: '文本',
      x: pos.x,
      y: pos.y,
      w: b.cardWidth,
      z: nextZ(b),
      locked: false,
      collapsed: false,
      values: values,
      ts: Date.now(),
    };
    b.items.push(card);
    persist(cid);
    repaintCanvas(cid);
    setTimeout(function () {
      const el = document.querySelector('.dmb-card[data-dmid="' + card.id + '"] textarea');
      if (el) el.focus();
    }, 30);
    return card;
  }

  function addCounter(cid, kind, at) {
    const b = data(cid);
    const adv = kind === 'advanced';
    const w = adv ? 240 : 180;
    const pos = at || stageCenter(cid, w);
    const item = {
      id: uid('dmk'),
      type: 'counter',
      kind: adv ? 'advanced' : 'simple',
      label: adv ? '进度' : '计数',
      x: pos.x,
      y: pos.y,
      w: w,
      z: nextZ(b),
      value: 0,
      max: adv ? 6 : 0,
      step: 1,
      note: '',
      locked: false,
      ts: Date.now(),
    };
    b.items.push(item);
    persist(cid);
    repaintCanvas(cid);
    return item;
  }

  /* ---------------- 菜单 ---------------- */

  let menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
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
        (it.active ? RT.icon('check', 13) : '') + '</button>';
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
      const item = items[Number(btn.getAttribute('data-mi'))];
      closeMenu();
      if (item && item.onClick) item.onClick();
    });
    menuEl = el;
  }

  document.addEventListener('click', function (e) {
    if (!menuEl) return;
    if (e.target.closest('.menu-pop')) return;
    closeMenu();
  }, true);

  document.addEventListener('dblclick', function (e) {
    const t = e.target.closest && e.target.closest('[data-dm-rename]');
    if (!t) return;
    const cid = viewCid();
    if (!cid) return;
    const b = data(cid);
    const it = itemById(b, t.getAttribute('data-dm-rename'));
    if (it) renameItem(cid, b, it);
  });

  /* ---------------- 卡片 / 计数编辑 ---------------- */

  function pathSet(obj, path, val) {
    const parts = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = val;
  }

  function cardOf(el) {
    const cardEl = el.closest('.dmb-card');
    const cid = viewCid();
    if (!cardEl || !cid) return null;
    const b = data(cid);
    const it = itemById(b, cardEl.getAttribute('data-dmid'));
    if (!it) return null;
    return { cid: cid, b: b, item: it, el: cardEl };
  }

  function editCardValues(el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const tpl = templateOf(ctx.item);
    if (!tpl) { RT.toast('模板已删除，无法编辑', 'warn'); return; }
    RT.dmCard.editDialog(tpl, ctx.item.values || {}, function (values) {
      ctx.item.values = values;
      persist(ctx.cid);
      repaintCanvas(ctx.cid);
    }, { title: ctx.item.title || '卡片' });
  }

  function renameItem(cid, b, it) {
    const current = it.type === 'counter' ? (it.label || '') : (it.title || '');
    RT.dialogs.prompt('重命名', current, function (name) {
      if (it.type === 'counter') it.label = name;
      else it.title = name;
      persist(cid);
      repaintCanvas(cid);
    });
  }

  function cardMenu(el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const b = ctx.b;
    const it = ctx.item;
    openMenu(el, [
      { label: '编辑数据', icon: 'edit', onClick: function () { editCardValues(el); } },
      { label: '重命名', icon: 'edit', onClick: function () { renameItem(ctx.cid, b, it); } },
      {
        label: '刷新模板', icon: 'refresh', onClick: function () {
          const tpl = RT.tpl.get(it.tplId);
          if (!tpl) { RT.toast('模板已删除', 'warn'); return; }
          it.tplSnapshot = {
            name: tpl.name, accent: tpl.accent || '', width: tpl.width || 0,
            responsive: tpl.responsive || 'stack', layout: clone(tpl.layout),
          };
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
          RT.toast('已按当前模板刷新');
        },
      },
      {
        label: '复制', icon: 'copy', onClick: function () {
          const copy = clone(it);
          copy.id = uid('dmc');
          copy.x = it.x + 24;
          copy.y = it.y + 24;
          copy.z = nextZ(b);
          b.items.push(copy);
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
      {
        label: '置顶', icon: 'up', onClick: function () {
          it.z = nextZ(b);
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
      {
        label: it.locked ? '解锁' : '锁定位置', icon: it.locked ? 'unlock' : 'lock', onClick: function () {
          it.locked = !it.locked;
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
      { sep: true },
      {
        label: '移除', icon: 'trash', danger: true, onClick: function () {
          b.items = b.items.filter(function (x) { return x.id !== it.id; });
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
    ]);
  }

  function counterMenu(el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const b = ctx.b;
    const it = ctx.item;
    openMenu(el, [
      { label: '重命名', icon: 'edit', onClick: function () { renameItem(ctx.cid, b, it); } },
      {
        label: '归零', icon: 'refresh', onClick: function () {
          it.value = 0;
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
      {
        label: '复制', icon: 'copy', onClick: function () {
          const copy = clone(it);
          copy.id = uid('dmk');
          copy.x = it.x + 24;
          copy.y = it.y + 24;
          copy.z = nextZ(b);
          b.items.push(copy);
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
      {
        label: it.locked ? '解锁' : '锁定位置', icon: it.locked ? 'unlock' : 'lock', onClick: function () {
          it.locked = !it.locked;
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
      { sep: true },
      {
        label: '移除', icon: 'trash', danger: true, onClick: function () {
          b.items = b.items.filter(function (x) { return x.id !== it.id; });
          persist(ctx.cid);
          repaintCanvas(ctx.cid);
        },
      },
    ]);
  }

  function updateCounterDom(it, skipEl) {
    const el = document.querySelector('.dmb-card[data-dmid="' + it.id + '"]');
    if (!el) return;
    const val = el.querySelector('[data-act="dm-counter-val"]');
    if (val && val !== skipEl) val.value = it.value;
    const maxEl = el.querySelector('[data-act="dm-counter-max"]');
    if (maxEl && maxEl !== skipEl) maxEl.value = it.max;
    const bar = el.querySelector('.dmb-bar i');
    if (bar) bar.style.width = Math.max(0, Math.min(100, (it.value / Math.max(1, it.max)) * 100)) + '%';
  }

  /* ---------------- 卡片库的导入 / 导出 ---------------- */

  function importLibDialog() {
    RT.dialogs.open({
      title: '导入卡片库',
      wide: true,
      body:
        '<p class="modal-note">支持 敌人数据库.json / 环境数据库.json / 本工具导出的库文件，也支持每行一条的纯文本。' +
        '会按内容自动识别类型；同名条目会重复导入，可先删除旧的。</p>' +
        '<div class="file-row"><label class="btn ghost small file-btn">' + RT.icon('upload', 14) + ' 选择文件' +
        '<input type="file" id="dmb-lib-file" accept=".json,.txt,application/json,text/plain" hidden></label>' +
        '<span class="dim">也可以把文件拖进卡片库面板</span></div>' +
        '<textarea class="textarea mono" id="dmb-lib-text" rows="10" placeholder="粘贴 JSON 或文本"></textarea>' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '<button class="btn gold" data-ok="1">导入</button></div>',
      onMount: function (modal) {
        const ta = modal.querySelector('#dmb-lib-text');
        modal.querySelector('#dmb-lib-file').addEventListener('change', function (e) {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = function () { ta.value = String(reader.result || ''); };
          reader.readAsText(f, 'utf-8');
        });
        modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
        modal.querySelector('[data-ok]').addEventListener('click', function () {
          const text = ta.value.trim();
          if (!text) { RT.toast('先粘贴内容或选文件', 'warn'); return; }
          try {
            const res = RT.dmLib.importText(text);
            RT.dialogs.close();
            RT.toast('已导入 ' + res.added + ' 条' + (res.skipped ? '，跳过 ' + res.skipped + ' 条' : ''));
            RT.rerender('all');
          } catch (err) {
            RT.toast(err.message || '导入失败', 'warn');
          }
        });
      },
    });
  }

  function exportLib(kind) {
    if (!RT.dmLib.count()) { RT.toast('卡片库还是空的', 'warn'); return; }
    if (kind === 'txt') {
      RT.download('卡片库-' + RT.dateStamp() + '.txt', RT.dmLib.exportAllTxt(), 'text/plain');
    } else {
      RT.download('卡片库-' + RT.dateStamp() + '.json', RT.dmLib.exportAllJson());
    }
  }

  function templatesForLib(lib) {
    const list = RT.tpl.list('card').filter(function (t) {
      return t.cardKind === lib;
    });
    if (!list.length) {
      const fallback = RT.tpl.get(RT.dmLib.libMeta(lib).tplId);
      return fallback ? [fallback] : [];
    }
    return list;
  }

  function openNewItemForm(lib, name, tplId) {
    const tpl = RT.tpl.get(tplId) || RT.tpl.get(RT.dmLib.libMeta(lib).tplId);
    if (!tpl) { RT.toast('模板不见了', 'warn'); return; }
    const values = RT.dmCard.defaultValues(tpl);
    RT.dmCard.editDialog(tpl, values, function (vals) {
      RT.dmLib.add({
        lib: lib,
        tplId: tpl.id,
        name: name,
        meta: vals.meta && typeof vals.meta === 'object' ? clone(vals.meta) : {},
        values: vals,
      });
      RT.toast('已加入卡片库');
      RT.rerender('all');
    }, { title: name });
  }

  function pickTemplateFor(lib, name) {
    const list = templatesForLib(lib);
    if (!list.length) { RT.toast('这一类还没有可用模板', 'warn'); return; }
    if (list.length === 1) {
      openNewItemForm(lib, name, list[0].id);
      return;
    }
    RT.dialogs.open({
      title: '用哪个模板',
      wide: true,
      body:
        '<p class="modal-note">同一类卡片可以有多个模板（内置的、复制的、自己搭的）。选一个开始填数据。</p>' +
        '<div class="tpl-pick">' + list.map(function (t) {
          return '<button class="tpl-card" data-pick="' + t.id + '">' +
            '<span class="tpl-name">' + esc(t.name) + '</span>' +
            '<span class="tpl-meta">' + RT.tpl.countFields(t.layout) + ' 个组件' +
            (t.builtin ? ' · 内置' : ' · 自定义') + '</span></button>';
        }).join('') + '</div>' +
        '<div class="modal-actions right"><button class="btn ghost" data-cancel="1">取消</button></div>',
      onMount: function (m) {
        m.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () {
            RT.dialogs.close();
            openNewItemForm(lib, name, b.getAttribute('data-pick'));
          });
        });
        m.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
      },
    });
  }

  function newLibItem() {
    const kinds = [
      { lib: 'enemy', name: '敌人卡' },
      { lib: 'env', name: '环境卡' },
      { lib: 'pc', name: '玩家卡' },
      { lib: 'text', name: '文本卡' },
      { lib: 'special', name: '特殊卡' },
    ];
    RT.dialogs.open({
      title: '新建卡片',
      body:
        '<p class="modal-note">先选卡片类型，下一步再选这一类里的具体模板。</p>' +
        '<div class="radio-row tpl-kind-row">' +
        kinds.map(function (k, i) {
          return '<label><input type="radio" name="dmb-new-kind" value="' + k.lib + '"' +
            (i === 0 ? ' checked' : '') + '> ' + k.name + '</label>';
        }).join('') +
        '</div>' +
        '<input id="dmb-new-name" class="grow" placeholder="名称（敌人 / 环境 / 角色名，或文本标题）" autocomplete="off">' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '<button class="btn gold" data-ok="1">下一步</button></div>',
      onMount: function (modal) {
        modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
        modal.querySelector('[data-ok]').addEventListener('click', function () {
          const picked = modal.querySelector('input[name="dmb-new-kind"]:checked');
          const meta = kinds.filter(function (k) { return k.lib === (picked ? picked.value : 'enemy'); })[0] || kinds[0];
          const nameEl = modal.querySelector('#dmb-new-name');
          const name = (nameEl && nameEl.value.trim()) || meta.name;
          RT.dialogs.close();
          pickTemplateFor(meta.lib, name);
        });
      },
    });
  }

  function libItemMenu(el) {
    const id = el.getAttribute('data-id');
    const item = RT.dmLib.get(id);
    if (!item) return;
    const cid = viewCid() || cur();
    openMenu(el, [
      {
        label: '放到面板', icon: 'plus', onClick: function () {
          if (cid) addCardFromLib(cid, id);
        },
      },
      {
        label: '编辑数据', icon: 'edit', onClick: function () {
          const tpl = RT.tpl.get(item.tplId);
          if (!tpl) { RT.toast('模板已删除', 'warn'); return; }
          RT.dmCard.editDialog(tpl, item.values || {}, function (vals) {
            RT.dmLib.update(id, { values: vals });
            RT.rerender('all');
          }, { title: item.name });
        },
      },
      {
        label: '重命名', icon: 'edit', onClick: function () {
          RT.dialogs.prompt('重命名条目', item.name, function (name) {
            RT.dmLib.update(id, { name: name });
            RT.rerender('all');
          });
        },
      },
      { sep: true },
      {
        label: '删除', icon: 'trash', danger: true, onClick: function () {
          RT.dialogs.confirm('删除条目', '「' + item.name + '」会从库里删除，已放到面板上的卡不受影响。', function () {
            RT.dmLib.remove(id);
            RT.rerender('all');
          }, true);
        },
      },
    ]);
  }

  /* ---------------- 面板导入 / 导出 ---------------- */

  function exportBoard() {
    const cid = viewCid() || cur();
    if (!cid) return;
    const b = data(cid);
    if (!b.items.length) { RT.toast('面板还是空的', 'warn'); return; }
    const payload = {
      kind: 'trpg-dm-board',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      board: clone(b),
    };
    const name = RT.ws.activeCampaign();
    RT.download((name ? name.name : '面板') + '-追踪面板-' + RT.dateStamp() + '.json', JSON.stringify(payload, null, 2));
  }

  function importBoardDialog() {
    RT.dialogs.open({
      title: '导入追踪面板',
      wide: true,
      body:
        '<p class="modal-note">导入会与当前面板合并（不会删掉现有卡片）。也支持本工具「导出」的面板文件。</p>' +
        '<div class="file-row"><label class="btn ghost small file-btn">' + RT.icon('upload', 14) + ' 选择文件' +
        '<input type="file" id="dmb-board-file" accept=".json,application/json" hidden></label></div>' +
        '<textarea class="textarea mono" id="dmb-board-text" rows="10" placeholder="粘贴面板 JSON"></textarea>' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '<button class="btn gold" data-ok="1">导入</button></div>',
      onMount: function (modal) {
        const ta = modal.querySelector('#dmb-board-text');
        modal.querySelector('#dmb-board-file').addEventListener('change', function (e) {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = function () { ta.value = String(reader.result || ''); };
          reader.readAsText(f, 'utf-8');
        });
        modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
        modal.querySelector('[data-ok]').addEventListener('click', function () {
          const text = ta.value.trim();
          if (!text) { RT.toast('先粘贴内容或选文件', 'warn'); return; }
          const cid = viewCid() || cur();
          if (!cid) return;
          let parsed;
          try { parsed = JSON.parse(text); } catch (e) { RT.toast('JSON 解析失败', 'warn'); return; }
          const incoming = parsed && parsed.board ? parsed.board : parsed;
          if (!incoming || !Array.isArray(incoming.items)) { RT.toast('这不是面板文件', 'warn'); return; }
          const b = data(cid);
          let n = 0;
          incoming.items.forEach(function (raw) {
            if (!raw || (raw.type !== 'card' && raw.type !== 'counter')) return;
            const it = normalize({ items: [Object.assign({}, raw, { id: raw.id || uid('tmp') })] }).items[0];
            if (!it) return;
            it.id = uid(it.type === 'card' ? 'dmc' : 'dmk');
            it.x = Math.max(0, num(it.x, 40) + 40);
            it.y = Math.max(0, num(it.y, 40) + 40);
            it.z = nextZ(b);
            b.items.push(it);
            n++;
          });
          persist(cid);
          RT.dialogs.close();
          RT.toast('已合并 ' + n + ' 项');
          RT.rerender('all');
        });
      },
    });
  }

  /* ---------------- 动作 ---------------- */

  RT.acts['dmb-add-counter'] = function (el) {
    const cid = cur();
    if (cid) addCounter(cid, el.getAttribute('data-kind') || 'simple');
  };

  RT.acts['dmb-add-text'] = function () {
    const cid = cur();
    if (cid) addTextCard(cid);
  };

  RT.acts['dmb-panel'] = function () {
    const cid = cur();
    if (!cid) return;
    const b = data(cid);
    b.view.panels.left = !b.view.panels.left;
    persist(cid);
    RT.rerender('all');
  };

  RT.acts['dmb-zoom'] = function (el) {
    const cid = viewCid() || cur();
    if (!cid) return;
    const act = el.getAttribute('data-zoom');
    if (act === 'in') zoomAt(cid, 1.15);
    else if (act === 'out') zoomAt(cid, 1 / 1.15);
    else if (act === 'fit') fitView(cid);
    else { const b = data(cid); b.view.zoom = 1; sizesToDom(cid); persistSoon(cid); }
  };

  RT.acts['dmb-lib-place'] = function (el, e) {
    if (e && e.target.closest('[data-act="dmb-lib-menu"]')) return;
    const cid = cur();
    if (!cid) return;
    addCardFromLib(cid, el.getAttribute('data-id'));
  };

  RT.acts['dmb-lib-menu'] = function (el, e) {
    if (e) e.stopPropagation();
    libItemMenu(el);
  };

  RT.acts['dmb-lib-new'] = function () { newLibItem(); };
  RT.acts['dmb-lib-import'] = function () { importLibDialog(); };
  RT.acts['dmb-lib-export-json'] = function () { exportLib('json'); };
  RT.acts['dmb-lib-export-txt'] = function () { exportLib('txt'); };

  RT.acts['dmb-card-menu'] = function (el) { cardMenu(el); };
  RT.acts['dmb-counter-menu'] = function (el) { counterMenu(el); };

  RT.acts['dmb-card-close'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    ctx.b.items = ctx.b.items.filter(function (x) { return x.id !== ctx.item.id; });
    persist(ctx.cid);
    repaintCanvas(ctx.cid);
  };

  RT.acts['dmb-card-collapse'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    ctx.item.collapsed = !ctx.item.collapsed;
    persist(ctx.cid);
    repaintCanvas(ctx.cid);
  };

  RT.acts['dmb-counter-step'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx || ctx.item.type !== 'counter') return;
    const it = ctx.item;
    const d = Number(el.getAttribute('data-d')) || 1;
    let v = num(it.value, 0) + d;
    if (it.kind === 'advanced') v = Math.max(0, Math.min(num(it.max, 6), v));
    else v = Math.max(0, v);
    it.value = v;
    updateCounterDom(it);
    persistSoon(ctx.cid);
  };

  RT.acts['dmb-clear'] = function () {
    const cid = cur();
    if (!cid) return;
    const b = data(cid);
    if (!b.items.length) { RT.toast('面板已经是空的'); return; }
    RT.dialogs.confirm('清空面板', '会移除面板上的 ' + b.items.length + ' 项内容（卡片库里的条目不受影响）。', function () {
      b.items = [];
      persist(cid);
      RT.rerender('all');
    }, true);
  };

  RT.acts['dmb-dice-roll'] = function () {
    const cid = viewCid() || cur();
    if (!cid) return;
    const b = data(cid);
    const d = b.dice;
    const adv = d.adv === 'adv' ? 1 : d.adv === 'dis' ? -1 : 0;
    let last = null;
    if (d.mode === 'duality') {
      const hope = 1 + Math.floor(Math.random() * 12);
      const fear = 1 + Math.floor(Math.random() * 12);
      const mod = Number(d.mod) || 0;
      let bonus = 0;
      if (adv) {
        const die = 1 + Math.floor(Math.random() * 6);
        bonus = adv > 0 ? die : -die;
      }
      last = {
        kind: 'duality', hope: hope, fear: fear, bonus: bonus, mod: mod,
        total: hope + fear + bonus + mod,
        outcome: hope === fear ? '暴击' : hope > fear ? '希望' : '恐惧',
        ts: Date.now(),
      };
    } else {
      const r = RT.rollExpr(d.expr, Math.random, { advantage: adv });
      if (!r) { RT.toast('骰式看不懂，点右侧「?」看写法', 'warn'); return; }
      last = { kind: 'normal', total: r.total, text: r.detail, ts: Date.now() };
    }
    d.last = last;
    persist(cid);
    const host = document.getElementById('dmb-dice-result');
    if (host) host.innerHTML = diceResultHtml(last);
  };

  RT.acts['dmb-dice-help'] = function () {
    RT.dialogs.open({
      title: '骰式怎么写',
      wide: true,
      body:
        '<p class="modal-note">通用骰支持多骰项、加减乘除、括号与取高 / 取低；优势 / 劣势既可以下拉选，也可以写在公式里。</p>' +
        '<div class="dmb-dice-help-grid">' +
        [['1d20', '普通判定'], ['1d20+5', '加值'], ['1d20+1d6+8', '多骰项相加'],
          ['2d6+3', '伤害 / 治疗'], ['2d6-1', '减值'], ['4d6kh3', '掷 4 取高 3'],
          ['2d20kh1', '优势（等价于掷法选「优势」）'], ['2d20kl1', '劣势'],
          ['2d20dl1', '去掉最低 1 个'], ['(1d8+2)*2', '括号与乘法'], ['d66', '十位 / 个位各 1d6']]
          .map(function (x) {
            return '<div class="dmb-dice-help-row"><code>' + esc(x[0]) + '</code><span>' + esc(x[1]) + '</span></div>';
          }).join('') +
        '</div>' +
        '<p class="modal-note">公式里写 <code>adv</code> / <code>dis</code>（或 优势 / 劣势）会按掷法处理：带 d20 时掷 2d20 取高 / 低；没有 d20 时加 / 减 1d6。</p>' +
        '<p class="modal-note">二元骰固定 2d12：希望骰高 = 希望，恐惧骰高 = 恐惧，两骰相同 = 暴击；选优势 / 劣势会额外 +1d6 / −1d6，右侧「调整」会计入合计。</p>' +
        '<div class="modal-actions right"><button class="btn gold" data-close="1">知道了</button></div>',
    });
  };

  RT.inputActs['dmb-dice-expr'] = function (el) {
    const cid = cur();
    if (!cid) return;
    data(cid).dice.expr = el.value;
    persistSoon(cid);
  };

  RT.inputActs['dmb-dice-mod'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const b = data(cid);
    b.dice.mod = Math.max(-999, Math.min(999, Number(el.value) || 0));
    persistSoon(cid);
  };

  RT.changeActs['dmb-dice-mode'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const b = data(cid);
    b.dice.mode = el.value === 'duality' ? 'duality' : 'normal';
    persist(cid);
    RT.rerender('main');
  };

  RT.changeActs['dmb-dice-adv'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const b = data(cid);
    b.dice.adv = ['adv', 'dis'].indexOf(el.value) >= 0 ? el.value : 'normal';
    persist(cid);
    RT.rerender('main');
  };

  RT.acts['dmb-export'] = function () { exportBoard(); };
  RT.acts['dmb-import'] = function () { importBoardDialog(); };
  function cardCounterState(it, block) {
    const v = it.values && it.values[block];
    if (!v || typeof v !== 'object') return { value: 0, max: 6 };
    return { value: Math.max(0, num(v.value, 0)), max: Math.max(1, Math.min(99, num(v.max, 6))) };
  }

  function updateCardCounterDom(el, block, st) {
    const wrap = el.closest('.dc-counter');
    if (!wrap) return;
    const val = wrap.querySelector('[data-act="dm-card-counter-val"]');
    if (val && val !== document.activeElement) val.value = st.value;
    const maxEl = wrap.querySelector('[data-act="dm-card-counter-max"]');
    if (maxEl && maxEl !== document.activeElement) maxEl.value = st.max;
    const bar = wrap.querySelector('.dc-counter-bar i');
    if (bar) bar.style.width = Math.max(0, Math.min(100, (st.value / st.max) * 100)) + '%';
  }

  RT.acts['dm-card-counter-step'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const block = el.getAttribute('data-dm-block');
    const st = cardCounterState(ctx.item, block);
    const d = Number(el.getAttribute('data-d')) || 1;
    st.value = Math.max(0, Math.min(st.max, st.value + d));
    ctx.item.values[block] = st;
    updateCardCounterDom(el, block, st);
    persistSoon(ctx.cid);
  };

  RT.inputActs['dm-card-counter-val'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const block = el.getAttribute('data-dm-block');
    const st = cardCounterState(ctx.item, block);
    st.value = Math.max(0, Math.min(st.max, num(el.value, 0)));
    ctx.item.values[block] = st;
    updateCardCounterDom(el, block, st);
    persistSoon(ctx.cid);
  };

  RT.inputActs['dm-card-counter-max'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const block = el.getAttribute('data-dm-block');
    const st = cardCounterState(ctx.item, block);
    st.max = Math.max(1, Math.min(99, num(el.value, 6)));
    st.value = Math.min(st.max, st.value);
    ctx.item.values[block] = st;
    updateCardCounterDom(el, block, st);
    persistSoon(ctx.cid);
  };

  RT.acts['dm-feature-toggle'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const block = el.getAttribute('data-dm-block');
    const i = Number(el.getAttribute('data-i'));
    const list = ctx.item.values[block];
    if (!Array.isArray(list) || !list[i]) return;
    list[i].open = !list[i].open;
    const feature = el.closest('.dc-feature');
    if (feature) feature.classList.toggle('open', !!list[i].open);
    persistSoon(ctx.cid);
  };

  RT.acts['dm-dice-roll'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const block = el.getAttribute('data-dm-block');
    const val = ctx.item.values[block] && typeof ctx.item.values[block] === 'object'
      ? ctx.item.values[block] : { mode: 'normal', expr: '1d20', last: null };
    const mode = val.mode === 'duality' ? 'duality' : 'normal';
    let last = null;
    if (mode === 'duality') {
      const hope = 1 + Math.floor(Math.random() * 12);
      const fear = 1 + Math.floor(Math.random() * 12);
      last = {
        kind: 'duality', hope: hope, fear: fear, total: hope + fear,
        outcome: hope > fear ? '希望' : fear > hope ? '恐惧' : '暴击',
        ts: Date.now(),
      };
    } else {
      const expr = val.expr || '1d20';
      const r = RT.rollDice(expr, Math.random);
      if (!r) { RT.toast('骰式看不懂，试试 1d20 或 2d6+3', 'warn'); return; }
      last = { kind: 'normal', total: r.total, text: r.detail, ts: Date.now() };
    }
    ctx.item.values[block] = Object.assign({}, val, { last: last });
    persist(ctx.cid);
    repaintCanvas(ctx.cid);
  };

  RT.inputActs['dm-dice-expr'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const block = el.getAttribute('data-dm-block');
    if (!ctx.item.values[block] || typeof ctx.item.values[block] !== 'object') {
      ctx.item.values[block] = { mode: 'normal', expr: el.value, last: null };
    } else {
      ctx.item.values[block].expr = el.value;
    }
    persistSoon(ctx.cid);
  };

  RT.acts['dm-box'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    const block = el.getAttribute('data-dm-block');
    const i = Number(el.getAttribute('data-i'));
    const values = ctx.item.values;
    const curVal = values[block] && typeof values[block] === 'object'
      ? values[block] : { max: 6, marked: 0 };
    const marked = Number(curVal.marked) || 0;
    values[block] = { max: Math.max(1, num(curVal.max, 6)), marked: i < marked ? i : i + 1 };
    const tracker = el.closest('.dc-tracker');
    if (tracker) {
      tracker.querySelectorAll('.dc-box').forEach(function (b, idx) {
        b.classList.toggle('on', idx < values[block].marked);
      });
      const count = tracker.querySelector('.dc-tracker-count');
      if (count) count.textContent = values[block].marked + '/' + values[block].max;
    }
    persistSoon(ctx.cid);
  };

  /* ---------------- 输入 ---------------- */

  RT.inputActs['dm-num'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    pathSet(ctx.item.values, el.getAttribute('data-dm-path'), el.value);
    persistSoon(ctx.cid);
  };

  RT.inputActs['dm-text'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    pathSet(ctx.item.values, el.getAttribute('data-dm-path'), el.value);
    persistSoon(ctx.cid);
  };

  RT.inputActs['dm-note'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    pathSet(ctx.item.values, el.getAttribute('data-dm-path'), el.value);
    persistSoon(ctx.cid);
  };

  RT.changeActs['dm-check'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx) return;
    pathSet(ctx.item.values, el.getAttribute('data-dm-path'), !!el.checked);
    persistSoon(ctx.cid);
  };

  RT.inputActs['dm-counter-val'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx || ctx.item.type !== 'counter') return;
    let v = Math.max(0, num(el.value, 0));
    if (ctx.item.kind === 'advanced') v = Math.min(num(ctx.item.max, 6), v);
    ctx.item.value = v;
    updateCounterDom(ctx.item, el);
    persistSoon(ctx.cid);
  };

  RT.inputActs['dm-counter-max'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx || ctx.item.type !== 'counter') return;
    const max = Math.max(1, Math.min(99, num(el.value, 6)));
    ctx.item.max = max;
    ctx.item.value = Math.min(max, num(ctx.item.value, 0));
    updateCounterDom(ctx.item, el);
    persistSoon(ctx.cid);
  };

  RT.inputActs['dm-counter-note'] = function (el) {
    const ctx = cardOf(el);
    if (!ctx || ctx.item.type !== 'counter') return;
    ctx.item.note = el.value;
    persistSoon(ctx.cid);
  };

  RT.inputActs['dmb-width'] = function (el) {
    const cid = cur();
    if (!cid) return;
    const b = data(cid);
    b.cardWidth = Math.min(520, Math.max(150, num(el.value, 220)));
    persistSoon(cid);
  };

  RT.inputActs['dmb-lib-search'] = function (el) {
    filter.q = el.value;
    paintLibList();
  };

  RT.changeActs['dmb-lib-sort'] = function (el) {
    filter.sort = el.value;
    paintLibList();
  };

  RT.changeActs['dmb-lib-type'] = function (el) {
    filter.lib = el.value;
    paintLibList();
  };

  RT.changeActs['dmb-lib-source'] = function (el) {
    filter.source = el.value;
    paintLibList();
  };

  RT.changeActs['dmb-lib-tier'] = function (el) {
    filter.tier = el.value;
    paintLibList();
  };

  RT.changeActs['dmb-lib-kind'] = function (el) {
    filter.kind = el.value;
    paintLibList();
  };

  /* ---------------- 指针：拖卡 / 改宽 / 平移 ---------------- */

  let gesture = null;

  function endGesture() {
    if (gesture) {
      gesture.cleanup();
      gesture = null;
    }
  }

  function bindDragOnce() {
    document.addEventListener('pointerdown', function (e) {
      const cid = viewCid();
      if (!cid) return;
      const b = data(cid);
      const stage = e.target.closest('#dmb-stage');

      /* 改宽 */
      const resize = e.target.closest('[data-dm-resize]');
      if (resize) {
        const item = itemById(b, resize.getAttribute('data-dm-resize'));
        if (!item || item.locked) return;
        e.preventDefault();
        const el = resize.closest('.dmb-card');
        const z = b.view.zoom;
        const startX = e.clientX;
        const startW = item.w;
        gesture = {
          cleanup: function () {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
          },
        };
        function move(ev) {
          item.w = Math.min(560, Math.max(160, Math.round(startW + (ev.clientX - startX) / z)));
          el.style.width = item.w + 'px';
        }
        function up() {
          endGesture();
          persist(cid);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        return;
      }

      /* 拖卡 */
      const head = e.target.closest('[data-dm-drag]');
      if (head && !e.target.closest('input,textarea,button,select,label')) {
        const item = itemById(b, head.getAttribute('data-dm-drag'));
        if (!item || item.locked) return;
        e.preventDefault();
        const el = head.closest('.dmb-card');
        const z = b.view.zoom;
        const sx = e.clientX;
        const sy = e.clientY;
        const ox = item.x;
        const oy = item.y;
        if (item.z !== nextZ(b) - 1) {
          item.z = nextZ(b);
          el.style.zIndex = 100 + item.z;
        }
        gesture = {
          cleanup: function () {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
          },
        };
        function move(ev) {
          item.x = Math.max(0, Math.round(ox + (ev.clientX - sx) / z));
          item.y = Math.max(0, Math.round(oy + (ev.clientY - sy) / z));
          el.style.left = item.x + 'px';
          el.style.top = item.y + 'px';
        }
        function up() {
          endGesture();
          persist(cid);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        return;
      }

      /* 平移 */
      if (!stage) return;
      const blank = e.target === stage || e.target.id === 'dmb-paper' ||
        e.target.id === 'dmb-canvas' || e.target.classList.contains('dmb-hint');
      if (!blank && e.button !== 1) return;
      e.preventDefault();
      const sl = stage.scrollLeft;
      const st = stage.scrollTop;
      const sx = e.clientX;
      const sy = e.clientY;
      gesture = {
        cleanup: function () {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          b.view.scrollX = stage.scrollLeft;
          b.view.scrollY = stage.scrollTop;
          persist(cid);
        },
      };
      function move(ev) {
        stage.scrollLeft = sl - (ev.clientX - sx);
        stage.scrollTop = st - (ev.clientY - sy);
      }
      function up() { endGesture(); }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });

    document.addEventListener('wheel', function (e) {
      const stage = e.target.closest && e.target.closest('#dmb-stage');
      if (!stage) return;
      const cid = viewCid();
      if (!cid) return;
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const b = data(cid);
      const r = stage.getBoundingClientRect();
      zoomAt(cid, e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    document.addEventListener('scroll', function (e) {
      if (e.target && e.target.id === 'dmb-stage') {
        const cid = viewCid();
        if (!cid) return;
        const b = data(cid);
        b.view.scrollX = e.target.scrollLeft;
        b.view.scrollY = e.target.scrollTop;
        persistSoon(cid);
      }
    }, true);

    /* 库 → 白板：拖放；拖文件进库面板 = 导入 */
    document.addEventListener('dragstart', function (e) {
      const row = e.target.closest && e.target.closest('.dmb-lib-row');
      if (!row) return;
      const id = row.getAttribute('data-id');
      if (!id) return;
      e.dataTransfer.setData('text/plain', 'dmlib:' + id);
      e.dataTransfer.effectAllowed = 'copy';
    });

    document.addEventListener('dragover', function (e) {
      const stage = e.target.closest && e.target.closest('#dmb-stage');
      if (stage) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        return;
      }
      const panel = e.target.closest && e.target.closest('.dmb-lib-panel');
      if (panel && e.dataTransfer && e.dataTransfer.types) {
        const hasFile = Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0;
        if (hasFile) e.preventDefault();
      }
    });

    document.addEventListener('drop', function (e) {
      const cid = viewCid();
      if (!cid) return;
      const stage = e.target.closest && e.target.closest('#dmb-stage');
      if (stage) {
        const raw = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
        if (!raw || raw.indexOf('dmlib:') !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const b = data(cid);
        const r = stage.getBoundingClientRect();
        const z = b.view.zoom;
        const x = Math.max(0, Math.round((stage.scrollLeft + e.clientX - r.left) / z - b.cardWidth / 2));
        const y = Math.max(0, Math.round((stage.scrollTop + e.clientY - r.top) / z - 24));
        addCardFromLib(cid, raw.slice(6), { x: x, y: y });
        return;
      }
      const panel = e.target.closest && e.target.closest('.dmb-lib-panel');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!panel || !file) return;
      e.preventDefault();
      e.stopPropagation();
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const res = RT.dmLib.importText(String(reader.result || ''));
          RT.toast('已导入 ' + res.added + ' 条' + (res.skipped ? '，跳过 ' + res.skipped + ' 条' : ''));
          RT.rerender('all');
        } catch (err) {
          RT.toast(err.message || '导入失败', 'warn');
        }
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  /* ---------------- 注册 ---------------- */

  RT.dmBoard = {
    refreshLibs: function () {
      if (document.querySelector('.dmb-view')) RT.rerender('all');
    },
  };

  function exportMd(cid) {
    const b = data(cid);
    if (!b.items.length) return '';
    const L = [];
    b.items.forEach(function (it) {
      if (it.type === 'counter') {
        L.push('### 计数：' + (it.label || '计数'));
        L.push('');
        L.push('- 数值：' + it.value + (it.kind === 'advanced' ? ' / ' + it.max : ''));
        if (it.note) L.push('- 备注：' + it.note);
        L.push('');
        return;
      }
      const tpl = templateOf(it);
      L.push('### ' + (it.title || (tpl ? tpl.name : '卡片')));
      if (tpl && Array.isArray(tpl.layout && tpl.layout.children)) {
        RT.tpl.walk(tpl.layout, function (n) {
          if (n.type !== 'field') return;
          const v = RT.tpl.getVal(it.values, n.id);
          if (n.comp === 'tracker') {
            const val = v && typeof v === 'object' ? v : { max: n.max, marked: 0 };
            L.push('- ' + (n.label || '计数') + '：' + (val.marked || 0) + '/' + (val.max || 0));
          } else if (n.comp === 'counter') {
            const val = v && typeof v === 'object' ? v : {};
            L.push('- ' + (n.label || '计数') + '：' + (val.value || 0) + '/' + (val.max || 0));
          } else if (n.comp === 'dice') {
            const val = v && typeof v === 'object' ? v : {};
            const last = val.last;
            if (last) {
              L.push('- ' + (n.label || '骰子') + '：' +
                (last.kind === 'duality'
                  ? ('希望 ' + last.hope + ' / 恐惧 ' + last.fear + ' → ' + last.outcome)
                  : (last.text || last.total)));
            }
          } else if (n.comp === 'stats' || n.comp === 'pairs' || n.comp === 'chips') {
            const obj = v && typeof v === 'object' ? v : {};
            const bits = (n.fields || []).filter(function (f) { return obj[f.id] != null && obj[f.id] !== ''; })
              .map(function (f) { return f.label + ' ' + obj[f.id]; });
            if (bits.length) L.push('- ' + (n.label ? n.label + '：' : '') + bits.join('，'));
          } else if (n.comp === 'note') {
            if (v) L.push('- 备注：' + v);
          } else if (n.comp === 'features') {
            (Array.isArray(v) ? v : []).forEach(function (f) {
              if (f && f.name) L.push('- ' + f.name + (f.type ? '（' + f.type + '）' : '') + (f.desc ? '：' + f.desc : ''));
            });
          }
        });
      }
      L.push('');
    });
    return L.join('\n');
  }

  RT.ws.register({
    id: 'dmboard',
    name: '追踪面板',
    icon: 'grid',
    kind: 'campaign',
    key: KEY,
    unit: '项',
    view: RT.viewDmBoard,
    side: RT.dmBoardSide,
    newBtn: RT.dmBoardNewBtn,
    count: function (cid) { return data(cid).items.length; },
    clear: function (cid) { delete cache[cid]; store.del(cid); },
    exportMd: exportMd,
    seed: function (cid) {
      store.set(cid, {
        items: [],
        view: {
          zoom: 1, scrollX: 0, scrollY: 0,
          panels: { left: true },
        },
        cardWidth: 220,
        dice: { mode: 'normal', expr: '1d20', adv: 'normal', mod: 0, last: null },
        v: 2,
      });
    },
  });

  bindDragOnce();

})(window.RT = window.RT || {});
