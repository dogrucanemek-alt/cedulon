/* global CEDULON_BALANCED, CEDULON_BYPASS */
(function () {
  "use strict";

  function shortHash(value) {
    if (!value) return "—";
    return value.slice(0, 8);
  }

  function render(data) {
    var banner = document.getElementById("banner");
    banner.textContent = data.banner;
    banner.className = data.ok ? "banner ok" : "banner bad";

    var chain = document.getElementById("chain");
    chain.innerHTML = "";
    data.receipts.forEach(function (r, i) {
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        "<div>" +
        r.payer +
        " → " +
        r.payee +
        " · " +
        r.amount +
        " " +
        r.currency +
        "</div>" +
        '<div class="meta">nonce ' +
        r.nonce +
        " · hash " +
        shortHash(r.hash) +
        " · prev " +
        shortHash(r.prevHash) +
        "</div>";
      chain.appendChild(card);
      if (data.gapAfter === i) {
        var gap = document.createElement("article");
        gap.className = "card gap";
        gap.innerHTML =
          "<div>missing receipt</div>" +
          '<div class="meta">settlement without a spend receipt</div>';
        chain.appendChild(gap);
      }
    });

    var cps = document.getElementById("checkpoints");
    cps.innerHTML = "";
    data.checkpoints.forEach(function (c) {
      var totals = Object.keys(c.totals)
        .map(function (k) {
          return k + " " + c.totals[k];
        })
        .join(", ");
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        "<div>epoch " +
        c.epoch +
        " · receipts " +
        c.receiptCount +
        "</div>" +
        '<div class="meta">window ' +
        c.startMs +
        "–" +
        c.endMs +
        " · " +
        totals +
        " · head " +
        shortHash(c.chainHead) +
        "</div>";
      cps.appendChild(card);
    });

    var body = document.getElementById("findings");
    body.innerHTML = "";
    if (data.findings.length === 0) {
      var empty = document.createElement("tr");
      empty.innerHTML = "<td colspan=\"3\">no findings</td>";
      body.appendChild(empty);
      return;
    }
    data.findings.forEach(function (f) {
      var row = document.createElement("tr");
      row.innerHTML =
        "<td class=\"mono\">" +
        f.code +
        "</td><td class=\"mono\">" +
        f.id +
        "</td><td>" +
        f.detail +
        "</td>";
      body.appendChild(row);
    });
  }

  function show(name) {
    var data = name === "bypass" ? window.CEDULON_BYPASS : window.CEDULON_BALANCED;
    document.getElementById("btn-balanced").setAttribute("aria-pressed", name === "balanced" ? "true" : "false");
    document.getElementById("btn-bypass").setAttribute("aria-pressed", name === "bypass" ? "true" : "false");
    render(data);
  }

  document.getElementById("btn-balanced").addEventListener("click", function () {
    show("balanced");
  });
  document.getElementById("btn-bypass").addEventListener("click", function () {
    show("bypass");
  });

  show("balanced");
})();
