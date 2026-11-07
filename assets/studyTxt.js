// AHP 研究題目純文字檔（.txt）解析器
// 格式說明（見 studies/範本.txt 與 README）：
//   # 開頭為註解行；空白行忽略；全形與半形標點（：/：、，/，）都可混用。
//   頂層鍵值行：研究標題、研究副標題、後台密碼、Apps Script 網址、
//     主要分組、分組選項、相依修正（開／關）、方案評分（開／關）。
//   [背景欄位]：每行「欄位名稱：選項1，選項2」，欄位代碼自動編為 bg1、bg2……
//     （研究收案後不要中途調整欄位順序，否則舊資料的欄位會對不上）。
//   [構面] 名稱：其後「定義：……」為構面定義，其餘每行「指標名：說明」
//     （說明可省略，只寫指標名亦可）。
//   [分組規則]：每行「欄位標籤：來源1，來源2 → 目標組名」。
//     欄位標籤可用背景欄位名稱、「主要分組」，或欄位代碼（bg1、group）。
//   [相依關係]：每行「構面名 / 基準因子：因子1，因子2」（須包含基準因子本身）。
//   [問卷說明]：其後所有文字原樣保留為問卷開頭的說明（空行分段，
//     寫在這裡的說明會顯示在填答頁標題下方；不寫此區段就不顯示）。
// 回傳 { ok, config, errors: [{line, message}], warnings: [{line, message}] }。
// config 形狀與 config.js 的單一研究設定相同，可直接取代 window.AHP_CONFIG。
(function () {
  'use strict';

  var TOP_KEYS = {
    '研究標題': 'studyTitle', 'studyTitle': 'studyTitle',
    '研究副標題': 'studySubtitle', 'studySubtitle': 'studySubtitle',
    '後台密碼': 'adminCode', 'adminCode': 'adminCode',
    'Apps Script 網址': 'appsScriptUrl', 'appsScriptUrl': 'appsScriptUrl',
    '主要分組': 'groupLabel', 'groupLabel': 'groupLabel',
    '分組選項': 'groupOptions', 'groupOptions': 'groupOptions',
    '相依修正': 'dependency', 'dependency': 'dependency',
    '方案評分': 'scoring', 'scoring': 'scoring'
  };
  var DEFAULT_PASSWORD = '請改成自己的後台密碼';

  function splitList(s) {
    return String(s).split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  // 在第一個全形或半形冒號處切開，找不到回傳 null。
  function splitKV(line) {
    var i1 = line.indexOf('：'), i2 = line.indexOf(':');
    var i = -1;
    if (i1 >= 0 && i2 >= 0) i = Math.min(i1, i2); else i = Math.max(i1, i2);
    if (i < 0) return null;
    return { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
  }
  function parseOnOff(v, line, errors) {
    if (/^(開|啟用|是|true|on|1)$/i.test(v)) return true;
    if (/^(關|停用|否|false|off|0)$/i.test(v)) return false;
    errors.push({ line: line, message: '開關值「' + v + '」無法辨識，請填「開」或「關」。' });
    return false;
  }

  function parse(text) {
    var errors = [], warnings = [];
    var cfg = {
      studyTitle: '', studySubtitle: '層級分析法（AHP）問卷',
      appsScriptUrl: '', adminCode: '',
      groupLabel: '', groupOptions: [], groupingRules: {},
      features: { dependency: false, scoring: false }, dependencies: [],
      backgroundFields: [], dimensions: [], intro: ''
    };
    var lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    var section = 'top'; // top | bg | dim | rules | dep | intro
    var curDim = null;
    var introLines = [];
    var seenTopKeys = {};
    var bgCount = 0;

    function fieldKeyByLabel(label) {
      if (label === '主要分組' || (cfg.groupLabel && label === cfg.groupLabel)) return 'group';
      for (var i = 0; i < cfg.backgroundFields.length; i++) {
        if (cfg.backgroundFields[i].label === label) return cfg.backgroundFields[i].key;
      }
      if (/^bg\d+$/.test(label) || label === 'group') return label;
      return null;
    }
    function fieldOptions(fieldKey) {
      if (fieldKey === 'group') return cfg.groupOptions;
      for (var i = 0; i < cfg.backgroundFields.length; i++) {
        if (cfg.backgroundFields[i].key === fieldKey) return cfg.backgroundFields[i].options;
      }
      return null;
    }

    lines.forEach(function (raw, idx) {
      var ln = idx + 1;
      var line = raw.trim();
      var m = line.match(/^\[(.+?)\]\s*(.*)$/);
      if (m) {
        var head = m[1].trim(), rest = (m[2] || '').trim();
        if (head === '背景欄位') { section = 'bg'; curDim = null; }
        else if (head === '構面') {
          if (!rest) { errors.push({ line: ln, message: '「[構面]」後面要寫構面名稱，例如「[構面] 教師個人層面」。' }); section = 'top'; return; }
          section = 'dim';
          curDim = { name: rest, desc: '', items: [], itemDescs: [] };
          cfg.dimensions.push(curDim);
        }
        else if (head === '分組規則') { section = 'rules'; curDim = null; }
        else if (head === '相依關係') { section = 'dep'; curDim = null; }
        else if (head === '問卷說明') { section = 'intro'; curDim = null; }
        else errors.push({ line: ln, message: '不認識的區段「[' + head + ']」，可用區段：[背景欄位]、[構面]、[分組規則]、[相依關係]、[問卷說明]。' });
        return;
      }
      // 問卷說明區：文字原樣保留，空行分段（# 開頭仍為註解行）。
      if (section === 'intro') {
        if (line.charAt(0) === '#') return;
        introLines.push(raw.replace(/\s+$/, ''));
        return;
      }
      if (!line || line.charAt(0) === '#') return;

      if (section === 'top') {
        var kv = splitKV(line);
        if (!kv) { errors.push({ line: ln, message: '這一行看不懂，請寫成「鍵：值」的形式，例如「研究標題：……」。' }); return; }
        var field = TOP_KEYS[kv.key];
        if (!field) {
          errors.push({ line: ln, message: '不認識的設定鍵「' + kv.key + '」，可用鍵：研究標題、研究副標題、後台密碼、Apps Script 網址、主要分組、分組選項、相依修正、方案評分。' });
          return;
        }
        if (seenTopKeys[field]) { errors.push({ line: ln, message: '「' + kv.key + '」重複出現，請只寫一次。' }); return; }
        seenTopKeys[field] = true;
        if (field === 'groupOptions') cfg.groupOptions = splitList(kv.value);
        else if (field === 'dependency') cfg.features.dependency = parseOnOff(kv.value, ln, errors);
        else if (field === 'scoring') cfg.features.scoring = parseOnOff(kv.value, ln, errors);
        else cfg[field] = kv.value;
        return;
      }

      if (section === 'bg') {
        var bkv = splitKV(line);
        if (!bkv || !bkv.key) { errors.push({ line: ln, message: '背景欄位請寫成「欄位名稱：選項1，選項2」，例如「性別：男，女」。' }); return; }
        var opts = splitList(bkv.value);
        if (!opts.length) { errors.push({ line: ln, message: '背景欄位「' + bkv.key + '」至少要有一個選項。' }); return; }
        bgCount++;
        cfg.backgroundFields.push({ key: 'bg' + bgCount, label: bkv.key, options: opts });
        return;
      }

      if (section === 'dim') {
        if (!curDim) { errors.push({ line: ln, message: '構面內容前要先寫「[構面] 名稱」。' }); return; }
        var dkv = splitKV(line);
        if (dkv && dkv.key === '定義') {
          if (curDim.desc) { errors.push({ line: ln, message: '構面「' + curDim.name + '」的定義重複出現，請只寫一次。' }); return; }
          curDim.desc = dkv.value;
          return;
        }
        var itemName = dkv ? dkv.key : line;
        var itemDesc = dkv ? dkv.value : '';
        if (!itemName) { errors.push({ line: ln, message: '指標名稱不可為空。' }); return; }
        curDim.items.push(itemName);
        curDim.itemDescs.push(itemDesc);
        return;
      }

      if (section === 'rules') {
        var rkv = splitKV(line);
        var arrow = line.match(/→|->|=>/);
        if (!rkv || !arrow) { errors.push({ line: ln, message: '分組規則請寫成「欄位標籤：來源1，來源2 → 目標組名」，例如「年資：5~10年，10~15年 → 年資20年以下」。' }); return; }
        var target = line.slice(arrow.index + arrow[0].length).trim();
        var srcPart = line.slice(rkv.key.length + 1, arrow.index).trim();
        if (!target) { errors.push({ line: ln, message: '分組規則缺少目標組名（箭頭後面要寫組名）。' }); return; }
        var fkey = fieldKeyByLabel(rkv.key);
        if (!fkey) { errors.push({ line: ln, message: '分組規則的欄位「' + rkv.key + '」找不到：請用背景欄位名稱、「主要分組」，或欄位代碼（bg1、group）。' }); return; }
        var sources = splitList(srcPart);
        var avail = fieldOptions(fkey) || [];
        var bad = sources.filter(function (s) { return avail.indexOf(s) < 0; });
        if (bad.length) { errors.push({ line: ln, message: '分組規則的來源選項「' + bad.join('、') + '」不在欄位「' + rkv.key + '」的可選值中，請檢查文字是否完全相同。' }); return; }
        if (!sources.length) { errors.push({ line: ln, message: '分組規則至少要有一個來源選項。' }); return; }
        if (!cfg.groupingRules[fkey]) cfg.groupingRules[fkey] = [];
        cfg.groupingRules[fkey].push({ name: target, values: sources });
        return;
      }

      if (section === 'dep') {
        var pkv = splitKV(line);
        if (!pkv) { errors.push({ line: ln, message: '相依關係請寫成「構面名 / 基準因子：因子1，因子2」，例如「技術能力 / 對供應商製程了解程度：對供應商製程了解程度，客戶設計規範的完整性」。' }); return; }
        var parts = pkv.key.split(/[/／]/);
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) { errors.push({ line: ln, message: '相依關係的冒號前面請寫「構面名 / 基準因子」，中間用斜線隔開。' }); return; }
        var dimName = parts[0].trim(), baseName = parts[1].trim();
        var dimIdx = -1;
        for (var di = 0; di < cfg.dimensions.length; di++) if (cfg.dimensions[di].name === dimName) { dimIdx = di; break; }
        if (dimIdx < 0) { errors.push({ line: ln, message: '相依關係的構面「' + dimName + '」找不到，請確認構面名稱與上方 [構面] 完全相同。' }); return; }
        var dim = cfg.dimensions[dimIdx];
        var baseIdx = dim.items.indexOf(baseName);
        if (baseIdx < 0) { errors.push({ line: ln, message: '相依關係的基準因子「' + baseName + '」不在構面「' + dimName + '」的指標中。' }); return; }
        var factors = splitList(pkv.value);
        var fidx = [];
        for (var fi = 0; fi < factors.length; fi++) {
          var ix = dim.items.indexOf(factors[fi]);
          if (ix < 0) { errors.push({ line: ln, message: '相依關係的因子「' + factors[fi] + '」不在構面「' + dimName + '」的指標中。' }); return; }
          if (fidx.indexOf(ix) < 0) fidx.push(ix);
        }
        if (fidx.indexOf(baseIdx) < 0) { errors.push({ line: ln, message: '相依關係的因子清單必須包含基準因子「' + baseName + '」本身。' }); return; }
        fidx.sort(function (a, b) { return a - b; });
        cfg.dependencies.push({ dimensionIndex: dimIdx, baseItemIndex: baseIdx, items: fidx });
        return;
      }
    });

    // 問卷說明：空行分段，前後多餘空行去掉。
    cfg.intro = introLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    // ---------- 整體驗證 ----------
    if (!cfg.studyTitle) errors.push({ line: 0, message: '缺少「研究標題」，請在檔案開頭寫「研究標題：……」。' });
    if (!cfg.adminCode) errors.push({ line: 0, message: '缺少「後台密碼」，請寫「後台密碼：……」（密碼跟著題目走，每個研究各自一組）。' });
    if (cfg.dimensions.length < 2) errors.push({ line: 0, message: '至少要有 2 個構面（目前 ' + cfg.dimensions.length + ' 個），請用「[構面] 名稱」新增。' });
    var dimNames = {};
    cfg.dimensions.forEach(function (d) {
      if (dimNames[d.name]) errors.push({ line: 0, message: '構面名稱「' + d.name + '」重複出現。' });
      dimNames[d.name] = true;
      if (d.items.length < 2) errors.push({ line: 0, message: '構面「' + d.name + '」至少要有 2 個指標（目前 ' + d.items.length + ' 個）。' });
      var itemNames = {};
      d.items.forEach(function (it) {
        if (itemNames[it]) errors.push({ line: 0, message: '構面「' + d.name + '」的指標「' + it + '」重複出現。' });
        itemNames[it] = true;
      });
      while (d.itemDescs.length < d.items.length) d.itemDescs.push('');
      d.itemDescs = d.itemDescs.slice(0, d.items.length);
    });
    if (!cfg.appsScriptUrl) warnings.push({ line: 0, message: '未填「Apps Script 網址」，此研究為本機模式：填答只存在填答者瀏覽器，不寫入試算表。' });
    if (cfg.adminCode === DEFAULT_PASSWORD) warnings.push({ line: 0, message: '後台密碼還是預設值，請改成自己的密碼再發連結。' });
    if (cfg.groupLabel && !cfg.groupOptions.length) warnings.push({ line: 0, message: '已設「主要分組」但未填「分組選項」，填答時分組下拉會是空的。' });
    if (cfg.features.dependency && !cfg.dependencies.length) warnings.push({ line: 0, message: '已開啟「相依修正」但沒有寫任何 [相依關係]，第二階段問卷不會出現。' });

    return { ok: errors.length === 0, config: cfg, errors: errors, warnings: warnings };
  }

  var api = { parse: parse, DEFAULT_PASSWORD: DEFAULT_PASSWORD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.StudyTxt = api;
})();
