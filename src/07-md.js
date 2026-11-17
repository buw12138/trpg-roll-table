/* ============================================================
 * 07. Markdown 子集渲染：标题 / 列表 / 表格 / 引用 / 代码块 / 行内格式
 *     产出 { html, toc }，供「规则速查」逐段渲染与目录跳转。
 *     只支持规则速查真正用得到的语法，不做完整 Markdown。
 * ============================================================ */
(function (RT) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function inline(s) {
    let out = esc(s);
    // 行内码优先，避免里面的 ** 被当粗体
    const codes = [];
    out = out.replace(/`([^`]+)`/g, function (m, code) {
      codes.push(code);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/\u0000(\d+)\u0000/g, function (m, i) {
      return '<code>' + esc(codes[Number(i)]) + '</code>';
    });
    return out;
  }

  function slug(text, used) {
    let base = 'h-' + String(text).replace(/[\s\u3000]+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 40);
    if (!base || base === 'h-') base = 'h-sec';
    let id = base;
    let i = 2;
    while (used[id]) {
      id = base + '-' + i;
      i++;
    }
    used[id] = true;
    return id;
  }

  const RE_UL = /^\s{0,3}[-*+]\s+(.*)$/;
  const RE_OL = /^\s{0,3}(\d+)[.)]\s+(.*)$/;
  const RE_HEAD = /^\s{0,3}(#{1,4})\s+(.*)$/;
  const RE_HR = /^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/;
  const RE_TABLE_SEP = /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/;

  function splitRow(line) {
    let s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split('|').map(function (x) { return x.trim(); });
  }

  function render(text) {
    const lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const used = {};
    const toc = [];
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 代码块
      if (/^\s*```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        i++;
        out.push('<pre class="md-code">' + esc(buf.join('\n')) + '</pre>');
        continue;
      }

      // 空行
      if (!line.trim()) {
        i++;
        continue;
      }

      // 分隔线
      if (RE_HR.test(line.trim()) && line.trim().length <= 6) {
        out.push('<hr class="md-hr">');
        i++;
        continue;
      }

      // 标题
      let m = line.match(RE_HEAD);
      if (m) {
        const level = Math.min(4, m[1].length);
        const t = m[2].trim();
        const id = slug(t, used);
        toc.push({ level: level, text: t, id: id });
        out.push('<h' + level + ' class="md-h md-h' + level + '" id="' + id + '">' + inline(t) + '</h' + level + '>');
        i++;
        continue;
      }

      // 表格
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        out.push(
          '<div class="md-tablewrap"><table class="md-table"><thead><tr>' +
          head.map(function (h) { return '<th>' + inline(h) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') +
          '</tbody></table></div>'
        );
        continue;
      }

      // 引用
      if (/^\s{0,3}>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
          i++;
        }
        out.push('<blockquote class="md-quote">' + buf.map(function (b) { return inline(b); }).join('<br>') + '</blockquote>');
        continue;
      }

      // 无序列表
      if (RE_UL.test(line)) {
        const items = [];
        while (i < lines.length && RE_UL.test(lines[i])) {
          items.push(lines[i].match(RE_UL)[1]);
          i++;
        }
        out.push('<ul class="md-ul">' + items.map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</ul>');
        continue;
      }

      // 有序列表
      if (RE_OL.test(line)) {
        const items = [];
        while (i < lines.length && RE_OL.test(lines[i])) {
          items.push(lines[i].match(RE_OL)[2]);
          i++;
        }
        out.push('<ol class="md-ol">' + items.map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</ol>');
        continue;
      }

      // 普通段落（连续行合并，行内换行保留）
      const buf = [];
      while (i < lines.length && lines[i].trim() && !RE_UL.test(lines[i]) && !RE_OL.test(lines[i]) &&
        !RE_HEAD.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^\s*```/.test(lines[i]) &&
        !(lines[i].indexOf('|') >= 0 && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1]))) {
        buf.push(lines[i]);
        i++;
      }
      out.push('<p class="md-p">' + buf.map(inline).join('<br>') + '</p>');
    }

    return { html: out.join('\n'), toc: toc };
  }

  /* JSON 结构块：{t:'h',level,text} / {t:'p'} / {t:'ul',items} / {t:'table',head,rows} … */
  function blocksToHtml(blocks) {
    const used = {};
    const toc = [];
    const html = (blocks || []).map(function (b) {
      if (!b || !b.t) return '';
      switch (b.t) {
        case 'h': {
          const level = Math.min(4, Math.max(1, Number(b.level) || 2));
          const text = b.text || '';
          const id = slug(text, used);
          toc.push({ level: level, text: text, id: id });
          return '<h' + level + ' class="md-h md-h' + level + '" id="' + id + '">' + inline(text) + '</h' + level + '>';
        }
        case 'p':
          return '<p class="md-p">' + inline(b.text || '') + '</p>';
        case 'ul':
          return '<ul class="md-ul">' + (b.items || []).map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</ul>';
        case 'ol':
          return '<ol class="md-ol">' + (b.items || []).map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</ol>';
        case 'table':
          return '<div class="md-tablewrap"><table class="md-table"><thead><tr>' +
            (b.head || []).map(function (h) { return '<th>' + inline(h) + '</th>'; }).join('') +
            '</tr></thead><tbody>' + (b.rows || []).map(function (r) {
              return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
            }).join('') + '</tbody></table></div>';
        case 'quote':
          return '<blockquote class="md-quote">' + inline(b.text || '') + '</blockquote>';
        case 'hr':
          return '<hr class="md-hr">';
        case 'code':
          return '<pre class="md-code">' + esc(b.text || '') + '</pre>';
        default:
          return '';
      }
    }).join('\n');
    return { html: html, toc: toc };
  }

  /** 包内容统一转 html：优先 md，其次 blocks */
  function renderPack(pack) {
    if (pack && typeof pack.md === 'string' && pack.md.trim()) return render(pack.md);
    if (pack && Array.isArray(pack.blocks)) return blocksToHtml(pack.blocks);
    return { html: '', toc: [] };
  }

  /** 在正文纯文本区间里加高亮（不动标签与属性） */
  function highlight(html, query) {
    const q = String(query || '').trim();
    if (!q) return html;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return html.replace(/>([^<]+)</g, function (m, txt) {
      return '>' + txt.replace(re, '<mark class="md-mark">$1</mark>') + '<';
    });
  }

  RT.md = {
    render: render,
    blocksToHtml: blocksToHtml,
    renderPack: renderPack,
    highlight: highlight,
  };
})(window.RT = window.RT || {});
