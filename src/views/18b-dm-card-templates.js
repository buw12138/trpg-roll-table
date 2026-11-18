/* ============================================================
 * 18b. 卡片模板：内置敌人 / 环境 / 玩家 / 文本卡 + 卡片渲染方言
 *      与记录表共用 RT.tpl 的模板定义与编辑器，只是组件集与渲染样式不同。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const tpl = RT.tpl;

  function field(id, comp, opts) {
    return Object.assign({ id: id, type: 'field', comp: comp, start: 1, span: 12 }, opts || {});
  }

  function row(children, opts) {
    return Object.assign({
      id: RT.ws.uid('r'), type: 'row', start: 1, span: 12, gap: 8, children: children || [],
    }, opts || {});
  }

  /* ---------------- 内置卡片模板 ---------------- */

  function builtins() {
    return [
      {
        id: 'bt_enemy',
        name: '敌人卡',
        icon: 'book',
        kind: 'card',
        cardKind: 'enemy',
        builtin: true,
        version: 2,
        width: 300,
        accent: 'danger',
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('meta', 'chips', {
              fields: [
                { id: 'tier', label: '位阶' },
                { id: 'kind', label: '种类' },
                { id: 'source', label: '来源' },
              ],
            }),
            field('intro', 'para', { italic: true }),
            field('motive', 'para', { label: '动机与战术' }),
            row([
              field('difficulty', 'number', { start: 1, span: 4, label: '难度' }),
              field('thr', 'stats', {
                start: 5, span: 8, label: '阈值',
                fields: [
                  { id: 'minor', label: '重度' },
                  { id: 'major', label: '严重' },
                ],
              }),
            ]),
            field('hp', 'tracker', { label: '生命', max: 6 }),
            field('stress', 'tracker', { label: '压力', max: 3 }),
            field('attack', 'pairs', {
              fields: [
                { id: 'hit', label: '攻击' },
                { id: 'weapon', label: '武器' },
                { id: 'range', label: '范围' },
                { id: 'damage', label: '伤害' },
                { id: 'attr', label: '属性' },
              ],
            }),
            field('exp', 'text', { label: '经历', placeholder: '如：盗贼+2' }),
            field('features', 'features', { label: '特性' }),
            field('note', 'note', { label: '备注', rows: 2 }),
          ],
        },
      },
      {
        id: 'bt_env',
        name: '环境卡',
        icon: 'grid',
        kind: 'card',
        cardKind: 'env',
        builtin: true,
        version: 2,
        width: 300,
        accent: 'gold',
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('meta', 'chips', {
              fields: [
                { id: 'tier', label: '位阶' },
                { id: 'kind', label: '种类' },
                { id: 'source', label: '来源' },
              ],
            }),
            field('intro', 'para', { italic: true }),
            field('trend', 'para', { label: '趋向' }),
            row([
              field('difficulty', 'number', { start: 1, span: 4, label: '难度' }),
              field('potential', 'pairs', {
                start: 5, span: 8,
                fields: [{ id: 'enemies', label: '潜在敌人' }],
              }),
            ]),
            field('features', 'features', { label: '特性' }),
            field('note', 'note', { label: '备注', rows: 2 }),
          ],
        },
      },
      {
        id: 'bt_pc',
        name: '玩家卡',
        icon: 'star',
        kind: 'card',
        cardKind: 'pc',
        builtin: true,
        version: 3,
        width: 300,
        accent: 'info',
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('meta', 'chips', {
              fields: [
                { id: 'level', label: '等级' },
                { id: 'profession', label: '职业' },
                { id: 'subclass', label: '子职' },
                { id: 'ancestry', label: '祖先' },
                { id: 'community', label: '社群' },
              ],
            }),
            row([
              field('evasion', 'number', { start: 1, span: 4, label: '闪避' }),
              field('armorValue', 'number', { start: 5, span: 4, label: '护甲值' }),
              field('proficiency', 'number', { start: 9, span: 4, label: '熟练' }),
            ]),
            field('hp', 'tracker', { label: '生命', max: 6 }),
            field('stress', 'tracker', { label: '压力', max: 6 }),
            field('hope', 'tracker', { label: '希望', max: 6 }),
            field('armor', 'tracker', { label: '护甲槽', max: 3 }),
            field('thr', 'stats', {
              label: '阈值',
              fields: [
                { id: 'minor', label: '重度' },
                { id: 'major', label: '严重' },
              ],
            }),
            field('attrs', 'stats', {
              label: '属性',
              fields: [
                { id: 'agility', label: '敏捷' },
                { id: 'strength', label: '力量' },
                { id: 'finesse', label: '灵巧' },
                { id: 'instinct', label: '本能' },
                { id: 'presence', label: '风度' },
                { id: 'knowledge', label: '知识' },
              ],
            }),
            field('spellcasting', 'text', { label: '施法属性', placeholder: '如：知识' }),
            field('background', 'para', { label: '背景' }),
            field('appearance', 'para', { label: '外貌' }),
            field('motivation', 'para', { label: '动机' }),
            field('effects', 'features', { label: '卡组效果' }),
            field('experience', 'text', { label: '经历', placeholder: '如：书虫+2' }),
            field('weapons', 'pairs', {
              label: '武器',
              fields: [
                { id: 'primary', label: '主' },
                { id: 'secondary', label: '副' },
              ],
            }),
            field('gear', 'pairs', {
              label: '装备',
              fields: [
                { id: 'armor', label: '护甲' },
                { id: 'gold', label: '金币' },
              ],
            }),
            field('inventory', 'para', { label: '物品' }),
            field('note', 'note', { label: '备注', rows: 2 }),
          ],
        },
      },
      {
        id: 'bt_text',
        name: '文本卡',
        icon: 'file',
        kind: 'card',
        cardKind: 'text',
        builtin: true,
        version: 2,
        width: 260,
        accent: 'muted',
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('meta', 'chips', { fields: [{ id: 'tag', label: '标签' }] }),
            field('body', 'note', { rows: 6 }),
          ],
        },
      },
      {
        id: 'bt_special',
        name: '特殊卡',
        icon: 'wand',
        kind: 'card',
        cardKind: 'special',
        builtin: true,
        version: 2,
        width: 220,
        accent: 'gold',
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('counter', 'counter', { label: '进度', max: 6 }),
            field('note', 'note', { label: '备注', rows: 2 }),
          ],
        },
      },
    ];
  }

  /* ---------------- 小工具 ---------------- */

  function inlineMd(text) {
    let s = esc(text == null ? '' : text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function sampleAttr(o, key, fallback) {
    return o && o.preview ? ' data-tb-sample="' + fallback + '"' : '';
  }

  /* ---------------- 值 ---------------- */

  function defaultValues(template) {
    const vals = {};
    tpl.walk(template.layout, function (node) {
      if (node.type !== 'field') return;
      switch (node.comp) {
        case 'tracker':
          vals[node.id] = { max: Math.max(1, Number(node.max) || 1), marked: 0 };
          break;
        case 'counter':
          vals[node.id] = { value: 0, max: Math.max(1, Number(node.max) || 6) };
          break;
        case 'dice':
          vals[node.id] = {
            mode: node.mode === 'duality' ? 'duality' : 'normal',
            expr: node.expr || '1d20',
            last: null,
          };
          break;
        case 'chips':
        case 'stats':
        case 'pairs':
          vals[node.id] = {};
          break;
        case 'features':
          vals[node.id] = [];
          break;
        default:
          vals[node.id] = '';
      }
    });
    return vals;
  }

  /* ---------------- 渲染 ---------------- */

  function trackerHtml(node, path, val, o) {
    const v = obj(val);
    const max = Math.max(1, Math.min(40, Number(v.max != null ? v.max : node.max) || 1));
    const marked = Math.max(0, Math.min(max, Number(v.marked) || 0));
    const boxes = [];
    for (let i = 0; i < max; i++) {
      const on = i < marked;
      const attrs = o && o.preview
        ? ' data-tb-sample-box="' + path + ':' + i + '"'
        : ' data-act="dm-box" data-dm-block="' + path + '" data-i="' + i + '"';
      boxes.push('<button type="button" class="dc-box' + (on ? ' on' : '') + '"' + attrs +
        ' aria-label="' + esc(node.label || '标记') + ' ' + (i + 1) + '"></button>');
    }
    return '<div class="dc-tracker">' +
      '<span class="dc-tracker-label">' + esc(node.label || '') + '</span>' +
      '<span class="dc-boxes">' + boxes.join('') + '</span>' +
      '<span class="dc-tracker-count">' + marked + '/' + max + '</span>' +
      '</div>';
  }

  function chipsHtml(node, path, val) {
    const v = obj(val);
    const bits = (node.fields || []).map(function (f) {
      const text = v[f.id];
      if (text == null || text === '') return '';
      return '<span class="dc-chip"><i>' + esc(f.label || '') + '</i>' + esc(text) + '</span>';
    }).filter(Boolean);
    return bits.length ? '<div class="dc-chips">' + bits.join('') + '</div>' : '';
  }

  function paraHtml(node, path, val) {
    const text = val == null ? '' : String(val);
    if (!text.trim() && !(node.label || '').trim()) return '';
    return '<div class="dc-para' + (node.italic ? ' italic' : '') + '">' +
      (node.label ? '<span class="dc-para-label">' + esc(node.label) + '</span>' : '') +
      '<p>' + inlineMd(text) + '</p></div>';
  }

  function pairsHtml(node, path, val) {
    const v = obj(val);
    const bits = (node.fields || []).map(function (f) {
      if (v[f.id] == null || v[f.id] === '') return '';
      return '<span class="dc-pair"><b>' + esc(f.label || '') + '</b>' + esc(v[f.id]) + '</span>';
    }).filter(Boolean);
    return bits.length ? '<div class="dc-pairs">' + bits.join('') + '</div>' : '';
  }

  function statsHtml(node, path, val, o) {
    const v = obj(val);
    return '<div class="dc-stats">' + (node.label ? '<span class="dc-stats-label">' + esc(node.label) + '</span>' : '') +
      (node.fields || []).map(function (f) {
        const p = path + '.' + f.id;
        const inputAttr = o && o.preview
          ? ' data-tb-sample="' + p + '"'
          : ' data-act="dm-num" data-dm-path="' + p + '"';
        return '<label class="dc-stat"><span>' + esc(f.label || '') + '</span>' +
          '<input type="text" inputmode="numeric" value="' + RT.attr(v[f.id] == null ? '' : v[f.id]) + '"' +
          inputAttr + '></label>';
      }).join('') + '</div>';
  }

  function featuresHtml(node, path, val, o) {
    const list = arr(val);
    if (!list.length) return '';
    const preview = !!(o && o.preview);
    return '<div class="dc-features">' +
      (node.label ? '<div class="dc-section">' + esc(node.label) + '</div>' : '') +
      list.map(function (f, i) {
        if (!f) return '';
        const type = f.type || '';
        const open = preview || !!f.open;
        return '<div class="dc-feature' + (open ? ' open' : '') + '">' +
          '<div class="dc-feature-head" data-act="dm-feature-toggle" data-dm-block="' + path +
          '" data-i="' + i + '" title="点击展开 / 收起">' +
          '<span class="dc-feature-caret">▸</span>' +
          '<b>' + esc(f.name || '未命名') + '</b>' +
          (type ? '<span class="dc-badge">' + esc(type) + '</span>' : '') +
          '</div>' +
          '<div class="dc-feature-body">' +
          (f.desc ? '<p>' + inlineMd(f.desc) + '</p>' : '') +
          (f.question ? '<p class="dc-quest">' + inlineMd(f.question) + '</p>' : '') +
          '</div>' +
          '</div>';
      }).join('') + '</div>';
  }

  function noteHtml(node, path, val, o) {
    const text = val == null ? '' : String(val);
    const attr = o && o.preview
      ? ' data-tb-sample="' + path + '"'
      : ' data-act="dm-note" data-dm-path="' + path + '"';
    return '<textarea class="dc-note" rows="' + (node.rows || 2) + '" placeholder="' +
      RT.attr(node.placeholder || node.label || '备注…') + '"' + attr + '>' + esc(text) + '</textarea>';
  }

  function textHtml(node, path, val, o) {
    const v = val == null ? '' : String(val);
    const attr = o && o.preview
      ? ' data-tb-sample="' + path + '"'
      : ' data-act="dm-text" data-dm-path="' + path + '"';
    return '<label class="dc-field"><span>' + esc(node.label || '') + '</span>' +
      '<input type="text" value="' + RT.attr(v) + '" placeholder="' + RT.attr(node.placeholder || '') + '"' + attr + '></label>';
  }

  function numberHtml(node, path, val, o) {
    const v = val == null ? '' : String(val);
    const attr = o && o.preview
      ? ' data-tb-sample="' + path + '"'
      : ' data-act="dm-num" data-dm-path="' + path + '"';
    return '<label class="dc-field"><span>' + esc(node.label || '') + '</span>' +
      '<input type="text" inputmode="numeric" value="' + RT.attr(v) + '" placeholder="' +
      RT.attr(node.placeholder || '') + '"' + attr + '></label>';
  }

  function textareaHtml(node, path, val, o) {
    const v = val == null ? '' : String(val);
    const attr = o && o.preview
      ? ' data-tb-sample="' + path + '"'
      : ' data-act="dm-note" data-dm-path="' + path + '"';
    return '<label class="dc-field"><span>' + esc(node.label || '') + '</span>' +
      '<textarea rows="' + (node.rows || 2) + '"' + attr + ' placeholder="' +
      RT.attr(node.placeholder || '') + '">' + esc(v) + '</textarea></label>';
  }

  function checkHtml(node, path, val, o) {
    const on = val === true || val === 'true';
    const attr = o && o.preview ? ' data-tb-sample-check="' + path + '"' : ' data-act="dm-check" data-dm-path="' + path + '"';
    return '<label class="dc-check"><input type="checkbox"' + attr + (on ? ' checked' : '') + '>' +
      '<span>' + esc(node.label || '') + '</span></label>';
  }

  function counterHtml(node, path, val, o) {
    const v = obj(val);
    const max = Math.max(1, Math.min(99, Number(v.max != null ? v.max : node.max) || 6));
    const value = Math.max(0, Math.min(max, Number(v.value) || 0));
    const pct = Math.round((value / max) * 100);
    const preview = !!(o && o.preview);
    const valAttr = preview
      ? ' data-tb-sample="' + path + '.value"'
      : ' data-act="dm-card-counter-val" data-dm-block="' + path + '"';
    const maxAttr = preview
      ? ' data-tb-sample="' + path + '.max"'
      : ' data-act="dm-card-counter-max" data-dm-block="' + path + '"';
    const stepAttr = function (d) {
      return preview
        ? ' data-tb-counter-step="' + path + ':' + d + '"'
        : ' data-act="dm-card-counter-step" data-dm-block="' + path + '" data-d="' + d + '"';
    };
    return '<div class="dc-counter">' +
      (node.label ? '<span class="dc-counter-label">' + esc(node.label) + '</span>' : '') +
      '<div class="dc-counter-row">' +
      '<button type="button" class="dmb-step"' + stepAttr(-1) + ' aria-label="减一">−</button>' +
      '<input class="dc-counter-val" inputmode="numeric" value="' + value + '"' + valAttr + '>' +
      '<span class="dc-counter-of">/</span>' +
      '<input class="dc-counter-max" inputmode="numeric" value="' + max + '"' + maxAttr + '>' +
      '<button type="button" class="dmb-step"' + stepAttr(1) + ' aria-label="加一">＋</button>' +
      '</div>' +
      '<div class="dc-counter-bar"><i style="width:' + pct + '%"></i></div>' +
      '</div>';
  }

  function diceResultHtml(last) {
    if (!last) return '<span class="dim">还没掷</span>';
    if (last.kind === 'duality') {
      const cls = last.outcome === '希望' ? 'hope' : last.outcome === '恐惧' ? 'fear' : 'crit';
      return '<span class="dc-die hope">希望 ' + esc(String(last.hope)) + '</span>' +
        '<span class="dc-die fear">恐惧 ' + esc(String(last.fear)) + '</span>' +
        '<b class="dc-die-out ' + cls + '">' + esc(last.outcome || '') + '</b>' +
        '<span class="dim">合计 ' + esc(String((last.hope || 0) + (last.fear || 0))) + '</span>';
    }
    return '<b class="dc-dice-total">' + esc(String(last.total)) + '</b>' +
      '<span class="dc-dice-detail">' + esc(last.text || '') + '</span>';
  }

  function diceHtml(node, path, val, o) {
    const v = obj(val);
    const mode = v.mode || node.mode || 'normal';
    const expr = v.expr || node.expr || '1d20';
    const preview = !!(o && o.preview);
    return '<div class="dc-dice">' +
      (node.label ? '<div class="dc-dice-label">' + esc(node.label) + '</div>' : '') +
      '<div class="dc-dice-row">' +
      (mode === 'duality'
        ? '<span class="dc-dice-fixed">2d12（希望 / 恐惧）</span>'
        : '<input class="dc-dice-expr" value="' + RT.attr(expr) + '"' +
        (preview ? ' data-tb-sample="' + path + '.expr"' : ' data-act="dm-dice-expr" data-dm-block="' + path + '"') +
        ' aria-label="骰子表达式">') +
      '<button type="button" class="dc-dice-btn"' +
      (preview ? ' disabled' : ' data-act="dm-dice-roll" data-dm-block="' + path + '"') +
      '>掷</button>' +
      '</div>' +
      '<div class="dc-dice-result">' + diceResultHtml(v.last) + '</div>' +
      '</div>';
  }

  function renderField(node, path, val, o) {
    switch (node.comp) {
      case 'chips': return chipsHtml(node, path, val);
      case 'para': return paraHtml(node, path, val);
      case 'pairs': return pairsHtml(node, path, val);
      case 'stats': return statsHtml(node, path, val, o);
      case 'tracker': return trackerHtml(node, path, val, o);
      case 'counter': return counterHtml(node, path, val, o);
      case 'dice': return diceHtml(node, path, val, o);
      case 'features': return featuresHtml(node, path, val, o);
      case 'note': return noteHtml(node, path, val, o);
      case 'textarea': return textareaHtml(node, path, val, o);
      case 'number': return numberHtml(node, path, val, o);
      case 'check': return checkHtml(node, path, val, o);
      case 'heading': return '<div class="dc-section">' + esc(node.label || '') + '</div>';
      default: return textHtml(node, path, val, o);
    }
  }

  function boxStyle(node) {
    const b = tpl.box(node);
    return 'grid-column:' + b.start + ' / span ' + b.span;
  }

  function renderNode(node, values, o) {
    if (!node) return '';
    if (node.type === 'row') {
      return '<div class="dc-row" style="' + boxStyle(node) + ';gap:' + (Number(node.gap) || 8) + 'px">' +
        (node.children || []).map(function (c) { return renderNode(c, values, o); }).join('') + '</div>';
    }
    if (node.type === 'group') {
      return '<section class="dc-group' + (node.boxed ? ' boxed' : '') + '" style="' + boxStyle(node) + '">' +
        (node.title ? '<div class="dc-section">' + esc(node.title) + '</div>' : '') +
        '<div class="dc-group-body">' +
        (node.children || []).map(function (c) { return renderNode(c, values, o); }).join('') +
        '</div></section>';
    }
    const val = tpl.getVal(values, node.id);
    const inner = renderField(node, node.id, val, o);
    if (!inner) return '';
    return '<div class="dc-cell" style="' + boxStyle(node) + '">' + inner + '</div>';
  }

  /** 卡面（不含白板外壳的标题栏 / 关闭按钮） */
  function renderFace(template, values, opts) {
    const o = opts || {};
    if (!template || !template.layout) return '<p class="dim">模板已删除。</p>';
    const accent = template.accent ? ' dc-accent-' + template.accent : '';
    return '<div class="dc-face' + accent + (o.preview ? ' dc-preview' : '') + '">' +
      '<div class="dc-grid12' + (template.responsive === 'stack' ? ' dc-stack' : '') + '">' +
      (template.layout.children || []).map(function (n) { return renderNode(n, values || {}, o); }).join('') +
      '</div></div>';
  }

  /* ---------------- 按模板编辑数据（库条目 / 白板卡片共用） ---------------- */

  function fieldRow(node, val) {
    const label = esc(node.label || RT.tpl.TYPE_NAME[node.comp] || node.id);
    switch (node.comp) {
      case 'para':
        return '<label class="edit-row"><span>' + label + '</span>' +
          '<textarea rows="3" data-edit="' + node.id + '">' + esc(val == null ? '' : val) + '</textarea></label>';
      case 'note':
        return '<label class="edit-row"><span>' + label + '</span>' +
          '<textarea rows="3" data-edit="' + node.id + '">' + esc(val == null ? '' : val) + '</textarea></label>';
      case 'tracker': {
        const v = obj(val);
        return '<div class="edit-row"><span>' + label +
          '<button class="mini" data-tracker-add="' + node.id + '" title="加一格">＋</button>' +
          '<button class="mini" data-tracker-sub="' + node.id + '" title="减一格">－</button></span>' +
          '<input type="number" min="1" max="40" data-edit-tracker="' + node.id + '" value="' +
          (v.max != null ? v.max : node.max || 1) + '"></div>';
      }
      case 'counter': {
        const v = obj(val);
        return '<div class="edit-row"><span>' + label + '</span>' +
          '<div class="edit-inline">' +
          '<input type="number" min="0" max="99" data-edit-counter="' + node.id + '" value="' +
          (v.value != null ? v.value : 0) + '" title="当前值">' +
          '<span class="dim">/</span>' +
          '<input type="number" min="1" max="99" data-edit-counter-max="' + node.id + '" value="' +
          (v.max != null ? v.max : node.max || 6) + '" title="上限">' +
          '</div></div>';
      }
      case 'dice': {
        const v = obj(val);
        if (node.mode === 'duality') {
          return '<div class="edit-row"><span>' + label + '</span><p class="dim">二元骰固定掷 2d12（希望 / 恐惧）。</p></div>';
        }
        return '<div class="edit-row"><span>' + label + '（骰式）</span>' +
          '<input data-edit-dice="' + node.id + '" value="' +
          RT.attr(v.expr || node.expr || '1d20') + '" placeholder="1d20 / 2d6+3"></div>';
      }
      case 'number':
        return '<label class="edit-row"><span>' + label + '</span>' +
          '<input type="text" inputmode="numeric" data-edit="' + node.id + '" value="' + RT.attr(val == null ? '' : val) + '"></label>';
      case 'features': {
        const list = arr(val);
        return '<div class="edit-features" data-features="' + node.id + '">' +
          '<div class="edit-features-head"><span>' + label + '</span>' +
          '<button class="mini" data-feature-add="' + node.id + '">＋</button></div>' +
          list.map(function (f, i) {
            return '<div class="edit-feature" data-fi="' + i + '">' +
              '<div class="edit-feature-top">' +
              '<input data-feature-name="' + node.id + '" data-fi="' + i + '" value="' + RT.attr(f.name || '') + '" placeholder="特性名">' +
              '<input data-feature-type="' + node.id + '" data-fi="' + i + '" value="' + RT.attr(f.type || '') + '" placeholder="类型">' +
              '<button class="mini danger" data-feature-del="' + node.id + '" data-fi="' + i + '">' + RT.icon('x', 12) + '</button>' +
              '</div>' +
              '<textarea rows="2" data-feature-desc="' + node.id + '" data-fi="' + i + '" placeholder="描述">' + esc(f.desc || '') + '</textarea>' +
              '<input data-feature-question="' + node.id + '" data-fi="' + i + '" value="' + RT.attr(f.question || '') + '" placeholder="特性问题（可选）">' +
              '</div>';
          }).join('') + '</div>';
      }
      case 'chips':
      case 'pairs':
      case 'stats': {
        const v = obj(val);
        return '<div class="edit-row-group"><span class="edit-group-label">' + label + '</span>' +
          (node.fields || []).map(function (f) {
            return '<label class="edit-row"><span>' + esc(f.label || f.id) + '</span>' +
              '<input type="text" data-edit-sub="' + node.id + ':' + f.id + '" value="' +
              RT.attr(v[f.id] == null ? '' : v[f.id]) + '"></label>';
          }).join('') + '</div>';
      }
      case 'heading':
        return '';
      default:
        return '<label class="edit-row"><span>' + label + '</span>' +
          '<input type="text" data-edit="' + node.id + '" value="' + RT.attr(val == null ? '' : val) + '"></label>';
    }
  }

  /** 弹窗编辑一张卡片 / 一条库条目的全部数据 */
  function editDialog(template, values, onSave, opts) {
    if (!template) { RT.toast('模板已删除', 'warn'); return; }
    const draft = JSON.parse(JSON.stringify(values || {}));
    const o = opts || {};
    const rows = [];
    RT.tpl.walk(template.layout, function (node) {
      if (node.type !== 'field') return;
      const html = fieldRow(node, draft[node.id]);
      if (html) rows.push(html);
    });

    const modal = RT.dialogs.open({
      title: (o.title || '编辑数据') + '：' + template.name,
      wide: true,
      body:
        '<p class="modal-note">这里的改动只作用于这一张卡 / 这一条库条目，不会改模板。</p>' +
        '<div class="edit-grid">' + rows.join('') + '</div>' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '<button class="btn gold" data-ok="1">保存</button></div>',
      onMount: function (m) {
        const bodyEl = m.querySelector('.modal-body');
        if (bodyEl && o.scrollTop) bodyEl.scrollTop = o.scrollTop;
        function setPath(path, val) {
          const parts = String(path).split(':');
          const id = parts[0];
          if (parts.length > 1) {
            if (!draft[id] || typeof draft[id] !== 'object') draft[id] = {};
            draft[id][parts[1]] = val;
          } else {
            draft[id] = val;
          }
        }
        m.addEventListener('input', function (e) {
          const el = e.target;
          if (el.hasAttribute('data-edit')) setPath(el.getAttribute('data-edit'), el.value);
          else if (el.hasAttribute('data-edit-sub')) setPath(el.getAttribute('data-edit-sub'), el.value);
          else if (el.hasAttribute('data-edit-tracker')) {
            const id = el.getAttribute('data-edit-tracker');
            if (!draft[id] || typeof draft[id] !== 'object') draft[id] = { max: 1, marked: 0 };
            const max = Math.max(1, Math.min(40, Number(el.value) || 1));
            draft[id].max = max;
            draft[id].marked = Math.min(draft[id].marked || 0, max);
          } else if (el.hasAttribute('data-edit-counter')) {
            const id = el.getAttribute('data-edit-counter');
            if (!draft[id] || typeof draft[id] !== 'object') draft[id] = { value: 0, max: 6 };
            draft[id].value = Math.max(0, Math.min(99, Number(el.value) || 0));
            draft[id].value = Math.min(draft[id].value, draft[id].max || 6);
          } else if (el.hasAttribute('data-edit-counter-max')) {
            const id = el.getAttribute('data-edit-counter-max');
            if (!draft[id] || typeof draft[id] !== 'object') draft[id] = { value: 0, max: 6 };
            const max = Math.max(1, Math.min(99, Number(el.value) || 6));
            draft[id].max = max;
            draft[id].value = Math.min(draft[id].value || 0, max);
          } else if (el.hasAttribute('data-edit-dice')) {
            const id = el.getAttribute('data-edit-dice');
            if (!draft[id] || typeof draft[id] !== 'object') draft[id] = { mode: 'normal', expr: '1d20', last: null };
            draft[id].expr = el.value;
          } else if (el.hasAttribute('data-feature-name') || el.hasAttribute('data-feature-type') ||
            el.hasAttribute('data-feature-desc') || el.hasAttribute('data-feature-question')) {
            const id = el.getAttribute('data-feature-name') || el.getAttribute('data-feature-type') ||
              el.getAttribute('data-feature-desc') || el.getAttribute('data-feature-question');
            const i = Number(el.getAttribute('data-fi'));
            if (!Array.isArray(draft[id])) draft[id] = [];
            const f = draft[id][i] || (draft[id][i] = { name: '', type: '', desc: '', question: '' });
            if (el.hasAttribute('data-feature-name')) f.name = el.value;
            else if (el.hasAttribute('data-feature-type')) f.type = el.value;
            else if (el.hasAttribute('data-feature-desc')) f.desc = el.value;
            else f.question = el.value;
          }
        });
        m.addEventListener('click', function (e) {
          const add = e.target.closest('[data-tracker-add]');
          const sub = e.target.closest('[data-tracker-sub]');
          if (add || sub) {
            const id = (add || sub).getAttribute(add ? 'data-tracker-add' : 'data-tracker-sub');
            if (!draft[id] || typeof draft[id] !== 'object') draft[id] = { max: 1, marked: 0 };
            draft[id].max = Math.max(1, Math.min(40, (draft[id].max || 1) + (add ? 1 : -1)));
            draft[id].marked = Math.min(draft[id].marked || 0, draft[id].max);
            const inp = m.querySelector('[data-edit-tracker="' + id + '"]');
            if (inp) inp.value = draft[id].max;
            return;
          }
          const fa = e.target.closest('[data-feature-add]');
          if (fa) {
            const id = fa.getAttribute('data-feature-add');
            if (!Array.isArray(draft[id])) draft[id] = [];
            draft[id].push({ name: '', type: '', desc: '', question: '' });
            const scroll = m.querySelector('.modal-body');
            const keep = scroll ? scroll.scrollTop : 0;
            RT.dialogs.close();
            editDialog(template, draft, onSave, { title: o.title, scrollTop: keep });
            return;
          }
          const fd = e.target.closest('[data-feature-del]');
          if (fd) {
            const id = fd.getAttribute('data-feature-del');
            const i = Number(fd.getAttribute('data-fi'));
            if (Array.isArray(draft[id])) draft[id].splice(i, 1);
            const scroll = m.querySelector('.modal-body');
            const keep = scroll ? scroll.scrollTop : 0;
            RT.dialogs.close();
            editDialog(template, draft, onSave, { title: o.title, scrollTop: keep });
          }
        });
        m.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
        m.querySelector('[data-ok]').addEventListener('click', function () {
          RT.dialogs.close();
          onSave(draft);
        });
      },
    });
    return modal;
  }

  RT.dmCard = {
    builtins: builtins,
    defaultValues: defaultValues,
    renderFace: renderFace,
    renderField: renderField,
    renderNode: renderNode,
    editDialog: editDialog,
    inlineMd: inlineMd,
  };

})(window.RT = window.RT || {});
