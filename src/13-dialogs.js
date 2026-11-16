/* ============================================================
 * 13. 弹窗：导入 / 导出 / CSV / 备份 / 确认
 * ============================================================ */
(function (RT) {
  'use strict';

  function root() {
    return document.getElementById('modal-root');
  }

  function esc(s) { return RT.esc(s); }

  RT.dialogs = {
    isOpen: function () {
      const r = root();
      return !!(r && r.firstElementChild);
    },

    close: function () {
      const r = root();
      if (r) r.innerHTML = '';
      document.body.classList.remove('modal-open');
    },

    open: function (opts) {
      const r = root();
      if (!r) return null;
      document.body.classList.add('modal-open');
      r.innerHTML =
        '<div class="modal-backdrop" data-close="1"></div>' +
        '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3>' + esc(opts.title) + '</h3>' +
        '<button class="mini" data-close="1" title="关闭">' + RT.icon('x', 16) + '</button></div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        '</div>';

      r.querySelectorAll('[data-close]').forEach(function (el) {
        el.addEventListener('click', function () { RT.dialogs.close(); });
      });

      const modal = r.querySelector('.modal');
      if (opts.onMount) opts.onMount(modal);
      return modal;
    },

    confirm: function (title, message, onYes, danger) {
      RT.dialogs.open({
        title: title,
        body:
          '<p class="modal-note">' + esc(message) + '</p>' +
          '<div class="modal-actions right">' +
          '<button class="btn ghost" data-cancel="1">取消</button>' +
          '<button class="btn ' + (danger ? 'danger-solid' : 'gold') + '" data-yes="1">确定</button>' +
          '</div>',
        onMount: function (modal) {
          modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
          modal.querySelector('[data-yes]').addEventListener('click', function () {
            RT.dialogs.close();
            onYes();
          });
        },
      });
    },

    /* ---------------- 导入 / 导出 ---------------- */

    io: function (initialTab, presetImportText) {
      const S = RT.state;
      const tabs = [
        ['export', '导出'],
        ['import', '导入'],
        ['csv', 'CSV'],
        ['backup', '备份'],
      ];
      let tab = initialTab || 'export';

      const modal = RT.dialogs.open({
        title: '数据管理',
        wide: true,
        body:
          '<div class="tabs" id="io-tabs">' + tabs.map(function (t) {
            return '<button class="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
          }).join('') + '</div>' +
          '<div id="io-body"></div>',
        onMount: function (m) {
          m.querySelector('#io-tabs').addEventListener('click', function (e) {
            const btn = e.target.closest('[data-tab]');
            if (!btn) return;
            tab = btn.getAttribute('data-tab');
            render();
          });
          render();
        },
      });

      function render() {
        const m = root();
        if (!m) return;
        m.querySelectorAll('#io-tabs .tab').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-tab') === tab);
        });
        const body = m.querySelector('#io-body');
        if (!body) return;
        body.innerHTML = '';
        ({ export: renderExport, import: renderImport, csv: renderCsv, backup: renderBackup })[tab](body);
      }

      function renderExport(body) {
        const json = RT.actions.exportJSON();
        const kb = (new Blob([json]).size / 1024).toFixed(1);
        body.innerHTML =
          '<p class="modal-note">导出内容包含全部表、组合、收藏与历史。把它存到网盘或发给另一台设备即可。</p>' +
          '<textarea class="textarea mono" id="io-export-text" rows="12" readonly>' + esc(json) + '</textarea>' +
          '<div class="modal-actions">' +
          '<button class="btn gold" id="io-download">' + RT.icon('download', 15) + ' 下载 .json</button>' +
          '<button class="btn ghost" id="io-copy">' + RT.icon('copy', 15) + ' 复制</button>' +
          '<span class="dim grow right">' + kb + ' KB</span>' +
          '</div>';
        body.querySelector('#io-download').addEventListener('click', function () {
          RT.download('随机生成器-表组-' + RT.dateStamp() + '.json', json);
        });
        body.querySelector('#io-copy').addEventListener('click', function () { RT.copyText(json); });
      }

      function renderImport(body) {
        body.innerHTML =
          '<p class="modal-note">选择 .json 文件，或把内容直接粘进下面的框。</p>' +
          '<div class="file-row">' +
          '<label class="btn ghost small file-btn">' + RT.icon('upload', 14) + ' 选择 .json 文件' +
          '<input type="file" id="io-file" accept=".json,application/json" hidden></label>' +
          '<span class="dim">也可以把文件直接拖进窗口</span>' +
          '</div>' +
          '<textarea class="textarea mono" id="io-import-text" rows="8" placeholder="把导出的 JSON 粘到这里"></textarea>' +
          '<div class="radio-row">' +
          '<label><input type="radio" name="io-strategy" value="merge" checked> 合并到当前表组</label>' +
          '<label><input type="radio" name="io-strategy" value="new"> 作为新表组载入</label>' +
          '<label><input type="radio" name="io-strategy" value="replace"> 覆盖当前表组</label>' +
          '</div>' +
          '<div class="modal-actions">' +
          '<button class="btn gold" id="io-do-import">' + RT.icon('check', 15) + ' 导入</button>' +
          '</div>';

        const ta = body.querySelector('#io-import-text');
        if (presetImportText) ta.value = presetImportText;

        body.querySelector('#io-file').addEventListener('change', function (e) {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function () { ta.value = String(reader.result || ''); };
          reader.readAsText(file, 'utf-8');
        });

        body.querySelector('#io-do-import').addEventListener('click', function () {
          const text = ta.value.trim();
          if (!text) { RT.toast('还没有内容可以导入', 'warn'); return; }
          const strategy = (body.querySelector('input[name="io-strategy"]:checked') || {}).value || 'merge';
          try {
            const info = RT.actions.importJSON(text, strategy);
            RT.dialogs.close();
            RT.toast('导入完成：' + info.tables + ' 张表、' + info.combos + ' 个组合');
          } catch (err) {
            RT.toast(err.message || '导入失败', 'warn');
          }
        });
      }

      function renderCsv(body) {
        const current = RT.currentTable();
        const options = S.set.tables.map(function (t) {
          return '<option value="' + t.id + '"' + (current && t.id === current.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
        }).join('');

        body.innerHTML =
          '<p class="modal-note">CSV 便于从 Excel / 表格软件批量搬条目。列顺序：<code>文本, 权重, 区间起, 区间止</code>，后三列可留空。</p>' +
          '<div class="file-row"><label class="dim">目标表</label><select id="csv-table" class="grow">' + options + '</select></div>' +
          '<textarea class="textarea mono" id="csv-text" rows="6" placeholder="文本,权重&#10;艾德温·灰堡,1&#10;莉安·银溪,3"></textarea>' +
          '<div class="modal-actions wrap">' +
          '<button class="btn ghost small" id="csv-download">' + RT.icon('download', 14) + ' 导出该表</button>' +
          '<button class="btn ghost small" id="csv-copy">' + RT.icon('copy', 14) + ' 复制为 CSV</button>' +
          '<button class="btn gold small" id="csv-append">追加导入</button>' +
          '<button class="btn ghost small danger" id="csv-replace">覆盖导入</button>' +
          '</div>';

        const sel = body.querySelector('#csv-table');
        const ta = body.querySelector('#csv-text');

        body.querySelector('#csv-download').addEventListener('click', function () {
          const csv = RT.actions.exportCSV(sel.value);
          if (!csv) { RT.toast('这张表还是空的', 'warn'); return; }
          const t = S.set.tables.find(function (x) { return x.id === sel.value; });
          RT.download((t ? t.name : '表') + '-' + RT.dateStamp() + '.csv', '\uFEFF' + csv, 'text/csv');
        });

        body.querySelector('#csv-copy').addEventListener('click', function () {
          const csv = RT.actions.exportCSV(sel.value);
          if (!csv) { RT.toast('这张表还是空的', 'warn'); return; }
          RT.copyText(csv);
        });

        body.querySelector('#csv-append').addEventListener('click', function () {
          const n = RT.actions.importCSV(sel.value, ta.value, false);
          if (!n) { RT.toast('没有解析到条目', 'warn'); return; }
          RT.dialogs.close();
          RT.toast('已追加 ' + n + ' 条');
        });

        body.querySelector('#csv-replace').addEventListener('click', function () {
          if (!ta.value.trim()) { RT.toast('先粘贴 CSV 内容', 'warn'); return; }
          RT.dialogs.confirm('覆盖导入', '这会清空目标表原有的条目（会先存一份自动快照）。继续？', function () {
            const n = RT.actions.importCSV(sel.value, ta.value, true);
            RT.toast(n ? '已覆盖为 ' + n + ' 条' : '没有解析到条目', n ? undefined : 'warn');
            RT.dialogs.close();
          }, true);
        });
      }

      function renderBackup(body) {
        const snaps = RT.snapshots.list();
        body.innerHTML =
          '<p class="modal-note">每次删除表或导入前都会自动存一份快照（最多 3 份，只在本机）。</p>' +
          (snaps.length
            ? '<div class="snap-list">' + snaps.map(function (s, i) {
              return '<div class="snap-row"><div><strong>' + esc(s.label || '自动快照') + '</strong>' +
                '<span class="dim"> · ' + new Date(s.ts).toLocaleString() + ' · ' + ((s.set && s.set.tables ? s.set.tables.length : 0)) + ' 张表</span></div>' +
                '<button class="btn ghost small" data-snap="' + i + '">恢复</button></div>';
            }).join('') + '</div>'
            : '<p class="dim">还没有快照。</p>') +
          '<div class="modal-actions wrap">' +
          '<button class="btn ghost small" id="backup-blank">新建空白表组</button>' +
          '<button class="btn ghost small" id="backup-sample">载入核心表包</button>' +
          '</div>';

        body.querySelectorAll('[data-snap]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const i = Number(btn.getAttribute('data-snap'));
            RT.dialogs.confirm('恢复快照', '当前数据会被替换（恢复前也会先存一份快照）。', function () {
              if (RT.snapshots.restore(i)) RT.toast('已恢复');
              RT.dialogs.close();
            });
          });
        });

        body.querySelector('#backup-blank').addEventListener('click', function () {
          RT.dialogs.confirm('新建空白表组', '当前表组会被清空（会先存一份快照）。', function () {
            RT.actions.newBlankSet();
            RT.dialogs.close();
            RT.toast('已新建空白表组');
          }, true);
        });

        body.querySelector('#backup-sample').addEventListener('click', function () {
          RT.dialogs.confirm('载入核心表包', '当前表组会被「即兴核心包」替换（会先存一份快照）。', function () {
            RT.actions.loadSample();
            RT.dialogs.close();
            RT.toast('已载入即兴核心包');
          }, true);
        });
      }

      return modal;
    },

    /* ---------------- 输入框 / 分组删除 ---------------- */

    prompt: function (title, value, onOk, note, validate) {
      RT.dialogs.open({
        title: title,
        body:
          (note ? '<p class="modal-note">' + esc(note) + '</p>' : '') +
          '<input id="prompt-input" class="grow" value="' + RT.attr(value || '') + '" autocomplete="off">' +
          '<div class="field-error" id="prompt-error" hidden></div>' +
          '<div class="modal-actions right">' +
          '<button class="btn ghost" data-cancel="1">取消</button>' +
          '<button class="btn gold" data-ok="1">确定</button>' +
          '</div>',
        onMount: function (modal) {
          const input = modal.querySelector('#prompt-input');
          const errEl = modal.querySelector('#prompt-error');
          const okBtn = modal.querySelector('[data-ok]');
          input.focus();
          input.select();

          const errorNow = function () {
            return validate ? (validate(input.value.trim()) || '') : '';
          };
          const sync = function () {
            const msg = errorNow();
            errEl.textContent = msg;
            errEl.hidden = !msg;
            okBtn.disabled = !!msg;
            input.classList.toggle('invalid', !!msg);
          };
          const close = function () { RT.dialogs.close(); };
          const ok = function () {
            if (errorNow()) { sync(); return; }
            const v = input.value.trim();
            RT.dialogs.close();
            if (v) onOk(v);
          };

          input.addEventListener('input', sync);
          modal.querySelector('[data-cancel]').addEventListener('click', close);
          okBtn.addEventListener('click', ok);
          input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); ok(); }
          });
          sync();
        },
      });
    },

    folderDelete: function (folder, count, kidCount, onKeep, onDelete) {
      const extra = kidCount ? '，以及 ' + kidCount + ' 个子分组' : '';
      RT.dialogs.open({
        title: '删除分组「' + folder.name + '」',
        body:
          '<p class="modal-note">这个分组里有 <strong>' + count + '</strong> 张表' + extra + '，你想怎么处理？</p>' +
          '<div class="modal-actions right">' +
          '<button class="btn ghost" data-cancel="1">取消</button>' +
          '<button class="btn ghost" data-keep="1">内容移到上一级</button>' +
          '<button class="btn danger-solid" data-del="1">全部删除</button>' +
          '</div>',
        onMount: function (modal) {
          modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
          modal.querySelector('[data-keep]').addEventListener('click', function () {
            RT.dialogs.close();
            onKeep();
          });
          modal.querySelector('[data-del]').addEventListener('click', function () {
            RT.dialogs.close();
            onDelete();
          });
        },
      });
    },

    /* ---------------- 存为条目 ---------------- */

    saveEntry: function (text) {
      const S = RT.state;
      if (!S.set.tables.length) {
        RT.toast('还没有表，先建一张', 'warn');
        return;
      }
      const current = RT.currentTable();
      RT.dialogs.open({
        title: '存入哪张表',
        body:
          '<p class="modal-note pre">' + esc(text) + '</p>' +
          '<select id="save-entry-table" class="grow">' + S.set.tables.map(function (t) {
            return '<option value="' + t.id + '"' + (current && t.id === current.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
          }).join('') + '</select>' +
          '<div class="modal-actions right">' +
          '<button class="btn ghost" data-cancel="1">取消</button>' +
          '<button class="btn gold" data-ok="1">存入</button>' +
          '</div>',
        onMount: function (modal) {
          modal.querySelector('[data-cancel]').addEventListener('click', function () { RT.dialogs.close(); });
          modal.querySelector('[data-ok]').addEventListener('click', function () {
            const id = modal.querySelector('#save-entry-table').value;
            RT.actions.saveTextAsEntry(id, text);
            RT.dialogs.close();
          });
        },
      });
    },
  };

})(window.RT = window.RT || {});
