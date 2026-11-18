/* ============================================================
 * 18. 统一模板核心：组件注册表、树状布局、存储 / 迁移 / 渲染 / 模板库
 *     记录表与卡片共用同一套模板定义：
 *     layout = { type:'root', cols:12, children:[ 行 / 分组 / 组件 ] }
 *     每个节点用 start（起始列）+ span（跨列）定位，窄屏可整体堆叠。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const KEY = 'trpg_rt_templates_v1';
  const LEGACY_KEY = 'trpg_rt_sheet_templates_v1';

  /* ---------------- 组件注册表 ---------------- */

  const COMPONENTS = [
    {
      type: 'heading', name: '分组标题', ctx: ['sheet', 'card'],
      desc: '只显示一行标题，不存数据。适合把一长串字段分成几段，比如「基础信息」「战斗数据」。',
    },
    {
      type: 'text', name: '单行文本', ctx: ['sheet', 'card'],
      desc: '一行输入框。适合姓名、场次、经历、武器名这类短内容。',
    },
    {
      type: 'textarea', name: '多行文本', ctx: ['sheet', 'card'],
      desc: '可换行的输入框。适合描述、问题、背景、备注这类会写好几行的内容。',
    },
    {
      type: 'number', name: '数字', ctx: ['sheet', 'card'],
      desc: '数字输入框。适合难度、阈值、等级、金币这类只需要数字的字段。',
    },
    {
      type: 'date', name: '日期', ctx: ['sheet'],
      desc: '日期选择器。适合记录场次日期、事件发生时间。',
    },
    {
      type: 'check', name: '勾选', ctx: ['sheet', 'card'],
      desc: '单个勾选框。适合「已完成」「已用过」「本轮生效」这种是非状态。',
    },
    {
      type: 'select', name: '下拉', ctx: ['sheet'],
      desc: '从固定选项里选一个。适合状态、类型、难度档位这类选项有限且固定的小字段。',
    },
    {
      type: 'list', name: '清单行', ctx: ['sheet'],
      desc: '可以不断加行的清单，每行带一个勾选。适合秘密与线索、怪物清单、购物清单。',
    },
    {
      type: 'table', name: '表格', ctx: ['sheet'],
      desc: '多列多行的表格。适合角色名单、NPC 列表、物品表这类需要横向对比的内容。',
    },
    {
      type: 'repeat', name: '重复组', ctx: ['sheet'],
      desc: '同一组字段重复出现多份。适合多个 NPC、三条前线、多张卡这类结构相同的条目。',
    },
    {
      type: 'chips', name: '标签组', ctx: ['card'],
      desc: '卡片顶部的小标签，如位阶 / 种类 / 来源。只做快速识别，不占正文。',
    },
    {
      type: 'para', name: '段落', ctx: ['card'],
      desc: '只读的长文本段落。适合简介、背景、外貌、动机这类整段描述。',
    },
    {
      type: 'pairs', name: '标签值行', ctx: ['card'],
      desc: '一排「标签 + 值」，如 攻击 +1 · 武器 匕首 · 范围 近战。适合紧凑的键值信息。',
    },
    {
      type: 'stats', name: '数值行', ctx: ['card'],
      desc: '一排可改的数字，如难度、阈值、六项属性。适合需要临场改数值但不需要方格的字段。',
    },
    {
      type: 'tracker', name: '方块追踪', ctx: ['card'],
      desc: '一排小方块，点一下标记一格。适合生命点、压力点、希望点、护甲槽这类小数值。',
    },
    {
      type: 'counter', name: '计数条', ctx: ['card'],
      desc: '带 − / ＋、上限和进度条的计数。适合进展倒计时、恐怖时钟、充能次数。',
    },
    {
      type: 'features', name: '特性列表', ctx: ['card'],
      desc: '名称 + 类型徽标 + 描述组成的列表。适合敌人特性、卡组效果、种族/职业能力。',
    },
    {
      type: 'note', name: '备注', ctx: ['card'],
      desc: '卡片自己的备注输入框。适合记临时状态、标记、DM 私有说明。',
    },
  ];

  const TYPE_NAME = {};
  COMPONENTS.forEach(function (c) { TYPE_NAME[c.type] = c.name; });

  const CARD_COMPS = {};
  COMPONENTS.forEach(function (c) { if (c.ctx.indexOf('card') >= 0) CARD_COMPS[c.type] = true; });

  /** 模板分类：记录表 + 四类卡片 */
  const KINDS = [
    { key: 'sheet', name: '记录表', icon: 'layers' },
    { key: 'card:enemy', name: '敌人卡', icon: 'book', cardKind: 'enemy' },
    { key: 'card:env', name: '环境卡', icon: 'grid', cardKind: 'env' },
    { key: 'card:pc', name: '玩家卡', icon: 'star', cardKind: 'pc' },
    { key: 'card:special', name: '特殊卡', icon: 'wand', cardKind: 'special' },
    { key: 'card:text', name: '文本卡', icon: 'file', cardKind: 'text' },
  ];

  function kindKey(t) {
    return t && t.kind === 'card' ? 'card:' + (t.cardKind || 'special') : 'sheet';
  }

  function kindName(t) {
    const k = KINDS.filter(function (x) { return x.key === kindKey(t); })[0];
    return k ? k.name : '模板';
  }

  function compsFor(kind) {
    const isCard = kind === 'card';
    return COMPONENTS.filter(function (c) { return c.ctx.indexOf(isCard ? 'card' : 'sheet') >= 0; });
  }

  /* ---------------- 小工具 ---------------- */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid(p) { return RT.ws.uid(p || 'c'); }

  function num(v, d) {
    const n = Number(v);
    return isFinite(n) ? n : d;
  }

  /** 把 start / span 收进合法栅格范围 */
  function box(node) {
    let span = Math.round(num(node && node.span, 12));
    span = Math.min(12, Math.max(1, span));
    let start = Math.round(num(node && node.start, 1));
    start = Math.min(13 - span, Math.max(1, start));
    return { start: start, span: span };
  }

  function cellStyle(node) {
    const b = box(node);
    return 'grid-column:' + b.start + ' / span ' + b.span;
  }

  function walk(layout, fn, ctx) {
    const list = (layout && layout.children) || [];
    list.forEach(function (n) { walkNode(n, fn, ctx || { depth: 0 }); });
  }

  function walkNode(node, fn, ctx) {
    if (!node) return;
    fn(node, ctx);
    if ((node.type === 'row' || node.type === 'group') && Array.isArray(node.children)) {
      node.children.forEach(function (c) {
        walkNode(c, fn, { depth: (ctx ? ctx.depth : 0) + 1 });
      });
    }
  }

  function countFields(layout) {
    let n = 0;
    walk(layout, function (node) { if (node.type === 'field') n++; });
    return n;
  }

  function getVal(values, path) {
    const parts = String(path).split('.');
    let cur = values;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  /* ---------------- 内置记录表模板（v2 树状） ---------------- */

  const QS = [
    ['出场的是哪些角色？', '玩家角色的名字、当前状态、他们想要什么'],
    ['强开场是什么？', '第一分钟就发生在眼前的动作场面'],
    ['可能出现哪些场景？', '3–5 个可能的场面，不写死顺序'],
    ['他们可能挖出哪些秘密与线索？', '10 条：秘密本身 + 能指向它的线索'],
    ['可能发现哪些奇幻地点？', ''],
    ['可能遇到哪些 NPC？', ''],
    ['可能面对哪些怪物？', ''],
    ['可能拿到哪些魔法物品？', ''],
  ];

  function field(id, comp, opts) {
    return Object.assign({ id: id, type: 'field', comp: comp, start: 1, span: 12 }, opts || {});
  }

  function row(children, opts) {
    return Object.assign({
      id: uid('r'), type: 'row', start: 1, span: 12, gap: 10, children: children || [],
    }, opts || {});
  }

  function group(title, children, opts) {
    return Object.assign({
      id: uid('g'), type: 'group', start: 1, span: 12, title: title || '', boxed: false,
      children: children || [],
    }, opts || {});
  }

  function builtins() {
    return [
      {
        id: 'bt_session',
        name: '会话工作表',
        icon: 'file',
        kind: 'sheet',
        builtin: true,
        version: 2,
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            row([
              field('c_no', 'text', { start: 1, span: 6, label: '场次', placeholder: '第 N 场' }),
              field('c_date', 'date', { start: 7, span: 6, label: '日期' }),
            ]),
          ].concat(QS.map(function (q, i) {
            return field('c_q' + (i + 1), 'textarea', {
              label: (i + 1) + '. ' + q[0],
              width: 'full',
              rows: i === 2 || i === 3 ? 4 : 2,
              placeholder: q[1],
            });
          })),
        },
      },
      {
        id: 'bt_characters',
        name: '角色追踪',
        icon: 'layers',
        kind: 'sheet',
        builtin: true,
        version: 2,
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('c_pc', 'table', {
              label: '角色',
              columns: [
                { key: 'name', label: '角色名', type: 'text' },
                { key: 'player', label: '玩家', type: 'text' },
                { key: 'raceClass', label: '种族 / 职业', type: 'text' },
                { key: 'background', label: '背景', type: 'text' },
                { key: 'details', label: '理念 / 特质 / 缺陷 / 羁绊', type: 'text' },
                { key: 'notes', label: '备注', type: 'text' },
              ],
            }),
          ],
        },
      },
      {
        id: 'bt_npcs',
        name: 'NPC 追踪',
        icon: 'wand',
        kind: 'sheet',
        builtin: true,
        version: 2,
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('c_npc', 'repeat', {
              label: 'NPC',
              min: 1,
              itemLabel: 'NPC',
              fields: [
                { id: 'name', type: 'text', label: 'NPC 名', width: 'half' },
                { id: 'archetype', type: 'text', label: '角色原型', width: 'half' },
                { id: 'stats', type: 'text', label: '显著数据', width: 'half', placeholder: 'HP / AC / 关键技能 / 攻击' },
                { id: 'relation', type: 'text', label: '与队伍的互动', width: 'half', placeholder: '欠他人情 / 想杀他 / 想招募他' },
                { id: 'notes', type: 'textarea', label: '备注', width: 'full' },
              ],
            }),
          ],
        },
      },
      {
        id: 'bt_planner',
        name: '战役规划',
        icon: 'grid',
        kind: 'sheet',
        builtin: true,
        version: 2,
        responsive: 'stack',
        layout: {
          type: 'root', cols: 12, children: [
            field('c_hook', 'textarea', {
              label: '战役钩子：这个战役讲什么？目标是什么？',
              rows: 2,
              placeholder: '一句话说清',
            }),
            group('世界的六条真相', [
              row([1, 2, 3].map(function (i) {
                return field('c_truth' + i, 'text', { start: (i - 1) * 4 + 1, span: 4, label: '真相 ' + i });
              })),
              row([4, 5, 6].map(function (i) {
                return field('c_truth' + i, 'text', { start: (i - 4) * 4 + 1, span: 4, label: '真相 ' + i });
              })),
            ], { id: 'g_truth' }),
            group('三条前线', [
              field('c_front', 'repeat', {
                label: '前线',
                min: 3,
                itemLabel: '前线',
                fields: [
                  { id: 'name', type: 'text', label: '势力 / 反派 / 事件', width: 'half' },
                  { id: 'goal', type: 'text', label: '它想达成什么', width: 'half' },
                  { id: 'p1', type: 'text', label: '凶兆 1', width: 'half' },
                  { id: 'p2', type: 'text', label: '凶兆 2', width: 'half' },
                  { id: 'p3', type: 'text', label: '凶兆 3', width: 'half' },
                ],
              }),
            ], { id: 'g_front', boxed: true }),
          ],
        },
      },
    ];
  }

  /* ---------------- 存储 ---------------- */

  function read() {
    try {
      const raw = RT.storage.get(KEY);
      const v = raw ? JSON.parse(raw) : null;
      return v && Array.isArray(v.list) ? v : { list: [] };
    } catch (e) {
      return { list: [] };
    }
  }

  function write(st) {
    RT.storage.set(KEY, JSON.stringify(st));
  }

  /** v1 扁平 layout → v2 树：连续两个 half 合并成一行两列，其余整行 */
  function convertV1(layout) {
    const out = [];
    let halfRow = null;

    function flushHalf() {
      if (!halfRow) return;
      if (halfRow.children.length === 1) {
        halfRow.children[0].start = 1;
        halfRow.children[0].span = 6;
      }
      out.push(halfRow);
      halfRow = null;
    }

    (layout || []).forEach(function (comp) {
      if (!comp || !comp.type) return;
      const node = Object.assign({}, comp, {
        type: 'field',
        comp: comp.type,
        start: 1,
        span: comp.width === 'half' ? 6 : 12,
        id: comp.id || uid('c'),
      });
      delete node.width;

      if (comp.type === 'heading') {
        flushHalf();
        node.start = 1;
        node.span = 12;
        out.push(node);
        return;
      }
      if (comp.width === 'half') {
        if (halfRow && halfRow.children.length < 2) {
          node.start = 7;
          node.span = 6;
          halfRow.children.push(node);
          flushHalf();
        } else {
          flushHalf();
          halfRow = {
            id: uid('r'), type: 'row', start: 1, span: 12, gap: 10, children: [node],
          };
        }
        return;
      }
      flushHalf();
      out.push(node);
    });
    flushHalf();
    return { type: 'root', cols: 12, children: out };
  }

  /** 把旧 key 里的模板迁到新格式；成功后删除旧 key（失败则原样保留） */
  function migrateLegacy() {
    let raw = null;
    try { raw = RT.storage.get(LEGACY_KEY); } catch (e) { return 0; }
    if (!raw) return 0;

    let old = null;
    try {
      old = JSON.parse(raw);
    } catch (e) {
      console.warn('旧模板数据无法解析，已原样保留：', e);
      return 0;
    }
    const list = old && Array.isArray(old.list) ? old.list : [];
    const st = read();
    const have = {};
    st.list.forEach(function (t) { have[t.id] = true; });

    let n = 0;
    list.forEach(function (t) {
      if (!t || !t.id || have[t.id]) return;
      st.list.push({
        id: t.id,
        name: t.name || '未命名模板',
        icon: t.icon || 'layers',
        kind: 'sheet',
        cardKind: null,
        builtin: !!t.builtin,
        version: (t.version || 1) + 1,
        responsive: 'stack',
        layout: Array.isArray(t.layout) ? convertV1(t.layout) : { type: 'root', cols: 12, children: [] },
        sample: {},
        accent: '',
        width: 0,
        ts: t.ts || Date.now(),
      });
      have[t.id] = true;
      n++;
    });

    write(st);
    try { RT.storage.del(LEGACY_KEY); } catch (e) { /* ignore */ }
    return n;
  }

  /** 内置模板（记录表 + 卡片，卡片由 18b 注册） */
  function allBuiltins() {
    let out = builtins().slice();
    if (RT.dmCard && typeof RT.dmCard.builtins === 'function') {
      out = out.concat(RT.dmCard.builtins());
    }
    return out;
  }

  let legacyChecked = false;

  /** 保证内置模板始终存在（用户改过的版本优先） */
  function ensure() {
    if (!legacyChecked) {
      legacyChecked = true;
      migrateLegacy();
    }
    const st = read();
    const have = {};
    st.list.forEach(function (t) { have[t.id] = true; });
    let dirty = false;
    /* 旧版「自定义卡片」分类已合并进特殊卡 */
    st.list.forEach(function (t) {
      if (t && t.kind === 'card' && (!t.cardKind || t.cardKind === 'custom')) {
        t.cardKind = 'special';
        dirty = true;
      }
    });
    allBuiltins().forEach(function (b) {
      const item = clone(b);
      if (!item.sample || typeof item.sample !== 'object') item.sample = {};
      if (!item.responsive) item.responsive = 'stack';
      const i = st.list.findIndex(function (t) { return t.id === b.id; });
      if (i < 0) {
        st.list.push(item);
        dirty = true;
      } else if (st.list[i].builtin && Number(st.list[i].version || 1) < Number(b.version || 1)) {
        /* 内置模板升级：用户自己存过新版（version 已被保存器递增）则不动 */
        st.list[i] = item;
        have[b.id] = true;
        dirty = true;
      }
    });
    if (dirty) write(st);
    return st;
  }

  /* ---------------- 记录表渲染 ---------------- */

  function attrSet(o, path, isCheck) {
    if (o && o.preview) {
      return isCheck
        ? 'data-tb-sample-check="' + path + '"'
        : 'data-tb-sample="' + path + '"';
    }
    return isCheck
      ? 'data-act="sheet-set-check" data-path="' + path + '"'
      : 'data-act="sheet-set" data-path="' + path + '"';
  }

  function inputHtml(comp, path, val, o) {
    const v = val == null ? '' : val;
    const base = attrSet(o, path);
    switch (comp.type) {
      case 'textarea':
        return '<textarea rows="' + (comp.rows || 2) + '" ' + base + ' placeholder="' +
          RT.attr(comp.placeholder || '') + '">' + esc(v) + '</textarea>';
      case 'number':
        return '<input type="number" ' + base + ' value="' + RT.attr(v) + '" placeholder="' +
          RT.attr(comp.placeholder || '') + '">';
      case 'date':
        return '<input type="date" ' + base + ' value="' + RT.attr(v) + '">';
      case 'select': {
        const opts = (comp.options || []).map(function (opt) {
          return '<option value="' + RT.attr(opt) + '"' + (String(v) === String(opt) ? ' selected' : '') + '>' + esc(opt) + '</option>';
        }).join('');
        return '<select ' + base + '><option value="">未选</option>' + opts + '</select>';
      }
      default:
        return '<input type="text" ' + base + ' value="' + RT.attr(v) + '" placeholder="' +
          RT.attr(comp.placeholder || '') + '">';
    }
  }

  function leafHtml(comp, path, val, o) {
    if (comp.type === 'check') {
      const on = val === true || val === 'true';
      return '<label class="sx-check"><input type="checkbox" ' + attrSet(o, path, true) +
        (on ? ' checked' : '') + '><span>' + esc(comp.label || '') + '</span></label>';
    }
    return '<label class="sx-field"><span>' + esc(comp.label || '') + '</span>' +
      inputHtml(comp, path, val, o) + '</label>';
  }

  function listHtml(comp, path, val, o) {
    const preview = !!(o && o.preview);
    const rows = Array.isArray(val) ? val : [];
    const n = Math.max(rows.length, preview ? 2 : 1);
    let html = '<div class="sx-rows">';
    for (let i = 0; i < n; i++) {
      const rowVal = rows[i] || {};
      html += '<div class="sx-rowline">' +
        '<input type="checkbox" ' + attrSet(o, path + '.' + i + '.done', true) + (rowVal.done ? ' checked' : '') +
        (preview ? ' disabled' : '') + '>' +
        '<input type="text" ' + attrSet(o, path + '.' + i + '.text') + ' value="' + RT.attr(rowVal.text || '') +
        '" placeholder="' + (preview ? '清单项' : '') + '"' + (preview ? ' readonly' : '') + '>' +
        (preview ? '' : '<button class="mini danger" data-act="sheet-row-del" data-path="' + path + '" data-i="' + i + '" title="删除">' +
          RT.icon('x', 12) + '</button>') +
        '</div>';
    }
    html += '</div>';
    if (!preview) {
      html += '<button class="btn ghost small" data-act="sheet-row-add" data-path="' + path + '">' +
        RT.icon('plus', 12) + ' 加一行</button>';
    }
    return html;
  }

  function tableHtml(comp, path, val, o) {
    const preview = !!(o && o.preview);
    const rows = Array.isArray(val) ? val : [];
    const cols = comp.columns || [];
    const n = Math.max(rows.length, preview ? 2 : 1);
    let html = '<div class="tablewrap"><table class="sheet-table sx-table"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c.label || c.key) + '</th>'; }).join('') +
      '<th class="row-end"></th></tr></thead><tbody>';
    for (let i = 0; i < n; i++) {
      const rowVal = rows[i] || {};
      html += '<tr>' + cols.map(function (c) {
        const p = path + '.' + i + '.' + c.key;
        if (c.type === 'number') {
          return '<td><input type="number" ' + attrSet(o, p) + ' value="' +
            RT.attr(rowVal[c.key] == null ? '' : rowVal[c.key]) + '"' + (preview ? ' readonly' : '') + '></td>';
        }
        if (c.type === 'check') {
          return '<td class="sx-cell-check"><input type="checkbox" ' + attrSet(o, p, true) +
            (rowVal[c.key] ? ' checked' : '') + (preview ? ' disabled' : '') + '></td>';
        }
        return '<td><input type="text" ' + attrSet(o, p) + ' value="' +
          RT.attr(rowVal[c.key] == null ? '' : rowVal[c.key]) + '"' + (preview ? ' readonly' : '') + '></td>';
      }).join('') +
        '<td class="row-end">' + (preview ? '' :
          '<button class="mini danger" data-act="sheet-row-del" data-path="' + path + '" data-i="' + i + '">' +
          RT.icon('trash', 12) + '</button>') + '</td></tr>';
    }
    html += '</tbody></table></div>';
    if (!preview) {
      html += '<button class="btn ghost small" data-act="sheet-row-add" data-path="' + path + '">' +
        RT.icon('plus', 12) + ' 加一行</button>';
    }
    return html;
  }

  function repeatHtml(comp, path, val, o) {
    const preview = !!(o && o.preview);
    const rows = Array.isArray(val) ? val : [];
    const n = Math.max(rows.length, comp.min || 1, preview ? 1 : 1);
    const fields = comp.fields || [];
    let html = '<div class="sx-repeat">';
    for (let i = 0; i < n; i++) {
      const rowVal = rows[i] || {};
      html += '<div class="sx-repcard">' +
        '<div class="sx-rephead"><span class="dim">' + esc(comp.itemLabel || comp.label || '条目') + ' ' + (i + 1) + '</span>' +
        (preview ? '' : '<button class="mini danger" data-act="sheet-row-del" data-path="' + path + '" data-i="' + i + '" title="删除这组">' +
          RT.icon('x', 12) + '</button>') + '</div>' +
        '<div class="sx-grid">' + fields.map(function (f) {
          return leafHtml(f, path + '.' + i + '.' + f.id, rowVal[f.id], o);
        }).join('') + '</div></div>';
    }
    html += '</div>';
    if (!preview) {
      html += '<button class="btn ghost small" data-act="sheet-row-add" data-path="' + path + '">' +
        RT.icon('plus', 12) + ' 加一组' + esc(comp.itemLabel || '') + '</button>';
    }
    return html;
  }

  /** 模板节点把组件类型放在 comp 上，老渲染函数按 type 分支：先归一化 */
  function asComp(node) {
    if (!node) return node;
    if (node.comp && node.comp !== node.type) return Object.assign({}, node, { type: node.comp });
    return node;
  }

  function renderField(node, path, val, o) {
    const comp = asComp(node);
    if (comp.type === 'heading') {
      return '<div class="sx-section">' + esc(comp.label || '') + '</div>';
    }
    if (comp.type === 'list') {
      return '<div class="sx-item"><div class="sx-itemhd">' + esc(comp.label || '') + '</div>' +
        listHtml(comp, path, val, o) + '</div>';
    }
    if (comp.type === 'table') {
      return '<div class="sx-item"><div class="sx-itemhd">' + esc(comp.label || '') + '</div>' +
        tableHtml(comp, path, val, o) + '</div>';
    }
    if (comp.type === 'repeat') {
      return '<div class="sx-item"><div class="sx-itemhd">' + esc(comp.label || '') + '</div>' +
        repeatHtml(comp, path, val, o) + '</div>';
    }
    return leafHtml(comp, path, val, o);
  }

  function renderNode(node, values, o) {
    if (!node) return '';
    if (node.type === 'row') {
      return '<div class="sx-row" style="' + cellStyle(node) + ';gap:' + num(node.gap, 10) + 'px">' +
        (node.children || []).map(function (c) { return renderNode(c, values, o); }).join('') + '</div>';
    }
    if (node.type === 'group') {
      return '<section class="sx-group' + (node.boxed ? ' boxed' : '') + '" style="' + cellStyle(node) + '">' +
        (node.title ? '<div class="sx-group-head">' + esc(node.title) + '</div>' : '') +
        '<div class="sx-group-body">' +
        (node.children || []).map(function (c) { return renderNode(c, values, o); }).join('') +
        '</div></section>';
    }
    const val = getVal(values, node.id);
    return '<div class="sx-cell" style="' + cellStyle(node) + '">' +
      renderField(node, node.id, val, o) + '</div>';
  }

  /** 渲染一份记录表实例 */
  function renderSheet(template, values, opts) {
    const o = opts || {};
    if (!template || !template.layout || !Array.isArray(template.layout.children)) {
      return '<p class="dim">这个模板还没有组件。</p>';
    }
    const stack = template.responsive === 'stack' ? ' sx-stack' : '';
    return '<div class="sx-form sx-grid12' + stack + '">' +
      template.layout.children.map(function (n) { return renderNode(n, values || {}, o); }).join('') +
      '</div>';
  }

  /** 只渲染一个节点（卡片渲染器 / 编辑器复用） */
  function renderSheetNode(node, values, opts) {
    return renderNode(node, values || {}, opts || {});
  }

  /* ---------------- 迁移：老四张表 → 实例 ---------------- */

  function migrate(raw) {
    const d = raw && typeof raw === 'object' ? raw : {};
    if (d.migratedToTemplates && Array.isArray(d.custom)) return d;

    const custom = Array.isArray(d.custom) ? d.custom.slice() : [];
    const mk = function (templateId, title, values) {
      return { id: RT.ws.uid('si'), templateId: templateId, title: title || '', values: values || {}, ts: Date.now() };
    };

    (d.sessions || []).forEach(function (s, i) {
      const values = { c_no: s.no || '第 ' + (i + 1) + ' 场', c_date: s.date || '' };
      QS.forEach(function (q, qi) {
        const v = (s.a && s.a['q' + (qi + 1)]) || '';
        if (v) values['c_q' + (qi + 1)] = v;
      });
      custom.push(mk('bt_session', s.no || '第 ' + (i + 1) + ' 场', values));
    });

    if (Array.isArray(d.characters) && d.characters.length) {
      custom.push(mk('bt_characters', '角色', {
        c_pc: d.characters.map(function (c) {
          return {
            name: c.name || '', player: c.player || '', raceClass: c.raceClass || '',
            background: c.background || '', details: c.details || '', notes: c.notes || '',
          };
        }),
      }));
    }

    if (Array.isArray(d.npcs) && d.npcs.length) {
      custom.push(mk('bt_npcs', 'NPC', {
        c_npc: d.npcs.map(function (n) {
          return {
            name: n.name || '', archetype: n.archetype || '', raceClass: n.raceClass || '',
            stats: n.stats || '', relation: n.relation || '', notes: n.notes || '',
          };
        }),
      }));
    }

    const p = d.planner;
    if (p && (p.hook || (p.truths || []).some(Boolean) || (p.fronts || []).some(function (f) {
      return f && (f.name || f.goal || f.p1 || f.p2 || f.p3);
    }))) {
      const values = { c_hook: p.hook || '' };
      (p.truths || []).forEach(function (t, i) { if (t) values['c_truth' + (i + 1)] = t; });
      values.c_front = (p.fronts || []).map(function (f) {
        return {
          name: (f && f.name) || '', goal: (f && f.goal) || '',
          p1: (f && f.p1) || '', p2: (f && f.p2) || '', p3: (f && f.p3) || '',
        };
      });
      custom.push(mk('bt_planner', '战役规划', values));
    }

    d.custom = custom;
    d.migratedToTemplates = true;
    if (!d.activeInstanceId && custom[0]) d.activeInstanceId = custom[0].id;
    return d;
  }

  /* ---------------- Markdown 导出 ---------------- */

  function valueText(comp, val) {
    if (comp.type === 'table') {
      const rows = Array.isArray(val) ? val : [];
      if (!rows.length) return '';
      const cols = comp.columns || [];
      const head = '| ' + cols.map(function (c) { return c.label || c.key; }).join(' | ') + ' |';
      const sep = '| ' + cols.map(function () { return '---'; }).join(' | ') + ' |';
      const body = rows.map(function (r) {
        return '| ' + cols.map(function (c) { return String((r && r[c.key]) || '').replace(/\|/g, '/'); }).join(' | ') + ' |';
      }).join('\n');
      return head + '\n' + sep + '\n' + body;
    }
    if (comp.type === 'list') {
      return (Array.isArray(val) ? val : []).map(function (r) {
        return '- ' + (r.done ? '[x] ' : '[ ] ') + (r.text || '');
      }).join('\n');
    }
    if (comp.type === 'repeat') {
      return (Array.isArray(val) ? val : []).map(function (rowVal, i) {
        const bits = (comp.fields || []).map(function (f) {
          const v = rowVal && rowVal[f.id];
          return v ? ('**' + (f.label || f.id) + '** ' + v) : '';
        }).filter(Boolean);
        if (!bits.length) return '';
        return '#### ' + (comp.itemLabel || comp.label || '条目') + ' ' + (i + 1) + '\n' + bits.join('\n');
      }).filter(Boolean).join('\n\n');
    }
    return val == null ? '' : String(val);
  }

  function mdNode(node, values, L) {
    if (!node) return;
    if (node.type === 'row') {
      (node.children || []).forEach(function (c) { mdNode(c, values, L); });
      return;
    }
    if (node.type === 'group') {
      if (node.title) { L.push('### ' + node.title); L.push(''); }
      (node.children || []).forEach(function (c) { mdNode(c, values, L); });
      return;
    }
    if (node.comp === 'heading') {
      L.push('### ' + (node.label || ''));
      L.push('');
      return;
    }
    const v = valueText(asComp(node), getVal(values, node.id));
    if (!v || !String(v).trim()) return;
    if (node.comp === 'table' || node.comp === 'list' || node.comp === 'repeat') {
      L.push('**' + (node.label || '') + '**');
      L.push('');
      L.push(v);
    } else if (node.comp === 'check') {
      L.push('- [x] ' + (node.label || ''));
    } else {
      L.push('**' + (node.label || '') + '**：' + String(v).replace(/\n/g, ' / '));
    }
    L.push('');
  }

  function instanceMd(template, inst) {
    const L = ['## ' + (inst.title || (template ? template.name : '记录'))];
    if (!template) return L.join('\n');
    L.push('');
    (template.layout ? template.layout.children || [] : []).forEach(function (n) {
      mdNode(n, inst.values || {}, L);
    });
    return L.join('\n');
  }

  /* ---------------- 模板库 API ---------------- */

  function listAll() {
    return ensure().list;
  }

  function get(id) {
    return listAll().filter(function (t) { return t.id === id; })[0] || null;
  }

  function save(tpl) {
    const st = ensure();
    const i = st.list.findIndex(function (t) { return t.id === tpl.id; });
    const isCard = tpl.kind === 'card';
    const clean = {
      id: tpl.id || uid('st'),
      name: String(tpl.name || '').trim() || '未命名模板',
      icon: tpl.icon || (isCard ? 'book' : 'layers'),
      kind: isCard ? 'card' : 'sheet',
      cardKind: isCard ? (tpl.cardKind === 'custom' || !tpl.cardKind ? 'special' : tpl.cardKind) : null,
      builtin: !!tpl.builtin,
      version: tpl.version || 1,
      layout: tpl.layout || { type: 'root', cols: 12, children: [] },
      sample: tpl.sample && typeof tpl.sample === 'object' ? tpl.sample : {},
      responsive: tpl.responsive || 'stack',
      accent: tpl.accent || '',
      width: num(tpl.width, 0),
      ts: Date.now(),
    };
    if (i >= 0) st.list[i] = clean;
    else st.list.push(clean);
    write(st);
    return clean;
  }

  function create(kind, name) {
    const isCard = kind === 'card';
    return save({
      id: uid('st'),
      name: name || (isCard ? '新卡片模板' : '新模板'),
      icon: isCard ? 'book' : 'layers',
      kind: isCard ? 'card' : 'sheet',
      cardKind: isCard ? 'special' : null,
      builtin: false,
      version: 1,
      layout: { type: 'root', cols: 12, children: [] },
      sample: {},
      responsive: 'stack',
      width: isCard ? 300 : 0,
      accent: isCard ? '' : '',
    });
  }

  function duplicate(id) {
    const t = get(id);
    if (!t) return null;
    const copy = clone(t);
    copy.id = uid('st');
    copy.name = t.name + '（副本）';
    copy.builtin = false;
    copy.version = 1;
    /* 组件 id 原样保留：新模板没有实例，不会被旧数据引用 */
    return save(copy);
  }

  function remove(id) {
    const st = ensure();
    const t = st.list.filter(function (x) { return x.id === id; })[0];
    if (!t || t.builtin) return false;
    st.list = st.list.filter(function (x) { return x.id !== id; });
    write(st);
    return true;
  }

  function resetBuiltin(id) {
    const st = ensure();
    const src = allBuiltins().filter(function (b) { return b.id === id; })[0];
    if (!src) return false;
    const i = st.list.findIndex(function (t) { return t.id === id; });
    if (i >= 0) st.list[i] = clone(src);
    else st.list.push(clone(src));
    write(st);
    return true;
  }

  function usage(id) {
    let n = 0;
    RT.ws.campaigns().forEach(function (c) {
      const d = RT.ws.store(RT.ws.KEYS.sheets).get(c.id);
      if (d && Array.isArray(d.custom)) {
        n += d.custom.filter(function (i) { return i.templateId === id; }).length;
      }
    });
    return n;
  }

  /* ---------------- 弹窗 ---------------- */

  function pickDialog(onPick, kindFilter) {
    const want = kindFilter || 'sheet';
    const list = listAll().filter(function (t) { return (t.kind === 'card' ? 'card' : 'sheet') === want; });
    RT.dialogs.open({
      title: want === 'card' ? '用模板新建卡片' : '用模板新建记录',
      wide: true,
      body:
        '<p class="modal-note">模板是全局的：任何战役都能用同一份模板新建内容。结构可直接在可视化编辑器里拖出来。</p>' +
        '<div class="tpl-pick">' + list.map(function (t) {
          return '<button class="tpl-card" data-pick="' + t.id + '">' +
            '<span class="tpl-name">' + esc(t.name) + '</span>' +
            '<span class="tpl-meta">' + countFields(t.layout) + ' 个组件 · ' + kindName(t) +
            (t.builtin ? ' · 内置' : ' · 自定义') + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost small" data-manage="1">模板库…</button>' +
        '<button class="btn ghost small" data-new="1">新建模板…</button>' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '</div>',
      onMount: function (modal) {
        modal.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () {
            RT.dialogs.close();
            onPick(b.getAttribute('data-pick'));
          });
        });
        modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
        modal.querySelector('[data-manage]').addEventListener('click', function () {
          RT.dialogs.close();
          manage();
        });
        modal.querySelector('[data-new]').addEventListener('click', function () {
          RT.dialogs.close();
          newTemplate(want);
        });
      },
    });
  }

  /** 新建模板：先选种类，再进编辑器 */
  function newTemplate(kind) {
    const kinds = !kind ? KINDS : KINDS.filter(function (k) {
      return kind === 'card' ? k.key.indexOf('card:') === 0 : k.key === 'sheet';
    });
    RT.dialogs.open({
      title: '新建模板',
      body:
        '<p class="modal-note">先用哪一类？种类决定可用的组件和渲染方式。</p>' +
        '<div class="radio-row tpl-kind-row">' +
        kinds.map(function (k, i) {
          return '<label><input type="radio" name="tpl-kind" value="' + k.key + '"' +
            (i === 0 ? ' checked' : '') + '> ' + esc(k.name) + '</label>';
        }).join('') +
        '</div>' +
        '<input id="tpl-new-name" class="grow" placeholder="模板名（可留空）" autocomplete="off">' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '<button class="btn gold" data-ok="1">打开编辑器</button>' +
        '</div>',
      onMount: function (modal) {
        modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
        modal.querySelector('[data-ok]').addEventListener('click', function () {
          const picked = modal.querySelector('input[name="tpl-kind"]:checked');
          const key = picked ? picked.value : (kind === 'card' ? 'card:special' : 'sheet');
          const meta = KINDS.filter(function (k) { return k.key === key; })[0] || KINDS[0];
          const nameEl = modal.querySelector('#tpl-new-name');
          const t = save({
            id: uid('st'),
            name: (nameEl && nameEl.value.trim()) || meta.name,
            icon: meta.icon,
            kind: meta.key === 'sheet' ? 'sheet' : 'card',
            cardKind: meta.cardKind || null,
            builtin: false,
            version: 1,
            layout: { type: 'root', cols: 12, children: [] },
            sample: {},
            responsive: 'stack',
            width: meta.key === 'sheet' ? 0 : 300,
            accent: '',
          });
          RT.dialogs.close();
          RT.tplBuilder.open(t.id);
        });
      },
    });
  }

  function manage() {
    const list = listAll();
    const order = KINDS.map(function (k) { return k.key; });
    const groups = {};
    list.forEach(function (t) {
      const k = kindKey(t);
      (groups[k] = groups[k] || []).push(t);
    });
    const blocks = order.filter(function (k) { return groups[k]; }).map(function (k) {
      const meta = KINDS.filter(function (x) { return x.key === k; })[0];
      return '<div class="tpl-group"><div class="tpl-group-head">' + esc(meta.name) +
        '<span class="dim">' + groups[k].length + '</span></div>' +
        groups[k].map(function (t) {
          return '<div class="tpl-row">' +
            '<div class="tpl-info"><strong>' + esc(t.name) + '</strong>' +
            '<span class="dim">' + countFields(t.layout) + ' 个组件 · v' + (t.version || 1) +
            (t.builtin ? ' · 内置' : '') + ' · 已用 ' + usage(t.id) + '</span></div>' +
            '<div class="tpl-acts">' +
            '<button class="btn ghost small" data-edit="' + t.id + '">编辑</button>' +
            '<button class="btn ghost small" data-dup="' + t.id + '">复制</button>' +
            (t.builtin ? '<button class="btn ghost small" data-reset="' + t.id + '">还原</button>'
              : '<button class="btn ghost small danger" data-del="' + t.id + '">删除</button>') +
            '</div></div>';
        }).join('') + '</div>';
    }).join('');

    RT.dialogs.open({
      title: '模板库',
      wide: true,
      body:
        '<p class="modal-note">模板系统是通用的：记录表与卡片共用同一套模板定义。' +
        '打开编辑器后可以直接在画布上拖组件、拉宽度、实时看到成品。</p>' +
        (blocks || '<p class="dim">还没有模板。</p>') +
        '<div class="modal-actions wrap">' +
        '<button class="btn gold small" data-new="1">' + RT.icon('plus', 13) + ' 新建模板…</button>' +
        '<button class="btn ghost small" data-export="1">导出模板 JSON</button>' +
        '<button class="btn ghost small" data-import="1">导入模板 JSON</button>' +
        '</div>',
      onMount: function (modal) {
        modal.querySelectorAll('[data-edit]').forEach(function (b) {
          b.addEventListener('click', function () {
            RT.dialogs.close();
            RT.tplBuilder.open(b.getAttribute('data-edit'));
          });
        });
        modal.querySelectorAll('[data-dup]').forEach(function (b) {
          b.addEventListener('click', function () {
            duplicate(b.getAttribute('data-dup'));
            RT.toast('已复制模板');
            RT.dialogs.close();
            manage();
          });
        });
        modal.querySelectorAll('[data-reset]').forEach(function (b) {
          b.addEventListener('click', function () {
            resetBuiltin(b.getAttribute('data-reset'));
            RT.toast('已还原为内置模板');
            RT.dialogs.close();
            manage();
          });
        });
        modal.querySelectorAll('[data-del]').forEach(function (b) {
          b.addEventListener('click', function () {
            const id = b.getAttribute('data-del');
            const used = usage(id);
            RT.dialogs.confirm('删除模板',
              '模板会被删除' + (used ? '，但已用它的 ' + used + ' 份记录仍保留（之后可能显示不全）' : '') + '。继续？',
              function () {
                remove(id);
                RT.dialogs.close();
                manage();
                RT.rerender('all');
              }, true);
          });
        });
        modal.querySelector('[data-new]').addEventListener('click', function () {
          RT.dialogs.close();
          newTemplate();
        });
        modal.querySelector('[data-export]').addEventListener('click', function () {
          const data = { kind: 'trpg-templates', schemaVersion: 2, list: listAll() };
          RT.download('模板-' + RT.dateStamp() + '.json', JSON.stringify(data, null, 2));
        });
        modal.querySelector('[data-import]').addEventListener('click', function () {
          importDialog();
        });
      },
    });
  }

  function importDialog() {
    RT.dialogs.open({
      title: '导入模板 JSON',
      wide: true,
      body:
        '<p class="modal-note">支持本工具「导出模板 JSON」产出的文件，也兼容旧版记录表模板文件（会自动转成新布局）。</p>' +
        '<textarea class="textarea mono" id="tpl-import-text" rows="10" placeholder="粘贴模板 JSON"></textarea>' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '<button class="btn gold" id="tpl-do-import">导入</button></div>',
      onMount: function (modal) {
        modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
        modal.querySelector('#tpl-do-import').addEventListener('click', function () {
          const text = modal.querySelector('#tpl-import-text').value.trim();
          if (!text) { RT.toast('先粘贴内容', 'warn'); return; }
          let parsed;
          try { parsed = JSON.parse(text); } catch (e) { RT.toast('JSON 解析失败', 'warn'); return; }
          const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.list) ? parsed.list : [parsed];
          let n = 0;
          arr.forEach(function (t) {
            if (!t || !t.name) return;
            const isCard = t.kind === 'card';
            const hasTree = t.layout && !Array.isArray(t.layout) && Array.isArray(t.layout.children);
            const layout = hasTree
              ? t.layout
              : Array.isArray(t.layout) ? convertV1(t.layout) : null;
            if (!layout) return;
            const copy = clone(t);
            copy.id = uid('st');
            copy.builtin = false;
            copy.name = t.name + '（导入）';
            copy.layout = layout;
            copy.kind = isCard ? 'card' : 'sheet';
            copy.cardKind = isCard ? (t.cardKind === 'custom' || !t.cardKind ? 'special' : t.cardKind) : null;
            copy.version = 1;
            save(copy);
            n++;
          });
          RT.dialogs.close();
          manage();
          RT.toast(n ? ('已导入 ' + n + ' 个模板') : '没有可导入的模板', n ? undefined : 'warn');
        });
      },
    });
  }

  /* ---------------- 导出入口 ---------------- */

  RT.tpl = {
    KEY: KEY,
    LEGACY_KEY: LEGACY_KEY,
    COMPONENTS: COMPONENTS,
    TYPE_NAME: TYPE_NAME,
    KINDS: KINDS,
    compsFor: compsFor,
    kindKey: kindKey,
    kindName: kindName,
    clone: clone,
    box: box,
    cellStyle: cellStyle,
    getVal: getVal,
    walk: walk,
    countFields: countFields,
    convertV1: convertV1,
    read: read,
    ensure: ensure,
    builtins: builtins,
    list: function (kind) {
      const all = listAll();
      if (!kind) return all;
      return all.filter(function (t) { return (t.kind === 'card' ? 'card' : 'sheet') === kind; });
    },
    get: get,
    save: save,
    create: create,
    duplicate: duplicate,
    remove: remove,
    resetBuiltin: resetBuiltin,
    usage: usage,
    manage: manage,
    newTemplate: newTemplate,
    importDialog: importDialog,
    pickDialog: pickDialog,
    renderSheet: renderSheet,
    render: renderSheet,
    renderSheetNode: renderSheetNode,
    renderSheetField: function (node, value, opts) {
      return renderField(node, node.id, value, opts || {});
    },
    instanceMd: instanceMd,
    migrate: migrate,
    exportData: function () {
      return { kind: 'trpg-templates', schemaVersion: 2, list: listAll() };
    },
  };

  /* 记录表 / 卡片库共用同一个模板管理入口 */
  RT.acts = RT.acts || {};
  RT.acts['tpl-manage'] = function () { RT.tpl.manage(); };

  /* ---------------- 兼容门面：记录表旧 API ---------------- */

  RT.sheetTpl = {
    KEY: KEY,
    COMPONENTS: COMPONENTS,
    TYPE_NAME: TYPE_NAME,
    builtins: builtins,
    ensure: ensure,
    read: read,
    migrate: migrate,
    render: renderSheet,
    instanceMd: instanceMd,
    clone: clone,
    getVal: getVal,
    list: function () { return RT.tpl.list('sheet'); },
    get: get,
    save: save,
    create: function (name) { return create('sheet', name); },
    duplicate: duplicate,
    remove: remove,
    resetBuiltin: resetBuiltin,
    usage: usage,
    pickDialog: function (onPick) { pickDialog(onPick, 'sheet'); },
  };

})(window.RT = window.RT || {});
