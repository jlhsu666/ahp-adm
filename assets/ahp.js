// AHP 純計算邏輯（不依賴 DOM，方便 Node 測試與 Apps Script 對照）
// 方法說明（與論文第三章一致）：
//  - 成對比較矩陣為正倒數矩陣，對角線為 1，a_ji = 1 / a_ij。
//  - 權重取主特徵向量（冪迭代法），並正規化使總和為 1。
//  - λmax = mean((A·w)_i / w_i)；C.I. = (λmax - n) / (n - 1)；C.R. = C.I. / R.I.
//  - C.R. <= 0.1 視為通過一致性檢驗；n <= 2 時 R.I. = 0，C.R. 記為 0。
//  - 多人彙總（論文第四章做法）：先算每位受訪者的區域權重，再取算術平均；
//    全域權重 = 主構面平均權重 × 子構面平均區域權重。
(function (global) {
  'use strict';
  var RI = { 1: 0, 2: 0, 3: 0.58, 4: 0.9, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49, 11: 1.51, 12: 1.48, 13: 1.56, 14: 1.57, 15: 1.58 };

  function riFor(n) { return RI[n] !== undefined ? RI[n] : 1.58; }

  // comparisons: { "i-j": signedValue }，signedValue > 0 表示 i 比 j 重要 signedValue 倍；
  // signedValue < 0 表示 j 比 i 重要 |signedValue| 倍；1 表示同等重要。
  function matrixFromComparisons(n, comparisons) {
    var m = [];
    for (var i = 0; i < n; i++) {
      m[i] = [];
      for (var j = 0; j < n; j++) {
        if (i === j) { m[i][j] = 1; continue; }
        if (i < j) {
          var v = comparisons ? comparisons[i + '-' + j] : undefined;
          if (v === undefined || v === null || v === 0) v = 1;
          m[i][j] = v > 0 ? v : 1 / Math.abs(v);
        } else {
          m[i][j] = 1 / m[j][i];
        }
      }
    }
    return m;
  }

  function principalEigenvector(matrix) {
    var n = matrix.length;
    var w = [];
    for (var i = 0; i < n; i++) w[i] = 1 / n;
    for (var iter = 0; iter < 200; iter++) {
      var next = [];
      for (var i2 = 0; i2 < n; i2++) {
        var s = 0;
        for (var j = 0; j < n; j++) s += matrix[i2][j] * w[j];
        next[i2] = s;
      }
      var sum = 0;
      for (var k = 0; k < n; k++) sum += next[k];
      for (var k2 = 0; k2 < n; k2++) next[k2] /= sum;
      var diff = 0;
      for (var k3 = 0; k3 < n; k3++) diff = Math.max(diff, Math.abs(next[k3] - w[k3]));
      w = next;
      if (diff < 1e-10) break;
    }
    var lambdaSum = 0;
    for (var i3 = 0; i3 < n; i3++) {
      var aw = 0;
      for (var j2 = 0; j2 < n; j2++) aw += matrix[i3][j2] * w[j2];
      lambdaSum += aw / w[i3];
    }
    var lambdaMax = lambdaSum / n;
    var ci = n > 1 ? (lambdaMax - n) / (n - 1) : 0;
    var ri = riFor(n);
    var cr = ri === 0 ? 0 : ci / ri;
    return { weights: w, lambdaMax: lambdaMax, ci: ci, cr: cr, valid: cr <= 0.1 + 1e-12 };
  }

  function analyseMatrix(n, comparisons) {
    var matrix = matrixFromComparisons(n, comparisons);
    var r = principalEigenvector(matrix);
    r.matrix = matrix;
    return r;
  }

  // structure: { dimensions: [{ name, items: [name, ...] }, ...] }
  // record.comparisons: { main: {...}, "sub0": {...}, "sub1": {...} }
  function computeRecord(structure, record) {
    var dims = structure.dimensions;
    var main = analyseMatrix(dims.length, record.comparisons && record.comparisons.main);
    var subs = dims.map(function (dim, di) {
      return analyseMatrix(dim.items.length, record.comparisons && record.comparisons['sub' + di]);
    });
    var valid = main.valid && subs.every(function (s) { return s.valid; });
    var global = [];
    dims.forEach(function (dim, di) {
      dim.items.forEach(function (item, ii) {
        global.push({
          dimensionIndex: di, itemIndex: ii,
          dimension: dim.name, item: item,
          local: subs[di].weights[ii],
          dimensionWeight: main.weights[di],
          global: main.weights[di] * subs[di].weights[ii]
        });
      });
    });
    return { main: main, subs: subs, global: global, valid: valid };
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function rankOf(values) {
    // 回傳每個位置的排行（1 為最大）；權重相同時依原順序排先後，並在報告中以數值呈現。
    var order = values.map(function (v, i) { return { v: v, i: i }; })
      .sort(function (a, b) { return b.v - a.v; });
    var ranks = [];
    order.forEach(function (o, pos) { ranks[o.i] = pos + 1; });
    return ranks;
  }

  function aggregate(structure, recordsWithResults) {
    // recordsWithResults: [{ record, result }]，已先篩選（例如只留有效問卷）。
    var dims = structure.dimensions;
    var mainAvg = dims.map(function (_, di) {
      return mean(recordsWithResults.map(function (r) { return r.result.main.weights[di]; }));
    });
    var subAvg = dims.map(function (dim, di) {
      return dim.items.map(function (_, ii) {
        return mean(recordsWithResults.map(function (r) { return r.result.subs[di].weights[ii]; }));
      });
    });
    var globalList = [];
    dims.forEach(function (dim, di) {
      dim.items.forEach(function (item, ii) {
        globalList.push({
          dimensionIndex: di, itemIndex: ii, dimension: dim.name, item: item,
          dimensionWeight: mainAvg[di], local: subAvg[di][ii],
          global: mainAvg[di] * subAvg[di][ii]
        });
      });
    });
    var globalRanks = rankOf(globalList.map(function (g) { return g.global; }));
    globalList.forEach(function (g, i) { g.rank = globalRanks[i]; });
    globalList.sort(function (a, b) { return a.rank - b.rank; });
    return {
      count: recordsWithResults.length,
      mainAvg: mainAvg, mainRanks: rankOf(mainAvg),
      subAvg: subAvg,
      subRanks: subAvg.map(function (arr) { return rankOf(arr); }),
      global: globalList
    };
  }

  // 由目標權重反推一組 Saaty 成對比較值（僅供示範資料產生器使用）。
  function comparisonsFromWeights(weights) {
    var comps = {};
    for (var i = 0; i < weights.length; i++) {
      for (var j = i + 1; j < weights.length; j++) {
        var ratio = weights[i] / weights[j];
        var v;
        if (ratio >= 1) v = Math.max(1, Math.min(9, Math.round(ratio)));
        else v = -Math.max(1, Math.min(9, Math.round(1 / ratio)));
        comps[i + '-' + j] = v;
      }
    }
    return comps;
  }

  var api = { RI: RI, riFor: riFor, matrixFromComparisons: matrixFromComparisons,
    principalEigenvector: principalEigenvector, analyseMatrix: analyseMatrix,
    computeRecord: computeRecord, aggregate: aggregate, rankOf: rankOf,
    comparisonsFromWeights: comparisonsFromWeights };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.AHP = api;
})(typeof window !== 'undefined' ? window : globalThis);
