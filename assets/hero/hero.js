/* ==========================================================================
   CommandCenter — hero behaviour
   Progressive enhancement only: with JS disabled the section still renders
   complete (counters are pre-seeded with 0-markup fallbacks, the terminal
   line keeps its static text). Everything respects prefers-reduced-motion.

     · reveals the "live" state (sparkline draw, bars, progress) on scroll
     · types out the terminal prompt on a loop
     · counts the metric strip up when it enters the viewport
   ========================================================================== */
(function () {
  'use strict';

  var hero = document.querySelector('.cc-hero');
  if (!hero) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 1. reveal ---------------------------------------------------- */
  function reveal() {
    hero.classList.add('is-live');
    hero.dispatchEvent(new CustomEvent('cc:hero-live'));
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { reveal(); io.disconnect(); }
      });
    }, { threshold: 0.15 });
    io.observe(hero);
  } else {
    window.addEventListener('load', reveal);
  }

  /* ---- 2. metric counters ------------------------------------------- */
  function format(value, decimals, group) {
    var out = value.toFixed(decimals);
    if (!group) return out;
    var parts = out.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-cc-count'));
    if (isNaN(target)) return;
    var decimals = parseInt(el.getAttribute('data-cc-decimals') || '0', 10);
    var group = el.getAttribute('data-cc-group') === '1';

    if (reduce) { el.textContent = format(target, decimals, group); return; }

    var DURATION = 1400;
    var start = null;

    function step(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / DURATION, 1);
      var eased = 1 - Math.pow(1 - t, 3);           // easeOutCubic
      el.textContent = format(target * eased, decimals, group);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = format(target, decimals, group);
    }
    requestAnimationFrame(step);
  }

  function runCounters() {
    var nodes = hero.querySelectorAll('[data-cc-count]');
    for (var i = 0; i < nodes.length; i++) countUp(nodes[i]);
  }

  if (reduce) runCounters();
  else hero.addEventListener('cc:hero-live', runCounters, { once: true });

  /* ---- 3. terminal typing loop -------------------------------------- */
  var targets = hero.querySelectorAll('[data-cc-type]');

  for (var t = 0; t < targets.length; t++) {
    (function (el) {
      var script = (el.getAttribute('data-cc-type') || '').split('|').filter(Boolean);
      if (!script.length) return;

      if (reduce) { el.textContent = script[0]; return; }

      var line = 0, pos = 0, deleting = false;

      function tick() {
        var text = script[line];
        var delay;

        if (!deleting) {
          pos++;
          el.textContent = text.slice(0, pos);
          delay = text[pos - 1] === ' ' ? 90 : 46 + Math.random() * 46;
          if (pos >= text.length) { deleting = true; delay = 2200; }   // hold when complete
        } else {
          pos -= 2;
          if (pos < 0) pos = 0;
          el.textContent = text.slice(0, pos);
          delay = 26;
          if (pos === 0) { deleting = false; line = (line + 1) % script.length; delay = 420; }
        }
        setTimeout(tick, delay);
      }

      setTimeout(tick, 900 + t * 300);
    })(targets[t]);
  }

  /* ---- 4. live clock in the terminal header ------------------------- */
  var clock = hero.querySelector('[data-cc-clock]');
  if (clock) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var paint = function () {
      var d = new Date();
      clock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' UTC';
    };
    paint();
    setInterval(paint, 1000);
  }
})();
