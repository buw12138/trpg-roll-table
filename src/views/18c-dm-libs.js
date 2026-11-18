/* ============================================================
 * 18c. DM 追踪面板的库：敌人库 / 环境库 / 文本库（全局）
 *      数据不内置：从 敌人数据库.json / 环境数据库.json 导入。
 *      每条库条目 = 名称 + 元信息 + 按卡片模板存的一份数据。
 * ============================================================ */
(function (RT) {
  'use strict';

  const KEY = 'trpg_rt_dm_lib_v1';

  const LIBS = [
    { id: 'enemy', name: '敌人库', tplId: 'bt_enemy' },
    { id: 'env', name: '环境库', tplId: 'bt_env' },
    { id: 'pc', name: '玩家卡', tplId: 'bt_pc' },
    { id: 'text', name: '文本库', tplId: 'bt_text' },
    { id: 'special', name: '特殊卡', tplId: 'bt_special' },
  ];

  function libMeta(id) {
    return LIBS.filter(function (l) { return l.id === id; })[0] || LIBS[0];
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid() { return RT.ws.uid('dml'); }

  function num(v, d) {
    const n = Number(v);
    return isFinite(n) ? n : d;
  }

  function read() {
    try {
      const raw = RT.storage.get(KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (!v || !Array.isArray(v.items)) return { items: [] };
      v.items = v.items.filter(function (it) { return it && it.id && it.name; });
      return v;
    } catch (e) {
      return { items: [] };
    }
  }

  function write(st) {
    RT.storage.set(KEY, JSON.stringify(st));
  }

  function all() { return read().items; }

  function list(lib) {
    return all().filter(function (it) { return it.lib === lib; });
  }

  function count(lib) {
    if (!lib) return all().length;
    return list(lib).length;
  }

  function get(id) {
    return all().filter(function (it) { return it.id === id; })[0] || null;
  }

  function save(item) {
    const st = read();
    const i = st.items.findIndex(function (x) { return x.id === item.id; });
    if (i >= 0) st.items[i] = item;
    else st.items.push(item);
    write(st);
    return item;
  }

  function add(item) {
    return save(Object.assign({}, item, { id: item.id || uid(), ts: Date.now() }));
  }

  function update(id, patch) {
    const it = get(id);
    if (!it) return null;
    const next = Object.assign({}, it, patch);
    return save(next);
  }

  function remove(id) {
    const st = read();
    st.items = st.items.filter(function (it) { return it.id !== id; });
    write(st);
    RT.dmBoard && RT.dmBoard.refreshLibs && RT.dmBoard.refreshLibs();
    return true;
  }

  function removeAll(lib) {
    const st = read();
    st.items = st.items.filter(function (it) { return it.lib !== lib; });
    write(st);
    RT.dmBoard && RT.dmBoard.refreshLibs && RT.dmBoard.refreshLibs();
  }

  function features(rawList) {
    return (Array.isArray(rawList) ? rawList : []).map(function (f) {
      return {
        name: f['名称'] || f.name || '',
        type: f['类型'] || f.type || '',
        desc: f['特性描述'] || f.desc || '',
        question: f['特性问题'] || f.question || '',
      };
    });
  }

  function fromEnemy(raw) {
    return {
      lib: 'enemy',
      tplId: 'bt_enemy',
      name: String(raw['名称'] || raw.name || '').trim(),
      meta: {
        tier: raw['位阶'] || '',
        kind: raw['种类'] || '',
        source: raw['来源'] || '',
      },
      values: {
        meta: {
          tier: raw['位阶'] || '',
          kind: raw['种类'] || '',
          source: raw['来源'] || '',
        },
        intro: raw['简介'] || '',
        motive: raw['动机与战术'] || '',
        difficulty: raw['难度'] == null ? '' : String(raw['难度']),
        thr: {
          minor: raw['重度伤害阈值'] == null ? '' : String(raw['重度伤害阈值']),
          major: raw['严重伤害阈值'] == null ? '' : String(raw['严重伤害阈值']),
        },
        hp: { max: Math.max(1, num(raw['生命点'], 6)), marked: 0 },
        stress: { max: Math.max(1, num(raw['压力点'], 3)), marked: 0 },
        attack: {
          hit: raw['攻击命中'] || '',
          weapon: raw['攻击武器'] || '',
          range: raw['攻击范围'] || '',
          damage: raw['攻击伤害'] || '',
          attr: raw['攻击属性'] || '',
        },
        exp: raw['经历'] || '',
        features: features(raw['特性']),
        note: '',
      },
    };
  }

  function fromEnv(raw) {
    return {
      lib: 'env',
      tplId: 'bt_env',
      name: String(raw['名称'] || raw.name || '').trim(),
      meta: {
        tier: raw['位阶'] || '',
        kind: raw['种类'] || '',
        source: raw['来源'] || '',
      },
      values: {
        meta: {
          tier: raw['位阶'] || '',
          kind: raw['种类'] || '',
          source: raw['来源'] || '',
        },
        intro: raw['简介'] || '',
        trend: raw['趋向'] || '',
        difficulty: raw['难度'] == null ? '' : String(raw['难度']),
        potential: { enemies: raw['潜在敌人'] || '' },
        features: features(raw['特性']),
        note: '',
      },
    };
  }

  function fromPc(raw) {
    function refName(ref, fallback) {
      return (ref && ref.name) || fallback || '';
    }
    function countTrue(arr) {
      return (Array.isArray(arr) ? arr : []).filter(Boolean).length;
    }
    function attr(o) {
      return o && o.value != null ? String(o.value) : '';
    }
    const ATTR_LABEL = {
      agility: '敏捷', strength: '力量', finesse: '灵巧',
      instinct: '本能', presence: '风度', knowledge: '知识',
    };
    const attrs = {};
    const spellNames = [];
    Object.keys(ATTR_LABEL).forEach(function (k) {
      attrs[k] = attr(raw[k]);
      if (raw[k] && raw[k].spellcasting) spellNames.push(ATTR_LABEL[k]);
    });
    const effectType = function (t) {
      const map = {
        profession: '职业', subclass: '子职', ancestry: '种族', community: '社群',
        domain: '领域', weapon: '武器', armor: '护甲', item: '物品',
      };
      return map[t] || t || '';
    };
    const effects = []
      .concat(Array.isArray(raw.cards) ? raw.cards : [])
      .concat(Array.isArray(raw.inventory_cards) ? raw.inventory_cards : [])
      .filter(function (c) { return c && c.name && c.type !== 'unknown'; })
      .map(function (c) {
        return {
          name: c.name,
          type: effectType(c.type),
          desc: c.description || '',
          question: '',
        };
      });
    const expNames = Array.isArray(raw.experience) ? raw.experience : [];
    const expValues = Array.isArray(raw.experienceValues) ? raw.experienceValues : [];
    const experience = expNames.map(function (e, i) {
      return e ? (e + (expValues[i] && expValues[i] !== '+0' ? expValues[i] : '')) : '';
    }).filter(Boolean).join('；');
    const weapon = function (name, trait, damage) {
      return [name, trait, damage].filter(Boolean).join(' · ');
    };
    const armor = [raw.armorName, raw.armorFeature].filter(Boolean).join(' · ');
    return {
      lib: 'pc',
      tplId: 'bt_pc',
      name: String(raw.name || raw['名称'] || '玩家角色').trim(),
      meta: {
        level: raw.level || '',
        profession: refName(raw.professionRef, raw.profession),
        subclass: refName(raw.subclassRef, raw.subclass),
        ancestry: [refName(raw.ancestry1Ref, raw.ancestry1), refName(raw.ancestry2Ref, raw.ancestry2)]
          .filter(Boolean).join(' / '),
        community: refName(raw.communityRef, raw.community),
      },
      values: {
        meta: {
          level: raw.level || '',
          profession: refName(raw.professionRef, raw.profession),
          subclass: refName(raw.subclassRef, raw.subclass),
          ancestry: [refName(raw.ancestry1Ref, raw.ancestry1), refName(raw.ancestry2Ref, raw.ancestry2)]
            .filter(Boolean).join(' / '),
          community: refName(raw.communityRef, raw.community),
        },
        evasion: raw.evasion == null ? '' : String(raw.evasion),
        armorValue: raw.armorValue == null ? '' : String(raw.armorValue),
        proficiency: String(countTrue(raw.proficiency) || ''),
        hp: { max: Math.max(1, num(raw.hpMax, 6)), marked: countTrue(raw.hp) },
        stress: { max: Math.max(1, num(raw.stressMax, 6)), marked: countTrue(raw.stress) },
        hope: { max: Math.max(1, num(raw.hopeMax, 6)), marked: Math.max(0, num(raw.hope, 0)) },
        armor: { max: Math.max(1, num(raw.armorMax, 3)), marked: countTrue(raw.armorBoxes) },
        thr: {
          minor: raw.minorThreshold == null ? '' : String(raw.minorThreshold),
          major: raw.majorThreshold == null ? '' : String(raw.majorThreshold),
        },
        attrs: attrs,
        spellcasting: spellNames.join('、'),
        background: raw.characterBackground || '',
        appearance: raw.characterAppearance || '',
        motivation: raw.characterMotivation || '',
        effects: effects,
        experience: experience,
        weapons: {
          primary: weapon(raw.primaryWeaponName, raw.primaryWeaponTrait, raw.primaryWeaponDamage),
          secondary: weapon(raw.secondaryWeaponName, raw.secondaryWeaponTrait, raw.secondaryWeaponDamage),
        },
        gear: {
          armor: armor,
          gold: String(countTrue(raw.gold) || 0),
        },
        inventory: (Array.isArray(raw.inventory) ? raw.inventory : []).filter(Boolean).join('\n'),
        note: '',
      },
    };
  }

  function fromText(raw, fallbackName) {
    const body = raw.body != null ? raw.body
      : raw['正文'] != null ? raw['正文']
        : raw['内容'] != null ? raw['内容']
          : raw.text != null ? raw.text
            : raw['名称'] ? '' : '';
    return {
      lib: 'text',
      tplId: 'bt_text',
      name: String(raw['名称'] || raw.name || raw.title || fallbackName || '文本').trim(),
      meta: { tag: raw['标签'] || raw.tag || '' },
      values: {
        meta: { tag: raw['标签'] || raw.tag || '' },
        body: String(body || ''),
      },
    };
  }

  /** 兼容：本工具导出的条目、敌人库 / 环境库 JSON、玩家角色卡 JSON、纯文本 */
  function normalizeOne(raw, hint) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.lib && raw.values && raw.name) {
      const known = ['enemy', 'env', 'pc', 'text', 'special'];
      const kind = known.indexOf(raw.lib) >= 0 ? raw.lib : 'text';
      return {
        lib: kind,
        tplId: raw.tplId || libMeta(kind).tplId,
        name: String(raw.name).trim(),
        meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
        values: raw.values,
      };
    }
    if (raw.lib && raw.values) {
      const it = fromText(raw, '文本');
      return it;
    }
    if (raw.hpMax != null || raw.stressMax != null || raw.armorMax != null ||
      raw.professionRef || raw.ruleSetId === 'daggerheart' || raw.rulesetId === 'daggerheart') {
      return fromPc(raw);
    }
    if (hint === 'enemy' || raw['生命点'] != null || raw['攻击伤害'] != null) {
      return fromEnemy(raw);
    }
    if (hint === 'env' || raw['潜在敌人'] != null || raw['趋向'] != null) {
      return fromEnv(raw);
    }
    const it = fromText(raw, hint === 'text' ? '文本' : '');
    if (!it.name) return null;
    return it;
  }

  /** 导入一段 JSON 文本（或纯文本逐行）；lib 只作为兜底提示，默认按内容识别 */
  function importText(text, lib) {
    const src = String(text || '').trim();
    if (!src) return { added: 0, skipped: 0 };
    let parsed = null;
    try {
      parsed = JSON.parse(src);
    } catch (e) {
      parsed = null;
    }

    let rows = [];
    if (parsed == null) {
      rows = src.split(/\r?\n/).map(function (line, i) {
        return { '名称': '文本 ' + (i + 1), '正文': line };
      }).filter(function (r) { return r['正文'].trim(); });
      if (!rows.length) throw new Error('JSON 解析失败');
    } else if (Array.isArray(parsed)) {
      rows = parsed;
    } else if (Array.isArray(parsed.items)) {
      rows = parsed.items;
    } else if (Array.isArray(parsed.list)) {
      rows = parsed.list;
    } else {
      rows = [parsed];
    }

    let added = 0;
    let skipped = 0;
    rows.forEach(function (raw) {
      const it = normalizeOne(raw, lib);
      if (!it || !it.name) { skipped++; return; }
      it.id = uid();
      it.ts = Date.now();
      add(it);
      added++;
    });
    RT.dmBoard && RT.dmBoard.refreshLibs && RT.dmBoard.refreshLibs();
    return { added: added, skipped: skipped };
  }

  function exportList(lib) {
    if (lib === 'enemy' || lib === 'env') {
      return list(lib).map(function (it) {
        const v = it.values || {};
        const base = {
          '名称': it.name,
          '位阶': (v.meta && v.meta.tier) || '',
          '种类': (v.meta && v.meta.kind) || '',
          '特性': (v.features || []).map(function (f) {
            return {
              '名称': f.name || '',
              '类型': f.type || '',
              '特性描述': f.desc || '',
              '特性问题': f.question || '',
            };
          }),
          '类型': lib === 'enemy' ? '敌人' : '环境',
          '简介': v.intro || '',
          '难度': v.difficulty || '',
          '来源': (v.meta && v.meta.source) || '',
        };
        if (lib === 'enemy') {
          base['动机与战术'] = v.motive || '';
          base['重度伤害阈值'] = (v.thr && v.thr.minor) || '';
          base['严重伤害阈值'] = (v.thr && v.thr.major) || '';
          base['生命点'] = (v.hp && v.hp.max) || '';
          base['压力点'] = (v.stress && v.stress.max) || '';
          base['攻击命中'] = (v.attack && v.attack.hit) || '';
          base['攻击武器'] = (v.attack && v.attack.weapon) || '';
          base['攻击范围'] = (v.attack && v.attack.range) || '';
          base['攻击伤害'] = (v.attack && v.attack.damage) || '';
          base['攻击属性'] = (v.attack && v.attack.attr) || '';
          base['经历'] = v.exp || '';
        } else {
          base['趋向'] = v.trend || '';
          base['潜在敌人'] = (v.potential && v.potential.enemies) || '';
        }
        base['id'] = it.id;
        return base;
      });
    }
    return list(lib).map(function (it) {
      return { lib: 'text', name: it.name, tag: (it.meta && it.meta.tag) || '', text: (it.values && it.values.body) || '' };
    });
  }

  function exportJson(lib) {
    return JSON.stringify(exportList(lib), null, 2);
  }

  function exportTxt(lib) {
    return list(lib).map(function (it) {
      if (lib === 'text') {
        return '# ' + it.name + '\n' + ((it.values && it.values.body) || '');
      }
      const v = it.values || {};
      const meta = v.meta || {};
      return it.name + '（位阶 ' + (meta.tier || '-') + ' · ' + (meta.kind || '-') + ' · ' + (meta.source || '-') + '）';
    }).join('\n\n');
  }

  /** 整个卡片库导出（本工具自己的格式，可原样导回） */
  function exportAllJson() {
    return JSON.stringify(all().map(function (it) {
      return {
        lib: it.lib,
        tplId: it.tplId,
        name: it.name,
        meta: it.meta || {},
        values: it.values || {},
      };
    }), null, 2);
  }

  function exportAllTxt() {
    const labels = { enemy: '敌人', env: '环境', pc: '玩家', text: '文本', special: '特殊' };
    return all().map(function (it) {
      if (it.lib === 'text') {
        return '[文本] ' + it.name + '\n' + ((it.values && it.values.body) || '');
      }
      const v = it.values || {};
      const meta = v.meta || {};
      return '[' + (labels[it.lib] || '卡片') + '] ' + it.name +
        '（' + (meta.profession ? meta.profession + ' · ' : '') +
        '位阶 ' + (meta.tier || '-') + ' · ' + (meta.kind || '-') + ' · ' + (meta.source || '-') + '）';
    }).join('\n\n');
  }

  /** 收藏 / 规则速查这类外部内容 → 文本卡 */
  function addText(name, body, tag) {
    return add({
      lib: 'text',
      tplId: 'bt_text',
      name: String(name || '文本').trim().slice(0, 60) || '文本',
      meta: { tag: tag || '' },
      values: {
        meta: { tag: tag || '' },
        body: String(body == null ? '' : body),
      },
    });
  }

  RT.dmLib = {
    KEY: KEY,
    LIBS: LIBS,
    libMeta: libMeta,
    read: read,
    all: all,
    list: list,
    count: count,
    get: get,
    add: add,
    save: save,
    update: update,
    remove: remove,
    removeAll: removeAll,
    addText: addText,
    importText: importText,
    normalizeOne: normalizeOne,
    exportList: exportList,
    exportJson: exportJson,
    exportTxt: exportTxt,
    exportAllJson: exportAllJson,
    exportAllTxt: exportAllTxt,
    clone: clone,
  };

})(window.RT = window.RT || {});
