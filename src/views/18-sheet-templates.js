/* ============================================================
 * 18. 记录表模板：内置模板、模板库、数据迁移、通用渲染器
 *     模板 = 组件数组；实例 = 模板 + 值。模板全局，实例按战役。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const KEY = RT.ws.KEYS.sheetTemplates;

  const COMPONENTS = [
    { type: 'heading', name: '分组标题' },
    { type: 'text', name: '单行文本' },
    { type: 'textarea', name: '多行文本' },
    { type: 'number', name: '数字' },
    { type: 'date', name: '日期' },
    { type: 'check', name: '勾选' },
    { type: 'select', name: '下拉' },
    { type: 'list', name: '清单行' },
    { type: 'table', name: '表格' },
    { type: 'repeat', name: '重复组' },
  ];

  const TYPE_NAME = {};
  COMPONENTS.forEach(function (c) { TYPE_NAME[c.type] = c.name; });

  /* ---------------- 内置模板 ---------------- */

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

  function flat(list) {
    let out = [];
    list.forEach(function (x) {
      if (Array.isArray(x)) out = out.concat(x);
      else out.push(x);
    });
    return out;
  }

  function builtins() {
    return [
      {
        id: 'bt_session',
        name: '会话工作表',
        icon: 'file',
        builtin: true,
        version: 1,
        layout: flat([
          [
            { id: 'c_no', type: 'text', label: '场次', width: 'half', placeholder: '第 N 场' },
            { id: 'c_date', type: 'date', label: '日期', width: 'half' },
          ],
          QS.map(function (q, i) {
            return {
              id: 'c_q' + (i + 1),
              type: 'textarea',
              label: (i + 1) + '. ' + q[0],
              width: 'full',
              rows: i === 2 || i === 3 ? 4 : 2,
              placeholder: q[1],
            };
          }),
        ]),
      },
      {
        id: 'bt_characters',
        name: '角色追踪',
        icon: 'layers',
        builtin: true,
        version: 1,
        layout: [
          {
            id: 'c_pc',
            type: 'table',
            label: '角色',
            width: 'full',
            columns: [
              { key: 'name', label: '角色名', type: 'text' },
              { key: 'player', label: '玩家', type: 'text' },
              { key: 'raceClass', label: '种族 / 职业', type: 'text' },
              { key: 'background', label: '背景', type: 'text' },
              { key: 'details', label: '理念 / 特质 / 缺陷 / 羁绊', type: 'text' },
              { key: 'notes', label: '备注', type: 'text' },
            ],
          },
        ],
      },
      {
        id: 'bt_npcs',
        name: 'NPC 追踪',
        icon: 'wand',
        builtin: true,
        version: 1,
        layout: [
          {
            id: 'c_npc',
            type: 'repeat',
            label: 'NPC',
            width: 'full',
            min: 1,
            fields: [
              { id: 'name', type: 'text', label: 'NPC 名', width: 'half' },
              { id: 'archetype', type: 'text', label: '角色原型', width: 'half' },
              { id: 'stats', type: 'text', label: '显著数据', width: 'half', placeholder: 'HP / AC / 关键技能 / 攻击' },
              { id: 'relation', type: 'text', label: '与队伍的互动', width: 'half', placeholder: '欠他人情 / 想杀他 / 想招募他' },
              { id: 'notes', type: 'textarea', label: '备注', width: 'full' },
            ],
          },
        ],
      },
      {
        id: 'bt_planner',
        name: '战役规划',
        icon: 'grid',
        builtin: true,
        version: 1,
        layout: flat([
          [{ id: 'c_hook', type: 'textarea', label: '战役钩子：这个战役讲什么？目标是什么？', width: 'full', rows: 2, placeholder: '一句话说清' }],
          [{ id: 'c_truth_head', type: 'heading', label: '世界的六条真相' }],
          [1, 2, 3, 4, 5, 6].map(function (i) {
            return { id: 'c_truth' + i, type: 'text', label: '真相 ' + i, width: 'half' };
          }),
          [{ id: 'c_front_head', type: 'heading', label: '三条前线' }],
          [{
            id: 'c_front',
            type: 'repeat',
            label: '前线',
            width: 'full',
            min: 3,
            fields: [
              { id: 'name', type: 'text', label: '势力 / 反派 / 事件', width: 'half' },
              { id: 'goal', type: 'text', label: '它想达成什么', width: 'half' },
              { id: 'p1', type: 'text', label: '凶兆 1', width: 'half' },
              { id: 'p2', type: 'text', label: '凶兆 2', width: 'half' },
              { id: 'p3', type: 'text', label: '凶兆 3', width: 'half' },
            ],
          }],
        ]),
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

  /** 保证内置模板始终存在（用户改过的版本优先） */
  function ensure() {
    const st = read();
    const have = {};
    st.list.forEach(function (t) { have[t.id] = true; });
    let dirty = false;
    builtins().forEach(function (b) {
      if (!have[b.id]) {
        st.list.push(b);
        dirty = true;
      }
    });
    if (dirty) write(st);
    return st;
  }

  /* ---------------- 渲染器 ---------------- */

  function getVal(values, path) {
    const parts = String(path).split('.');
    let cur = values;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function inputHtml(comp, path, val) {
    const v = val == null ? '' : val;
    const base = 'data-act="sheet-set" data-path="' + path + '"';
    switch (comp.type) {
      case 'textarea':
        return '<textarea rows="' + (comp.rows || 2) + '" ' + base + ' placeholder="' +
          RT.attr(comp.placeholder || '') + '">' + esc(v) + '</textarea>';
      case 'number':
        return '<input type="number" ' + base + ' value="' + RT.attr(v) + '" placeholder="' + RT.attr(comp.placeholder || '') + '">';
      case 'date':
        return '<input type="date" ' + base + ' value="' + RT.attr(v) + '">';
      case 'select': {
        const opts = (comp.options || []).map(function (o) {
          return '<option value="' + RT.attr(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('');
        return '<select ' + base + '><option value="">未选</option>' + opts + '</select>';
      }
      default:
        return '<input type="text" ' + base + ' value="' + RT.attr(v) + '" placeholder="' + RT.attr(comp.placeholder || '') + '">';
    }
  }

  function leafHtml(comp, path, val) {
    if (comp.type === 'check') {
      const on = val === true || val === 'true';
      return '<label class="sx-check"><input type="checkbox" data-act="sheet-set-check" data-path="' + path + '"' +
        (on ? ' checked' : '') + '><span>' + esc(comp.label || '') + '</span></label>';
    }
    return '<label class="sx-field sx-w-' + (comp.width === 'half' ? 'half' : 'full') + '">' +
      '<span>' + esc(comp.label || '') + '</span>' + inputHtml(comp, path, val) + '</label>';
  }

  function listHtml(comp, path, val) {
    const rows = Array.isArray(val) ? val : [];
    const n = Math.max(rows.length, 1);
    let html = '<div class="sx-rows">';
    for (let i = 0; i < n; i++) {
      const row = rows[i] || {};
      html += '<div class="sx-rowline">' +
        '<input type="checkbox" data-act="sheet-set-check" data-path="' + path + '.' + i + '.done"' +
        (row.done ? ' checked' : '') + '>' +
        '<input type="text" data-act="sheet-set" data-path="' + path + '.' + i + '.text" value="' + RT.attr(row.text || '') + '">' +
        '<button class="mini danger" data-act="sheet-row-del" data-path="' + path + '" data-i="' + i + '" title="删除">' +
        RT.icon('x', 12) + '</button></div>';
    }
    html += '</div><button class="btn ghost small" data-act="sheet-row-add" data-path="' + path + '">' +
      RT.icon('plus', 12) + ' 加一行</button>';
    return html;
  }

  function tableHtml(comp, path, val) {
    const rows = Array.isArray(val) ? val : [];
    const cols = comp.columns || [];
    const n = Math.max(rows.length, 1);
    let html = '<div class="tablewrap"><table class="sheet-table sx-table"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c.label || c.key) + '</th>'; }).join('') +
      '<th class="row-end"></th></tr></thead><tbody>';
    for (let i = 0; i < n; i++) {
      const row = rows[i] || {};
      html += '<tr>' + cols.map(function (c) {
        const p = path + '.' + i + '.' + c.key;
        if (c.type === 'number') {
          return '<td><input type="number" data-act="sheet-set" data-path="' + p + '" value="' + RT.attr(row[c.key] == null ? '' : row[c.key]) + '"></td>';
        }
        if (c.type === 'check') {
          return '<td class="sx-cell-check"><input type="checkbox" data-act="sheet-set-check" data-path="' + p + '"' +
            (row[c.key] ? ' checked' : '') + '></td>';
        }
        return '<td><input type="text" data-act="sheet-set" data-path="' + p + '" value="' + RT.attr(row[c.key] == null ? '' : row[c.key]) + '"></td>';
      }).join('') +
        '<td class="row-end"><button class="mini danger" data-act="sheet-row-del" data-path="' + path + '" data-i="' + i + '">' +
        RT.icon('trash', 12) + '</button></td></tr>';
    }
    html += '</tbody></table></div>' +
      '<button class="btn ghost small" data-act="sheet-row-add" data-path="' + path + '">' + RT.icon('plus', 12) + ' 加一行</button>';
    return html;
  }

  function repeatHtml(comp, path, val) {
    const rows = Array.isArray(val) ? val : [];
    const n = Math.max(rows.length, comp.min || 1);
    const fields = comp.fields || [];
    let html = '<div class="sx-repeat">';
    for (let i = 0; i < n; i++) {
      const row = rows[i] || {};
      html += '<div class="sx-repcard">' +
        '<div class="sx-rephead"><span class="dim">' + esc(comp.itemLabel || comp.label || '条目') + ' ' + (i + 1) + '</span>' +
        '<button class="mini danger" data-act="sheet-row-del" data-path="' + path + '" data-i="' + i + '" title="删除这组">' +
        RT.icon('x', 12) + '</button></div>' +
        '<div class="sx-grid">' + fields.map(function (f) {
          return leafHtml(f, path + '.' + i + '.' + f.id, row[f.id]);
        }).join('') + '</div></div>';
    }
    html += '</div><button class="btn ghost small" data-act="sheet-row-add" data-path="' + path + '">' +
      RT.icon('plus', 12) + ' 加一组' + esc(comp.itemLabel || '') + '</button>';
    return html;
  }

  /** 渲染一份实例；values 为实例的 values 对象 */
  function render(template, values, opts) {
    opts = opts || {};
    const vals = values || {};
    if (!template || !Array.isArray(template.layout) || !template.layout.length) {
      return '<p class="dim">这个模板还没有组件。</p>';
    }
    return '<div class="sx-form">' + template.layout.map(function (comp) {
      if (comp.type === 'heading') {
        return '<div class="sx-section">' + esc(comp.label || '') + '</div>';
      }
      const val = getVal(vals, comp.id);
      if (comp.type === 'list') {
        return '<div class="sx-item sx-w-full"><div class="sx-itemhd">' + esc(comp.label || '') + '</div>' +
          listHtml(comp, comp.id, val) + '</div>';
      }
      if (comp.type === 'table') {
        return '<div class="sx-item sx-w-full"><div class="sx-itemhd">' + esc(comp.label || '') + '</div>' +
          tableHtml(comp, comp.id, val) + '</div>';
      }
      if (comp.type === 'repeat') {
        return '<div class="sx-item sx-w-full"><div class="sx-itemhd">' + esc(comp.label || '') + '</div>' +
          repeatHtml(comp, comp.id, val) + '</div>';
      }
      return leafHtml(comp, comp.id, val);
    }).join('') + '</div>';
  }

  /* ---------------- 迁移：老四张表 → 实例 ---------------- */

  function migrate(raw) {
    const d = raw && typeof raw === 'object' ? raw : {};
    if (d.migratedToTemplates && Array.isArray(d.custom)) return d;

    const custom = Array.isArray(d.custom) ? d.custom.slice() : [];
    const mk = function (templateId, title, values) {
      return {
        id: RT.ws.uid('si'),
        templateId: templateId,
        title: title || '',
        values: values || {},
        ts: Date.now(),
      };
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
            name: n.name || '', archetype: n.archetype || '', stats: n.stats || '',
            relation: n.relation || '', notes: n.notes || '',
          };
        }),
      }));
    }

    const p = d.planner;
    if (p && (p.hook || (p.truths || []).some(Boolean) || (p.fronts || []).some(function (f) {
      return f && (f.name || f.goal || f.p1 || f.p2 || f.p3);
    }))) {
      const values = { c_hook: p.hook || '' };
      (p.truths || []).forEach(function (t, i) {
        if (t) values['c_truth' + (i + 1)] = t;
      });
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
      return (Array.isArray(val) ? val : []).map(function (row, i) {
        const bits = (comp.fields || []).map(function (f) {
          const v = row && row[f.id];
          return v ? ('**' + (f.label || f.id) + '** ' + v) : '';
        }).filter(Boolean);
        if (!bits.length) return '';
        return '#### ' + (comp.itemLabel || comp.label || '条目') + ' ' + (i + 1) + '\n' + bits.join('\n');
      }).filter(Boolean).join('\n\n');
    }
    return val == null ? '' : String(val);
  }

  function instanceMd(template, inst) {
    const L = ['## ' + (inst.title || (template ? template.name : '记录'))];
    if (!template) return L.join('\n');
    L.push('');
    let section = '';
    template.layout.forEach(function (comp) {
      if (comp.type === 'heading') {
        section = '### ' + (comp.label || '');
        L.push(section);
        L.push('');
        return;
      }
      const v = valueText(comp, (inst.values || {})[comp.id]);
      if (!v || !String(v).trim()) return;
      if (comp.type === 'table' || comp.type === 'list' || comp.type === 'repeat') {
        L.push('**' + (comp.label || '') + '**');
        L.push('');
        L.push(v);
      } else if (comp.type === 'check') {
        L.push('- [x] ' + (comp.label || ''));
      } else {
        L.push('**' + (comp.label || '') + '**：' + String(v).replace(/\n/g, ' / '));
      }
      L.push('');
    });
    return L.join('\n');
  }

  /* ---------------- 模板库 API ---------------- */

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  RT.sheetTpl = {
    KEY: KEY,
    COMPONENTS: COMPONENTS,
    TYPE_NAME: TYPE_NAME,
    builtins: builtins,
    ensure: ensure,
    read: read,
    migrate: migrate,
    render: render,
    instanceMd: instanceMd,
    clone: clone,
    getVal: getVal,

    list: function () {
      return ensure().list;
    },

    get: function (id) {
      return ensure().list.filter(function (t) { return t.id === id; })[0] || null;
    },

    save: function (tpl) {
      const st = ensure();
      const i = st.list.findIndex(function (t) { return t.id === tpl.id; });
      const clean = {
        id: tpl.id,
        name: String(tpl.name || '').trim() || '未命名模板',
        icon: tpl.icon || 'layers',
        builtin: !!tpl.builtin,
        version: (tpl.version || 1),
        layout: tpl.layout || [],
        ts: Date.now(),
      };
      if (i >= 0) st.list[i] = clean;
      else st.list.push(clean);
      write(st);
      return clean;
    },

    create: function (name) {
      return RT.sheetTpl.save({
        id: RT.ws.uid('st'),
        name: name || '新模板',
        icon: 'layers',
        builtin: false,
        version: 1,
        layout: [],
      });
    },

    duplicate: function (id) {
      const t = RT.sheetTpl.get(id);
      if (!t) return null;
      const copy = clone(t);
      copy.id = RT.ws.uid('st');
      copy.name = t.name + '（副本）';
      copy.builtin = false;
      copy.layout.forEach(function (c) { c.id = RT.ws.uid('c'); });
      return RT.sheetTpl.save(copy);
    },

    remove: function (id) {
      const st = ensure();
      const t = st.list.filter(function (x) { return x.id === id; })[0];
      if (!t || t.builtin) return false;
      st.list = st.list.filter(function (x) { return x.id !== id; });
      write(st);
      return true;
    },

    resetBuiltin: function (id) {
      const st = ensure();
      const src = builtins().filter(function (b) { return b.id === id; })[0];
      if (!src) return false;
      const i = st.list.findIndex(function (t) { return t.id === id; });
      if (i >= 0) st.list[i] = clone(src);
      else st.list.push(clone(src));
      write(st);
      return true;
    },

    usage: function (id) {
      let n = 0;
      RT.ws.campaigns().forEach(function (c) {
        const d = RT.ws.store(RT.ws.KEYS.sheets).get(c.id);
        if (d && Array.isArray(d.custom)) {
          n += d.custom.filter(function (i) { return i.templateId === id; }).length;
        }
      });
      return n;
    },

    /* 选模板新建实例的弹窗 */
    pickDialog: function (onPick) {
      const list = RT.sheetTpl.list();
      RT.dialogs.open({
        title: '用模板新建记录',
        wide: true,
        body:
          '<p class="modal-note">模板是全局的：任何战役都能用同一份模板新建记录。</p>' +
          '<div class="tpl-pick">' + list.map(function (t) {
            return '<button class="tpl-card" data-pick="' + t.id + '">' +
              '<span class="tpl-name">' + esc(t.name) + '</span>' +
              '<span class="tpl-meta">' + t.layout.length + ' 个组件' + (t.builtin ? ' · 内置' : ' · 自定义') + '</span>' +
              '</button>';
          }).join('') + '</div>' +
          '<div class="modal-actions right">' +
          '<button class="btn ghost small" data-manage="1">模板管理…</button>' +
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
            RT.sheetTpl.manage();
          });
        },
      });
    },

    /* 模板库管理 */
    manage: function () {
      const list = RT.sheetTpl.list();
      RT.dialogs.open({
        title: '记录表模板',
        wide: true,
        body:
          '<p class="modal-note">模板决定记录表长什么样；实例（每个战役里的具体记录）按模板渲染。内置模板可改可复制，但不能删。</p>' +
          '<div class="tpl-manage">' + list.map(function (t) {
            return '<div class="tpl-row">' +
              '<div class="tpl-info"><strong>' + esc(t.name) + '</strong>' +
              '<span class="dim">' + t.layout.length + ' 个组件 · v' + (t.version || 1) +
              (t.builtin ? ' · 内置' : '') + ' · 已用 ' + RT.sheetTpl.usage(t.id) + ' 份</span></div>' +
              '<div class="tpl-acts">' +
              '<button class="btn ghost small" data-edit="' + t.id + '">编辑</button>' +
              '<button class="btn ghost small" data-dup="' + t.id + '">复制</button>' +
              (t.builtin ? '<button class="btn ghost small" data-reset="' + t.id + '">还原</button>'
                : '<button class="btn ghost small danger" data-del="' + t.id + '">删除</button>') +
              '</div></div>';
          }).join('') + '</div>' +
          '<div class="modal-actions wrap">' +
          '<button class="btn gold small" data-new="1">' + RT.icon('plus', 13) + ' 新建模板</button>' +
          '<button class="btn ghost small" data-export="1">导出模板 JSON</button>' +
          '<button class="btn ghost small" data-import="1">导入模板 JSON</button>' +
          '</div>',
        onMount: function (modal) {
          modal.querySelectorAll('[data-edit]').forEach(function (b) {
            b.addEventListener('click', function () {
              RT.dialogs.close();
              RT.sheetBuilder.open(b.getAttribute('data-edit'));
            });
          });
          modal.querySelectorAll('[data-dup]').forEach(function (b) {
            b.addEventListener('click', function () {
              RT.sheetTpl.duplicate(b.getAttribute('data-dup'));
              RT.toast('已复制模板');
              RT.dialogs.close();
              RT.sheetTpl.manage();
            });
          });
          modal.querySelectorAll('[data-reset]').forEach(function (b) {
            b.addEventListener('click', function () {
              RT.sheetTpl.resetBuiltin(b.getAttribute('data-reset'));
              RT.toast('已还原为内置模板');
              RT.dialogs.close();
              RT.sheetTpl.manage();
            });
          });
          modal.querySelectorAll('[data-del]').forEach(function (b) {
            b.addEventListener('click', function () {
              const id = b.getAttribute('data-del');
              const used = RT.sheetTpl.usage(id);
              RT.dialogs.confirm('删除模板',
                '模板会被删除' + (used ? '，但已用它的 ' + used + ' 份记录仍保留（之后可能显示不全）' : '') + '。继续？',
                function () {
                  RT.sheetTpl.remove(id);
                  RT.dialogs.close();
                  RT.sheetTpl.manage();
                  RT.rerender('all');
                }, true);
            });
          });
          modal.querySelector('[data-new]').addEventListener('click', function () {
            const t = RT.sheetTpl.create('新模板');
            RT.dialogs.close();
            RT.sheetBuilder.open(t.id);
          });
          modal.querySelector('[data-export]').addEventListener('click', function () {
            const data = { kind: 'trpg-sheet-templates', schemaVersion: 1, list: RT.sheetTpl.list() };
            RT.download('记录表模板-' + RT.dateStamp() + '.json', JSON.stringify(data, null, 2));
          });
          modal.querySelector('[data-import]').addEventListener('click', function () {
            RT.sheetTpl.importDialog();
          });
        },
      });
    },

    importDialog: function () {
      RT.dialogs.open({
        title: '导入模板 JSON',
        wide: true,
        body:
          '<p class="modal-note">支持本工具「导出模板 JSON」产出的文件，或单个模板对象。</p>' +
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
              if (!t || !t.name || !Array.isArray(t.layout)) return;
              const copy = clone(t);
              copy.id = RT.ws.uid('st');
              copy.builtin = false;
              copy.name = t.name + '（导入）';
              RT.sheetTpl.save(copy);
              n++;
            });
            RT.dialogs.close();
            RT.sheetTpl.manage();
            RT.toast(n ? ('已导入 ' + n + ' 个模板') : '没有可导入的模板', n ? undefined : 'warn');
          });
        },
      });
    },
  };

})(window.RT = window.RT || {});
