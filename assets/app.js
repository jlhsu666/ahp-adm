// AHP GitHub 部署版：填答、後台、第四章格式分析報告
(function () {
  'use strict';
  var AHP = window.AHP;
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(x, d) { var n = Number(x); if (!isFinite(n)) return ''; return n.toFixed(d === undefined ? 3 : d); }
  function $ (id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function baseConfig() { return window.AHP_CONFIG || { dimensions: [] }; }
  function activeConfig() {
    try {
      var ov = localStorage.getItem('ahp_config_override');
      if (ov) {
        var o = JSON.parse(ov);
        var b = baseConfig();
        ['genericDimensions', 'presets', 'smtPreset'].forEach(function (k) { if (o[k] === undefined) o[k] = b[k]; });
        if (!o.groupingRules) o.groupingRules = b.groupingRules || {};
        return o;
      }
    } catch (e) {}
    return baseConfig();
  }
  // 構面／指標定義：與 items 一一對應的 itemDescs（可留空），向後相容舊版 config（沒有 desc 欄位時為空字串）。
  function dimDesc(d) { return (d && d.desc) || ''; }
  function itemDesc(d, ii) { return (d && d.itemDescs && d.itemDescs[ii]) || ''; }
  // 分組方案：主要分組（若 groupLabel 留空則不列）＋每一個背景欄位各一個方案。
  function schemeList(cfg) {
    var list = [];
    if (cfg.groupLabel) list.push({ field: 'group', label: cfg.groupLabel });
    (cfg.backgroundFields || []).forEach(function (f) { list.push({ field: f.key, label: f.label }); });
    return list;
  }
  // 衍生分組：若該欄位在 groupingRules 有規則（例如把三個年資區間併成「20年以下」），
  // 依規則把原始值映射為衍生組名；沒有規則時直接用原始值；規則有但對不上時標示「未歸類」。
  function getSchemeValue(record, scheme, cfg) {
    var raw = scheme.field === 'group' ? (record.group || '') : ((record.background || {})[scheme.field] || '未填');
    var rules = (cfg.groupingRules || {})[scheme.field];
    if (!rules || !rules.length) return raw;
    for (var i = 0; i < rules.length; i++) {
      if ((rules[i].values || []).indexOf(raw) >= 0) return rules[i].name;
    }
    return '未歸類：' + raw;
  }
  function sortSchemeGroups(groups, scheme, cfg) {
    var rules = (cfg.groupingRules || {})[scheme.field];
    var ruleOrder = rules ? rules.map(function (r) { return r.name; }) : [];
    var optOrder = [];
    if (scheme.field === 'group') optOrder = cfg.groupOptions || [];
    else {
      var f = (cfg.backgroundFields || []).filter(function (x) { return x.key === scheme.field; })[0];
      if (f) optOrder = f.options || [];
    }
    return groups.slice().sort(function (a, b) {
      var ia = ruleOrder.indexOf(a), ib = ruleOrder.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      var ja = optOrder.indexOf(a), jb = optOrder.indexOf(b);
      return (ja < 0 ? 999 : ja) - (jb < 0 ? 999 : jb);
    });
  }
  function featuresOf(cfg) {
    var f = (cfg && cfg.features) || {};
    return { dependency: !!f.dependency, scoring: !!f.scoring };
  }
  // 形式四：大按鈕步進滑桿。滑桿本身是「位置序號」，對照表才是真正的滑桿值 v：
  // 第一階段 v ∈ [-9..-2, 0, 2..9]（±1 不存在，因為 1 就是同等重要；2、4、6、8 為中間值）；
  // 相依階段 v ∈ [-9,-7,-5,-3, 0, 3,5,7,9]（不使用中間值）。
  // v = 0 為同等／影響相等；v < 0 為左方較重要／影響較強；v > 0 為右方。
  // 送出的選單值（與舊版選單、矩陣計算相容）：v = 0 時為 1，否則為 -v。
  var SLIDER_VALUES_MAIN = [-9, -8, -7, -6, -5, -4, -3, -2, 0, 2, 3, 4, 5, 6, 7, 8, 9];
  var SLIDER_VALUES_DEP = [-9, -7, -5, -3, 0, 3, 5, 7, 9];
  function sliderWord(a, isDep) {
    if (a === 3) return isDep ? '稍強' : '稍重要';
    if (a === 5) return isDep ? '頗強' : '頗重要';
    if (a === 7) return isDep ? '極強' : '極重要';
    if (a === 9) return isDep ? '絕對強' : '絕對重要';
    return '介於 ' + (a - 1) + ' 與 ' + (a + 1) + ' 之間';
  }
  function sliderLabel(v, isDep) {
    if (v === 0) return isDep ? '影響相等（1）' : '同等重要（1）';
    var a = Math.abs(v), w = sliderWord(a, isDep);
    if (v < 0) return isDep ? '左方影響較強（' + a + '，' + w + '）' : '左方較重要（' + a + '，' + w + '）';
    return isDep ? '右方影響較強（' + a + '，' + w + '）' : '右方較重要（' + a + '，' + w + '）';
  }
  function sliderSiteValue(v) { return v === 0 ? 1 : -v; }
  function sliderValueOf(el) {
    var vals = (el.getAttribute('data-values') || '').split(',').map(function (x) { return parseInt(x, 10); });
    return vals[parseInt(el.value, 10)];
  }
  function sliderHTML(cls, attrs, values, isDep, scaleHint) {
    var mid = values.indexOf(0);
    return '<div class="slider-row"><button type="button" class="slider-btn" data-step="-1" aria-label="往左一格">−</button>'
      + '<input type="range" class="' + cls + '" ' + attrs + ' min="0" max="' + (values.length - 1) + '" step="1" value="' + mid + '" data-answered="0" data-values="' + values.join(',') + '">'
      + '<button type="button" class="slider-btn" data-step="1" aria-label="往右一格">＋</button></div>'
      + '<div class="slider-big">尚未選擇，請拖動滑桿或按加減</div>'
      + '<div class="scale">' + scaleHint + '</div>';
  }
  function refreshSlider(el) {
    var pair = el.closest ? el.closest('.pair') : null;
    var big = pair ? pair.querySelector('.slider-big') : null;
    var isDep = el.classList.contains('dep-select');
    if (big) big.textContent = sliderLabel(sliderValueOf(el), isDep);
  }
  function initSliders() {
    document.querySelectorAll('input.pair-select, input.dep-select').forEach(function (el) {
      if (el.getAttribute('data-slider-init') === '1') return;
      el.setAttribute('data-slider-init', '1');
      el.addEventListener('input', function () {
        el.setAttribute('data-answered', '1');
        refreshSlider(el);
        updateProgress();
        var depText = $('depProgressText');
        if (depText) {
          var sels = document.querySelectorAll('.dep-select'), done = 0;
          sels.forEach(function (s) { if (s.getAttribute('data-answered') === '1') done++; });
          depText.textContent = '相依比較已完成 ' + done + ' / ' + sels.length + ' 題';
        }
      });
    });
    document.querySelectorAll('.slider-btn').forEach(function (btn) {
      if (btn.getAttribute('data-slider-init') === '1') return;
      btn.setAttribute('data-slider-init', '1');
      btn.addEventListener('click', function () {
        var pair = btn.closest ? btn.closest('.pair') : null;
        var el = pair ? pair.querySelector('input[type="range"]') : null;
        if (!el) return;
        var step = parseInt(btn.getAttribute('data-step'), 10);
        el.value = Math.max(parseInt(el.min, 10), Math.min(parseInt(el.max, 10), parseInt(el.value, 10) + step));
        el.dispatchEvent(new Event('input'));
      });
    });
  }
  function selectedSchemes(cfg) {
    var checks = document.querySelectorAll('.scheme-check:checked');
    var all = schemeList(cfg);
    if (!checks.length) return all.slice(0, 1);
    var out = [];
    checks.forEach(function (c) {
      var s = all.filter(function (x) { return x.field === c.getAttribute('data-scheme'); })[0];
      if (s) out.push(s);
    });
    return out.length ? out : all.slice(0, 1);
  }
  function renderReportSchemes() {
    var cfg = activeConfig(), schemes = schemeList(cfg);
    if (!$('reportSchemes')) return;
    if (!schemes.length) { $('reportSchemes').innerHTML = '<p class="muted small">目前沒有可分組的欄位（主要分組留空且無背景欄位），報告只做全體分析。</p>'; return; }
    $('reportSchemes').innerHTML = '<p class="small muted">勾選要做的分組方案（可複選，每個方案各產出一套分組＋比對；衍生分組規則在「研究設定」裡定義，例如把年資三區間併成「20年以下」）：</p>'
      + schemes.map(function (s, i) {
        return '<label style="display:inline-block;margin-right:14px;font-weight:normal"><input type="checkbox" class="scheme-check" data-scheme="' + esc(s.field) + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(s.label) + '</label>';
      }).join('');
  }
  function structureOf(cfg) { return { dimensions: clone(cfg.dimensions) }; }
  function pairs(n) { var out = []; for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) out.push([i, j]); return out; }

  // ---------- 填答 ----------
  var lastPreview = null, lastRecord = null;
  function renderFill() {
    var cfg = activeConfig();
    $('siteTitle').textContent = cfg.studyTitle || 'AHP 問卷與分析系統';
    $('siteSubtitle').textContent = cfg.studySubtitle || '';
    var dims = cfg.dimensions;
    $('fillIntro').innerHTML = '<h2>' + esc(cfg.studyTitle) + '</h2><p class="muted">' + esc(cfg.studySubtitle || '') + '</p>'
      + '<p>本問卷共 <b>' + dims.length + ' 個主構面</b>、<b>' + dims.reduce(function (s, d) { return s + d.items.length; }, 0) + ' 個子構面</b>，'
      + '成對比較共 <b>' + (pairs(dims.length).length + dims.reduce(function (s, d) { return s + pairs(d.items.length).length; }, 0)) + ' 題</b>。'
      + '請依您的判斷逐題比較，填完可先看個人結果再送出。</p>'
      + '<div id="modeHint"></div>';
    var mode = cfg.appsScriptUrl ? '已接 Google Sheets：送出後會寫入研究者的試算表。' : '目前是本機模式（config.js 未填 Apps Script 網址）：送出後只存在這台瀏覽器，正式收案前請研究者先接好 Sheets 再發連結。';
    $('modeHint').innerHTML = '<p class="warn">' + mode + '</p>';
    if ($('fGroupWrap')) $('fGroupWrap').hidden = !cfg.groupLabel;
    $('fGroupLabel').textContent = cfg.groupLabel || '分組';
    $('fGroup').innerHTML = (cfg.groupOptions || []).map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
    $('fBackground').innerHTML = (cfg.backgroundFields || []).map(function (f) {
      return '<div><label>' + esc(f.label) + '</label><select data-bg="' + esc(f.key) + '"><option value="">請選擇</option>'
        + f.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></div>';
    }).join('');
    var html = '';
    function matrixBlock(key, title, names, descs, dimDescText) {
      var h = '<h3>' + esc(title) + '</h3>';
      if (dimDescText) h += '<p class="muted small">' + esc(dimDescText) + '</p>';
      pairs(names.length).forEach(function (p) {
        var d0 = (descs || [])[p[0]] || '', d1 = (descs || [])[p[1]] || '';
        var descHtml = (d0 || d1) ? '<div class="small muted">左：' + esc(d0 || '（無定義）') + '<br>右：' + esc(d1 || '（無定義）') + '</div>' : '';
        h += '<div class="pair"><div class="names"><span>' + esc(names[p[0]]) + '</span><span>' + esc(names[p[1]]) + '</span></div>' + descHtml
          + sliderHTML('pair-select', 'data-matrix="' + key + '" data-pair="' + p[0] + '-' + p[1] + '"', SLIDER_VALUES_MAIN, false, '左方 9 … 1 同等 … 右方 9（滑桿偏左表示左項較重要，偏右表示右項較重要；中央為同等重要）') + '</div>';
      });
      return h;
    }
    html += matrixBlock('main', '主構面成對比較', dims.map(function (d) { return d.name; }), dims.map(function (d) { return dimDesc(d); }), '');
    dims.forEach(function (d, di) { html += matrixBlock('sub' + di, d.name + '之下子構面成對比較', d.items, d.itemDescs || [], dimDesc(d)); });
    $('fillMatrices').innerHTML = html;
    initSliders();
    updateProgress();
    // 第二階段：相依比較（僅本研究開啟相依修正時顯示；量尺只用 1、3、5、7、9，不用中間值）
    var depCard = $('fillDependencyCard'), depDiv = $('fillDependency');
    if (depCard && depDiv) {
      var feats = featuresOf(cfg), deps = cfg.dependencies || [];
      if (feats.dependency && deps.length) {
        depCard.hidden = false;
        var dh = '<p class="muted">以下為第二階段：因子間的相依（影響力）比較。每一題請以「基準因子」為對象，判斷左、右兩項對它的影響哪個較大：滑桿偏左表示左項影響較強，偏右表示右項影響較強，中央表示影響相等。本階段不使用 2、4、6、8 中間值（論文第二階段做法）。</p><p class="small muted" id="depProgressText"></p>';
        deps.forEach(function (entry, ei) {
          var dim = dims[entry.dimensionIndex];
          if (!dim) return;
          var names = (entry.items || []).map(function (ii) { return dim.items[ii]; });
          var baseName = dim.items[entry.baseItemIndex];
          dh += '<h3>' + esc(dim.name) + ' — 以「' + esc(baseName) + '」為基準</h3>';
          pairs(names.length).forEach(function (p) {
            dh += '<div class="pair"><div class="names"><span>' + esc(names[p[0]]) + '</span><span>' + esc(names[p[1]]) + '</span></div>'
              + sliderHTML('dep-select', 'data-dep="' + ei + '" data-pair="' + p[0] + '-' + p[1] + '"', SLIDER_VALUES_DEP, true, '左方影響較強 9 … 1 影響相等 … 右方影響較強 9（不使用中間值）') + '</div>';
          });
        });
        depDiv.innerHTML = dh;
        initSliders();
        var depText0 = $('depProgressText');
        if (depText0) depText0.textContent = '相依比較已完成 0 / ' + document.querySelectorAll('.dep-select').length + ' 題';
      } else {
        depCard.hidden = true; depDiv.innerHTML = '';
      }
    }
  }
  function collectComparisons() {
    var comps = { main: {} };
    var missing = 0;
    document.querySelectorAll('.pair-select').forEach(function (el) {
      var key = el.getAttribute('data-matrix'), pair = el.getAttribute('data-pair');
      if (el.getAttribute('data-answered') !== '1') { missing++; return; }
      if (!comps[key]) comps[key] = {};
      comps[key][pair] = sliderSiteValue(sliderValueOf(el));
    });
    return { comps: comps, missing: missing };
  }
  function collectDependencyComparisons() {
    var comps = {}, missing = 0;
    document.querySelectorAll('.dep-select').forEach(function (el) {
      var key = 'dep' + el.getAttribute('data-dep'), pair = el.getAttribute('data-pair');
      if (el.getAttribute('data-answered') !== '1') { missing++; return; }
      if (!comps[key]) comps[key] = {};
      comps[key][pair] = sliderSiteValue(sliderValueOf(el));
    });
    return { comps: comps, missing: missing };
  }
  function updateProgress() {
    var sels = document.querySelectorAll('.pair-select');
    var done = 0; sels.forEach(function (el) { if (el.getAttribute('data-answered') === '1') done++; });
    var pct = sels.length ? Math.round(done / sels.length * 100) : 0;
    $('fillProgress').style.width = pct + '%';
    $('fillProgressText').textContent = '已完成 ' + done + ' / ' + sels.length + ' 題（' + pct + '%）';
  }
  function collectRecord() {
    var cfg = activeConfig();
    var bg = {};
    document.querySelectorAll('[data-bg]').forEach(function (el) { bg[el.getAttribute('data-bg')] = el.value; });
    var rec = {
      id: '', submitted_at: new Date().toISOString(),
      group: $('fGroup').value, background: bg,
      comparisons: collectComparisons().comps,
      structure: structureOf(cfg), demo: false
    };
    if (featuresOf(cfg).dependency) rec.dependencies = collectDependencyComparisons().comps;
    return rec;
  }
  function matrixTableHTML(names, matrix) {
    var h = '<table><tr><th></th>' + names.map(function (n) { return '<th>' + esc(n) + '</th>'; }).join('') + '</tr>';
    matrix.forEach(function (row, i) {
      h += '<tr><th>' + esc(names[i]) + '</th>' + row.map(function (v) {
        var t = v === 1 ? '1' : (v > 1 ? String(Math.round(v)) : '1/' + Math.round(1 / v));
        return '<td class="num">' + t + '</td>';
      }).join('') + '</tr>';
    });
    return h + '</table>';
  }
  function previewHTML(cfg, record, result) {
    var dims = record.structure.dimensions;
    var h = '<h3>主構面權重</h3><table><tr><th>主構面</th><th class="num">權重</th><th class="num">排行</th></tr>';
    var ranks = AHP.rankOf(result.main.weights);
    dims.forEach(function (d, i) { h += '<tr><td>' + esc(d.name) + '</td><td class="num">' + fmt(result.main.weights[i]) + '</td><td class="num">' + ranks[i] + '</td></tr>'; });
    h += '</table><p class="small">λmax = ' + fmt(result.main.lambdaMax) + '，C.I. = ' + fmt(result.main.ci) + '，C.R. = ' + fmt(result.main.cr)
      + '（' + (result.main.valid ? '<span class="ok">通過</span>' : '<span class="bad">未通過，C.R. &gt; 0.1</span>') + '）</p>';
    dims.forEach(function (d, di) {
      var r = result.subs[di], rk = AHP.rankOf(r.weights);
      h += '<h4>' + esc(d.name) + '（區域權重）</h4><table><tr><th>子構面</th><th class="num">區域權重</th><th class="num">全域權重</th><th class="num">排行（構面內）</th></tr>';
      d.items.forEach(function (it, ii) {
        h += '<tr><td>' + esc(it) + '</td><td class="num">' + fmt(r.weights[ii]) + '</td><td class="num">' + fmt(result.global.filter(function (g) { return g.dimensionIndex === di && g.itemIndex === ii; })[0].global) + '</td><td class="num">' + rk[ii] + '</td></tr>';
      });
      h += '</table><p class="small">λmax = ' + fmt(r.lambdaMax) + '，C.I. = ' + fmt(r.ci) + '，C.R. = ' + fmt(r.cr)
        + '（' + (r.valid ? '<span class="ok">通過</span>' : '<span class="bad">未通過</span>') + '）</p>';
    });
    var sorted = clone(result.global).sort(function (a, b) { return b.global - a.global; });
    var totalItems = dims.reduce(function (s, d) { return s + d.items.length; }, 0);
    var matrixCount = 1 + dims.length;
    h += '<h3>' + totalItems + ' 項全域排行（個人）</h3><ol>' + sorted.map(function (g) { return '<li>' + esc(g.dimension) + ' — ' + esc(g.item) + '：' + fmt(g.global) + '</li>'; }).join('') + '</ol>';
    var crh = result.crh || AHP.computeCRH(result);
    h += '<p>整份問卷一致性：<b>' + (result.valid ? '<span class="ok">有效（' + matrixCount + ' 張矩陣 C.R. 皆 ≦ 0.1）</span>' : '<span class="bad">未通過（有矩陣 C.R. &gt; 0.1，後台分析預設會排除）</span>') + '</b>'
      + '；整體層級一致性 C.R.H. = ' + fmt(crh.crh) + '（C.I.H. ' + fmt(crh.cih) + '／R.I.H. ' + fmt(crh.rih) + '，論文門檻 C.R.H. &lt; 0.1，僅供參考，不取代逐矩陣判定）。</p>';
    // 相依修正後個人結果（僅開啟相依且有第二階段資料時）
    if (featuresOf(cfg).dependency && (cfg.dependencies || []).length && record.dependencies) {
      var dep = AHP.computeDependency(result, record.dependencies, cfg.dependencies || []);
      h += '<h3>相依修正後結果（個人，第二階段）</h3>';
      h += '<p>相依有效性：<b>' + (dep.valid ? '<span class="ok">通過（各相依矩陣 C.R. 皆 ≦ 0.1）</span>' : '<span class="bad">未通過（最大 C.R. ' + fmt(dep.maxCR) + '）</span>') + '</b></p>';
      h += '<table><tr><th>相依項目（基準因子）</th><th class="num">C.I.</th><th class="num">C.R.</th></tr>';
      dep.depResults.forEach(function (dr) {
        var d = dims[dr.dimensionIndex], baseName = d ? d.items[dr.baseItemIndex] : '';
        h += '<tr><td>' + esc(d ? d.name : '') + ' — ' + esc(baseName) + '</td><td class="num">' + fmt(dr.ci) + '</td><td class="num">' + fmt(dr.cr) + '</td></tr>';
      });
      h += '</table>';
      dims.forEach(function (d, di) {
        var corr = dep.perDimension[di].correctedWeights;
        h += '<h4>' + esc(d.name) + '（修正後區域權重）</h4><table><tr><th>子構面</th><th class="num">原始區域權重</th><th class="num">修正後區域權重</th><th class="num">修正後全域權重</th></tr>';
        d.items.forEach(function (it, ii) {
          h += '<tr><td>' + esc(it) + '</td><td class="num">' + fmt(result.subs[di].weights[ii]) + '</td><td class="num">' + fmt(corr[ii]) + '</td><td class="num">' + fmt(result.main.weights[di] * corr[ii]) + '</td></tr>';
        });
        h += '</table>';
      });
      var depGlobal = [];
      dims.forEach(function (d, di) { d.items.forEach(function (it, ii) { depGlobal.push({ label: d.name + ' — ' + it, v: result.main.weights[di] * dep.perDimension[di].correctedWeights[ii] }); }); });
      depGlobal.sort(function (a, b) { return b.v - a.v; });
      h += '<h4>相依修正後全域排行（個人）</h4><ol>' + depGlobal.map(function (g) { return '<li>' + esc(g.label) + '：' + fmt(g.v) + '</li>'; }).join('') + '</ol>';
    }
    return h;
  }

  $('btnPreview').addEventListener('click', function () {
    var c = collectComparisons();
    var dc = featuresOf(activeConfig()).dependency ? collectDependencyComparisons() : { missing: 0 };
    if (c.missing + dc.missing) { alert('還有 ' + (c.missing + dc.missing) + ' 題未填（含相依比較 ' + dc.missing + ' 題），請填完再計算。'); return; }
    var record = collectRecord();
    var result = AHP.computeRecord(record.structure, record);
    lastPreview = { record: record, result: result };
    $('fillPreview').innerHTML = previewHTML(activeConfig(), record, result);
    $('btnSubmit').disabled = false;
    $('submitStatus').textContent = '已算好個人結果，確認無誤即可送出。';
  });

  function rawHeadersFor(record) {
    var cfg = activeConfig();
    var headers = ['submission_id', 'submitted_at', 'group'];
    (cfg.backgroundFields || []).forEach(function (f) { headers.push('background_' + f.key + '（' + f.label + '）'); });
    var dims = record.structure.dimensions;
    pairs(dims.length).forEach(function (p) { headers.push('主構面：' + dims[p[0]].name + ' vs ' + dims[p[1]].name); });
    dims.forEach(function (d, di) {
      pairs(d.items.length).forEach(function (p) { headers.push(d.name + '：' + d.items[p[0]] + ' vs ' + d.items[p[1]]); });
    });
    headers.push('comparisons_json');
    return headers;
  }
  function rawRowFor(record) {
    var dims = record.structure.dimensions, row = [record.id, record.submitted_at, record.group];
    (activeConfig().backgroundFields || []).forEach(function (f) { row.push(record.background[f.key] || ''); });
    pairs(dims.length).forEach(function (p) { row.push(record.comparisons.main[p[0] + '-' + p[1]]); });
    dims.forEach(function (d, di) {
      pairs(d.items.length).forEach(function (p) { row.push((record.comparisons['sub' + di] || {})[p[0] + '-' + p[1]]); });
    });
    row.push(JSON.stringify(record));
    return row;
  }
  function weightsHeadersFor(record) {
    var dims = record.structure.dimensions, h = ['submission_id', 'submitted_at', 'group', 'valid', 'main_CI', 'main_CR'];
    dims.forEach(function (d) { h.push('主構面權重_' + d.name); });
    dims.forEach(function (d, di) {
      h.push('CI_' + d.name, 'CR_' + d.name);
      d.items.forEach(function (it) { h.push('區域權重_' + d.name + '_' + it); });
    });
    dims.forEach(function (d) { d.items.forEach(function (it) { h.push('全域權重_' + d.name + '_' + it); }); });
    return h;
  }
  function weightsRowFor(record, result) {
    var dims = record.structure.dimensions, row = [record.id, record.submitted_at, record.group, result.valid ? '有效' : '無效', fmt(result.main.ci), fmt(result.main.cr)];
    dims.forEach(function (_, di) { row.push(fmt(result.main.weights[di])); });
    dims.forEach(function (d, di) {
      row.push(fmt(result.subs[di].ci), fmt(result.subs[di].cr));
      d.items.forEach(function (_, ii) { row.push(fmt(result.subs[di].weights[ii])); });
    });
    result.global.forEach(function (g) { row.push(fmt(g.global)); });
    return row;
  }
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function csvEscape(v) { var s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(headers, rows) { return '\ufeff' + headers.map(csvEscape).join(',') + '\n' + rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\n'); }

  $('btnSubmit').addEventListener('click', function () {
    if (!lastPreview) return;
    var cfg = activeConfig();
    var record = clone(lastPreview.record);
    record.id = ($('fCode').value || '').trim() || ('R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase());
    record.submitted_at = new Date().toISOString();
    var result = AHP.computeRecord(record.structure, record);
    lastRecord = record;
    $('submitStatus').textContent = '送出中…';
    function doneLocal(msg) {
      try {
        var arr = JSON.parse(localStorage.getItem('ahp_records') || '[]');
        arr.push(record); localStorage.setItem('ahp_records', JSON.stringify(arr));
      } catch (e) {}
      $('fillDone').innerHTML = '<div class="card"><h3>已送出</h3><p>您的編號：<b>' + esc(record.id) + '</b>。一致性：' + (result.valid ? '<span class="ok">有效</span>' : '<span class="bad">未通過（後台分析預設排除）</span>') + '</p><p>' + esc(msg) + '</p>'
        + '<button class="secondary" id="btnMyJson">下載我的填答 JSON（可寄給研究者彙整）</button></div>';
      $('btnMyJson').addEventListener('click', function () { download(record.id + '_ahp.json', JSON.stringify(record, null, 2), 'application/json'); });
      $('btnSubmit').disabled = true; $('submitStatus').textContent = '';
    }
    if (cfg.appsScriptUrl) {
      var payload = { action: 'submit', record: record, rawHeaders: rawHeadersFor(record), rawRow: rawRowFor(record), weightHeaders: weightsHeadersFor(record), weightRow: weightsRowFor(record) };
      fetch(cfg.appsScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok) { $('fillDone').innerHTML = '<div class="card"><h3>已送出並寫入 Google Sheets</h3><p>您的編號：<b>' + esc(record.id) + '</b>。一致性：' + (result.valid ? '<span class="ok">有效</span>' : '<span class="bad">未通過</span>') + '</p></div>'; $('btnSubmit').disabled = true; $('submitStatus').textContent = ''; }
          else doneLocal('Sheet 寫入回傳異常，已先存在本機；請把下方 JSON 寄給研究者，或請研究者檢查 Apps Script 部署。');
        })
        .catch(function () { doneLocal('Sheet 寫入失敗（可能是 Apps Script 網址或權限問題），已先存在本機；請把填答 JSON 寄給研究者彙整，並請研究者檢查部署設定。'); });
    } else {
      doneLocal('目前是本機模式，未接 Google Sheets；這筆資料存在這台瀏覽器。如需交給研究者，請下載填答 JSON 寄出。');
    }
  });

  // ---------- 後台：資料來源 ----------
  var currentRecords = [], currentSource = 'local';
  function computeAll(records) { return records.map(function (r) { return { record: r, result: AHP.computeRecord(r.structure, r) }; }); }
  function loadLocal() {
    try { currentRecords = JSON.parse(localStorage.getItem('ahp_records') || '[]'); } catch (e) { currentRecords = []; }
    currentSource = 'local';
    $('srcHint').textContent = '本機紀錄存在這台瀏覽器的 localStorage；換台電腦就看不到，正式收案請用 Google Sheets 來源。';
    $('srcControls').innerHTML = '<p class="small">本機共 ' + currentRecords.length + ' 筆。</p>';
    renderRecords();
  }
  function loadSheet() {
    var cfg = baseConfig();
    if (!cfg.appsScriptUrl) { alert('config.js 尚未填寫 appsScriptUrl，請先依部署說明接好 Apps Script。'); return; }
    $('srcHint').textContent = '從 Google Sheets 讀取中…';
    fetch(cfg.appsScriptUrl + '?action=list')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error('sheet error');
        currentRecords = j.records || []; currentSource = 'sheet';
        $('srcHint').textContent = '已從 Google Sheets 讀回 ' + currentRecords.length + ' 筆（以 comparisons_json 欄重算權重，Sheet 上的人工修改也會反映）。';
        $('srcControls').innerHTML = '<button class="secondary" id="btnReloadSheet">重新讀取 Sheets</button>';
        $('btnReloadSheet').addEventListener('click', loadSheet);
        renderRecords();
      })
      .catch(function () { $('srcHint').textContent = '讀取 Sheets 失敗：請檢查 Apps Script 是否部署為「任何人」可存取、網址是否貼對；若瀏覽器擋跨網域，可改用「匯入檔案」：把 Sheet「檔案 → 下載 → CSV」後在這裡匯入。'; });
  }
  function csvParse(text) {
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function setupImport() {
    $('srcControls').innerHTML = '<p class="small">支援兩種檔案：(1) 本系統下載的完整 JSON；(2) 本系統下載／Sheet 匯出的原始填答 CSV（含 comparisons_json 欄）。匯入只影響目前分析，不會自動寫回 Sheet。</p><input type="file" id="importFile" accept=".json,.csv">';
    $('importFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var txt = String(rd.result);
          if (f.name.toLowerCase().endsWith('.json')) {
            var arr = JSON.parse(txt); if (!Array.isArray(arr)) arr = [arr];
            currentRecords = arr.filter(function (r) { return r && r.comparisons; });
          } else {
            var rows = csvParse(txt.replace(/^\ufeff/, ''));
            var hi = rows[0].indexOf('comparisons_json');
            if (hi < 0) throw new Error('no json column');
            currentRecords = rows.slice(1).filter(function (r) { return r[hi]; }).map(function (r) { return JSON.parse(r[hi]); });
          }
          currentSource = 'import';
          $('srcHint').textContent = '已匯入 ' + currentRecords.length + ' 筆。';
          renderRecords();
        } catch (err) { alert('匯入失敗：請確認是本系統的 JSON 或含 comparisons_json 的 CSV。'); }
      };
      rd.readAsText(f);
    });
  }
  document.querySelectorAll('[data-src]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-src]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (btn.getAttribute('data-src') === 'local') loadLocal();
      else if (btn.getAttribute('data-src') === 'sheet') loadSheet();
      else setupImport();
    });
  });

  // ---------- 後台：紀錄 ----------
  function filteredRecords() {
    var g = $('recGroupFilter').value, v = $('recValidFilter').value, q = ($('recSearch').value || '').trim().toLowerCase();
    var all = computeAll(currentRecords);
    return all.filter(function (x) {
      if (g !== 'all' && x.record.group !== g) return false;
      if (v === 'valid' && !x.result.valid) return false;
      if (v === 'invalid' && x.result.valid) return false;
      if (q && String(x.record.id).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function renderRecords() {
    var cfg = activeConfig();
    var groups = ['all'].concat(cfg.groupOptions || []);
    currentRecords.forEach(function (r) { if (groups.indexOf(r.group) < 0) groups.push(r.group); });
    $('recGroupFilter').innerHTML = groups.map(function (g) { return '<option value="' + esc(g) + '">' + (g === 'all' ? '全部分組' : (g === '' ? '（無主要分組）' : esc(g))) + '</option>'; }).join('');
    var list = filteredRecords();
    $('recSummary').textContent = '目前來源：' + (currentSource === 'local' ? '本機' : currentSource === 'sheet' ? 'Google Sheets' : currentSource === 'demo' ? '示範資料' : '匯入檔案')
      + '，共 ' + currentRecords.length + '筆，篩選後 ' + list.length + ' 筆；其中有效 ' + list.filter(function (x) { return x.result.valid; }).length + ' 筆。';
    if (!list.length) { $('recTable').innerHTML = '<p class="muted">沒有符合的紀錄。</p>'; return; }
    var h = '<table><tr><th>編號</th><th>填答時間</th><th>分組</th><th>最大 C.R.</th><th>是否有效</th><th>操作</th></tr>';
    list.forEach(function (x) {
      var maxCR = Math.max.apply(null, [x.result.main.cr].concat(x.result.subs.map(function (s) { return s.cr; })));
      h += '<tr><td>' + esc(x.record.id) + (x.record.demo ? ' <span class="pill warn">示範</span>' : '') + '</td><td>' + esc(new Date(x.record.submitted_at).toLocaleString()) + '</td><td>' + esc(x.record.group) + '</td><td class="num">' + fmt(maxCR) + '</td><td>' + (x.result.valid ? '<span class="ok">有效</span>' : '<span class="bad">無效</span>') + '</td>'
        + '<td><button class="secondary" data-viewrec="' + esc(x.record.id) + '">查看</button><button class="secondary danger" data-delrec="' + esc(x.record.id) + '">刪除</button></td></tr>';
    });
    $('recTable').innerHTML = h + '</table>';
    document.querySelectorAll('[data-viewrec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = computeAll(currentRecords).filter(function (y) { return String(y.record.id) === b.getAttribute('data-viewrec'); })[0];
        if (!x) return;
        var dims = x.record.structure.dimensions, h2 = '<h3>單筆明細：' + esc(x.record.id) + '（' + esc(x.record.group) + '）</h3>';
        h2 += '<p class="small">背景：' + Object.keys(x.record.background || {}).map(function (k) { return esc(k) + '＝' + esc(x.record.background[k]); }).join('，') + '</p>';
        h2 += '<h4>主構面矩陣</h4>' + matrixTableHTML(dims.map(function (d) { return d.name; }), x.result.main.matrix)
          + '<p class="small">權重：' + dims.map(function (d, i) { return esc(d.name) + ' ' + fmt(x.result.main.weights[i]); }).join('，') + '；λmax ' + fmt(x.result.main.lambdaMax) + '，C.I. ' + fmt(x.result.main.ci) + '，C.R. ' + fmt(x.result.main.cr) + '</p>';
        dims.forEach(function (d, di) {
          var s = x.result.subs[di];
          h2 += '<h4>' + esc(d.name) + '</h4>' + matrixTableHTML(d.items, s.matrix)
            + '<p class="small">區域權重：' + d.items.map(function (it, ii) { return esc(it) + ' ' + fmt(s.weights[ii]); }).join('，') + '；C.R. ' + fmt(s.cr) + '</p>';
        });
        $('recDetail').innerHTML = h2;
        $('recDetail').scrollIntoView();
      });
    });
    document.querySelectorAll('[data-delrec]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-delrec');
        if (!confirm('確定刪除編號 ' + id + ' 嗎？本機模式只刪本機；Sheets 模式會嘗試連 Apps Script 刪除（需先設定 ADMIN_CODE，否則會被拒絕）。')) return;
        if (currentSource === 'sheet' && baseConfig().appsScriptUrl) {
          fetch(baseConfig().appsScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'delete', id: id, adminCode: baseConfig().adminCode }) })
            .then(function (r) { return r.json(); }).then(function (j) { alert(j && j.ok ? '已從 Sheet 刪除。' : 'Sheet 刪除被拒絕（請檢查 Apps Script 指令碼屬性 ADMIN_CODE 是否與後台密碼相同）。'); loadSheet(); })
            .catch(function () { alert('刪除請求失敗，請檢查 Apps Script。'); });
        } else {
          currentRecords = currentRecords.filter(function (r) { return String(r.id) !== id; });
          try { localStorage.setItem('ahp_records', JSON.stringify(currentRecords)); } catch (e) {}
          renderRecords();
        }
      });
    });
  }
  ['recGroupFilter', 'recValidFilter'].forEach(function (id) { $(id).addEventListener('change', renderRecords); });
  $('recSearch').addEventListener('input', renderRecords);

  function downloadCurrentCSV(kind) {
    var all = computeAll(currentRecords);
    if (!all.length) { alert('目前沒有資料可下載。'); return; }
    if (kind === 'raw') {
      var headers = rawHeadersFor(all[0].record);
      download('ahp_raw_data.csv', toCSV(headers, all.map(function (x) { return rawRowFor(x.record); })));
    } else if (kind === 'weights') {
      var headers2 = weightsHeadersFor(all[0].record);
      download('ahp_weights.csv', toCSV(headers2, all.map(function (x) { return weightsRowFor(x.record, x.result); })));
    } else {
      download('ahp_records.json', JSON.stringify(currentRecords, null, 2), 'application/json');
    }
  }
  $('btnCsvRaw').addEventListener('click', function () { downloadCurrentCSV('raw'); });
  $('btnCsvWeights').addEventListener('click', function () { downloadCurrentCSV('weights'); });
  $('btnJson').addEventListener('click', function () { downloadCurrentCSV('json'); });
  $('btnClearLocal').addEventListener('click', function () {
    if (!confirm('確定清除本機所有填答紀錄嗎？此動作無法復原，Sheets 上的資料不受影響。')) return;
    try { localStorage.removeItem('ahp_records'); } catch (e) {}
    loadLocal();
  });

  // ---------- 後台：分析報告（論文第四章格式） ----------
  function barChart(rows, maxVal) {
    // rows: [{ label, value }]
    return rows.map(function (r) {
      var pct = maxVal ? Math.round(r.value / maxVal * 100) : 0;
      return '<div class="bar-row"><div class="lbl">' + esc(r.label) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div class="v">' + fmt(r.value) + '</div></div>';
    }).join('');
  }
  function groupBarChart(items, groupNames) {
    // items: [{ label, values: [per group] }], 並排長條以便組間比對（論文圖 8 做法）
    var maxVal = 0; items.forEach(function (it) { it.values.forEach(function (v) { if (v > maxVal) maxVal = v; }); });
    var h = '';
    items.forEach(function (it) {
      h += '<div style="margin:10px 0"><div class="small"><b>' + esc(it.label) + '</b></div>';
      it.values.forEach(function (v, gi) {
        var pct = maxVal ? Math.round(v / maxVal * 100) : 0;
        h += '<div class="bar-row"><div class="lbl">' + esc(groupNames[gi]) + '</div><div class="bar-track"><div class="bar-fill ' + (gi === 1 ? 'b' : '') + '" style="width:' + pct + '%"></div></div><div class="v">' + fmt(v) + '</div></div>';
      });
      h += '</div>';
    });
    return h;
  }
  function rankingSentence(names, weights) {
    var order = weights.map(function (w, i) { return { w: w, i: i }; }).sort(function (a, b) { return b.w - a.w; });
    return order.map(function (o, idx) { return '第' + (idx + 1) + '為「' + names[o.i] + '」（' + fmt(o.w) + '）'; }).join('，') + '。';
  }
  function failedMatrices(x) {
    var dims = x.record.structure.dimensions, fails = [];
    if (!x.result.main.valid) fails.push('主構面（C.R. ' + fmt(x.result.main.cr) + '）');
    x.result.subs.forEach(function (s, di) { if (!s.valid) fails.push(dims[di].name + '（C.R. ' + fmt(s.cr) + '）'); });
    return fails;
  }
  function groupSectionHTML(title, list, agg, structure, opts) {
    opts = opts || {};
    var methodLabel = opts.methodLabel || '算術平均';
    var showCRH = !!opts.showCRH;
    var dims = structure.dimensions;
    var h = '<h3>' + esc(title) + '</h3>';
    h += '<p>有效問卷 ' + list.length + ' 份。主構面依權重排序：' + rankingSentence(dims.map(function (d) { return d.name; }), agg.mainAvg) + '</p>';
    h += '<p class="small muted">下表為逐人權重（論文表 9、15、21 格式）；C.I.／C.R. 為主構面矩陣之值；平均值為納入問卷的' + esc(methodLabel) + '。</p>';
    h += '<table><tr><th>編號</th>' + dims.map(function (d) { return '<th class="num">' + esc(d.name) + '</th>'; }).join('') + '<th class="num">C.I.</th><th class="num">C.R.</th>' + (showCRH ? '<th class="num">C.R.H.</th>' : '') + '</tr>';
    list.forEach(function (x) {
      var crh = x.result.crh || AHP.computeCRH(x.result);
      h += '<tr><td>' + esc(x.record.id) + '</td>' + x.result.main.weights.map(function (w) { return '<td class="num">' + fmt(w) + '</td>'; }).join('') + '<td class="num">' + fmt(x.result.main.ci) + '</td><td class="num">' + fmt(x.result.main.cr) + '</td>' + (showCRH ? '<td class="num">' + fmt(crh.crh) + '</td>' : '') + '</tr>';
    });
    h += '<tr><th>平均</th>' + agg.mainAvg.map(function (w) { return '<th class="num">' + fmt(w) + '</th>'; }).join('') + '<th></th><th></th>' + (showCRH ? '<th></th>' : '') + '</tr>';
    h += '<tr><th>排行</th>' + agg.mainRanks.map(function (r) { return '<th class="num">' + r + '</th>'; }).join('') + '<th></th><th></th>' + (showCRH ? '<th></th>' : '') + '</tr></table>';
    h += '<textarea class="report-note" placeholder="研究者解讀（可在此補充主構面結果的詮釋，列印／下載報告時會一併印出）"></textarea>';
    dims.forEach(function (d, di) {
      h += '<h4>' + esc(d.name) + '之下子構面</h4><p>依權重排序：' + rankingSentence(d.items, agg.subAvg[di]) + '</p>';
      h += '<table><tr><th>編號</th>' + d.items.map(function (it) { return '<th class="num">' + esc(it) + '</th>'; }).join('') + '<th class="num">C.I.</th><th class="num">C.R.</th></tr>';
      list.forEach(function (x) {
        var s = x.result.subs[di];
        h += '<tr><td>' + esc(x.record.id) + '</td>' + s.weights.map(function (w) { return '<td class="num">' + fmt(w) + '</td>'; }).join('') + '<td class="num">' + fmt(s.ci) + '</td><td class="num">' + fmt(s.cr) + '</td></tr>';
      });
      h += '<tr><th>平均</th>' + agg.subAvg[di].map(function (w) { return '<th class="num">' + fmt(w) + '</th>'; }).join('') + '<th></th><th></th></tr>';
      h += '<tr><th>排行</th>' + agg.subRanks[di].map(function (r) { return '<th class="num">' + r + '</th>'; }).join('') + '<th></th><th></th></tr></table>';
      h += '<textarea class="report-note" placeholder="研究者解讀（可在此補充本構面子構面結果的詮釋）"></textarea>';
    });
    h += '<h4>全域權重與排行（論文表 14、20、26 格式）</h4><p class="small muted">全域權重＝主構面' + esc(methodLabel) + ' × 子構面' + esc(methodLabel) + '區域權重。</p>';
    h += '<table><tr><th>主構面</th><th>子構面</th><th class="num">區域權重</th><th class="num">全域權重</th><th class="num">排序</th></tr>';
    agg.global.forEach(function (g) {
      h += '<tr><td>' + esc(g.dimension) + '（' + fmt(g.dimensionWeight) + '）</td><td>' + esc(g.item) + '</td><td class="num">' + fmt(g.local) + '</td><td class="num">' + fmt(g.global) + '</td><td class="num">' + g.rank + '</td></tr>';
    });
    h += '</table>';
    var maxG = Math.max.apply(null, agg.global.map(function (g) { return g.global; }));
    h += '<h4>全域排行圖（論文圖 5、6、7 格式）</h4>' + barChart(agg.global.map(function (g) { return { label: g.dimension + ' — ' + g.item, value: g.global }; }), maxG);
    return h;
  }
  function dependentSectionHTML(structure, analysed, overallAgg, aggMethod, methodLabel, cfg) {
    var deps = cfg.dependencies || [];
    var withDep = analysed.filter(function (x) { return x.record.dependencies && Object.keys(x.record.dependencies).length; });
    if (!deps.length) return '<h3>相依修正後結果</h3><p class="muted">本研究未定義相依關係，故無相依修正結果。</p>';
    if (!withDep.length) return '<h3>相依修正後結果</h3><p class="muted">本研究已開啟相依修正，但納入資料中沒有第二階段相依比較值（可能是在開啟相依功能前收的問卷），故無法計算相依修正結果。相依分析只納入有第二階段資料的問卷。</p>';
    var withDepComputed = withDep.map(function (x) { return { record: x.record, result: x.result, dep: AHP.computeDependency(x.result, x.record.dependencies, deps) }; });
    var depValid = withDepComputed.filter(function (x) { return x.dep.valid; });
    var h = '<h3>相依修正後結果（整體）</h3>';
    h += '<p>有第二階段資料 ' + withDep.length + ' 份，其中相依矩陣全數通過（C.R. ≦ 0.1）' + depValid.length + ' 份。以下相依彙總以通過者為準（若報告勾選「只納入有效」，此處再以第一階段有效為前提，兩者皆已在納入資料中篩過）。</p>';
    h += '<table><tr><th>編號</th><th class="num">相依最大 C.R.</th><th>相依是否通過</th></tr>';
    withDepComputed.forEach(function (x) {
      h += '<tr><td>' + esc(x.record.id) + '</td><td class="num">' + fmt(x.dep.maxCR) + '</td><td>' + (x.dep.valid ? '<span class="ok">通過</span>' : '<span class="bad">未通過</span>') + '</td></tr>';
    });
    h += '</table>';
    if (!depValid.length) { h += '<p class="bad">沒有相依通過的問卷，故無法產生相依彙總。</p>'; return h; }
    // 相依彙總：主構面平均取通過者，主構面不變；子構面平均改用修正後區域權重。
    var aggFn = (aggMethod === 'geometric') ? AHP.geoMean : function (arr) { var s = 0; arr.forEach(function (v) { s += v; }); return arr.length ? s / arr.length : 0; };
    var dims = structure.dimensions;
    var mainAvg = AHP.normalize(dims.map(function (_, di) { return aggFn(depValid.map(function (x) { return x.result.main.weights[di]; })); }));
    var subAvgCorr = dims.map(function (dim, di) {
      return AHP.normalize(dim.items.map(function (_, ii) { return aggFn(depValid.map(function (x) { return x.dep.perDimension[di].correctedWeights[ii]; })); }));
    });
    var depGlobal = [];
    dims.forEach(function (dim, di) { dim.items.forEach(function (it, ii) { depGlobal.push({ dimensionIndex: di, itemIndex: ii, dimension: dim.name, item: it, dimensionWeight: mainAvg[di], local: subAvgCorr[di][ii], global: mainAvg[di] * subAvgCorr[di][ii] }); }); });
    var depRanks = AHP.rankOf(depGlobal.map(function (g) { return g.global; }));
    depGlobal.forEach(function (g, i) { g.rank = depRanks[i]; });
    h += '<h4>相依修正後子構面平均（整體）</h4>';
    dims.forEach(function (dim, di) {
      h += '<h5>' + esc(dim.name) + '</h5><table><tr><th>子構面</th><th class="num">未相依區域平均</th><th class="num">修正後區域平均</th></tr>';
      dim.items.forEach(function (it, ii) {
        h += '<tr><td>' + esc(it) + '</td><td class="num">' + fmt(overallAgg.subAvg[di][ii]) + '</td><td class="num">' + fmt(subAvgCorr[di][ii]) + '</td></tr>';
      });
      h += '</table>';
    });
    h += '<h4>相依前後全域權重比較（論文表 4-6 格式）</h4><table><tr><th>主構面 — 子構面</th><th class="num">未相依全域權重</th><th class="num">未相依排行</th><th class="num">修正後全域權重</th><th class="num">修正後排行</th><th class="num">權重差（修正後－未相依）</th></tr>';
    var depByKey = {};
    depGlobal.forEach(function (g) { depByKey[g.dimensionIndex + '-' + g.itemIndex] = g; });
    overallAgg.global.forEach(function (g) {
      var dg = depByKey[g.dimensionIndex + '-' + g.itemIndex];
      h += '<tr><td>' + esc(g.dimension) + ' — ' + esc(g.item) + '</td><td class="num">' + fmt(g.global) + '</td><td class="num">' + g.rank + '</td><td class="num">' + fmt(dg.global) + '</td><td class="num">' + dg.rank + '</td><td class="num">' + (dg.global - g.global >= 0 ? '+' : '') + fmt(dg.global - g.global) + '</td></tr>';
    });
    h += '</table>';
    var depSorted = depGlobal.slice().sort(function (a, b) { return a.rank - b.rank; });
    var maxG = Math.max.apply(null, depSorted.map(function (g) { return g.global; }));
    h += '<h4>相依修正後全域排行圖</h4>' + barChart(depSorted.map(function (g) { return { label: g.dimension + ' — ' + g.item, value: g.global }; }), maxG);
    h += '<textarea class="report-note" placeholder="研究者解讀（可在此補充相依修正前後的差異詮釋）"></textarea>';
    return h;
  }
  function scoringSectionHTML(structure, finalAgg, isDep, cfg) {
    var customers = loadScoring();
    if (!customers.length) return '<h3>方案／客戶評分結果</h3><p class="muted">本研究已開啟評分，但評分表是空的。請先到「方案／客戶評分」頁填寫並儲存，再產生報告。</p>';
    var dims = structure.dimensions;
    var factorOrder = [];
    dims.forEach(function (dim, di) { dim.items.forEach(function (it, ii) { factorOrder.push({ dimensionIndex: di, itemIndex: ii, dimension: dim.name, item: it }); }); });
    var weights = factorOrder.map(function (f) {
      var found = finalAgg.global.filter(function (g) { return g.dimensionIndex === f.dimensionIndex && g.itemIndex === f.itemIndex; })[0];
      return found ? found.global : 0;
    });
    var complete = [], incomplete = [];
    customers.forEach(function (c) {
      var scores = factorOrder.map(function (f) { var v = (c.scores || {})[f.dimensionIndex + '-' + f.itemIndex]; return (v === undefined || v === null || v === '') ? null : Number(v); });
      if (scores.some(function (v) { return v === null || isNaN(v) || v < 1 || v > 5; })) incomplete.push(c.name);
      else complete.push({ name: c.name, scores: scores });
    });
    var h = '<h3>方案／客戶評分結果</h3><p class="small muted">評分採用' + (isDep ? '相依修正後' : '未相依') + '最終全域權重；每因子評分 1–5 分，總分 = Σ 權重 × 評分。</p>';
    if (incomplete.length) h += '<p class="warn">以下客戶／方案因評分未填滿（或超出 1–5 分）未納入排序：' + esc(incomplete.join('、')) + '。</p>';
    if (!complete.length) { h += '<p class="bad">沒有評分完整的客戶／方案，故無法計算總分。</p>'; return h; }
    var scored = AHP.scoreAlternatives(weights, complete);
    h += '<table><tr><th>主構面 — 因子</th><th class="num">權重</th>' + complete.map(function (c) { return '<th class="num">' + esc(c.name) + ' 評分</th><th class="num">' + esc(c.name) + ' 加權分</th>'; }).join('') + '</tr>';
    factorOrder.forEach(function (f, fi) {
      h += '<tr><td>' + esc(f.dimension) + ' — ' + esc(f.item) + '</td><td class="num">' + fmt(weights[fi]) + '</td>';
      complete.forEach(function (c, ci) {
        h += '<td class="num">' + c.scores[fi] + '</td><td class="num">' + fmt(scored[ci].weighted[fi]) + '</td>';
      });
      h += '</tr>';
    });
    h += '<tr><th>總分</th><th></th>' + complete.map(function (c, ci) { return '<th class="num"></th><th class="num">' + fmt(scored[ci].total) + '</th>'; }).join('') + '</tr>';
    h += '<tr><th>排序</th><th></th>' + complete.map(function (c, ci) { return '<th class="num"></th><th class="num">' + scored[ci].rank + '</th>'; }).join('') + '</tr></table>';
    var maxT = Math.max.apply(null, scored.map(function (s) { return s.total; }));
    h += '<h4>方案／客戶總分比較圖</h4>' + barChart(scored.map(function (s) { return { label: s.name, value: s.total }; }), maxT);
    h += '<p>排序：' + scored.slice().sort(function (a, b) { return a.rank - b.rank; }).map(function (s) { return '第' + s.rank + '名 ' + esc(s.name) + '（' + fmt(s.total) + '）'; }).join('，') + '。</p>';
    h += '<textarea class="report-note" placeholder="研究者解讀（可在此補充評分結果的詮釋）"></textarea>';
    return h;
  }
  function generateReport() {
    var onlyValid = $('onlyValid').checked;
    var issued = parseInt($('issuedCount').value, 10);
    var aggMethod = 'arithmetic';
    document.querySelectorAll('input[name="aggMethod"]').forEach(function (r) { if (r.checked) aggMethod = r.value; });
    var methodLabel = aggMethod === 'geometric' ? '幾何平均（先取幾何平均再正規化）' : '算術平均';
    var showCRH = $('showCRH') ? $('showCRH').checked : false;
    var all = computeAll(currentRecords);
    if (!all.length) { $('reportArea').innerHTML = '<p class="muted">目前沒有資料，請先到「填答紀錄」確認資料來源與筆數。</p>'; return; }
    // 以最常見的研究架構為分析架構；架構不同者不混算。
    var sigCount = {};
    all.forEach(function (x) { var s = JSON.stringify(x.record.structure); sigCount[s] = (sigCount[s] || 0) + 1; });
    var mainSig = Object.keys(sigCount).sort(function (a, b) { return sigCount[b] - sigCount[a]; })[0];
    var structure = JSON.parse(mainSig);
    var same = all.filter(function (x) { return JSON.stringify(x.record.structure) === mainSig; });
    var diffCount = all.length - same.length;
    var validAll = same.filter(function (x) { return x.result.valid; });
    var analysed = onlyValid ? validAll : same;
    var cfg = activeConfig();
    var h = '<div id="reportPrintArea"><h2>' + esc(cfg.studyTitle) + ' — 分析報告</h2>';
    h += '<p class="small muted">計算方法：主特徵向量法；C.I.＝(λmax−n)/(n−1)，C.R.＝C.I.／R.I.（Saaty 表，n=4 時 R.I.＝0.90，各階數見 assets/ahp.js），C.R. ≦ 0.1 為有效；多人彙總採' + esc(methodLabel) + '，全域權重＝主構面平均 × 區域平均。'
      + (showCRH ? '本報告另列整體層級一致性 C.R.H.（C.I.H.／R.I.H.，門檻 &lt; 0.1，僅供參考，不取代逐矩陣 C.R. 判定）。' : '')
      + '數值四捨五入至小數第三位，加總可能差 0.001；有效判定以未四捨五入值計算。</p>';
    if (diffCount) h += '<p class="warn">注意：有 ' + diffCount + ' 筆的研究架構與多數筆數不同，已排除在本次分析外（研究架構改變後，舊架構資料不應與新架構混算）。</p>';
    h += '<h3>樣本總覽</h3><table>';
    h += '<tr><th>項目</th><th class="num">份數</th></tr>';
    h += '<tr><td>回收份數（目前資料來源總筆數）</td><td class="num">' + all.length + '</td></tr>';
    if (!isNaN(issued) && issued > 0) h += '<tr><td>發放份數</td><td class="num">' + issued + '</td></tr><tr><td>回收率</td><td class="num">' + fmt(all.length / issued * 100, 1) + '%</td></tr>';
    h += '<tr><td>有效問卷（全部矩陣 C.R. ≦ 0.1）</td><td class="num">' + validAll.length + '</td></tr>';
    h += '<tr><td>無效問卷</td><td class="num">' + (same.length - validAll.length) + '</td></tr>';
    h += '<tr><td>本次分析納入份數' + (onlyValid ? '（只納入有效）' : '（納入全部）') + '</td><td class="num">' + analysed.length + '</td></tr>';
    if (showCRH) {
      var crhPass = same.filter(function (x) { var c = x.result.crh || AHP.computeCRH(x.result); return c.crh < 0.1; }).length;
      h += '<tr><td>整體層級一致性 C.R.H. &lt; 0.1 的問卷（補充指標）</td><td class="num">' + crhPass + '</td></tr>';
    }
    h += '</table>';
    var invalidList = same.filter(function (x) { return !x.result.valid; });
    h += '<h4>無效問卷清單</h4>';
    if (!invalidList.length) h += '<p>無。</p>';
    else h += '<table><tr><th>編號</th><th>分組</th><th>未通過的矩陣</th></tr>' + invalidList.map(function (x) { return '<tr><td>' + esc(x.record.id) + '</td><td>' + esc(x.record.group) + '</td><td>' + esc(failedMatrices(x).join('、')) + '</td></tr>'; }).join('') + '</table>';
    h += '<h4>分組與背景分布（以全部回收問卷計）</h4><table><tr><th>分組</th><th class="num">人數</th></tr>' + (function () {
      var counts = {};
      same.forEach(function (x) { counts[x.record.group] = (counts[x.record.group] || 0) + 1; });
      return Object.keys(counts).map(function (g) { return '<tr><td>' + (g === '' ? '（無主要分組，改用背景欄位分組）' : esc(g)) + '</td><td class="num">' + counts[g] + '</td></tr>'; }).join('');
    })() + '</table>';
    (cfg.backgroundFields || []).forEach(function (f) {
      var counts = {};
      same.forEach(function (x) { var v = (x.record.background || {})[f.key] || '未填'; counts[v] = (counts[v] || 0) + 1; });
      h += '<p class="small"><b>' + esc(f.label) + '：</b>' + Object.keys(counts).map(function (k) { return esc(k) + ' ' + counts[k] + ' 人'; }).join('，') + '</p>';
    });
    if (!analysed.length) { h += '<p class="bad">本次分析沒有可納入的問卷（可能全部皆為無效且已勾選只納入有效）。請取消勾選或檢查一致性。</p></div>'; $('reportArea').innerHTML = h; return; }
    var sectionNo = 1;
    var overallAgg = AHP.aggregate(structure, analysed, aggMethod);
    h += '<h3>第' + sectionNo + '節 全體問卷結果</h3>'; sectionNo++;
    h += groupSectionHTML('全體', analysed, overallAgg, structure, { methodLabel: methodLabel, showCRH: showCRH });
    var featsReport = featuresOf(cfg);
    var depAggForScoring = null;
    if (featsReport.dependency) {
      h += '<h3>第' + sectionNo + '節 相依修正後結果</h3>'; sectionNo++;
      h += dependentSectionHTML(structure, analysed, overallAgg, aggMethod, methodLabel, cfg);
      // 評分若開啟且有相依通過資料，評分權重改用相依修正後權重（重算一次，與 dependentSectionHTML 同方法）
      var withDepR = analysed.filter(function (x) { return x.record.dependencies && Object.keys(x.record.dependencies).length; }).map(function (x) { return { record: x.record, result: x.result, dep: AHP.computeDependency(x.result, x.record.dependencies, cfg.dependencies || []) }; }).filter(function (x) { return x.dep.valid; });
      if (withDepR.length) {
        var aggFn2 = (aggMethod === 'geometric') ? AHP.geoMean : function (arr) { var s = 0; arr.forEach(function (v) { s += v; }); return arr.length ? s / arr.length : 0; };
        var mainAvg2 = AHP.normalize(structure.dimensions.map(function (_, di) { return aggFn2(withDepR.map(function (x) { return x.result.main.weights[di]; })); }));
        var subAvg2 = structure.dimensions.map(function (dim, di) { return AHP.normalize(dim.items.map(function (_, ii) { return aggFn2(withDepR.map(function (x) { return x.dep.perDimension[di].correctedWeights[ii]; })); })); });
        var g2 = [];
        structure.dimensions.forEach(function (dim, di) { dim.items.forEach(function (it, ii) { g2.push({ dimensionIndex: di, itemIndex: ii, dimension: dim.name, item: it, dimensionWeight: mainAvg2[di], local: subAvg2[di][ii], global: mainAvg2[di] * subAvg2[di][ii] }); }); });
        var r2 = AHP.rankOf(g2.map(function (g) { return g.global; })); g2.forEach(function (g, i) { g.rank = r2[i]; });
        depAggForScoring = { global: g2 };
      }
    }
    var schemes = selectedSchemes(cfg);
    schemes.forEach(function (scheme) {
      var derived = analysed.map(function (x) {
        var rec = clone(x.record); rec.group = getSchemeValue(x.record, scheme, cfg);
        return { record: rec, result: x.result };
      });
      var groups = [];
      derived.forEach(function (x) { if (groups.indexOf(x.record.group) < 0) groups.push(x.record.group); });
      groups = sortSchemeGroups(groups, scheme, cfg);
      if (groups.length < 2) {
        h += '<p class="muted small">分組方案「' + esc(scheme.label) + '」在納入資料中只有一組（' + esc(groups[0] || '無') + '），與全體相同，故不重複列出分組結果。</p>';
        return;
      }
      groups.forEach(function (g) {
        var sub = derived.filter(function (x) { return x.record.group === g; });
        if (!sub.length) return;
        h += '<h3>第' + sectionNo + '節 ' + esc(scheme.label) + ' — ' + esc(g) + '問卷結果</h3>'; sectionNo++;
        h += groupSectionHTML(g, sub, AHP.aggregate(structure, sub, aggMethod), structure, { methodLabel: methodLabel, showCRH: showCRH });
      });
      h += '<h3>第' + sectionNo + '節 ' + esc(scheme.label) + ' 各分組結果比對</h3>'; sectionNo++;
      var aggs = {};
      groups.forEach(function (g) { aggs[g] = AHP.aggregate(structure, derived.filter(function (x) { return x.record.group === g; }), aggMethod); });
      h += '<p>各組第一名：' + groups.map(function (g) { var top = aggs[g].global[0]; return esc(g) + '為「' + esc(top.item) + '」（' + fmt(top.global) + '）'; }).join('；') + '。</p>';
      var base = aggs[groups[0]].global;
      h += '<table><tr><th>子構面</th>' + groups.map(function (g) { return '<th class="num">' + esc(g) + ' 全域權重</th><th class="num">' + esc(g) + ' 排行</th>'; }).join('') + (groups.length === 2 ? '<th class="num">權重差（後組－前組）</th>' : '') + '</tr>';
      base.forEach(function (bg) {
        var row = '<tr><td>' + esc(bg.dimension) + ' — ' + esc(bg.item) + '</td>';
        groups.forEach(function (g) {
          var found = aggs[g].global.filter(function (x) { return x.dimensionIndex === bg.dimensionIndex && x.itemIndex === bg.itemIndex; })[0];
          row += '<td class="num">' + fmt(found.global) + '</td><td class="num">' + found.rank + '</td>';
        });
        if (groups.length === 2) {
          var a = aggs[groups[0]].global.filter(function (x) { return x.dimensionIndex === bg.dimensionIndex && x.itemIndex === bg.itemIndex; })[0].global;
          var b = aggs[groups[1]].global.filter(function (x) { return x.dimensionIndex === bg.dimensionIndex && x.itemIndex === bg.itemIndex; })[0].global;
          row += '<td class="num">' + (b - a >= 0 ? '+' : '') + fmt(b - a) + '</td>';
        }
        h += row + '</tr>';
      });
      h += '</table>';
      h += '<h4>分組全域權重比較圖（論文圖 8 格式）</h4>';
      var items = base.map(function (bg) {
        return { label: bg.dimension + ' — ' + bg.item, values: groups.map(function (g) { return aggs[g].global.filter(function (x) { return x.dimensionIndex === bg.dimensionIndex && x.itemIndex === bg.itemIndex; })[0].global; }) };
      });
      h += groupBarChart(items, groups);
      h += '<textarea class="report-note" placeholder="研究者解讀（可在此補充組間差異的詮釋，列印／下載報告時會一併印出）"></textarea>';
    });
    if (featsReport.scoring) {
      h += '<h3>第' + sectionNo + '節 方案／客戶評分結果</h3>'; sectionNo++;
      h += scoringSectionHTML(structure, depAggForScoring || overallAgg, !!depAggForScoring, cfg);
    }
    // 附錄：構面與指標定義（有填定義時才列出）
    var hasDesc = structure.dimensions.some(function (d) { return dimDesc(d) || (d.itemDescs || []).some(function (x) { return !!x; }); });
    if (hasDesc) {
      h += '<h3>附錄 構面與指標定義</h3><table><tr><th>主構面</th><th>定義</th><th>子構面</th><th>定義</th></tr>';
      structure.dimensions.forEach(function (d) {
        d.items.forEach(function (it, ii) {
          h += '<tr><td>' + esc(d.name) + '</td><td>' + esc(dimDesc(d)) + '</td><td>' + esc(it) + '</td><td>' + esc(itemDesc(d, ii)) + '</td></tr>';
        });
      });
      h += '</table><p class="small muted">定義由研究者在「研究設定」填寫；未填者留空，不影響計算。</p>';
    }
    h += '</div>';
    $('reportArea').innerHTML = h;
    window._lastReportHTML = h;
  }
  $('btnGenReport').addEventListener('click', generateReport);
  $('btnPrintReport').addEventListener('click', function () {
    if (!$('reportArea').innerHTML) { alert('請先產生分析報告。'); return; }
    document.body.classList.add('print-report');
    window.print();
    setTimeout(function () { document.body.classList.remove('print-report'); }, 500);
  });
  $('btnDownloadReport').addEventListener('click', function () {
    if (!window._lastReportHTML) { alert('請先產生分析報告。'); return; }
    var doc = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>分析報告</title><style>body{font-family:"Noto Sans TC",sans-serif;line-height:1.65;color:#1f2937;max-width:960px;margin:0 auto;padding:20px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#f1f5f9}textarea{width:100%;min-height:70px} .bar-row{display:grid;grid-template-columns:200px 1fr 70px;gap:8px;margin:5px 0;font-size:13px}.bar-track{background:#eef2f7;height:16px}.bar-fill{background:#0f766e;height:100%}.bar-fill.b{background:#0369a1}</style></head><body>' + window._lastReportHTML + '</body></html>';
    download('ahp_analysis_report.html', doc, 'text/html;charset=utf-8');
  });

  // ---------- Word 報告下載（第四章格式） ----------
  // 格式規範取自 HiTeach 論文第四章「研究對象與結果分析」：
  // 章標題置中、節標題置中、內文標楷體 12pt 行距 1.5 倍首行縮排 2 字；
  // 表題在表上方（「表 4.1 標題」，章內連續編號、標號與標題間有空格），不加資料來源註；
  // 節標題一律「第X節」格式；表格內文一律 12pt；附錄不進 Word。
  // 逐人權重表含平均與排行兩列、全域表含區域權重／全域權重／排序，權重皆取小數第三位；
  // 長條圖不進 Word（Word 版以各表之權重與排序呈現全部數據，圖表請見網站報告）。
  function chineseNumeral(n) {
    var digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n === 10) return '十';
    if (n < 10) return digits[n];
    if (n < 20) return '十' + digits[n - 10];
    var t = Math.floor(n / 10), o = n % 10;
    return digits[t] + '十' + (o ? digits[o] : '');
  }
  function wordCleanText(node) { return (node.textContent || '').replace(/\s+/g, ' ').trim(); }
  function buildWordReport() {
    var D = window.DocxBuilder;
    if (!D) throw new Error('DocxBuilder 未載入');
    var area = $('reportArea');
    if (!area || !area.innerHTML) throw new Error('請先產生分析報告');
    var printArea = area.querySelector('#reportPrintArea') || area;
    var clone = printArea.cloneNode(true);
    // 研究者解讀以現場輸入值為準（cloneNode 不一定帶走輸入值，故以現場 textarea 對位取值）
    var liveTAs = printArea.querySelectorAll('textarea');
    clone.querySelectorAll('textarea').forEach(function (ta, i) {
      var live = liveTAs[i];
      if (live && live.value) {
        var p = document.createElement('p');
        p.textContent = '研究者解讀：' + live.value;
        ta.parentNode.replaceChild(p, ta);
      } else if (ta.parentNode) {
        ta.parentNode.removeChild(ta);
      }
    });
    var blocks = [];
    var cfg = activeConfig();
    blocks.push(D.heading1('第四章 研究結果與分析'));
    blocks.push(D.para(cfg.studyTitle || 'AHP 問卷與分析系統', { size: 28, bold: true, align: 'center', spaceBefore: 0, spaceAfter: 120 }));
    var methodEl = clone.querySelector('p.small.muted');
    var methodText = methodEl ? wordCleanText(methodEl) : '計算方法：主特徵向量法；C.I.＝(λmax−n)/(n−1)，C.R.＝C.I.／R.I.，C.R. ≦ 0.1 為有效。';
    blocks.push(D.bodyPara(methodText));
    var sectionTitles = [];
    clone.querySelectorAll('h3').forEach(function (h) {
      var m = wordCleanText(h).match(/^第(\d+)節\s*(.*)$/);
      if (m) sectionTitles.push('第' + chineseNumeral(parseInt(m[1], 10)) + '節 ' + m[2]);
    });
    if (sectionTitles.length) blocks.push(D.bodyPara('本章共分' + sectionTitles.length + '節：' + sectionTitles.join('；') + '。'));
    var tableNo = 0, currentSection = '', currentGroup = '全體', lastH3 = '', lastH4 = '', lastH5 = '', seenMethod = false;
    function groupFromSection(title) {
      return title.replace(/^第\d+節\s*/, '').replace(/問卷結果$/, '') || '全體';
    }
    function captionFor(tbl) {
      var headerCount = tbl.querySelectorAll('tr')[0] ? tbl.querySelectorAll('tr')[0].querySelectorAll('th,td').length : 0;
      var rowCount = tbl.querySelectorAll('tr').length - 1;
      var hasCRH = false;
      if (tbl.querySelectorAll('tr')[0]) tbl.querySelectorAll('tr')[0].querySelectorAll('th,td').forEach(function (c) { if (wordCleanText(c).indexOf('C.R.H.') >= 0) hasCRH = true; });
      if (lastH3 === '樣本總覽') return '基本資料分析表';
      if (lastH4 === '無效問卷清單') return '無效問卷清單';
      if (lastH4.indexOf('分組與背景分布') >= 0) return '分組與背景分布';
      if (lastH4.indexOf('之下子構面') >= 0) {
        var dim = lastH4.replace('之下子構面', '');
        return dim + '之下' + (headerCount - 3) + '個子構面分析結果—' + currentGroup;
      }
      if (lastH4.indexOf('全域權重與排行') >= 0) return rowCount + '項構面分析結果—' + currentGroup;
      if (lastH4.indexOf('相依前後') >= 0) return '相依前後全域權重比較';
      if (lastH4.indexOf('相依修正後子構面') >= 0) return (lastH5 ? lastH5 + '相依修正後區域權重平均' : '相依修正後子構面平均');
      if (currentSection.indexOf('相依修正') >= 0 && !lastH4) return '相依修正有效性檢驗';
      if (currentSection.indexOf('評分') >= 0) return '方案／客戶評分結果';
      if (currentSection.indexOf('各分組結果比對') >= 0) return '各分組全域權重比對';
      if (!lastH4 && !lastH5 && currentSection) return (headerCount - 3 - (hasCRH ? 1 : 0)) + '大主構面之分析結果—' + currentGroup;
      if (lastH4) return lastH4;
      return currentSection || '分析結果';
    }
    function tableBlock(tbl) {
      var rows = [];
      tbl.querySelectorAll('tr').forEach(function (tr) {
        var cells = [];
        tr.querySelectorAll('th,td').forEach(function (cell) {
          cells.push({ t: wordCleanText(cell), bold: cell.tagName.toLowerCase() === 'th', align: cell.classList.contains('num') ? 'right' : 'left' });
        });
        if (cells.length) rows.push(cells);
      });
      if (!rows.length) return '';
      return D.table(rows[0], rows.slice(1));
    }
    var inAppendix = false;
    function walk(node) {
      node.childNodes.forEach(function (child) {
        if (inAppendix) return;
        if (child.nodeType !== 1) return;
        var tag = child.tagName.toLowerCase();
        if (child.classList && (child.classList.contains('bar-row') || child.classList.contains('bar-track'))) return;
        if (tag === 'h2') return;
        if (tag === 'h3') {
          var txt = wordCleanText(child);
          var m = txt.match(/^第(\d+)節\s*(.*)$/);
          if (txt.indexOf('附錄') === 0) { inAppendix = true; return; }
          if (m) { currentSection = txt; currentGroup = groupFromSection(txt); lastH3 = ''; lastH4 = ''; lastH5 = ''; blocks.push(D.heading2('第' + chineseNumeral(parseInt(m[1], 10)) + '節 ' + m[2])); return; }
          lastH3 = txt; lastH4 = ''; lastH5 = ''; blocks.push(D.boldPara(txt)); return;
        }
        if (tag === 'h4') { lastH4 = wordCleanText(child).replace(/（[^）]*格式）/g, '').trim(); lastH5 = ''; blocks.push(D.boldPara(lastH4)); return; }
        if (tag === 'h5') { lastH5 = wordCleanText(child); blocks.push(D.boldPara(lastH5)); return; }
        if (tag === 'p') {
          var ptxt = wordCleanText(child);
          if (!ptxt) return;
          if (!seenMethod && child.classList.contains('small') && child.classList.contains('muted')) { seenMethod = true; return; }
          blocks.push(D.bodyPara(ptxt)); return;
        }
        if (tag === 'ol' || tag === 'ul') {
          child.querySelectorAll('li').forEach(function (li, i) {
            var ltxt = wordCleanText(li);
            if (ltxt) blocks.push(D.bodyPara((tag === 'ol' ? (i + 1) + '. ' : '• ') + ltxt));
          });
          return;
        }
        if (tag === 'table') {
          tableNo++;
          blocks.push(D.captionPara('表 4.' + tableNo + ' ' + captionFor(child)));
          var tb = tableBlock(child);
          if (tb) blocks.push(tb);
          lastH4 = ''; lastH5 = '';
          return;
        }
        walk(child);
      });
    }
    walk(clone);
    blocks.push(D.bodyPara('註：本 Word 版不含長條圖，圖表請見網站報告；所有權重、平均與排序數據均已列於各表中。'));
    return D.buildDocx(blocks, (cfg.studyTitle || 'AHP') + '分析報告');
  }
  function downloadBlob(filename, bytes, type) {
    var blob = new Blob([bytes], { type: type });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  if ($('btnDownloadWord')) $('btnDownloadWord').addEventListener('click', function () {
    try {
      var bytes = buildWordReport();
      downloadBlob('ahp_analysis_report.docx', bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } catch (e) { alert('Word 報告產生失敗：' + e.message); }
  });

  // ---------- 示範資料（依目前架構動態產生，不再寫死 4×4） ----------
  function demoWeightVector(n, pattern) {
    var w = [];
    for (var i = 0; i < n; i++) w.push(pattern[i % pattern.length] + i * 0.01);
    var s = w.reduce(function (a, b) { return a + b; }, 0);
    return w.map(function (v) { return v / s; });
  }
  $('btnLoadDemo').addEventListener('click', function () {
    var cfg = activeConfig(), structure = structureOf(cfg);
    var dims = structure.dimensions;
    var demoGroups = (cfg.groupOptions || []).slice(0, 2);
    if (demoGroups.length < 2) demoGroups = [demoGroups[0] || '組別一', '組別二'];
    var mainPatterns = [[0.40, 0.20, 0.25, 0.15], [0.15, 0.35, 0.30, 0.20], [0.45, 0.15, 0.25, 0.15], [0.20, 0.20, 0.35, 0.25]];
    var subPatterns = [[0.30, 0.20, 0.25, 0.25], [0.35, 0.20, 0.20, 0.25], [0.25, 0.15, 0.30, 0.30], [0.35, 0.15, 0.30, 0.20]];
    var records = [];
    for (var idx = 0; idx < 8; idx++) {
      var comps = { main: AHP.comparisonsFromWeights(demoWeightVector(dims.length, mainPatterns[idx % 4])) };
      dims.forEach(function (d, di) { comps['sub' + di] = AHP.comparisonsFromWeights(demoWeightVector(d.items.length, subPatterns[(idx + di) % 4])); });
      if (idx === 7 && dims.length >= 3) { comps.main['0-1'] = 9; comps.main['1-2'] = 9; comps.main['0-2'] = -9; }
      var bg = {};
      (cfg.backgroundFields || []).forEach(function (f, fi) {
        bg[f.key] = (f.options && f.options.length) ? f.options[(idx + fi) % f.options.length] : '';
      });
      var demoRec = { id: 'DEMO0' + (idx + 1), submitted_at: new Date(Date.now() - (8 - idx) * 86400000).toISOString(), group: demoGroups[idx < 4 ? 0 : 1], background: bg, comparisons: comps, structure: structure, demo: true };
      if (featuresOf(cfg).dependency && (cfg.dependencies || []).length) {
        var depComps = {};
        (cfg.dependencies || []).forEach(function (entry, ei) {
          depComps['dep' + ei] = AHP.comparisonsFromWeights(demoWeightVector((entry.items || []).length, [0.5, 0.3, 0.2]));
        });
        demoRec.dependencies = depComps;
      }
      records.push(demoRec);
    }
    currentRecords = records; currentSource = 'demo';
    var invalidNote = dims.length >= 3 ? '最後一筆刻意設為不一致，示範無效問卷排除效果。' : '主構面少於 3 項時一致性恆為 0，故無法示範無效筆數。';
    $('srcHint').textContent = '已載入 8 筆合成示範資料（依目前 ' + dims.length + ' 構面架構動態產生；' + invalidNote + '）。示範資料只存在目前頁面，不會寫入 Sheet 或本機，重新整理即消失。';
    renderRecords();
  });

  // ---------- 後台：方案／客戶評分（僅開啟評分功能時使用；資料只存在本機瀏覽器） ----------
  function loadScoring() {
    try { var v = JSON.parse(localStorage.getItem('ahp_scoring_v3') || 'null'); if (v && v.customers) return v.customers; } catch (e) {}
    return [];
  }
  function readScoringEditor() {
    var customers = [];
    document.querySelectorAll('[data-score-cust-name]').forEach(function (nameEl, ci) {
      var scores = {};
      document.querySelectorAll('[data-score-cust="' + ci + '"]').forEach(function (el) {
        var v = parseInt(el.value, 10);
        if (!isNaN(v)) scores[el.getAttribute('data-score-factor')] = v;
      });
      customers.push({ name: nameEl.value, scores: scores });
    });
    return customers;
  }
  function renderScoringEditor(draft) {
    if (!$('scoringEditor')) return;
    var cfg = activeConfig();
    if (!featuresOf(cfg).scoring) {
      $('scoringEditor').innerHTML = '<p class="muted">本研究未開啟評分功能。請先到「研究設定」勾選「開啟方案／客戶評分」，再回來填評分表。</p>';
      return;
    }
    var customers = draft || loadScoring();
    if (!customers.length) customers = [{ name: '客戶A', scores: {} }, { name: '客戶B', scores: {} }];
    var dims = cfg.dimensions;
    var h = '<p class="small muted">每一列是一個因子，每一欄是一位客戶／方案，評分 1–5 分（分數越高越好）。報告產生時會用最終全域權重（相依開啟時用相依修正後權重，否則用未相依權重）算加權總分與排序。評分表只存在這台瀏覽器，報告 HTML 下載後會把算好的評分結果一併帶走。</p>';
    h += '<table><tr><th>主構面 — 因子</th>' + customers.map(function (c, ci) { return '<th><input data-score-cust-name="' + ci + '" type="text" value="' + esc(c.name) + '" style="width:110px"></th>'; }).join('') + '</tr>';
    dims.forEach(function (d, di) {
      d.items.forEach(function (it, ii) {
        var key = di + '-' + ii;
        h += '<tr><td>' + esc(d.name) + ' — ' + esc(it) + '</td>' + customers.map(function (c, ci) {
          var v = (c.scores && c.scores[key] !== undefined) ? c.scores[key] : '';
          return '<td><input data-score-cust="' + ci + '" data-score-factor="' + key + '" type="number" min="1" max="5" step="1" value="' + v + '" style="width:70px"></td>';
        }).join('') + '</tr>';
      });
    });
    h += '</table>';
    h += '<div style="margin-top:10px"><button class="secondary" id="btnAddScoringCust">新增客戶／方案</button> <button class="secondary danger" id="btnDelScoringCust">刪除最後一位</button> <button class="secondary" id="btnLoadScoringExample">載入汽車零件範例評分（A／B／C）</button></div>';
    $('scoringEditor').innerHTML = h;
    $('btnAddScoringCust').addEventListener('click', function () { var cs = readScoringEditor(); cs.push({ name: '客戶' + String.fromCharCode(65 + cs.length), scores: {} }); renderScoringEditor(cs); });
    $('btnDelScoringCust').addEventListener('click', function () { var cs = readScoringEditor(); if (cs.length > 1) cs.pop(); renderScoringEditor(cs); });
    $('btnLoadScoringExample').addEventListener('click', function () {
      var preset = (baseConfig().presets && baseConfig().presets.auto);
      if (!preset || !preset.scoringExample) { alert('config.js 尚未內含範例評分。'); return; }
      var cur = activeConfig();
      var sameStruct = JSON.stringify(cur.dimensions.map(function (d) { return d.items; })) === JSON.stringify(preset.dimensions.map(function (d) { return d.items; }));
      if (!sameStruct) { alert('目前架構不是汽車零件範本，無法載入範例評分。請先在「研究設定」載入汽車零件範本。'); return; }
      renderScoringEditor(clone(preset.scoringExample));
      $('scoringMsg').textContent = '已載入範例評分，請按「儲存評分」後再產生報告。';
    });
  }
  if ($('btnSaveScoring')) $('btnSaveScoring').addEventListener('click', function () {
    var cs = readScoringEditor();
    try { localStorage.setItem('ahp_scoring_v3', JSON.stringify({ customers: cs })); } catch (e) {}
    $('scoringMsg').textContent = '評分已儲存（本機瀏覽器）。產生報告時會一併列出評分結果。';
  });

  // ---------- 後台：研究設定（構面增刪、定義、背景欄位、衍生分組規則皆可編） ----------
  function renderSettingsEditor(draft) {
    var cfg = draft || activeConfig();
    var h = '<label>研究標題</label><input id="setTitle" type="text" value="' + esc(cfg.studyTitle) + '">';
    h += '<label>副標題</label><input id="setSubtitle" type="text" value="' + esc(cfg.studySubtitle || '') + '">';
    var feats0 = featuresOf(cfg);
    h += '<h3>功能開關（依研究主題開啟；預設全關，行為與 v2 相同）</h3>'
      + '<label style="font-weight:normal"><input type="checkbox" id="setFeatureDep"' + (feats0.dependency ? ' checked' : '') + '> 開啟相依修正（關聯性 AHP 第二階段：因子間影響力比較＋矩陣乘積修正）</label>'
      + '<label style="font-weight:normal"><input type="checkbox" id="setFeatureScoring"' + (feats0.scoring ? ' checked' : '') + '> 開啟方案／客戶評分（後台評分表：每因子 1–5 分，加權總分排序）</label>'
      + '<p class="small muted">開關存在 config.js 的 features 裡。相依關閉時，第二階段問卷與相依報告都不出現；評分關閉時，評分頁不顯示。兩個開關獨立：只開評分時，評分用未相依權重算。</p>';
    h += '<label>主要分組欄位名稱（留空表示不使用主要分組，改用背景欄位分組）</label><input id="setGroupLabel" type="text" value="' + esc(cfg.groupLabel || '') + '">';
    h += '<label>主要分組選項（每行一個）</label><textarea id="setGroups">' + esc((cfg.groupOptions || []).join('\n')) + '</textarea>';
    h += '<h3>背景欄位（填答者基本資料；分組方案可任選其中一個欄位）</h3><div id="setBgList">';
    (cfg.backgroundFields || []).forEach(function (f, fi) {
      h += '<div class="card" style="margin:8px 0"><label>欄位代碼（英文，資料欄位鍵，改動後舊資料的該欄位將對不上）</label><input data-bgkey="' + fi + '" type="text" value="' + esc(f.key) + '">'
        + '<label>欄位名稱</label><input data-bglabel="' + fi + '" type="text" value="' + esc(f.label) + '">'
        + '<label>選項（每行一個）</label><textarea data-bgopts="' + fi + '">' + esc((f.options || []).join('\n')) + '</textarea>'
        + '<button class="secondary danger" data-bgdel="' + fi + '">刪除此欄位</button></div>';
    });
    h += '</div><button class="secondary" id="btnAddBg">新增背景欄位</button>';
    h += '<h3>主構面與子構面（含定義說明，問卷會顯示、報告附錄會列出）</h3><div id="setDimList">';
    cfg.dimensions.forEach(function (d, di) {
      h += '<div class="card" style="margin:8px 0"><h4>主構面 ' + (di + 1) + '</h4><label>名稱</label><input data-dim="' + di + '" type="text" value="' + esc(d.name) + '">'
        + '<label>構面定義（可留空）</label><input data-dimdesc="' + di + '" type="text" value="' + esc(dimDesc(d)) + '">'
        + '<label>子構面（每行一個）</label><textarea data-dimitems="' + di + '">' + esc(d.items.join('\n')) + '</textarea>'
        + '<label>子構面定義（每行一個，與上一欄一一對應，可留空行）</label><textarea data-dimitemdescs="' + di + '">' + esc((d.itemDescs || []).join('\n')) + '</textarea>'
        + '<button class="secondary danger" data-dimdel="' + di + '">刪除此構面</button></div>';
    });
    h += '</div><button class="secondary" id="btnAddDim">新增主構面</button>';
    h += '<h3>相依關係（僅開啟相依修正時生效；每列是一個基準因子）</h3><p class="small muted">每列選一個構面、一個基準因子，並勾選要一起比較的因子（必須包含基準因子本身；未勾選基準時儲存會自動補上）。問卷第二階段會對每列的勾選因子做兩兩影響力比較，算出影響權重後填進該構面的相依矩陣。同一構面、同一基準因子請只寫一列（重複時以後列為準）。未列出的構面／基準因子保持獨立，修正時該欄為單位向量。</p><div id="setDepList">';
    (cfg.dependencies || []).forEach(function (entry, ei) {
      var dimIdx = entry.dimensionIndex, dim = cfg.dimensions[dimIdx];
      h += '<div class="card" style="margin:8px 0" data-deprow="' + ei + '"><label>構面</label><select data-depdim="' + ei + '">'
        + cfg.dimensions.map(function (d, di) { return '<option value="' + di + '"' + (di === dimIdx ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select>';
      h += '<label>基準因子</label><select data-depbase="' + ei + '">';
      if (dim) dim.items.forEach(function (it, ii) { h += '<option value="' + ii + '"' + (ii === entry.baseItemIndex ? ' selected' : '') + '>' + esc(it) + '</option>'; });
      h += '</select><label>一起比較的因子（勾選）</label><div>';
      if (dim) dim.items.forEach(function (it, ii) {
        var checked = (entry.items || []).indexOf(ii) >= 0 || ii === entry.baseItemIndex;
        h += '<label style="display:inline-block;margin-right:12px;font-weight:normal"><input type="checkbox" data-depitem="' + ei + '" value="' + ii + '"' + (checked ? ' checked' : '') + '> ' + esc(it) + '</label>';
      });
      h += '</div><button class="secondary danger" data-depdel="' + ei + '">刪除此相依列</button></div>';
    });
    h += '</div><button class="secondary" id="btnAddDep">新增相依列</button>';
    h += '<h3>衍生分組規則（把原始選項合併／二分，例如年資三區間併成「20年以下」；留空表示不衍生，直接用原始值分組）</h3><p class="small muted">規則寫法：每個衍生組填名稱＋原始值（每行一個，必須與上面該欄位的選項文字完全相同）。報告分組時，符合第一個規則的原始值就歸到該衍生組；對不上任何規則的會標示「未歸類」。</p><div id="setRuleList">';
    schemeList(cfg).forEach(function (s) {
      var rules = (cfg.groupingRules || {})[s.field] || [];
      h += '<div class="card" style="margin:8px 0"><h4>' + esc(s.label) + '（欄位：' + esc(s.field) + '）</h4><div data-rulefield="' + esc(s.field) + '">';
      rules.forEach(function (r, ri) {
        h += '<div style="margin:8px 0"><label>衍生組名稱</label><input data-rulename="' + esc(s.field) + ':' + ri + '" type="text" value="' + esc(r.name) + '">'
          + '<label>原始值（每行一個）</label><textarea data-rulevals="' + esc(s.field) + ':' + ri + '">' + esc((r.values || []).join('\n')) + '</textarea>'
          + '<button class="secondary danger" data-ruledel="' + esc(s.field) + ':' + ri + '">刪除此衍生組</button></div>';
      });
      h += '</div><button class="secondary" data-ruleadd="' + esc(s.field) + '">新增衍生組</button></div>';
    });
    h += '</div>';
    $('settingsEditor').innerHTML = h;
    // 設定頁內的增刪按鈕：先讀出目前編輯狀態再改，避免已打的字被重繪洗掉。
    var addBg = $('btnAddBg'); if (addBg) addBg.addEventListener('click', function () { var c = readSettingsEditor(); c.backgroundFields.push({ key: 'field' + (c.backgroundFields.length + 1), label: '新欄位', options: ['選項一', '選項二'] }); renderSettingsEditor(c); });
    var addDim = $('btnAddDim'); if (addDim) addDim.addEventListener('click', function () { var c = readSettingsEditor(); c.dimensions.push({ name: '新構面', desc: '', items: ['新指標一', '新指標二'], itemDescs: [] }); renderSettingsEditor(c); });
    var addDep = $('btnAddDep'); if (addDep) addDep.addEventListener('click', function () { var c = readSettingsEditor(); if (!c.dependencies) c.dependencies = []; c.dependencies.push({ dimensionIndex: 0, baseItemIndex: 0, items: [0] }); renderSettingsEditor(c); });
    document.querySelectorAll('[data-depdel]').forEach(function (b) { b.addEventListener('click', function () { var c = readSettingsEditor(); c.dependencies.splice(parseInt(b.getAttribute('data-depdel'), 10), 1); renderSettingsEditor(c); }); });
    document.querySelectorAll('[data-depdim]').forEach(function (s) { s.addEventListener('change', function () { var c = readSettingsEditor(); renderSettingsEditor(c); }); });
    document.querySelectorAll('[data-bgdel]').forEach(function (b) { b.addEventListener('click', function () { var c = readSettingsEditor(); c.backgroundFields.splice(parseInt(b.getAttribute('data-bgdel'), 10), 1); renderSettingsEditor(c); }); });
    document.querySelectorAll('[data-dimdel]').forEach(function (b) { b.addEventListener('click', function () { var c = readSettingsEditor(); c.dimensions.splice(parseInt(b.getAttribute('data-dimdel'), 10), 1); renderSettingsEditor(c); }); });
    document.querySelectorAll('[data-ruleadd]').forEach(function (b) { b.addEventListener('click', function () { var c = readSettingsEditor(); var f = b.getAttribute('data-ruleadd'); if (!c.groupingRules) c.groupingRules = {}; if (!c.groupingRules[f]) c.groupingRules[f] = []; c.groupingRules[f].push({ name: '新分組', values: [] }); renderSettingsEditor(c); }); });
    document.querySelectorAll('[data-ruledel]').forEach(function (b) { b.addEventListener('click', function () { var c = readSettingsEditor(); var parts = b.getAttribute('data-ruledel').split(':'); if (c.groupingRules && c.groupingRules[parts[0]]) c.groupingRules[parts[0]].splice(parseInt(parts[1], 10), 1); renderSettingsEditor(c); }); });
  }
  function readSettingsEditor() {
    var cfg = clone(activeConfig());
    cfg.studyTitle = $('setTitle').value; cfg.studySubtitle = $('setSubtitle').value;
    cfg.features = { dependency: !!($('setFeatureDep') && $('setFeatureDep').checked), scoring: !!($('setFeatureScoring') && $('setFeatureScoring').checked) };
    cfg.dependencies = [];
    document.querySelectorAll('[data-deprow]').forEach(function (row) {
      var dimSel = row.querySelector('[data-depdim]'), baseSel = row.querySelector('[data-depbase]');
      if (!dimSel || !baseSel) return;
      var di = parseInt(dimSel.value, 10), base = parseInt(baseSel.value, 10);
      var items = [];
      row.querySelectorAll('[data-depitem]:checked').forEach(function (cb) { items.push(parseInt(cb.value, 10)); });
      if (items.indexOf(base) < 0) items.unshift(base);
      items.sort(function (a, b) { return a - b; });
      cfg.dependencies.push({ dimensionIndex: di, baseItemIndex: base, items: items });
    });
    cfg.groupLabel = $('setGroupLabel').value;
    cfg.groupOptions = $('setGroups').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var bgCount = document.querySelectorAll('[data-bgkey]').length;
    cfg.backgroundFields = [];
    for (var fi = 0; fi < bgCount; fi++) {
      var k = document.querySelector('[data-bgkey="' + fi + '"]').value.trim() || ('field' + (fi + 1));
      cfg.backgroundFields.push({ key: k, label: document.querySelector('[data-bglabel="' + fi + '"]').value, options: document.querySelector('[data-bgopts="' + fi + '"]').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) });
    }
    var dimCount = document.querySelectorAll('[data-dim]').length;
    cfg.dimensions = [];
    for (var di = 0; di < dimCount; di++) {
      var items = document.querySelector('[data-dimitems="' + di + '"]').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      var descs = document.querySelector('[data-dimitemdescs="' + di + '"]').value.split('\n').map(function (s) { return s.trim(); });
      while (descs.length < items.length) descs.push('');
      var dim = { name: document.querySelector('[data-dim="' + di + '"]').value, desc: document.querySelector('[data-dimdesc="' + di + '"]').value, items: items };
      if (descs.some(function (x) { return !!x; })) dim.itemDescs = descs.slice(0, items.length);
      cfg.dimensions.push(dim);
    }
    cfg.groupingRules = {};
    document.querySelectorAll('[data-rulefield]').forEach(function (wrap) {
      var field = wrap.getAttribute('data-rulefield');
      var rules = [];
      wrap.querySelectorAll('[data-rulename]').forEach(function (el) {
        var idx = el.getAttribute('data-rulename').split(':')[1];
        var valsEl = wrap.querySelector('[data-rulevals="' + field + ':' + idx + '"]');
        rules.push({ name: el.value, values: valsEl ? valsEl.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : [] });
      });
      if (rules.length) cfg.groupingRules[field] = rules;
    });
    return cfg;
  }
  function loadPreset(preset, msg) {
    var cfg = clone(activeConfig());
    ['studyTitle', 'studySubtitle', 'groupLabel', 'groupOptions', 'backgroundFields', 'groupingRules', 'dimensions', 'features', 'dependencies'].forEach(function (k) { if (preset[k] !== undefined) cfg[k] = clone(preset[k]); });
    try { localStorage.setItem('ahp_config_override', JSON.stringify(cfg)); } catch (e) {}
    renderFill(); renderSettingsEditor(); renderReportSchemes(); $('settingsMsg').textContent = msg;
  }
  $('btnLoadGeneric').addEventListener('click', function () {
    var cfg = clone(activeConfig()); cfg.dimensions = clone(baseConfig().genericDimensions); cfg.features = { dependency: false, scoring: false }; cfg.dependencies = [];
    try { localStorage.setItem('ahp_config_override', JSON.stringify(cfg)); } catch (e) {}
    renderFill(); renderSettingsEditor(); $('settingsMsg').textContent = '已載入通用範本到本機測試；正式部署請下載新的 config.js。';
  });
  $('btnLoadThesis').addEventListener('click', function () {
    var cfg = clone(activeConfig()); cfg.dimensions = clone(baseConfig().dimensions); cfg.features = { dependency: false, scoring: false }; cfg.dependencies = [];
    try { localStorage.setItem('ahp_config_override', JSON.stringify(cfg)); } catch (e) {}
    renderFill(); renderSettingsEditor(); $('settingsMsg').textContent = '已載入論文範本（特教資訊融入教學）到本機測試。';
  });
  if ($('btnLoadSMT')) $('btnLoadSMT').addEventListener('click', function () {
    var preset = (baseConfig().presets && baseConfig().presets.smt) || baseConfig().smtPreset;
    if (!preset) { alert('config.js 尚未內含 SMT 範本，請確認已更新到通用版 config.js。'); return; }
    loadPreset(preset, '已載入 SMT 生產效率範本到本機測試（含年資／職級衍生分組規則）；正式部署請下載新的 config.js。');
  });
  if ($('btnLoadAuto')) $('btnLoadAuto').addEventListener('click', function () {
    var preset = (baseConfig().presets && baseConfig().presets.auto);
    if (!preset) { alert('config.js 尚未內含汽車零件範本，請確認已更新到通用版 v3 config.js。'); return; }
    loadPreset(preset, '已載入汽車零件重要客戶範本到本機測試（含相依修正與評分開關、5 構面 × 16 因子、相依關係）；正式部署請下載新的 config.js。');
    if (preset.scoringExample) { try { localStorage.setItem('ahp_scoring_v3', JSON.stringify({ customers: preset.scoringExample })); } catch (e) {} }
    renderScoringEditor(); $('settingsMsg').textContent = '已載入汽車零件範本（含範例評分 A／B／C，請在「方案／客戶評分」頁確認後再改成自己的客戶）；正式部署請下載新的 config.js。';
  });
  $('btnSaveSettingsLocal').addEventListener('click', function () {
    var cfg = readSettingsEditor();
    try { localStorage.setItem('ahp_config_override', JSON.stringify(cfg)); } catch (e) {}
    renderFill(); renderSettingsEditor(); renderReportSchemes(); renderScoringEditor(); $('settingsMsg').textContent = '已存到本機測試（填答頁已更新）。正式部署仍需下載 config.js。';
  });
  $('btnDownloadConfig').addEventListener('click', function () {
    var cfg = readSettingsEditor(), base = baseConfig();
    var text = '// 研究者部署設定（由後台「研究設定」匯出，請覆蓋 repo 根目錄的 config.js 後重新部署）\nwindow.AHP_CONFIG = {\n'
      + '  studyTitle: ' + JSON.stringify(cfg.studyTitle) + ',\n'
      + '  studySubtitle: ' + JSON.stringify(cfg.studySubtitle) + ',\n'
      + '  appsScriptUrl: ' + JSON.stringify(base.appsScriptUrl || '') + ',\n'
      + '  adminCode: ' + JSON.stringify(base.adminCode) + ',\n'
      + '  groupLabel: ' + JSON.stringify(cfg.groupLabel) + ',\n'
      + '  groupOptions: ' + JSON.stringify(cfg.groupOptions) + ',\n'
      + '  backgroundFields: ' + JSON.stringify(cfg.backgroundFields) + ',\n'
      + '  groupingRules: ' + JSON.stringify(cfg.groupingRules || {}) + ',\n'
      + '  features: ' + JSON.stringify(cfg.features || { dependency: false, scoring: false }) + ',\n'
      + '  dependencies: ' + JSON.stringify(cfg.dependencies || []) + ',\n'
      + '  dimensions: ' + JSON.stringify(cfg.dimensions) + ',\n'
      + '  genericDimensions: ' + JSON.stringify(base.genericDimensions) + ',\n'
      + '  presets: ' + JSON.stringify(base.presets || {}) + '\n};\n';
    download('config.js', text, 'text/javascript;charset=utf-8');
  });

  // ---------- 檢視切換與啟動 ----------
  document.querySelectorAll('[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-view]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      ['fill', 'admin', 'deploy'].forEach(function (v) { $('view-' + v).hidden = (v !== btn.getAttribute('data-view')); });
    });
  });
  document.querySelectorAll('[data-atab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-atab]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      ['records', 'report', 'scoring', 'settings'].forEach(function (t) { if ($('atab-' + t)) $('atab-' + t).hidden = (t !== btn.getAttribute('data-atab')); });
    });
  });
  $('btnAdminUnlock').addEventListener('click', function () {
    var base = baseConfig();
    if ($('adminCodeInput').value === base.adminCode) {
      $('adminLock').hidden = true; $('adminBody').hidden = false;
      $('adminWarn').innerHTML = base.adminCode === '請改成自己的後台密碼'
        ? '<p class="warn">警告：你還在用預設後台密碼，請先到 config.js 改掉再正式發連結。</p>' : '';
      renderSettingsEditor(); renderReportSchemes(); renderScoringEditor(); loadLocal();
    } else {
      $('adminLockMsg').textContent = '密碼不正確，請檢查 config.js 的 adminCode。';
    }
  });
  renderFill();
})();
