// google-version/shim.js — the "translator"
// GCS Creatives Project by Grace Campbell-Sheran, Copyright 2026
//
// Code.gs adds this to the top of every page when it runs on Google. It lets
// the exact same game files work on both Netlify and Google:
//
//   • When a game asks for ./data/books.json (etc.), the answer comes from
//     data Code.gs already tucked into the page.
//   • When a game talks to /api/... (the old Netlify functions), the request
//     is passed to Code.gs's pbqApi() instead, and the reply is made to look
//     exactly like Netlify's.
//   • Links like board.html go to the matching Google Sites page (or app
//     page), because pages inside Google can't link to each other directly.
//   • If the browser blocks saved progress (localStorage) inside the embed,
//     games keep working with a temporary in-memory stand-in.
//
// Nothing here runs on the Netlify version.

(function () {
  "use strict";

  var ENV = window.PBQ_ENV || {};
  var DATA = window.PBQ_DATA || {};

  // ---- Saved progress fallback -------------------------------------------
  function memoryStorage() {
    var store = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      clear: function () { store = {}; },
      key: function (i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; },
    };
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    try {
      var s = window[name];
      s.setItem("__pbq_test", "1");
      s.removeItem("__pbq_test");
    } catch (e) {
      try {
        Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
      } catch (e2) { /* nothing else we can do */ }
    }
  });

  // ---- fetch() translator -------------------------------------------------
  function fakeResponse(status, text) {
    return {
      ok: status >= 200 && status < 300,
      status: status,
      json: function () { return Promise.resolve(JSON.parse(text)); },
      text: function () { return Promise.resolve(text); },
    };
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    init = init || {};

    var dataMatch = url.match(/^(?:\.\/)?data\/([\w.-]+\.json)$/);
    if (dataMatch) {
      if (Object.prototype.hasOwnProperty.call(DATA, dataMatch[1])) {
        return Promise.resolve(fakeResponse(200, JSON.stringify(DATA[dataMatch[1]])));
      }
      return Promise.resolve(fakeResponse(404, '{"error":"File not found."}'));
    }

    if (/^\/api\//.test(url)) {
      var q = url.indexOf("?");
      var path = q === -1 ? url : url.slice(0, q);
      var query = {};
      if (q !== -1) {
        new URLSearchParams(url.slice(q + 1)).forEach(function (v, k) { query[k] = v; });
      }
      var request = {
        path: path,
        method: String(init.method || "GET").toUpperCase(),
        query: query,
        body: typeof init.body === "string" ? init.body : null,
      };
      return new Promise(function (resolve, reject) {
        if (!window.google || !google.script || !google.script.run) {
          reject(new TypeError("Google connection not available."));
          return;
        }
        google.script.run
          .withSuccessHandler(function (r) { resolve(fakeResponse(r.status, r.body)); })
          .withFailureHandler(function (err) {
            reject(new TypeError("Could not reach the server: " + ((err && err.message) || err)));
          })
          .pbqApi(request);
      });
    }

    if (realFetch) return realFetch(input, init);
    return Promise.reject(new TypeError("fetch is not available."));
  };

  // ---- Links ---------------------------------------------------------------
  function go(url, target) {
    var w = window.open(url, target);
    if (!w && target !== "_blank") window.open(url, "_blank");
  }

  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";

      // Another game page, e.g. "board.html" or "./match.html#top"
      var page = href.match(/^(?:\.\/)?([\w-]+)\.html(?:[?#].*)?$/);
      if (page && ENV.pageUrls && ENV.pageUrls[page[1]]) {
        e.preventDefault();
        go(ENV.pageUrls[page[1]], ENV.linkTarget || "_top");
        return;
      }

      // A file in assets/, e.g. the study guide PDF
      var asset = href.match(/^(?:\.\/)?(assets\/.+)$/);
      if (asset) {
        e.preventDefault();
        var url = /\.pdf$/i.test(asset[1]) && ENV.studyGuideUrl ? ENV.studyGuideUrl : (ENV.assetBase || "") + asset[1];
        go(url, "_blank");
        return;
      }

      // Outside websites always open in a new tab (they can't load inside Google's frame).
      if (/^https?:/i.test(href) && !a.target) a.target = "_blank";
    },
    true
  );

  // ---- Hide teacher-only links from students -----------------------------
  if (!ENV.isTeacher) {
    var style = document.createElement("style");
    style.textContent = 'a[href="admin.html"], a[href="review.html"], a[href="./admin.html"], a[href="./review.html"] { display: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
})();
