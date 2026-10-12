/* Portfolio directory filter */
(function () {
  'use strict';
  var grid = document.getElementById('pgrid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.pcard'));
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.pfilter'));
  var empty = document.getElementById('pempty');

  function apply(cat) {
    var shown = 0;
    cards.forEach(function (c) {
      var on = cat === 'all' || c.getAttribute('data-cat') === cat;
      c.hidden = !on;
      if (on) shown++;
    });
    if (empty) empty.hidden = shown > 0;
    buttons.forEach(function (b) {
      var on = b.getAttribute('data-cat') === cat;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      apply(b.getAttribute('data-cat'));
    });
  });
})();
