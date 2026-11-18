/* ============================================================
 * 19. 模板编辑器：单画布所见即所得
 *     记录表与卡片共用：拖容器 / 组件、按 12 列栅格拉宽、实时看成品。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const T = RT.tpl;
  const DRAFT_KEY = 'trpg_rt_tpl_draft_v1';
  const MAX_CONTAINER_DEPTH = 2;

  let st = null;          // { tpl, base, sel, undo, redo, preview, root }
  let draftTimer = null;

  /* ---------------- 基础 ---------------- */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function rootChildren() {
    if (!st.tpl.layout) st.tpl.layout = { type: 'root', cols: 12, children: [] };
    if (!Array.isArray(st.tpl.layout.children)) st.tpl.layout.children = [];
    return st.tpl.layout.children;
  }

  /** 按 "0.2.1" 定位节点；depth = 该节点之上有几层容器 */
  function locate(path) {
    if (path == null || path === '') return null;
    const idx = String(path).split('.').map(Number);
    let arr = rootChildren();
    let node = null;
    let depth = 0;
    for (let i = 0; i < idx.length; i++) {
      node = arr[idx[i]];
      if (!node) return null;
      if (i < idx.length - 1) {
        if (node.type === 'field') return null;
        if (!Array.isArray(node.children)) node.children = [];
        arr = node.children;
        depth++;
      }
    }
    return { node: node, arr: arr, idx: idx[idx.length - 1], depth: depth };
  }

  function parentPath(path) {
    const p = String(path).split('.');
    p.pop();
    return p.join('.');
  }

  function findPath(target) {
    let out = null;
    (function walkArr(arr, prefix) {
      for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        const p = prefix ? prefix + '.' + i : String(i);
        if (n === target) { out = p; return true; }
        if (n && n.children && walkArr(n.children, p)) return true;
      }
      return false;
    })(rootChildren(), '');
    return out;
  }

  function nodeName(n) {
    if (!n) return '';
    if (n.type === 'row') return '行';
    if (n.type === 'group') return '分组';
    return n.label || T.TYPE_NAME[n.comp] || '组件';
  }

  /* ---------------- 新建节点 ---------------- */

  const FULL_SPAN = {
    textarea: 1, list: 1, table: 1, repeat: 1, para: 1, features: 1,
    note: 1, tracker: 1, chips: 1, pairs: 1, stats: 1, heading: 1,
  };

  function makeField(comp) {
    const node = {
      id: RT.ws.uid('c'),
      type: 'field',
      comp: comp,
      start: 1,
      span: FULL_SPAN[comp] ? 12 : 6,
      label: T.TYPE_NAME[comp] || '字段',
    };
    if (comp === 'textarea' || comp === 'note') node.rows = 2;
    if (comp === 'number') node.step = 1;
    if (comp === 'select') node.options = ['选项 A', '选项 B'];
    if (comp === 'para') node.italic = false;
    if (comp === 'table') node.columns = [{ key: 'c1', label: '列 1', type: 'text' }];
    if (comp === 'repeat') {
      node.min = 1;
      node.itemLabel = '条目';
      node.fields = [{ id: RT.ws.uid('f'), type: 'text', label: '字段 1', width: 'half' }];
    }
    if (comp === 'chips' || comp === 'stats' || comp === 'pairs') {
      node.fields = [{ id: RT.ws.uid('f'), label: '字段 1' }];
    }
    if (comp === 'tracker') {
      node.max = 6;
      node.label = '计数';
    }
    return node;
  }

  function makeRow() {
    return { id: RT.ws.uid('r'), type: 'row', start: 1, span: 12, gap: 10, children: [] };
  }

  function makeGroup() {
    return { id: RT.ws.uid('g'), type: 'group', start: 1, span: 12, title: '分组', boxed: false, children: [] };
  }

  function makeNode(kind) {
    if (kind === 'row') return makeRow();
    if (kind === 'group') return makeGroup();
    return makeField(kind);
  }

  /* ---------------- 示例值 ---------------- */

  function demoField(node) {
    switch (node.comp) {
      case 'text': return node.placeholder || '示例文本';
      case 'textarea': return node.placeholder || '示例内容…';
      case 'number': return '0';
      case 'date': return '2026-01-01';
      case 'check': return false;
      case 'select': return (node.options && node.options[0]) || '';
      case 'table':
      case 'list':
      case 'repeat': return [];
      case 'chips': {
        const o = {};
        (node.fields || []).forEach(function (f) { o[f.id] = f.label === '位阶' ? '1' : '示例'; });
        return o;
      }
      case 'pairs': {
        const o = {};
        (node.fields || []).forEach(function (f) { o[f.id] = '值'; });
        return o;
      }
      case 'stats': {
        const o = {};
        (node.fields || []).forEach(function (f) { o[f.id] = '0'; });
        return o;
      }
      case 'tracker': return { max: Math.max(1, Number(node.max) || 6), marked: 0 };
      case 'counter': return { value: 0, max: Math.max(1, Number(node.max) || 6) };
      case 'dice': {
        const dual = node.mode === 'duality';
        return dual
          ? { mode: 'duality', expr: '2d12', last: { kind: 'duality', hope: 7, fear: 4, total: 11, outcome: '希望' } }
          : { mode: 'normal', expr: node.expr || '1d20', last: { kind: 'normal', total: 14, text: (node.expr || '1d20') + ' → 14 = 14' } };
      }
      case 'features': return [{ name: '特性名', type: '被动', desc: '示例描述，用来预览特性列表。', question: '示例问题？' }];
      case 'para': return '示例段落，用来预览卡片排版。';
      case 'note': return '';
      default: return '';
    }
  }

  function sampleValues() {
    const vals = {};
    T.walk(st.tpl.layout, function (n) { if (n.type === 'field') vals[n.id] = demoField(n); });
    const s = st.tpl.sample || {};
    Object.keys(s).forEach(function (k) {
      const a = vals[k];
      const b = s[k];
      if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object' && !Array.isArray(b)) {
        vals[k] = Object.assign({}, a, b);
      } else {
        vals[k] = b;
      }
    });
    return vals;
  }

  /* ---------------- 画布渲染 ---------------- */

  function fieldPreview(node) {
    const vals = sampleValues();
    const val = vals[node.id];
    if (st.tpl.kind === 'card' && RT.dmCard) {
      return RT.dmCard.renderField(node, node.id, val, { preview: true });
    }
    return T.renderSheetField(node, val, { preview: true });
  }

  function childrenHtml(list, path, emptyText) {
    if (!list || !list.length) return '<div class="tb-container-empty">' + emptyText + '</div>';
    return list.map(function (c, i) { return nodeHtml(c, path + '.' + i); }).join('');
  }

  function nodeHtml(node, path) {
    const b = T.box(node);
    const style = 'grid-column:' + b.start + ' / span ' + b.span;
    let inner;
    if (node.type === 'field') {
      inner = fieldPreview(node);
    } else if (node.type === 'row') {
      inner = '<div class="tb-row sx-grid12" style="gap:' + (Number(node.gap) || 10) + 'px">' +
        childrenHtml(node.children, path, '把组件拖进这一行') +
        '</div>';
    } else {
      inner = '<div class="tb-group-box' + (node.boxed ? ' boxed' : '') + '">' +
        '<div class="tb-group-title">' + esc(node.title || '分组') + '</div>' +
        '<div class="tb-group-body sx-grid12">' +
        childrenHtml(node.children, path, '把组件拖进这个分组') +
        '</div></div>';
    }
    return '<div class="tb-node tb-' + node.type + (st.sel === path ? ' selected' : '') +
      '" data-path="' + path + '" style="' + style + '">' +
      '<div class="tb-bar">' +
      '<span class="tb-grip" draggable="true" data-grip="' + path + '" title="按住拖动">⠿</span>' +
      '<span class="tb-bar-name">' + esc(nodeName(node)) + '</span>' +
      '<button class="tb-mini" data-tb="span-" data-path="' + path + '" title="减一列">−</button>' +
      '<span class="tb-span">' + b.span + '</span>' +
      '<button class="tb-mini" data-tb="span+" data-path="' + path + '" title="加一列">＋</button>' +
      '<button class="tb-mini" data-tb="dup" data-path="' + path + '" title="复制">⧉</button>' +
      (node.type === 'field' ? '' : '<button class="tb-mini" data-tb="add" data-path="' + path + '" title="往这里加组件">⊞</button>') +
      '<button class="tb-mini danger" data-tb="del" data-path="' + path + '" title="删除">×</button>' +
      '</div>' +
      '<div class="tb-inner">' + inner + '</div>' +
      '<span class="tb-resize" data-path="' + path + '" title="拖我改宽度"></span>' +
      '</div>';
  }

  function scrollState(el) {
    return el ? { top: el.scrollTop, left: el.scrollLeft } : null;
  }

  function restoreScroll(el, s) {
    if (!el || !s) return;
    el.scrollTop = s.top;
    el.scrollLeft = s.left;
  }

  function paintCanvas() {
    if (!st || !st.root) return;
    const host = st.root.querySelector('#tb-canvas');
    if (!host) return;
    const keep = scrollState(host);
    const body = st.root.querySelector('.modal-body');
    const keepBody = scrollState(body);
    const stage = st.root.querySelector('#tb-stage');
    if (stage) {
      stage.style.width = st.tpl.kind === 'card' ? Math.max(200, Math.min(520, Number(st.tpl.width) || 300)) + 'px' : '';
    }
    host.className = 'tb-canvas' + (st.preview ? ' tb-preview' : '');
    host.setAttribute('data-kind', st.tpl.kind || 'sheet');
    const gridCls = 'tb-grid ' + (st.tpl.kind === 'card' ? 'dc-grid12' : 'sx-grid12') +
      (st.tpl.responsive === 'stack' ? ' sx-stack' : '');
    const kids = rootChildren().map(function (n, i) { return nodeHtml(n, String(i)); }).join('');
    host.innerHTML =
      (kids ? '<div class="' + gridCls + '">' + kids + '</div>' : '') +
      (kids ? '' : '<div class="tb-empty">从左边拖组件进来，或点组件名加到画布。<br>' +
        '两个「单行文本」默认各占 6 列，会自动并排。<span class="dim">（窄屏按模板设置自动堆叠）</span></div>') +
      (st.preview ? '' : '<div class="tb-drop-tail">拖到画布空白处 = 加到最后</div>');
    restoreScroll(host, keep);
    restoreScroll(body, keepBody);
    requestAnimationFrame(function () {
      restoreScroll(host, keep);
      restoreScroll(body, keepBody);
    });
  }

  /* ---------------- 检查器 ---------------- */

  function textRow(label, key, val) {
    return '<label class="tb-ins-row"><span>' + esc(label) + '</span>' +
      '<input data-tb-field="' + key + '" value="' + RT.attr(val == null ? '' : val) + '"></label>';
  }

  function numRow(label, key, val) {
    return '<label class="tb-ins-row"><span>' + esc(label) + '</span>' +
      '<input type="number" data-tb-field="' + key + '" value="' + RT.attr(val == null ? '' : val) + '"></label>';
  }

  function boolRow(label, key, on) {
    return '<label class="tb-ins-check"><input type="checkbox" data-tb-field="' + key + '"' +
      (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }

  function selectRow(label, key, value, options) {
    return '<label class="tb-ins-row"><span>' + esc(label) + '</span>' +
      '<select data-tb-field="' + key + '">' +
      options.map(function (o) {
        return '<option value="' + o[0] + '"' + (String(value) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>';
  }

  function columnsEditor(n) {
    const cols = n.columns || (n.columns = []);
    return '<div class="tb-ins-sub">表格列</div>' +
      cols.map(function (c, i) {
        return '<div class="tb-ins-line">' +
          '<input data-tb-col="label" data-idx="' + i + '" value="' + RT.attr(c.label || '') + '" placeholder="列名">' +
          '<select data-tb-col="type" data-idx="' + i + '">' +
          ['text', 'number', 'check'].map(function (tp) {
            return '<option value="' + tp + '"' + (c.type === tp ? ' selected' : '') + '>' +
              (tp === 'text' ? '文本' : tp === 'number' ? '数字' : '勾选') + '</option>';
          }).join('') +
          '</select>' +
          '<button class="mini danger" data-tb="col-del" data-idx="' + i + '">' + RT.icon('x', 12) + '</button>' +
          '</div>';
      }).join('') +
      '<button class="btn ghost small" data-tb="col-add">' + RT.icon('plus', 12) + ' 加一列</button>';
  }

  function repeatFieldsEditor(n) {
    const fields = n.fields || (n.fields = []);
    return '<div class="tb-ins-sub">组内字段</div>' +
      fields.map(function (f, i) {
        return '<div class="tb-ins-line">' +
          '<input data-tb-repfield="label" data-idx="' + i + '" value="' + RT.attr(f.label || '') + '" placeholder="字段名">' +
          '<select data-tb-repfield="type" data-idx="' + i + '">' +
          ['text', 'textarea', 'number', 'date', 'check', 'select', 'list'].map(function (tp) {
            return '<option value="' + tp + '"' + (f.type === tp ? ' selected' : '') + '>' +
              (T.TYPE_NAME[tp] || tp) + '</option>';
          }).join('') +
          '</select>' +
          '<button class="mini" data-tb="repfield-width" data-idx="' + i + '" title="切换半宽 / 整行">' +
          (f.width === 'half' ? '半宽' : '整行') + '</button>' +
          '<button class="mini danger" data-tb="repfield-del" data-idx="' + i + '">' + RT.icon('x', 12) + '</button>' +
          '</div>';
      }).join('') +
      '<button class="btn ghost small" data-tb="repfield-add">' + RT.icon('plus', 12) + ' 加一个字段</button>';
  }

  function subFieldsEditor(n) {
    const fields = n.fields || (n.fields = []);
    return '<div class="tb-ins-sub">字段</div>' +
      fields.map(function (f, i) {
        return '<div class="tb-ins-line">' +
          '<input data-tb-subfield="label" data-idx="' + i + '" value="' + RT.attr(f.label || '') + '" placeholder="字段名">' +
          '<button class="mini danger" data-tb="subfield-del" data-idx="' + i + '">' + RT.icon('x', 12) + '</button>' +
          '</div>';
      }).join('') +
      '<button class="btn ghost small" data-tb="subfield-add">' + RT.icon('plus', 12) + ' 加一个字段</button>';
  }

  function optionsEditor(n) {
    return '<label class="tb-ins-row tb-ins-col"><span>下拉选项</span>' +
      '<textarea rows="3" data-tb-field="optionsText">' + esc((n.options || []).join('\n')) + '</textarea></label>';
  }

  function compInspector(n) {
    let html = '';
    switch (n.comp) {
      case 'text':
        html += textRow('占位提示', 'placeholder', n.placeholder || '');
        break;
      case 'textarea':
      case 'note':
        html += textRow('占位提示', 'placeholder', n.placeholder || '');
        html += numRow('行数', 'rows', n.rows == null ? 2 : n.rows);
        break;
      case 'number':
        html += textRow('占位提示', 'placeholder', n.placeholder || '');
        html += numRow('步长', 'step', n.step == null ? 1 : n.step);
        break;
      case 'select':
        html += optionsEditor(n);
        break;
      case 'para':
        html += boolRow('斜体段落', 'italic', !!n.italic);
        break;
      case 'table':
        html += columnsEditor(n);
        break;
      case 'repeat':
        html += numRow('至少几组', 'min', n.min == null ? 1 : n.min);
        html += textRow('条目称呼', 'itemLabel', n.itemLabel || '');
        html += repeatFieldsEditor(n);
        break;
      case 'chips':
      case 'stats':
      case 'pairs':
        html += subFieldsEditor(n);
        break;
      case 'tracker':
        html += numRow('默认格数', 'max', n.max == null ? 6 : n.max);
        break;
      case 'counter':
        html += numRow('默认上限', 'max', n.max == null ? 6 : n.max);
        break;
      case 'dice':
        html += selectRow('骰子类型', 'mode', n.mode === 'duality' ? 'duality' : 'normal', [
          ['normal', '通用骰'],
          ['duality', '二元骰（2d12 希望 / 恐惧）'],
        ]);
        html += textRow('默认骰式', 'expr', n.expr || '1d20');
        break;
      default:
        break;
    }
    return html;
  }

  function tplRow(label, key, val, type) {
    return '<label class="tb-ins-row"><span>' + esc(label) + '</span>' +
      '<input ' + (type ? 'type="' + type + '" ' : '') + 'data-tpl-field="' + key +
      '" value="' + RT.attr(val == null ? '' : val) + '"></label>';
  }

  function tplInspector() {
    const t = st.tpl;
    let html = '<div class="tb-ins-head"><span>模板设置</span></div>' +
      tplRow('模板名', 'name', t.name) +
      '<p class="tb-ins-note">种类：' + esc(T.kindName(t)) + '。画布里点任意组件可编辑它的属性。</p>' +
      '<div class="tb-ins-row"><span>窄屏</span><select data-tpl-field="responsive">' +
      '<option value="stack"' + (t.responsive !== 'keep' ? ' selected' : '') + '>自动堆成一列</option>' +
      '<option value="keep"' + (t.responsive === 'keep' ? ' selected' : '') + '>保持栅格</option>' +
      '</select></div>';
    if (t.kind === 'card') {
      html += tplRow('卡片宽度', 'width', Math.max(200, Math.min(520, Number(t.width) || 300)), 'number');
      html += '<div class="tb-ins-row"><span>强调色</span><select data-tpl-field="accent">' +
        [['', '默认'], ['gold', '金'], ['danger', '赤'], ['info', '青'], ['muted', '灰']].map(function (p) {
          return '<option value="' + p[0] + '"' + ((t.accent || '') === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
        }).join('') + '</select></div>';
    }
    html += '<p class="tb-ins-note">两个短组件各占 6 列就会自动并排；想更自由就改「起始列」。' +
      '容器最多套两层。</p>';
    return html;
  }

  const CONTAINER_DESC = {
    row: '横向容器：把几个短组件并排放，比如「场次 + 日期」或三个属性。窄屏会按模板设置自动堆成一列。',
    group: '分区容器：带标题，把相关组件框在一起，比如「世界的六条真相」。分组里还能放行，最多套两层。',
  };

  function compDesc(type) {
    const c = T.COMPONENTS.filter(function (x) { return x.type === type; })[0];
    return c ? (c.desc || '') : '';
  }

  function helpHtml(text) {
    return text ? '<p class="tb-ins-help">' + esc(text) + '</p>' : '';
  }

  function paintInspector() {
    if (!st || !st.root) return;
    const host = st.root.querySelector('#tb-inspector');
    if (!host) return;
    const keep = scrollState(host);
    const body = st.root.querySelector('.modal-body');
    const keepBody = scrollState(body);
    if (!st.sel) {
      host.innerHTML = tplInspector();
      restoreScroll(host, keep);
      restoreScroll(body, keepBody);
      return;
    }
    const loc = locate(st.sel);
    if (!loc) {
      st.sel = null;
      host.innerHTML = tplInspector();
      restoreScroll(host, keep);
      restoreScroll(body, keepBody);
      return;
    }
    const n = loc.node;
    let html = '<div class="tb-ins-head"><span>' + esc(nodeName(n)) + '</span>' +
      '<button class="mini" data-tb="sel-close" title="取消选择">' + RT.icon('x', 12) + '</button></div>';
    if (n.type === 'row') {
      html += helpHtml(CONTAINER_DESC.row);
      html += numRow('列间距', 'gap', n.gap == null ? 10 : n.gap);
    } else if (n.type === 'group') {
      html += helpHtml(CONTAINER_DESC.group);
      html += textRow('分区标题', 'title', n.title || '');
      html += boolRow('显示外框', 'boxed', !!n.boxed);
    } else {
      html += helpHtml(compDesc(n.comp));
      if (n.comp !== 'heading') html += textRow('标签', 'label', n.label || '');
      html += compInspector(n);
    }
    html += '<div class="tb-ins-sub">位置</div>' +
      numRow('起始列', 'start', T.box(n).start) +
      numRow('跨列', 'span', T.box(n).span);
    host.innerHTML = html;
    restoreScroll(host, keep);
    restoreScroll(body, keepBody);
  }

  /* ---------------- 顶部 / 外壳 ---------------- */

  function paletteHtml() {
    const isCard = st.tpl.kind === 'card';
    const comps = T.compsFor(isCard ? 'card' : 'sheet');
    return '<div class="tb-pal-head">容器</div>' +
      '<button class="tb-chip" draggable="true" data-comp="row" title="' + RT.attr(CONTAINER_DESC.row) + '">行</button>' +
      '<button class="tb-chip" draggable="true" data-comp="group" title="' + RT.attr(CONTAINER_DESC.group) + '">分组</button>' +
      '<div class="tb-pal-head">组件</div>' +
      comps.map(function (c) {
        return '<button class="tb-chip" draggable="true" data-comp="' + c.type + '" title="' +
          RT.attr(c.desc || c.name) + '">' + esc(c.name) + '</button>';
      }).join('') +
      '<p class="tb-pal-tip">拖进画布任意位置；单击加到选中容器，没选中就加到最后。选中组件后右侧会显示它的用途说明。</p>';
  }

  function shell() {
    return '<div class="tb-wrap">' +
      '<div class="tb-top">' +
      '<label class="dim">模板名</label>' +
      '<input id="tb-name" class="grow" value="' + RT.attr(st.tpl.name || '') + '" autocomplete="off">' +
      '<span class="tb-kind">' + esc(T.kindName(st.tpl)) + '</span>' +
      '<button class="btn ghost small" data-tb="undo">撤销</button>' +
      '<button class="btn ghost small" data-tb="redo">重做</button>' +
      '<button class="btn ghost small" data-tb="preview">成品预览</button>' +
      '<button class="btn ghost small" data-tb="discard">丢弃草稿</button>' +
      '<button class="btn gold small" data-tb="save">保存</button>' +
      '<button class="btn ghost small" data-tb="save-close">保存并关闭</button>' +
      '<button class="btn ghost small" data-tb="cancel">取消</button>' +
      '</div>' +
      '<div class="tb-main">' +
      '<div class="tb-palette">' + paletteHtml() + '</div>' +
      '<div class="tb-stage">' +
      '<div class="tb-stage-inner" id="tb-stage"><div class="tb-canvas" id="tb-canvas"></div></div>' +
      '<div class="tb-stage-foot">拖 ⠿ 移动 · 拖右边缘改宽度 · Delete 删除 · Ctrl+Z 撤销 · 输入框里填的是示例值</div>' +
      '</div>' +
      '<div class="tb-inspector" id="tb-inspector"></div>' +
      '</div></div>';
  }

  function syncName() {
    if (!st || !st.root) return;
    const inp = st.root.querySelector('#tb-name');
    if (inp && inp.value !== st.tpl.name) inp.value = st.tpl.name || '';
  }

  function updateButtons() {
    if (!st || !st.root) return;
    const undo = st.root.querySelector('[data-tb="undo"]');
    const redo = st.root.querySelector('[data-tb="redo"]');
    const prev = st.root.querySelector('[data-tb="preview"]');
    if (undo) undo.disabled = !st.undo.length;
    if (redo) redo.disabled = !st.redo.length;
    if (prev) prev.classList.toggle('active', !!st.preview);
  }

  function refreshAll() {
    paintCanvas();
    paintInspector();
    syncName();
    updateButtons();
    saveDraft();
  }

  function refreshCanvas() {
    paintCanvas();
    updateButtons();
    saveDraft();
  }

  /* ---------------- 撤销 / 草稿 ---------------- */

  function snapshot() {
    return clone({
      layout: st.tpl.layout,
      name: st.tpl.name,
      sample: st.tpl.sample || {},
      width: st.tpl.width,
      accent: st.tpl.accent,
      responsive: st.tpl.responsive,
    });
  }

  function pushUndo() {
    st.undo.push(snapshot());
    if (st.undo.length > 60) st.undo.shift();
    st.redo.length = 0;
  }

  function applySnapshot(s) {
    st.tpl.layout = clone(s.layout);
    st.tpl.name = s.name;
    st.tpl.sample = clone(s.sample || {});
    if (s.width != null) st.tpl.width = s.width;
    if (s.accent != null) st.tpl.accent = s.accent;
    if (s.responsive) st.tpl.responsive = s.responsive;
    st.sel = null;
    refreshAll();
  }

  function undo() {
    if (!st.undo.length) return;
    st.redo.push(snapshot());
    applySnapshot(st.undo.pop());
  }

  function redo() {
    if (!st.redo.length) return;
    st.undo.push(snapshot());
    applySnapshot(st.redo.pop());
  }

  function saveDraft() {
    if (!st) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      if (!st) return;
      try {
        RT.storage.set(DRAFT_KEY, JSON.stringify({ id: st.tpl.id, tpl: st.tpl, ts: Date.now() }));
      } catch (e) { /* 超限就算了 */ }
    }, 400);
  }

  function clearDraft() {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
    try { RT.storage.del(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  function loadDraft(id) {
    try {
      const raw = RT.storage.get(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (d && d.id === id && d.tpl) return d.tpl;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------------- 添加 / 删除 / 复制 ---------------- */

  function insertionTarget() {
    if (!st.sel) {
      return { arr: rootChildren(), index: rootChildren().length, depth: 0 };
    }
    const loc = locate(st.sel);
    if (!loc) return { arr: rootChildren(), index: rootChildren().length, depth: 0 };
    if (loc.node.type !== 'field') {
      const arr = loc.node.children || (loc.node.children = []);
      return { arr: arr, index: arr.length, depth: loc.depth + 1, container: loc.node };
    }
    return { arr: loc.arr, index: loc.idx + 1, depth: loc.depth };
  }

  function addComp(kind) {
    const target = insertionTarget();
    const node = makeNode(kind);
    if (node.type !== 'field' && target.depth > MAX_CONTAINER_DEPTH) {
      RT.toast('容器最多套两层', 'warn');
      return;
    }
    pushUndo();
    target.arr.splice(target.index, 0, node);
    st.sel = findPath(node);
    refreshAll();
  }

  function deleteNode(path) {
    const loc = locate(path);
    if (!loc) return;
    pushUndo();
    loc.arr.splice(loc.idx, 1);
    st.sel = null;
    refreshAll();
  }

  function duplicateNode(path) {
    const loc = locate(path);
    if (!loc) return;
    pushUndo();
    const copy = clone(loc.node);
    copy.id = loc.node.type === 'field' ? RT.ws.uid('c') : RT.ws.uid(loc.node.type === 'row' ? 'r' : 'g');
    (function renew(n) {
      if (n.type === 'field') {
        if (n.comp === 'table') {
          (n.columns || []).forEach(function (c) { c.key = RT.ws.uid('k'); });
        }
        if (n.comp === 'repeat') {
          (n.fields || []).forEach(function (f) { f.id = RT.ws.uid('f'); });
        }
        if (n.comp === 'chips' || n.comp === 'stats' || n.comp === 'pairs') {
          (n.fields || []).forEach(function (f) { f.id = RT.ws.uid('f'); });
        }
      }
      (n.children || []).forEach(renew);
    })(copy);
    loc.arr.splice(loc.idx + 1, 0, copy);
    st.sel = findPath(copy);
    refreshAll();
  }

  function changeSpan(path, delta) {
    const loc = locate(path);
    if (!loc) return;
    pushUndo();
    const b = T.box(loc.node);
    loc.node.span = Math.max(1, Math.min(12, b.span + delta));
    st.sel = path;
    refreshAll();
  }

  /* ---------------- 拖拽 ---------------- */

  let dragPayload = null;

  function payloadFromEvent(e) {
    if (dragPayload) return dragPayload;
    const raw = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    if (!raw) return null;
    if (raw.indexOf('comp:') === 0) return { kind: 'comp', comp: raw.slice(5) };
    if (raw.indexOf('node:') === 0) return { kind: 'node', path: raw.slice(5) };
    return null;
  }

  function containerDepthFor(target) {
    if (!target) return 99;
    if (target.mode === 'root') return 0;
    if (target.mode === 'inside') {
      const loc = locate(target.containerPath);
      return loc ? loc.depth + 1 : 99;
    }
    const loc = locate(target.path);
    return loc ? loc.depth : 99;
  }

  function findTarget(e) {
    if (!st || !st.root) return null;
    const canvas = st.root.querySelector('#tb-canvas');
    if (!canvas) return null;
    const grid = canvas.querySelector('.tb-grid');
    const nodeEl = e.target.closest ? e.target.closest('.tb-node') : null;
    if (!nodeEl) {
      return { mode: 'root', nodeEl: null, arr: rootChildren(), index: rootChildren().length };
    }
    const path = nodeEl.getAttribute('data-path');
    const loc = locate(path);
    if (!loc) return null;
    /* 指到容器内部的空白/间距时算“放进容器”：
       closest('.tb-node') 会命中容器自身，要排除的是它下面真正的子节点 */
    const inner = nodeEl.querySelector('.tb-inner');
    const hitNode = e.target.closest ? e.target.closest('.tb-node') : null;
    const overInner = !!(inner && inner.contains(e.target) && (!hitNode || hitNode === nodeEl));
    if (loc.node.type !== 'field' && overInner) {
      return { mode: 'inside', containerPath: path, nodeEl: nodeEl, arr: null, index: -1 };
    }
    const parentLoc = locate(parentPath(path));
    const horizontal = parentLoc && parentLoc.node.type === 'row';
    const rect = nodeEl.getBoundingClientRect();
    const mid = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const before = horizontal ? e.clientX < mid : e.clientY < mid;
    return {
      mode: before ? 'before' : 'after',
      path: path,
      nodeEl: nodeEl,
      arr: loc.arr,
      index: loc.idx + (before ? 0 : 1),
    };
  }

  function dropAllowed(payload, target) {
    if (!payload || !target) return false;
    let isContainer = false;
    if (payload.kind === 'comp') {
      isContainer = payload.comp === 'row' || payload.comp === 'group';
    } else {
      const src = locate(payload.path);
      if (!src) return false;
      isContainer = src.node.type !== 'field';
      if (target.mode === 'inside') {
        if (target.containerPath === payload.path ||
          String(target.containerPath).indexOf(payload.path + '.') === 0) return false;
      }
      if (target.mode !== 'inside' && target.path === payload.path) return false;
    }
    if (!isContainer) return true;
    return containerDepthFor(target) <= MAX_CONTAINER_DEPTH;
  }

  function clearDropMarks() {
    if (!st || !st.root) return;
    st.root.querySelectorAll('.tb-drop-before, .tb-drop-after, .tb-drop-inside, .tb-drop-end')
      .forEach(function (el) {
        el.classList.remove('tb-drop-before', 'tb-drop-after', 'tb-drop-inside', 'tb-drop-end');
      });
  }

  function markDrop(target) {
    clearDropMarks();
    if (!target || !st.root) return;
    if (target.nodeEl) {
      target.nodeEl.classList.add(target.mode === 'inside'
        ? 'tb-drop-inside'
        : target.mode === 'before' ? 'tb-drop-before' : 'tb-drop-after');
    } else {
      const grid = st.root.querySelector('#tb-canvas .tb-grid');
      if (grid) grid.classList.add('tb-drop-end');
    }
  }

  function performDrop(payload, target) {
    if (!dropAllowed(payload, target)) return;
    let node = null;
    let src = null;
    if (payload.kind === 'comp') {
      node = makeNode(payload.comp);
    } else {
      src = locate(payload.path);
      if (!src) return;
      node = src.node;
    }
    pushUndo();
    let arr = null;
    let index = 0;
    if (target.mode === 'root') {
      arr = rootChildren();
      index = arr.length;
    } else if (target.mode === 'inside') {
      const loc = locate(target.containerPath);
      if (!loc) return;
      arr = loc.node.children || (loc.node.children = []);
      index = arr.length;
    } else {
      const loc = locate(target.path);
      if (!loc) return;
      arr = loc.arr;
      index = loc.idx + (target.mode === 'after' ? 1 : 0);
    }
    if (src) {
      if (src.arr === arr && src.idx < index) index--;
      src.arr.splice(src.idx, 1);
    }
    index = Math.max(0, Math.min(arr.length, index));
    arr.splice(index, 0, node);
    clearDropMarks();
    st.sel = findPath(node);
    refreshAll();
  }

  function bindDrag() {
    const root = st.root;

    root.addEventListener('dragstart', function (e) {
      const chip = e.target.closest('[data-comp]');
      if (chip) {
        dragPayload = { kind: 'comp', comp: chip.getAttribute('data-comp') };
        e.dataTransfer.setData('text/plain', 'comp:' + dragPayload.comp);
        e.dataTransfer.effectAllowed = 'copy';
        return;
      }
      const grip = e.target.closest('[data-grip]');
      if (grip) {
        dragPayload = { kind: 'node', path: grip.getAttribute('data-grip') };
        e.dataTransfer.setData('text/plain', 'node:' + dragPayload.path);
        e.dataTransfer.effectAllowed = 'move';
        const nodeEl = grip.closest('.tb-node');
        if (nodeEl) nodeEl.classList.add('tb-dragging');
        return;
      }
      e.preventDefault();
    });

    root.addEventListener('dragend', function () {
      dragPayload = null;
      clearDropMarks();
      root.querySelectorAll('.tb-dragging').forEach(function (x) { x.classList.remove('tb-dragging'); });
    });

    root.addEventListener('dragover', function (e) {
      if (!dragPayload) return;
      const overCanvas = e.target.closest && e.target.closest('#tb-canvas');
      if (!overCanvas) { clearDropMarks(); return; }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = dragPayload.kind === 'comp' ? 'copy' : 'move';
      const target = findTarget(e);
      if (dropAllowed(dragPayload, target)) markDrop(target);
      else clearDropMarks();
    });

    root.addEventListener('drop', function (e) {
      const overCanvas = e.target.closest && e.target.closest('#tb-canvas');
      if (!overCanvas) return;
      e.preventDefault();
      e.stopPropagation();
      const payload = payloadFromEvent(e);
      const target = findTarget(e);
      dragPayload = null;
      performDrop(payload, target);
    });
  }

  /* ---------------- 检查器输入 ---------------- */

  function setSample(path, val) {
    if (!st.tpl.sample) st.tpl.sample = {};
    const parts = String(path).split('.');
    if (parts.length === 1) {
      st.tpl.sample[parts[0]] = val;
      return;
    }
    const id = parts[0];
    const field = parts[1];
    if (!st.tpl.sample[id] || typeof st.tpl.sample[id] !== 'object') st.tpl.sample[id] = {};
    st.tpl.sample[id][field] = val;
  }

  function bindInputs() {
    const root = st.root;

    root.addEventListener('input', function (e) {
      const el = e.target;

      if (el.id === 'tb-name') {
        st.tpl.name = el.value;
        saveDraft();
        return;
      }

      if (el.hasAttribute('data-tpl-field')) {
        const key = el.getAttribute('data-tpl-field');
        if (key === 'width') st.tpl.width = Math.max(200, Math.min(520, Number(el.value) || 300));
        else st.tpl[key] = el.value;
        if (key !== 'name') paintCanvas();
        saveDraft();
        return;
      }

      if (el.hasAttribute('data-tb-sample')) {
        setSample(el.getAttribute('data-tb-sample'), el.value);
        saveDraft();
        return;
      }
      if (el.hasAttribute('data-tb-sample-check')) {
        setSample(el.getAttribute('data-tb-sample-check'), !!el.checked);
        saveDraft();
        return;
      }

      if (!st.sel) return;
      const loc = locate(st.sel);
      if (!loc) return;
      const n = loc.node;

      if (el.hasAttribute('data-tb-field')) {
        const key = el.getAttribute('data-tb-field');
        if (key === 'optionsText') {
          n.options = el.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        } else if (key === 'start' || key === 'span' || key === 'gap' || key === 'rows' ||
          key === 'min' || key === 'max' || key === 'step') {
          n[key] = Number(el.value);
          paintCanvas();
        } else if (key === 'boxed' || key === 'italic') {
          n[key] = !!el.checked;
          paintCanvas();
        } else {
          n[key] = el.value;
          paintCanvas();
        }
        saveDraft();
        return;
      }

      if (el.hasAttribute('data-tb-col')) {
        const i = Number(el.getAttribute('data-idx'));
        if (!n.columns) n.columns = [];
        if (!n.columns[i]) n.columns[i] = { key: RT.ws.uid('k'), label: '', type: 'text' };
        n.columns[i].label = el.value;
        paintCanvas();
        saveDraft();
        return;
      }

      if (el.hasAttribute('data-tb-repfield')) {
        const i = Number(el.getAttribute('data-idx'));
        if (!n.fields) n.fields = [];
        if (!n.fields[i]) n.fields[i] = { id: RT.ws.uid('f'), label: '', type: 'text', width: 'half' };
        n.fields[i].label = el.value;
        paintCanvas();
        saveDraft();
        return;
      }

      if (el.hasAttribute('data-tb-subfield')) {
        const i = Number(el.getAttribute('data-idx'));
        if (!n.fields) n.fields = [];
        if (!n.fields[i]) n.fields[i] = { id: RT.ws.uid('f'), label: '' };
        n.fields[i].label = el.value;
        paintCanvas();
        saveDraft();
      }
    });

    root.addEventListener('change', function (e) {
      const el = e.target;
      if (el.hasAttribute('data-tb-col') && el.tagName === 'SELECT') {
        const loc = st.sel && locate(st.sel);
        if (!loc) return;
        loc.node.columns[Number(el.getAttribute('data-idx'))].type = el.value;
        paintCanvas();
        saveDraft();
      } else if (el.hasAttribute('data-tb-repfield') && el.tagName === 'SELECT') {
        const loc = st.sel && locate(st.sel);
        if (!loc) return;
        loc.node.fields[Number(el.getAttribute('data-idx'))].type = el.value;
        paintCanvas();
        saveDraft();
      } else if (el.hasAttribute('data-tpl-field')) {
        st.tpl[el.getAttribute('data-tpl-field')] = el.value;
        paintCanvas();
        saveDraft();
      } else if (el.hasAttribute('data-tb-field')) {
        const loc = st.sel && locate(st.sel);
        if (!loc) return;
        const key = el.getAttribute('data-tb-field');
        loc.node[key] = el.type === 'checkbox' ? !!el.checked : el.value;
        paintCanvas();
        saveDraft();
      }
    });
  }

  /* ---------------- 点击 ---------------- */

  function bindClicks() {
    const root = st.root;

    root.addEventListener('click', function (e) {
      const step = e.target.closest('[data-tb-counter-step]');
      if (step) {
        if (!st.tpl.sample || typeof st.tpl.sample !== 'object') st.tpl.sample = {};
        const raw = step.getAttribute('data-tb-counter-step').split(':');
        const id = raw[0];
        const d = Number(raw[1]) || 1;
        const loc = locate(findPathById(id));
        const node = loc && loc.node;
        const cur = st.tpl.sample[id] && typeof st.tpl.sample[id] === 'object'
          ? st.tpl.sample[id]
          : { value: 0, max: (node && Number(node.max)) || 6 };
        const max = Math.max(1, Number(cur.max) || 6);
        const value = Math.max(0, Math.min(max, Number(cur.value) || 0) + d);
        st.tpl.sample[id] = { value: value, max: max };
        paintCanvas();
        saveDraft();
        return;
      }

      const box = e.target.closest('[data-tb-sample-box]');
      if (box) {
        if (!st.tpl.sample || typeof st.tpl.sample !== 'object') st.tpl.sample = {};
        const raw = box.getAttribute('data-tb-sample-box').split(':');
        const id = raw[0];
        const i = Number(raw[1]);
        const loc = locate(findPathById(id));
        const cur = (st.tpl.sample[id] && typeof st.tpl.sample[id] === 'object')
          ? st.tpl.sample[id]
          : { max: (loc && Number(loc.node.max)) || 6, marked: 0 };
        const marked = Number(cur.marked) || 0;
        st.tpl.sample[id] = { max: cur.max || (loc && Number(loc.node.max)) || 6, marked: i < marked ? i : i + 1 };
        paintCanvas();
        saveDraft();
        return;
      }

      const chip = e.target.closest('.tb-chip');
      if (chip) {
        e.preventDefault();
        addComp(chip.getAttribute('data-comp'));
        return;
      }

      const btn = e.target.closest('[data-tb]');
      if (btn) {
        e.preventDefault();
        const act = btn.getAttribute('data-tb');
        const path = btn.getAttribute('data-path');
        switch (act) {
          case 'undo': undo(); return;
          case 'redo': redo(); return;
          case 'preview':
            st.preview = !st.preview;
            paintCanvas();
            updateButtons();
            return;
          case 'discard':
            RT.dialogs.confirm('丢弃草稿', '会把画布恢复成上次保存的版本，未保存的改动全部丢掉。', function () {
              st.tpl = clone(st.base);
              st.sel = null;
              clearDraft();
              refreshAll();
            }, true);
            return;
          case 'save': save(false); return;
          case 'save-close': save(true); return;
          case 'cancel': cancel(); return;
          case 'sel-close': st.sel = null; paintCanvas(); paintInspector(); return;
          case 'span-': changeSpan(path, -1); return;
          case 'span+': changeSpan(path, 1); return;
          case 'dup': duplicateNode(path); return;
          case 'del': deleteNode(path); return;
          case 'add':
            st.sel = path;
            paintCanvas();
            paintInspector();
            RT.toast('已选中这个容器，点左边组件加进来');
            return;
          case 'col-add': {
            const loc = locate(st.sel);
            if (!loc) return;
            pushUndo();
            const cols = loc.node.columns || (loc.node.columns = []);
            cols.push({ key: RT.ws.uid('k'), label: '列 ' + (cols.length + 1), type: 'text' });
            refreshAll();
            return;
          }
          case 'col-del': {
            const loc = locate(st.sel);
            if (!loc) return;
            pushUndo();
            loc.node.columns.splice(Number(btn.getAttribute('data-idx')), 1);
            refreshAll();
            return;
          }
          case 'repfield-add': {
            const loc = locate(st.sel);
            if (!loc) return;
            pushUndo();
            const fields = loc.node.fields || (loc.node.fields = []);
            fields.push({ id: RT.ws.uid('f'), type: 'text', label: '字段 ' + (fields.length + 1), width: 'half' });
            refreshAll();
            return;
          }
          case 'repfield-del': {
            const loc = locate(st.sel);
            if (!loc) return;
            pushUndo();
            loc.node.fields.splice(Number(btn.getAttribute('data-idx')), 1);
            refreshAll();
            return;
          }
          case 'repfield-width': {
            const loc = locate(st.sel);
            if (!loc) return;
            pushUndo();
            const f = loc.node.fields[Number(btn.getAttribute('data-idx'))];
            f.width = f.width === 'half' ? 'full' : 'half';
            refreshAll();
            return;
          }
          case 'subfield-add': {
            const loc = locate(st.sel);
            if (!loc) return;
            pushUndo();
            const fields = loc.node.fields || (loc.node.fields = []);
            fields.push({ id: RT.ws.uid('f'), label: '字段 ' + (fields.length + 1) });
            refreshAll();
            return;
          }
          case 'subfield-del': {
            const loc = locate(st.sel);
            if (!loc) return;
            pushUndo();
            loc.node.fields.splice(Number(btn.getAttribute('data-idx')), 1);
            refreshAll();
            return;
          }
          default:
            return;
        }
      }

      const nodeEl = e.target.closest('.tb-node');
      if (nodeEl && root.contains(nodeEl)) {
        const path = nodeEl.getAttribute('data-path');
        if (st.sel !== path) {
          st.sel = path;
          /* 点输入框只是选中，不能重画画布，否则焦点会丢 */
          if (e.target.closest('input,textarea,select')) {
            root.querySelectorAll('.tb-node.selected').forEach(function (x) { x.classList.remove('selected'); });
            nodeEl.classList.add('selected');
            paintInspector();
            updateButtons();
          } else {
            paintCanvas();
            paintInspector();
          }
        }
        return;
      }

      if (e.target.closest('#tb-canvas')) {
        if (st.sel) {
          st.sel = null;
          paintCanvas();
          paintInspector();
        }
      }
    });
  }

  function findPathById(id) {
    let out = null;
    T.walk(st.tpl.layout, function (node) {
      if (node.type === 'field' && node.id === id) out = findPath(node);
    });
    return out;
  }

  /* ---------------- 容器宽度拖拽 ---------------- */

  function bindResize() {
    st.root.addEventListener('pointerdown', function (e) {
      const handle = e.target.closest('.tb-resize');
      if (!handle) return;
      e.preventDefault();
      e.stopPropagation();
      const path = handle.getAttribute('data-path');
      const loc = locate(path);
      if (!loc) return;
      const nodeEl = handle.closest('.tb-node');
      const grid = st.root.querySelector('#tb-canvas .tb-grid');
      const gridW = grid ? grid.getBoundingClientRect().width : 600;
      const colW = gridW / 12;
      const startX = e.clientX;
      const startSpan = T.box(loc.node).span;
      let changed = false;

      function move(ev) {
        const span = Math.max(2, Math.min(12, Math.round(startSpan + (ev.clientX - startX) / colW)));
        if (span === T.box(loc.node).span) return;
        loc.node.span = span;
        const b = T.box(loc.node);
        if (nodeEl) nodeEl.style.gridColumn = b.start + ' / span ' + b.span;
        const spanEl = nodeEl && nodeEl.querySelector('.tb-span');
        if (spanEl) spanEl.textContent = b.span;
        changed = true;
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (changed) {
          saveDraft();
          paintInspector();
        }
      }
      pushUndo();
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  /* ---------------- 保存 / 取消 ---------------- */

  function isDirty() {
    try {
      return JSON.stringify(st.tpl) !== JSON.stringify(st.base);
    } catch (e) {
      return true;
    }
  }

  /* 哪些组件必须有标签；chips / pairs / para / features / heading 允许留空 */
  const LABEL_REQUIRED = {
    text: 1, textarea: 1, number: 1, date: 1, select: 1, check: 1,
    list: 1, table: 1, repeat: 1, tracker: 1, note: 1,
  };

  function save(close) {
    const nameEl = st.root.querySelector('#tb-name');
    if (nameEl) st.tpl.name = nameEl.value.trim();
    if (!st.tpl.name) {
      RT.toast('先给模板起个名字', 'warn');
      if (nameEl) nameEl.focus();
      return;
    }
    const bad = [];
    T.walk(st.tpl.layout, function (n) {
      if (n.type === 'field' && LABEL_REQUIRED[n.comp] && !String(n.label || '').trim()) bad.push(n);
    });
    if (bad.length) {
      RT.toast('还有 ' + bad.length + ' 个组件没填标签', 'warn');
      return;
    }
    st.tpl.version = (Number(st.tpl.version) || 0) + 1;
    const clean = T.save(st.tpl);
    st.tpl = clone(clean);
    st.base = clone(clean);
    clearDraft();
    RT.toast('模板已保存');
    RT.rerender('all');
    if (close) {
      RT.dialogs.close();
      st = null;
    } else {
      updateButtons();
    }
  }

  function cancel() {
    if (isDirty()) {
      RT.dialogs.confirm('放弃未保存的改动', '画布上的改动还没保存，确定离开？', function () {
        clearDraft();
        RT.dialogs.close();
        st = null;
      }, true);
      return;
    }
    clearDraft();
    RT.dialogs.close();
    st = null;
  }

  /* ---------------- 打开 ---------------- */

  RT.tplBuilder = {
    open: function (templateId) {
      const src = templateId ? T.get(templateId) : null;
      const blank = {
        id: RT.ws.uid('st'),
        name: '新模板',
        icon: 'layers',
        kind: 'sheet',
        cardKind: null,
        builtin: false,
        version: 0,
        responsive: 'stack',
        layout: { type: 'root', cols: 12, children: [] },
        sample: {},
        width: 0,
        accent: '',
      };
      const base = clone(src || blank);
      const draft = templateId ? loadDraft(templateId) : null;

      st = {
        tpl: draft ? clone(draft) : clone(base),
        base: clone(base),
        sel: null,
        undo: [],
        redo: [],
        preview: false,
        root: null,
      };

      RT.dialogs.open({
        title: '模板编辑器：' + (src ? src.name : '新模板'),
        wide: true,
        full: true,
        body: shell(),
        onMount: function (modal) {
          st.root = modal;
          refreshAll();
          bindClicks();
          bindInputs();
          bindDrag();
          bindResize();

          modal.addEventListener('keydown', function (e) {
            const typing = e.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable);
            if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) redo(); else undo();
              return;
            }
            if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'y') {
              e.preventDefault();
              redo();
              return;
            }
            if (e.key === 'Delete' && !typing && st.sel) {
              e.preventDefault();
              deleteNode(st.sel);
            }
          });

          if (draft) RT.toast('已恢复上次未保存的草稿');
        },
      });
    },
  };

  /* 旧名字仍可用 */
  RT.sheetBuilder = {
    open: function (id) { RT.tplBuilder.open(id); },
  };

})(window.RT = window.RT || {});
