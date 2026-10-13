/* =========================================================
   library.js
   Buy links for the shelf.

   TO TURN THESE ON: put your tags in AFFILIATE below and the links appear
   under every book's full summary. While both are empty nothing renders, so
   the page never ships a half-finished affiliate link.

     amazon  - your Associates tracking id, e.g. "mambaykanu-20"
     audible - the tracking fragment from your Audible/Amazon affiliate link

   Links are built from each book's data-title and data-author, so adding a
   book to library.html is enough. Nothing to maintain here per title.
   ========================================================= */
(function () {
  "use strict";

  var AFFILIATE = {
    amazon: "",
    audible: ""
  };

  if (!AFFILIATE.amazon && !AFFILIATE.audible) return;

  var books = document.querySelectorAll(".bk[data-title]");

  Array.prototype.forEach.call(books, function (book) {
    var slot = book.querySelector(".bk-buy");
    if (!slot) return;

    var title = book.getAttribute("data-title") || "";
    var author = book.getAttribute("data-author") || "";
    var query = encodeURIComponent((title + " " + author).trim());
    var links = [];

    if (AFFILIATE.amazon) {
      links.push({
        href: "https://www.amazon.com/s?k=" + query + "&tag=" + encodeURIComponent(AFFILIATE.amazon),
        label: "Find it on Amazon"
      });
    }

    if (AFFILIATE.audible) {
      links.push({
        href: "https://www.audible.com/search?keywords=" + query + "&tag=" + encodeURIComponent(AFFILIATE.audible),
        label: "Listen on Audible"
      });
    }

    links.forEach(function (link) {
      var a = document.createElement("a");
      a.href = link.href;
      a.target = "_blank";
      /* sponsored tells search engines this is a paid link, which is what an
         affiliate link is. nofollow and noopener are the usual hygiene. */
      a.rel = "sponsored noopener nofollow";
      a.textContent = link.label;
      slot.appendChild(a);
    });

    if (links.length) slot.hidden = false;
  });
})();
