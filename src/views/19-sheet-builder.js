/* ============================================================
 * 19. 记录表模板编辑器：拖组件搭结构，保存为可复用模板
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;
  const T = RT.sheetTpl;

  let draft = null;   // 正在编辑的模板（副本）
  let root = null;    // 弹窗内画布容器

  const LEAF = ['text', 'textarea', 'number', 'date', 'check', 'select'];

  function paint() {
    if (!root) return;
    const canvas = root.querySelector('#sb-canvas');
    if (!canvas) return;
    if (!draft.layout.length) {
      canvas.innerHTML = '<div class="sb-empty">把左边的组件拖进来，或直接点一下添加。</div>';
      return;
    }
    canvas.innerHTML = draft.layout.map(function (c, i) { return card(c, i); }).join('');
  }

  function card(c, i) {
    return '<div class="sb-card" draggable="true" data-idx="' + i + '">' +
      '<div class="sb-hd">' +
      '<span class="sb-type">' + esc(T.TYPE_NAME[c.type] || c.type) + '</span>' +
      '<input class="sb-label" data-act="sb-label" data-idx="' + i + '" value="' + RT.attr(c.label || '') + '" placeholder="标签">' +
      (c.type !== 'heading'
        ? '<button class="mini" data-act="sb-width" data-idx="' + i + '" title="切换半宽 / 整行">' +
          (c.width === 'half' ? '半宽' : '整行') + '</button>'
        : '') +
      '<button class="mini" data-act="sb-up" data-idx="' + i + '" title="上移">' + RT.icon('up', 12) + '</button>' +
      '<button class="mini" data-act="sb-down" data-idx="' + i + '" title="下移">' + RT.icon('down', 12) + '</button>' +
      '<button class="mini danger" data-act="sb-del" data-idx="' + i + '" title="删除">' + RT.icon('trash', 12) + '</button>' +
      '</div>' +
      '<div class="sb-body">' + settings(c, i) + '</div>' +
      '</div>';
  }

  function settings(c, i) {
    if (c.type === 'heading') {
      return '<p class="dim">只作为分组标题，不占数据。</p>';
    }
    if (c.type === 'list') {
      return '<p class="dim">可增行的「一条文本 + 勾选」，适合秘密线索、怪物清单。</p>';
    }
    if (c.type === 'table') {
      const cols = c.columns || (c.columns = []);
      return '<div class="sb-sub">表格列</div>' +
        cols.map(function (col, ci) {
          return '<div class="sb-line">' +
            '<input data-act="sb-col-label" data-idx="' + i + '" data-ci="' + ci + '" value="' + RT.attr(col.label || '') + '" placeholder="列名">' +
            '<select data-act="sb-col-type" data-idx="' + i + '" data-ci="' + ci + '">' +
            ['text', 'number', 'check'].map(function (t) {
              return '<option value="' + t + '"' + (col.type === t ? ' selected' : '') + '>' +
                (t === 'text' ? '文本' : t === 'number' ? '数字' : '勾选') + '</option>';
            }).join('') + '</select>' +
            '<button class="mini danger" data-act="sb-col-del" data-idx="' + i + '" data-ci="' + ci + '">' + RT.icon('x', 12) + '</button>' +
            '</div>';
        }).join('') +
        '<button class="btn ghost small" data-act="sb-col-add" data-idx="' + i + '">' + RT.icon('plus', 12) + ' 加一列</button>';
    }
    if (c.type === 'repeat') {
      const fields = c.fields || (c.fields = []);
      return '<div class="sb-line"><label class="dim">至少几组</label>' +
        '<input type="number" min="0" max="20" data-act="sb-min" data-idx="' + i + '" value="' + (c.min == null ? 1 : c.min) + '">' +
        '<label class="dim">条目称呼</label>' +
        '<input data-act="sb-item-label" data-idx="' + i + '" value="' + RT.attr(c.itemLabel || '') + '" placeholder="如 NPC / 前线"></div>' +
        '<div class="sb-sub">组内字段</div>' +
        fields.map(function (f, fi) {
          return '<div class="sb-line">' +
            '<input data-act="sb-field-label" data-idx="' + i + '" data-fi="' + fi + '" value="' + RT.attr(f.label || '') + '" placeholder="字段名">' +
            '<select data-act="sb-field-type" data-idx="' + i + '" data-fi="' + fi + '">' +
            LEAF.concat(['list']).map(function (t) {
              return '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + (T.TYPE_NAME[t] || t) + '</option>';
            }).join('') + '</select>' +
            '<button class="mini" data-act="sb-field-width" data-idx="' + i + '" data-fi="' + fi + '">' +
            (f.width === 'half' ? '半宽' : '整行') + '</button>' +
            '<button class="mini danger" data-act="sb-field-del" data-idx="' + i + '" data-fi="' + fi + '">' + RT.icon('x', 12) + '</button>' +
            '</div>';
        }).join('') +
        '<button class="btn ghost small" data-act="sb-field-add" data-idx="' + i + '">' + RT.icon('plus', 12) + ' 加一个字段</button>';
    }
    if (c.type === 'select') {
      return '<textarea class="sb-opts" rows="3" data-act="sb-opts" data-idx="' + i +
        '" placeholder="每行一个选项">' + esc((c.options || []).join('\n')) + '</textarea>';
    }
    if (c.type === 'textarea') {
      return '<div class="sb-line"><label class="dim">行数</label>' +
        '<input type="number" min="1" max="12" data-act="sb-rows" data-idx="' + i + '" value="' + (c.rows || 2) + '">' +
        '<input data-act="sb-placeholder" data-idx="' + i + '" value="' + RT.attr(c.placeholder || '') + '" placeholder="占位提示（可选）"></div>';
    }
    return '<div class="sb-line"><input data-act="sb-placeholder" data-idx="' + i +
      '" value="' + RT.attr(c.placeholder || '') + '" placeholder="占位提示（可选）"></div>';
  }

  function body(tpl) {
    return (
      '<div class="sb-wrap">' +
      '<div class="sb-top">' +
      '<label class="dim">模板名</label>' +
      '<input id="sb-name" class="grow" value="' + RT.attr(tpl.name || '') + '" placeholder="例如：据点经营 / 角色卡">' +
      '<button class="btn gold small" data-act="sb-save">保存</button>' +
      '<button class="btn ghost small" data-act="sb-save-close">保存并关闭</button>' +
      '<button class="btn ghost small" data-act="sb-cancel">取消</button>' +
      '</div>' +
      '<div class="sb-palette" id="sb-palette">' +
      T.COMPONENTS.map(function (c) {
        return '<button class="sb-chip" draggable="true" data-comp="' + c.type + '" data-act="sb-add" data-type="' + c.type + '">' +
          c.name + '</button>';
      }).join('') +
      '<span class="dim sb-tip">拖进来，或点一下加到末尾</span>' +
      '</div>' +
      '<div class="sb-canvas" id="sb-canvas"></div>' +
      '</div>'
    );
  }

  function comp(type) {
    const c = { id: RT.ws.uid('c'), type: type, label: '', width: 'full' };
    if (type === 'select') c.options = ['选项 A', '选项 B'];
    if (type === 'table') c.columns = [{ key: 'c1', label: '列 1', type: 'text' }];
    if (type === 'repeat') {
      c.min = 1;
      c.itemLabel = '条目';
      c.fields = [{ id: RT.ws.uid('f'), type: 'text', label: '字段 1', width: 'half' }];
    }
    if (type === 'textarea') c.rows = 2;
    return c;
  }

  function idxOf(el) {
    return Number(el.getAttribute('data-idx'));
  }

  RT.acts['sb-add'] = function (el) {
    if (!draft) return;
    draft.layout.push(comp(el.getAttribute('data-type')));
    paint();
  };
  RT.acts['sb-del'] = function (el) {
    draft.layout.splice(idxOf(el), 1);
    paint();
  };
  RT.acts['sb-up'] = function (el) {
    const i = idxOf(el);
    if (i <= 0) return;
    const x = draft.layout.splice(i, 1)[0];
    draft.layout.splice(i - 1, 0, x);
    paint();
  };
  RT.acts['sb-down'] = function (el) {
    const i = idxOf(el);
    if (i >= draft.layout.length - 1) return;
    const x = draft.layout.splice(i, 1)[0];
    draft.layout.splice(i + 1, 0, x);
    paint();
  };
  RT.acts['sb-width'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.width = c.width === 'half' ? 'full' : 'half';
    paint();
  };
  RT.acts['sb-col-add'] = function (el) {
    const c = draft.layout[idxOf(el)];
    const n = c.columns.length + 1;
    c.columns.push({ key: 'c' + Date.now().toString(36).slice(-4), label: '列 ' + n, type: 'text' });
    paint();
  };
  RT.acts['sb-col-del'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.columns.splice(Number(el.getAttribute('data-ci')), 1);
    paint();
  };
  RT.acts['sb-field-add'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.fields.push({ id: RT.ws.uid('f'), type: 'text', label: '字段 ' + (c.fields.length + 1), width: 'half' });
    paint();
  };
  RT.acts['sb-field-del'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.fields.splice(Number(el.getAttribute('data-fi')), 1);
    paint();
  };
  RT.acts['sb-field-width'] = function (el) {
    const c = draft.layout[idxOf(el)];
    const f = c.fields[Number(el.getAttribute('data-fi'))];
    f.width = f.width === 'half' ? 'full' : 'half';
    paint();
  };
  RT.acts['sb-save'] = function () { save(false); };
  RT.acts['sb-save-close'] = function () { save(true); };
  RT.acts['sb-cancel'] = function () { RT.dialogs.close(); };

  RT.changeActs['sb-col-type'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.columns[Number(el.getAttribute('data-ci'))].type = el.value;
  };
  RT.changeActs['sb-field-type'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.fields[Number(el.getAttribute('data-fi'))].type = el.value;
  };

  RT.inputActs['sb-label'] = function (el) {
    draft.layout[idxOf(el)].label = el.value;
  };
  RT.inputActs['sb-placeholder'] = function (el) {
    draft.layout[idxOf(el)].placeholder = el.value;
  };
  RT.inputActs['sb-opts'] = function (el) {
    draft.layout[idxOf(el)].options = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  };
  RT.inputActs['sb-rows'] = function (el) {
    draft.layout[idxOf(el)].rows = Math.max(1, Math.min(12, Number(el.value) || 2));
  };
  RT.inputActs['sb-min'] = function (el) {
    draft.layout[idxOf(el)].min = Math.max(0, Math.min(20, Number(el.value) || 0));
  };
  RT.inputActs['sb-item-label'] = function (el) {
    draft.layout[idxOf(el)].itemLabel = el.value;
  };
  RT.inputActs['sb-col-label'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.columns[Number(el.getAttribute('data-ci'))].label = el.value;
  };
  RT.inputActs['sb-field-label'] = function (el) {
    const c = draft.layout[idxOf(el)];
    c.fields[Number(el.getAttribute('data-fi'))].label = el.value;
  };

  function save(close) {
    if (!draft) return;
    const nameEl = root.querySelector('#sb-name');
    draft.name = nameEl ? nameEl.value.trim() : draft.name;
    if (!draft.name) { RT.toast('先给模板起个名字', 'warn'); return; }
    if (!draft.layout.length) { RT.toast('模板里还没有组件', 'warn'); return; }
    const bad = draft.layout.filter(function (c) {
      return c.type !== 'heading' && !String(c.label || '').trim();
    });
    if (bad.length) {
      RT.toast('有 ' + bad.length + ' 个组件还没填标签', 'warn');
      return;
    }
    draft.version = (draft.version || 1) + 1;
    RT.sheetTpl.save(draft);
    RT.toast('模板已保存');
    RT.rerender('all');
    if (close) RT.dialogs.close();
  }

  /* ---------------- 拖拽 ---------------- */

  function bindDrag() {
    if (!root) return;

    root.addEventListener('dragstart', function (e) {
      const chip = e.target.closest('[data-comp]');
      if (chip) {
        e.dataTransfer.setData('text/plain', 'comp:' + chip.getAttribute('data-comp'));
        e.dataTransfer.effectAllowed = 'copy';
        return;
      }
      const cardEl = e.target.closest('.sb-card');
      if (cardEl && !e.target.closest('input,textarea,select,button')) {
        e.dataTransfer.setData('text/plain', 'card:' + cardEl.getAttribute('data-idx'));
        e.dataTransfer.effectAllowed = 'move';
        cardEl.classList.add('dragging');
        return;
      }
      e.preventDefault();
    });

    root.addEventListener('dragend', function () {
      root.querySelectorAll('.dragging').forEach(function (x) { x.classList.remove('dragging'); });
      root.querySelectorAll('.drop-hover').forEach(function (x) { x.classList.remove('drop-hover'); });
    });

    root.addEventListener('dragover', function (e) {
      if (!e.target.closest('#sb-canvas')) return;
      e.preventDefault();
      const cardEl = e.target.closest('.sb-card');
      root.querySelectorAll('.drop-hover').forEach(function (x) { x.classList.remove('drop-hover'); });
      if (cardEl) cardEl.classList.add('drop-hover');
    });

    root.addEventListener('drop', function (e) {
      const canvas = e.target.closest('#sb-canvas');
      if (!canvas) return;
      e.preventDefault();
      const payload = e.dataTransfer.getData('text/plain') || '';
      const cardEl = e.target.closest('.sb-card');
      const at = cardEl ? Number(cardEl.getAttribute('data-idx')) : draft.layout.length;

      if (payload.indexOf('comp:') === 0) {
        draft.layout.splice(at, 0, comp(payload.slice(5)));
        paint();
      } else if (payload.indexOf('card:') === 0) {
        const from = Number(payload.slice(5));
        const item = draft.layout.splice(from, 1)[0];
        draft.layout.splice(from < at ? at - 1 : at, 0, item);
        paint();
      }
      root.querySelectorAll('.drop-hover').forEach(function (x) { x.classList.remove('drop-hover'); });
    });
  }

  RT.sheetBuilder = {
    open: function (templateId) {
      const src = templateId ? T.get(templateId) : null;
      const blank = {
        id: RT.ws.uid('st'),
        name: '新模板',
        icon: 'layers',
        builtin: false,
        version: 0,
        layout: [],
      };
      draft = T.clone(src || blank);

      RT.dialogs.open({
        title: '编辑模板：' + (src ? src.name : '新模板'),
        wide: true,
        body: body(draft),
        onMount: function (modal) {
          root = modal;
          paint();
          bindDrag();
        },
      });
    },
  };

})(window.RT = window.RT || {});
