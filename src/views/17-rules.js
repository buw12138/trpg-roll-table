/* ============================================================
 * 17. 视图：规则速查（全局，跨战役共用）
 *     多规则包切换、Markdown / JSON 导入、目录跳转、搜索高亮。
 * ============================================================ */
(function (RT) {
  'use strict';

  const esc = RT.esc;

  function state() {
    return RT.ws.rulesState();
  }

  function saveState(st) {
    RT.ws.saveRules(st);
  }

  function active() {
    const st = state();
    let p = st.packs.filter(function (x) { return x.id === st.activeId; })[0];
    if (!p && st.packs.length) {
      p = st.packs[0];
      st.activeId = p.id;
      saveState(st);
    }
    return p || null;
  }

  function setActive(id) {
    const st = state();
    st.activeId = id;
    saveState(st);
    RT.state.ui.rulesId = id;
  }

  function addPack(pack) {
    const st = state();
    let name = String(pack.name || '').trim() || '未命名规则包';
    if (st.packs.some(function (p) { return p.name === name; })) {
      name = name + '（导入）';
      let i = 2;
      while (st.packs.some(function (p) { return p.name === name; })) {
        name = pack.name + '（导入 ' + i + '）';
        i++;
      }
    }
    const np = {
      id: RT.ws.uid('rp'),
      name: name,
      source: pack.source || '手动导入',
      md: typeof pack.md === 'string' ? pack.md : '',
      blocks: Array.isArray(pack.blocks) ? pack.blocks : null,
      ts: Date.now(),
    };
    st.packs.push(np);
    st.activeId = np.id;
    saveState(st);
    RT.state.ui.rulesId = np.id;
    return np;
  }

  /* ---------------- 主区 ---------------- */

  RT.viewRules = function () {
    const st = state();
    const pack = active();
    if (!pack) {
      return (
        '<div class="empty rules-empty">' +
        '<div class="empty-mark">' + RT.icon('book', 40) + '</div>' +
        '<h2>还没有规则速查</h2>' +
        '<p>规则速查是全局的，不跟战役走：把 Markdown（或 JSON）丢进来，桌面随时查。</p>' +
        '<p class="dim">支持标题、列表、表格、引用、代码块；「## 标题」会自动进左侧目录。</p>' +
        '<div class="camp-empty-actions">' +
        '<button class="btn gold" data-act="rules-import">' + RT.icon('upload', 15) + ' 导入 / 粘贴内容</button>' +
        '<button class="btn ghost" data-act="rules-new">' + RT.icon('plus', 15) + ' 新建空白规则包</button>' +
        '<button class="btn ghost" data-act="rules-spec">' + RT.icon('file', 15) + ' 格式规范</button>' +
        '</div>' +
        '</div>'
      );
    }

    const q = RT.state.ui.rulesQuery || '';
    const rendered = RT.md.renderPack(pack);
    const html = q ? RT.md.highlight(rendered.html, q) : rendered.html;

    return (
      '<div class="view rules-view">' +
      '<div class="rules-head">' +
      '<div class="head-main">' +
      '<h2 class="page-title">' + esc(pack.name) + '</h2>' +
      '<div class="meta-row"><span class="dim">' + esc(pack.source || '本地') + '</span>' +
      '<span class="dim">' + rendered.toc.length + ' 个标题</span>' +
      '<span class="dim">' + (pack.md ? pack.md.length + ' 字' : '结构化块') + '</span></div>' +
      '</div>' +
      '<div class="head-actions">' +
      '<button class="btn ghost small" data-act="rules-rename">' + RT.icon('edit', 14) + ' 重命名</button>' +
      '<button class="btn ghost small" data-act="rules-spec">' + RT.icon('file', 14) + ' 格式说明</button>' +
      '<button class="btn ghost small" data-act="rules-export">' + RT.icon('download', 14) + ' 导出 .md</button>' +
      '<button class="btn ghost small danger" data-act="rules-del">' + RT.icon('trash', 14) + ' 删除</button>' +
      '</div>' +
      '</div>' +
      '<div class="rules-bar">' +
      '<input id="rules-search" class="grow" data-act="rules-search" placeholder="在本规则包里搜索（标题、关键词）" value="' + RT.attr(q) + '">' +
      '<button class="btn ghost small" data-act="rules-import">' + RT.icon('upload', 14) + ' 导入新的</button>' +
      '<button class="btn ghost small" data-act="rules-print">' + RT.icon('download', 14) + ' 打印</button>' +
      '</div>' +
      '<div class="rules-doc md">' + (html || '<p class="dim">这个规则包是空的。</p>') + '</div>' +
      '</div>'
    );
  };

  /* ---------------- 侧栏 ---------------- */

  RT.rulesSide = function () {
    const st = state();
    const pack = active();
    const q = RT.state.ui.rulesQuery || '';
    let html = '<div class="side-summary">规则包 <strong>' + st.packs.length + '</strong> 个</div>';
    html += st.packs.map(function (p) {
      return '<button class="side-row' + (pack && p.id === pack.id ? ' active' : '') +
        '" data-act="rules-open" data-id="' + p.id + '">' +
        '<span class="side-main">' + esc(p.name) + '</span>' +
        '<span class="side-meta">' + (p.md ? Math.round(p.md.length / 100) / 10 + 'k' : 'JSON') + '</span></button>';
    }).join('');
    if (pack) {
      const toc = RT.md.renderPack(pack).toc.filter(function (t) {
        return t.level <= 3 && (!q || t.text.toLowerCase().indexOf(q.toLowerCase()) >= 0);
      });
      if (toc.length) {
        html += '<div class="side-toc-head">目录</div>' + toc.map(function (t) {
          return '<button class="side-toc lv' + t.level + '" data-act="rules-jump" data-id="' + t.id + '">' +
            esc(t.text) + '</button>';
        }).join('');
      }
    }
    return html;
  };

  RT.rulesNewBtn = function () {
    return '<button class="side-new" data-act="rules-import">' + RT.icon('upload', 15) + ' 导入规则</button>';
  };

  /* ---------------- 动作 ---------------- */

  RT.acts['rules-open'] = function (el) {
    setActive(el.getAttribute('data-id'));
    RT.state.ui.rulesQuery = '';
    RT.scheduleSave();
    RT.rerender('all');
  };

  RT.acts['rules-jump'] = function (el) {
    const id = el.getAttribute('data-id');
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.classList.add('flash');
    setTimeout(function () { target.classList.remove('flash'); }, 900);
  };

  RT.acts['rules-rename'] = function () {
    const pack = active();
    if (!pack) return;
    RT.dialogs.prompt('重命名规则包', pack.name, function (name) {
      const st = state();
      const p = st.packs.filter(function (x) { return x.id === pack.id; })[0];
      if (!p) return;
      p.name = String(name || '').trim() || p.name;
      saveState(st);
      RT.rerender('all');
    });
  };

  RT.acts['rules-del'] = function () {
    const pack = active();
    if (!pack) return;
    RT.dialogs.confirm('删除规则包', '「' + pack.name + '」会被删除，不能恢复。', function () {
      const st = state();
      st.packs = st.packs.filter(function (p) { return p.id !== pack.id; });
      st.activeId = st.packs[0] ? st.packs[0].id : null;
      saveState(st);
      RT.toast('已删除规则包');
      RT.rerender('all');
    }, true);
  };

  RT.acts['rules-export'] = function () {
    const pack = active();
    if (!pack) return;
    const md = pack.md || '';
    if (!md) {
      RT.toast('这个规则包是结构化块，暂时只能就地查看', 'warn');
      return;
    }
    RT.download(pack.name + '-' + RT.dateStamp() + '.md', md, 'text/markdown');
  };

  RT.acts['rules-print'] = function () {
    window.print();
  };

  RT.acts['rules-new'] = function () {
    RT.dialogs.prompt('新建规则包', '', function (name) {
      const md = [
        '# ' + name,
        '',
        '## 一、判定',
        '',
        '- 需要判定时，说出「目标 + 难度」，让玩家掷。',
        '',
        '## 二、难度参考',
        '',
        '| 难度 | 目标值 |',
        '| --- | --- |',
        '| 简单 | 10 |',
        '| 中等 | 15 |',
        '| 困难 | 20 |',
        '',
        '> 把这一段换成你自己的规则；「## 标题」会自动进左侧目录。',
      ].join('\n');
      addPack({ name: name || '新规则包', source: '空白模板', md: md });
      RT.toast('已新建规则包');
      RT.rerender('all');
    }, '只建一个空壳，之后可以随时「导入 / 粘贴内容」追加或替换。');
  };

  /* ---------------- 导入弹窗 ---------------- */

  RT.acts['rules-import'] = function () {
    RT.dialogs.open({
      title: '导入规则速查',
      wide: true,
      body:
        '<p class="modal-note">支持 Markdown（.md / .txt）与 JSON；也可以直接把文件拖进下面的框里。' +
        'JSON 可为 <code>{name, md}</code>、<code>{name, blocks:[…]}</code> 或 <code>{packs:[…]}</code>。' +
        '<button class="btn ghost small" data-act="rules-spec">格式规范</button></p>' +
        '<div class="file-row">' +
        '<label class="btn ghost small file-btn">' + RT.icon('upload', 14) + ' 选择文件' +
        '<input type="file" id="rules-file" accept=".md,.markdown,.txt,.json,text/markdown,application/json" hidden></label>' +
        '<input id="rules-name" class="grow" placeholder="规则包名称（留空则用文件名 / 首个标题）">' +
        '</div>' +
        '<textarea class="textarea mono" id="rules-text" rows="12" placeholder="把 Markdown 或 JSON 粘到这里"></textarea>' +
        '<div class="modal-actions right">' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '<button class="btn gold" id="rules-do-import">' + RT.icon('check', 15) + ' 导入</button>' +
        '</div>',
      onMount: function (modal) {
        const ta = modal.querySelector('#rules-text');
        const nameEl = modal.querySelector('#rules-name');
        let fileName = '';

        modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });

        const fileInput = modal.querySelector('#rules-file');
        fileInput.addEventListener('change', function (e) {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          fileName = f.name.replace(/\.[^.]+$/, '');
          const reader = new FileReader();
          reader.onload = function () { ta.value = String(reader.result || ''); };
          reader.readAsText(f, 'utf-8');
        });

        ta.addEventListener('dragover', function (e) { e.preventDefault(); });
        ta.addEventListener('drop', function (e) {
          e.preventDefault();
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (!f) return;
          fileName = f.name.replace(/\.[^.]+$/, '');
          const reader = new FileReader();
          reader.onload = function () { ta.value = String(reader.result || ''); };
          reader.readAsText(f, 'utf-8');
        });

        modal.querySelector('#rules-do-import').addEventListener('click', function () {
          const text = String(ta.value || '').replace(/^\uFEFF/, '').trim();
          if (!text) {
            RT.toast('还没有内容', 'warn');
            return;
          }
          let count = 0;
          const trimmed = text.charAt(0) === '{' || text.charAt(0) === '[';
          if (trimmed) {
            let parsed = null;
            try {
              parsed = JSON.parse(text);
            } catch (e) {
              parsed = null;
            }
            if (parsed) {
              if (Array.isArray(parsed.packs)) {
                parsed.packs.forEach(function (p) {
                  if (p && (p.md || p.blocks)) { addPack(p); count++; }
                });
              } else if (parsed.name || parsed.md || parsed.blocks) {
                addPack({
                  name: parsed.name || nameEl.value || fileName || '导入的规则包',
                  source: parsed.source || (fileName ? '文件：' + fileName : 'JSON 导入'),
                  md: parsed.md,
                  blocks: parsed.blocks,
                });
                count++;
              }
            }
          }
          if (!count) {
            const firstHead = (text.match(/^\s*#\s+(.+)$/m) || [])[1];
            addPack({
              name: nameEl.value.trim() || fileName || firstHead || '导入的规则包',
              source: fileName ? '文件：' + fileName : '粘贴导入',
              md: text,
            });
            count = 1;
          }
          RT.dialogs.close();
          RT.toast('已导入 ' + count + ' 个规则包');
          RT.rerender('all');
        });
      },
    });
  };

  /* ---------------- 搜索 ---------------- */

  RT.inputActs['rules-search'] = function (el) {
    RT.state.ui.rulesQuery = el.value;
    RT.debouncedRulesSearch = RT.debouncedRulesSearch || RT.debounce(function () {
      RT.rerender('main');
      RT.rerender('sidebar');
      const s = document.querySelector('#rules-search');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }, 220);
    RT.debouncedRulesSearch();
  };

})(window.RT = window.RT || {});
