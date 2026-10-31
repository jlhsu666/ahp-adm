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
      if (ov) { var o = JSON.parse(ov); o.genericDimensions = baseConfig().genericDimensions; return o; }
    } catch (e) {}
    return baseConfig();
  }
  function structureOf(cfg) { return { dimensions: clone(cfg.dimensions) }; }
  function pairs(n) { var out = []; for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) out.push([i, j]); return out; }
  function scaleOptions() {
    var opts = '<option value="">請選擇</option>';
    var labels = { 9: '絕對重要', 7: '極度重要', 5: '頗為重要', 3: '稍微重要', 1: '同等重要' };
    for (var k = 9; k >= 2; k--) opts += '<option value="' + k + '">左方' + (labels[k] || '重要') + '（' + k + '）</option>';
    opts += '<option value="1">同等重要（1）</option>';
    for (var k2 = 2; k2 <= 9; k2++) opts += '<option value="' + (-k2) + '">右方' + (labels[k2] || '重要') + '（' + k2 + '）</option>';
    return opts;
  }

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
    $('fGroupLabel').textContent = cfg.groupLabel || '分組';
    $('fGroup').innerHTML = (cfg.groupOptions || []).map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
    $('fBackground').innerHTML = (cfg.backgroundFields || []).map(function (f) {
      return '<div><label>' + esc(f.label) + '</label><select data-bg="' + esc(f.key) + '"><option value="">請選擇</option>'
        + f.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></div>';
    }).join('');
    var html = '';
    function matrixBlock(key, title, names) {
      var h = '<h3>' + esc(title) + '</h3>';
      pairs(names.length).forEach(function (p) {
        h += '<div class="pair"><div class="names"><span>' + esc(names[p[0]]) + '</span><span>' + esc(names[p[1]]) + '</span></div>'
          + '<select class="pair-select" data-matrix="' + key + '" data-pair="' + p[0] + '-' + p[1] + '">' + scaleOptions() + '</select>'
          + '<div class="scale">左方 9 … 1 同等 … 右方 9（選「左方」表示左項較重要，選「右方」表示右項較重要）</div></div>';
      });
      return h;
    }
    html += matrixBlock('main', '主構面成對比較', dims.map(function (d) { return d.name; }));
    dims.forEach(function (d, di) { html += matrixBlock('sub' + di, d.name + '之下子構面成對比較', d.items); });
    $('fillMatrices').innerHTML = html;
    document.querySelectorAll('.pair-select').forEach(function (el) { el.addEventListener('change', updateProgress); });
    updateProgress();
  }
  function collectComparisons() {
    var comps = { main: {} };
    var missing = 0;
    document.querySelectorAll('.pair-select').forEach(function (el) {
      var key = el.getAttribute('data-matrix'), pair = el.getAttribute('data-pair');
      if (!el.value) { missing++; return; }
      if (!comps[key]) comps[key] = {};
      comps[key][pair] = parseInt(el.value, 10);
    });
    return { comps: comps, missing: missing };
  }
  function updateProgress() {
    var sels = document.querySelectorAll('.pair-select');
    var done = 0; sels.forEach(function (el) { if (el.value) done++; });
    var pct = sels.length ? Math.round(done / sels.length * 100) : 0;
    $('fillProgress').style.width = pct + '%';
    $('fillProgressText').textContent = '已完成 ' + done + ' / ' + sels.length + ' 題（' + pct + '%）';
  }
  function collectRecord() {
    var cfg = activeConfig();
    var bg = {};
    document.querySelectorAll('[data-bg]').forEach(function (el) { bg[el.getAttribute('data-bg')] = el.value; });
    return {
      id: '', submitted_at: new Date().toISOString(),
      group: $('fGroup').value, background: bg,
      comparisons: collectComparisons().comps,
      structure: structureOf(cfg), demo: false
    };
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
    h += '<h3>16 項全域排行（個人）</h3><ol>' + sorted.map(function (g) { return '<li>' + esc(g.dimension) + ' — ' + esc(g.item) + '：' + fmt(g.global) + '</li>'; }).join('') + '</ol>';
    h += '<p>整份問卷一致性：<b>' + (result.valid ? '<span class="ok">有效（5 張矩陣 C.R. 皆 ≦ 0.1）</span>' : '<span class="bad">未通過（有矩陣 C.R. &gt; 0.1，後台分析預設會排除）</span>') + '</b></p>';
    return h;
  }

  $('btnPreview').addEventListener('click', function () {
    var c = collectComparisons();
    if (c.missing) { alert('還有 ' + c.missing + ' 題未填，請填完再計算。'); return; }
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
    $('recGroupFilter').innerHTML = groups.map(function (g) { return '<option value="' + esc(g) + '">' + (g === 'all' ? '全部分組' : esc(g)) + '</option>'; }).join('');
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
  function groupSectionHTML(title, list, agg, structure) {
    var dims = structure.dimensions;
    var h = '<h3>' + esc(title) + '</h3>';
    h += '<p>有效問卷 ' + list.length + ' 份。主構面依權重排序：' + rankingSentence(dims.map(function (d) { return d.name; }), agg.mainAvg) + '</p>';
    h += '<p class="small muted">下表為逐人權重（論文表 9、15、21 格式）；C.I.／C.R. 為主構面矩陣之值；平均值為有效問卷的算術平均。</p>';
    h += '<table><tr><th>編號</th>' + dims.map(function (d) { return '<th class="num">' + esc(d.name) + '</th>'; }).join('') + '<th class="num">C.I.</th><th class="num">C.R.</th></tr>';
    list.forEach(function (x) {
      h += '<tr><td>' + esc(x.record.id) + '</td>' + x.result.main.weights.map(function (w) { return '<td class="num">' + fmt(w) + '</td>'; }).join('') + '<td class="num">' + fmt(x.result.main.ci) + '</td><td class="num">' + fmt(x.result.main.cr) + '</td></tr>';
    });
    h += '<tr><th>平均</th>' + agg.mainAvg.map(function (w) { return '<th class="num">' + fmt(w) + '</th>'; }).join('') + '<th></th><th></th></tr>';
    h += '<tr><th>排行</th>' + agg.mainRanks.map(function (r) { return '<th class="num">' + r + '</th>'; }).join('') + '<th></th><th></th></tr></table>';
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
    h += '<h4>全域權重與排行（論文表 14、20、26 格式）</h4><p class="small muted">全域權重＝主構面平均權重 × 子構面平均區域權重。</p>';
    h += '<table><tr><th>主構面</th><th>子構面</th><th class="num">區域權重</th><th class="num">全域權重</th><th class="num">排序</th></tr>';
    agg.global.forEach(function (g) {
      h += '<tr><td>' + esc(g.dimension) + '（' + fmt(g.dimensionWeight) + '）</td><td>' + esc(g.item) + '</td><td class="num">' + fmt(g.local) + '</td><td class="num">' + fmt(g.global) + '</td><td class="num">' + g.rank + '</td></tr>';
    });
    h += '</table>';
    var maxG = Math.max.apply(null, agg.global.map(function (g) { return g.global; }));
    h += '<h4>全域排行圖（論文圖 5、6、7 格式）</h4>' + barChart(agg.global.map(function (g) { return { label: g.dimension + ' — ' + g.item, value: g.global }; }), maxG);
    return h;
  }
  function generateReport() {
    var onlyValid = $('onlyValid').checked;
    var issued = parseInt($('issuedCount').value, 10);
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
    var groups = [];
    analysed.forEach(function (x) { if (groups.indexOf(x.record.group) < 0) groups.push(x.record.group); });
    // 分組順序盡量跟 config 的分組選項一致
    groups.sort(function (a, b) {
      var ia = (cfg.groupOptions || []).indexOf(a), ib = (cfg.groupOptions || []).indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    var h = '<div id="reportPrintArea"><h2>' + esc(cfg.studyTitle) + ' — 分析報告</h2>';
    h += '<p class="small muted">計算方法：主特徵向量法；C.I.＝(λmax−n)/(n−1)，C.R.＝C.I.／R.I.（n=4 時 R.I.＝0.90），C.R. ≦ 0.1 為有效；多人彙總為個人權重算術平均，全域權重＝主構面平均 × 區域平均。數值四捨五入至小數第三位，加總可能差 0.001；有效判定以未四捨五入值計算。</p>';
    if (diffCount) h += '<p class="warn">注意：有 ' + diffCount + ' 筆的研究架構與多數筆數不同，已排除在本次分析外（研究架構改變後，舊架構資料不應與新架構混算）。</p>';
    h += '<h3>樣本總覽</h3><table>';
    h += '<tr><th>項目</th><th class="num">份數</th></tr>';
    h += '<tr><td>回收份數（目前資料來源總筆數）</td><td class="num">' + all.length + '</td></tr>';
    if (!isNaN(issued) && issued > 0) h += '<tr><td>發放份數</td><td class="num">' + issued + '</td></tr><tr><td>回收率</td><td class="num">' + fmt(all.length / issued * 100, 1) + '%</td></tr>';
    h += '<tr><td>有效問卷（全部矩陣 C.R. ≦ 0.1）</td><td class="num">' + validAll.length + '</td></tr>';
    h += '<tr><td>無效問卷</td><td class="num">' + (same.length - validAll.length) + '</td></tr>';
    h += '<tr><td>本次分析納入份數' + (onlyValid ? '（只納入有效）' : '（納入全部）') + '</td><td class="num">' + analysed.length + '</td></tr></table>';
    var invalidList = same.filter(function (x) { return !x.result.valid; });
    h += '<h4>無效問卷清單</h4>';
    if (!invalidList.length) h += '<p>無。</p>';
    else h += '<table><tr><th>編號</th><th>分組</th><th>未通過的矩陣</th></tr>' + invalidList.map(function (x) { return '<tr><td>' + esc(x.record.id) + '</td><td>' + esc(x.record.group) + '</td><td>' + esc(failedMatrices(x).join('、')) + '</td></tr>'; }).join('') + '</table>';
    h += '<h4>分組與背景分布（以全部回收問卷計）</h4><table><tr><th>分組</th><th class="num">人數</th></tr>' + (function () {
      var counts = {};
      same.forEach(function (x) { counts[x.record.group] = (counts[x.record.group] || 0) + 1; });
      return Object.keys(counts).map(function (g) { return '<tr><td>' + esc(g) + '</td><td class="num">' + counts[g] + '</td></tr>'; }).join('');
    })() + '</table>';
    (cfg.backgroundFields || []).forEach(function (f) {
      var counts = {};
      same.forEach(function (x) { var v = (x.record.background || {})[f.key] || '未填'; counts[v] = (counts[v] || 0) + 1; });
      h += '<p class="small"><b>' + esc(f.label) + '：</b>' + Object.keys(counts).map(function (k) { return esc(k) + ' ' + counts[k] + ' 人'; }).join('，') + '</p>';
    });
    if (!analysed.length) { h += '<p class="bad">本次分析沒有可納入的問卷（可能全部皆為無效且已勾選只納入有效）。請取消勾選或檢查一致性。</p></div>'; $('reportArea').innerHTML = h; return; }
    h += '<h3>第一節 全體問卷結果</h3>';
    h += groupSectionHTML('全體', analysed, AHP.aggregate(structure, analysed), structure);
    groups.forEach(function (g, gi) {
      var sub = analysed.filter(function (x) { return x.record.group === g; });
      if (!sub.length) return;
      h += '<h3>第' + (gi + 2) + '節 ' + esc(g) + '問卷結果</h3>';
      h += groupSectionHTML(g, sub, AHP.aggregate(structure, sub), structure);
    });
    if (groups.length >= 2) {
      h += '<h3>第' + (groups.length + 2) + '節 各分組結果比對</h3>';
      var aggs = {};
      groups.forEach(function (g) { aggs[g] = AHP.aggregate(structure, analysed.filter(function (x) { return x.record.group === g; })); });
      h += '<p>各組第一名：' + groups.map(function (g) { var top = aggs[g].global[0]; return esc(g) + '為「' + esc(top.item) + '」（' + fmt(top.global) + '）'; }).join('；') + '。</p>';
      // 以第一組的全域順序為列順，附各組權重與排行、權重差（第二組減第一組，僅兩組時有意義）
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

  // ---------- 示範資料 ----------
  function demoWeights(base, jitter) {
    return base.map(function (w, i) { var v = w + (jitter[i] || 0); return v > 0.05 ? v : 0.05; }).map(function (v, _, arr) { var s = arr.reduce(function (a, b) { return a + b; }, 0); return v / s; });
  }
  $('btnLoadDemo').addEventListener('click', function () {
    var cfg = activeConfig(), structure = structureOf(cfg);
    var specs = [
      { group: cfg.groupOptions[0], main: [0.40, 0.20, 0.25, 0.15], subs: [[0.30, 0.20, 0.25, 0.25], [0.35, 0.20, 0.20, 0.25], [0.25, 0.15, 0.30, 0.30], [0.35, 0.15, 0.30, 0.20]] },
      { group: cfg.groupOptions[0], main: [0.15, 0.35, 0.30, 0.20], subs: [[0.25, 0.25, 0.30, 0.20], [0.40, 0.20, 0.20, 0.20], [0.30, 0.10, 0.30, 0.30], [0.30, 0.20, 0.30, 0.20]] },
      { group: cfg.groupOptions[0], main: [0.45, 0.15, 0.25, 0.15], subs: [[0.35, 0.15, 0.25, 0.25], [0.30, 0.25, 0.20, 0.25], [0.20, 0.20, 0.35, 0.25], [0.40, 0.10, 0.25, 0.25]] },
      { group: cfg.groupOptions[0], main: [0.20, 0.20, 0.35, 0.25], subs: [[0.20, 0.30, 0.25, 0.25], [0.35, 0.30, 0.15, 0.20], [0.35, 0.15, 0.25, 0.25], [0.30, 0.20, 0.35, 0.15]] },
      { group: cfg.groupOptions[1] || '組別二', main: [0.20, 0.30, 0.20, 0.30], subs: [[0.25, 0.15, 0.20, 0.40], [0.30, 0.20, 0.20, 0.30], [0.25, 0.10, 0.35, 0.30], [0.35, 0.20, 0.25, 0.20]] },
      { group: cfg.groupOptions[1] || '組別二', main: [0.15, 0.25, 0.35, 0.25], subs: [[0.30, 0.10, 0.20, 0.40], [0.25, 0.20, 0.25, 0.30], [0.30, 0.15, 0.30, 0.25], [0.40, 0.15, 0.30, 0.15]] },
      { group: cfg.groupOptions[1] || '組別二', main: [0.30, 0.20, 0.15, 0.35], subs: [[0.20, 0.20, 0.20, 0.40], [0.35, 0.15, 0.20, 0.30], [0.25, 0.15, 0.30, 0.30], [0.30, 0.25, 0.25, 0.20]] },
      { group: cfg.groupOptions[1] || '組別二', main: [0.25, 0.27, 0.25, 0.23], subs: [[0.28, 0.12, 0.18, 0.42], [0.32, 0.18, 0.22, 0.28], [0.28, 0.12, 0.32, 0.28], [0.38, 0.18, 0.27, 0.17]] }
    ];
    var records = specs.map(function (sp, idx) {
      var comps = { main: AHP.comparisonsFromWeights(sp.main) };
      sp.subs.forEach(function (w, di) { comps['sub' + di] = AHP.comparisonsFromWeights(w); });
      if (idx === 7) { comps.main['0-1'] = 9; comps.main['1-2'] = 9; comps.main['0-2'] = -9; }
      return { id: 'DEMO0' + (idx + 1), submitted_at: new Date(Date.now() - (8 - idx) * 86400000).toISOString(), group: sp.group, background: { sex: idx % 2 ? '女性' : '男性', age: '31~40 歲', education: '大學', years: '11~20 年' }, comparisons: comps, structure: structure, demo: true };
    });
    currentRecords = records; currentSource = 'demo';
    $('srcHint').textContent = '已載入 8 筆合成示範資料（最後一筆刻意設為不一致，示範無效問卷排除效果）。示範資料只存在目前頁面，不會寫入 Sheet 或本機，重新整理即消失。';
    renderRecords();
  });

  // ---------- 後台：研究設定 ----------
  function renderSettingsEditor() {
    var cfg = activeConfig();
    var h = '<label>研究標題</label><input id="setTitle" type="text" value="' + esc(cfg.studyTitle) + '">';
    h += '<label>副標題</label><input id="setSubtitle" type="text" value="' + esc(cfg.studySubtitle || '') + '">';
    h += '<label>分組欄位名稱</label><input id="setGroupLabel" type="text" value="' + esc(cfg.groupLabel) + '">';
    h += '<label>分組選項（每行一個）</label><textarea id="setGroups">' + esc((cfg.groupOptions || []).join('\n')) + '</textarea>';
    h += '<div id="setDims"></div>';
    cfg.dimensions.forEach(function (d, di) {
      h += '<h4>主構面 ' + (di + 1) + '</h4><label>名稱</label><input data-dim="' + di + '" type="text" value="' + esc(d.name) + '">';
      h += '<label>子構面（每行一個）</label><textarea data-dimitems="' + di + '">' + esc(d.items.join('\n')) + '</textarea>';
    });
    $('settingsEditor').innerHTML = h;
  }
  function readSettingsEditor() {
    var cfg = clone(activeConfig());
    cfg.studyTitle = $('setTitle').value; cfg.studySubtitle = $('setSubtitle').value;
    cfg.groupLabel = $('setGroupLabel').value;
    cfg.groupOptions = $('setGroups').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    cfg.dimensions = cfg.dimensions.map(function (d, di) {
      var nameEl = document.querySelector('[data-dim="' + di + '"]');
      var itemsEl = document.querySelector('[data-dimitems="' + di + '"]');
      return { name: nameEl ? nameEl.value : d.name, items: itemsEl ? itemsEl.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : d.items };
    });
    return cfg;
  }
  $('btnLoadGeneric').addEventListener('click', function () {
    var cfg = clone(activeConfig()); cfg.dimensions = clone(baseConfig().genericDimensions);
    try { localStorage.setItem('ahp_config_override', JSON.stringify(cfg)); } catch (e) {}
    renderFill(); renderSettingsEditor(); $('settingsMsg').textContent = '已載入通用範本到本機測試；正式部署請下載新的 config.js。';
  });
  $('btnLoadThesis').addEventListener('click', function () {
    var cfg = clone(activeConfig()); cfg.dimensions = clone(baseConfig().dimensions);
    // 注意：baseConfig().dimensions 已是論文範本；若本機曾覆蓋，仍以 base 為準。
    try { localStorage.setItem('ahp_config_override', JSON.stringify(cfg)); } catch (e) {}
    renderFill(); renderSettingsEditor(); $('settingsMsg').textContent = '已載入論文範本到本機測試。';
  });
  $('btnSaveSettingsLocal').addEventListener('click', function () {
    var cfg = readSettingsEditor();
    try { localStorage.setItem('ahp_config_override', JSON.stringify(cfg)); } catch (e) {}
    renderFill(); $('settingsMsg').textContent = '已存到本機測試（填答頁已更新）。正式部署仍需下載 config.js。';
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
      + '  backgroundFields: ' + JSON.stringify(base.backgroundFields) + ',\n'
      + '  dimensions: ' + JSON.stringify(cfg.dimensions) + ',\n'
      + '  genericDimensions: ' + JSON.stringify(base.genericDimensions) + '\n};\n';
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
      ['records', 'report', 'settings'].forEach(function (t) { $('atab-' + t).hidden = (t !== btn.getAttribute('data-atab')); });
    });
  });
  $('btnAdminUnlock').addEventListener('click', function () {
    var base = baseConfig();
    if ($('adminCodeInput').value === base.adminCode) {
      $('adminLock').hidden = true; $('adminBody').hidden = false;
      $('adminWarn').innerHTML = base.adminCode === '請改成自己的後台密碼'
        ? '<p class="warn">警告：你還在用預設後台密碼，請先到 config.js 改掉再正式發連結。</p>' : '';
      renderSettingsEditor(); loadLocal();
    } else {
      $('adminLockMsg').textContent = '密碼不正確，請檢查 config.js 的 adminCode。';
    }
  });
  renderFill();
})();
