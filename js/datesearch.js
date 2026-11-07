// ============================================================================
//  SEARCH BY DATE  (works inside the existing search box, top-left)
//
//  Type a date and a "Go to ..." row appears under the box. Click it (or press Enter)
//  and the situation slider jumps there. Accepted forms:
//      22 June 1941   June 22, 1941   22.06.1941   22/06/1941   1941-06-22
//      June 1941      06.1941         1941
//  Numbers with dots or slashes are read as DAY.MONTH.YEAR.
//
//  The slider moves in whole months, so a day in the middle of a month goes to the
//  nearest slider date (22 June -> 1 July). Dates outside the timeline go to the nearest end.
//  Place search keeps working: anything that is not a date is left to js/search.js.
// ============================================================================
(function () {
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
                  'august', 'september', 'october', 'november', 'december'];

  function monthNumber(word) {
    word = word.replace(/\.$/, '');
    if (word.length < 3) return 0;
    const i = MONTHS.findIndex(m => m === word || m.startsWith(word));
    return i + 1;                                   // 0 = not a month name
  }

  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const toMs = s => Date.parse(s + 'T00:00:00Z');

  function validDay(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  // -> null (not a date), { partial: true } (day + month, no year yet) or { y, m, d, precise }
  function parse(text) {
    let s = text.toLowerCase().trim().replace(/,/g, ' ').replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/\s+/g, ' ');
    if (!s) return null;
    let m;
    const done = (y, mo, d, precise) => (validDay(y, mo, d) ? { y, m: mo, d, precise } : null);

    if ((m = /^(\d{4})$/.exec(s))) return { y: +m[1], m: 1, d: 1, precise: false, yearOnly: true };
    if ((m = /^(\d{4})[-\/.](\d{1,2})$/.exec(s))) return done(+m[1], +m[2], 1, false);
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s))) return done(+m[1], +m[2], +m[3], true);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s))) return done(+m[3], +m[2], +m[1], true);
    if ((m = /^(\d{1,2})[-\/.](\d{4})$/.exec(s))) return done(+m[2], +m[1], 1, false);
    if ((m = /^(\d{1,2}) ([a-z.]+) (\d{4})$/.exec(s)) && monthNumber(m[2])) return done(+m[3], monthNumber(m[2]), +m[1], true);
    if ((m = /^([a-z.]+) (\d{1,2}) (\d{4})$/.exec(s)) && monthNumber(m[1])) return done(+m[3], monthNumber(m[1]), +m[2], true);
    if ((m = /^([a-z.]+) (\d{4})$/.exec(s)) && monthNumber(m[1])) return done(+m[2], monthNumber(m[1]), 1, false);
    if (((m = /^(\d{1,2}) ([a-z.]+)$/.exec(s)) && monthNumber(m[2])) ||
        ((m = /^([a-z.]+) (\d{1,2})$/.exec(s)) && monthNumber(m[1]))) return { partial: true };
    return null;
  }

  // Which slider date does a parsed date lead to?
  function resolve(p, dates, borderYears, borderIso) {
    let target = iso(p.y, p.m, p.d);
    if (p.yearOnly && borderYears.includes(p.y)) target = borderIso(p.y);   // 1939 = 1 Sep, 1945 = 5 Jun
    const t = toMs(target);
    let best = dates[0], diff = Infinity;
    for (const d of dates) {
      const x = Math.abs(toMs(d) - t);
      if (x < diff) { diff = x; best = d; }                                  // a tie keeps the earlier date
    }
    const outside = t < toMs(dates[0]) || t > toMs(dates[dates.length - 1]);
    return { target, date: best, exact: best === target, outside };
  }

  globalThis.DateSearch = { parse, resolve };      // also lets the logic be tested without a browser
  if (typeof document === 'undefined') return;

  // ---- the "Go to ..." row ----
  let box, input, row, mainEl, subEl, hintEl, go = null;

  function attach() {
    box = document.querySelector('.search');
    input = box && box.querySelector('input');
    if (!input) return false;

    row = document.createElement('div');
    row.className = 'search-date';
    row.hidden = true;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-date-go';
    mainEl = document.createElement('span');
    mainEl.className = 'search-date-main';
    subEl = document.createElement('span');
    subEl.className = 'search-date-sub';
    btn.append(mainEl, subEl);
    btn.addEventListener('mousedown', e => e.preventDefault());   // keep the keyboard open
    btn.addEventListener('click', jump);

    hintEl = document.createElement('div');
    hintEl.className = 'search-date-hint';
    hintEl.hidden = true;

    row.append(btn, hintEl);
    box.append(row);
    input.title = 'Search places, or type a date such as 22 June 1941';

    input.addEventListener('input', update);
    box.addEventListener('focusout', () => setTimeout(() => { if (!box.contains(document.activeElement)) hide(); }, 150));
    box.addEventListener('focusin', update);
    // Capture phase on the wrapper: runs before js/search.js sees the key.
    box.addEventListener('keydown', e => {
      if (e.target !== input) return;
      if (e.key === 'Enter' && go) { e.preventDefault(); e.stopPropagation(); jump(); }
      else if (e.key === 'Escape') hide();
    }, true);
    return true;
  }

  function hide() {
    go = null;
    row.hidden = true;
    box.classList.remove('is-date');
  }

  function update() {
    const p = parse(input.value);
    go = null;
    if (!p) { hide(); return; }
    box.classList.add('is-date');                    // hides the place results while a date is typed
    row.hidden = false;
    const btn = row.firstChild;
    if (p.partial) {
      btn.hidden = true;
      hintEl.hidden = false;
      hintEl.textContent = 'Add a year, for example 22 June 1941';
      return;
    }
    hintEl.hidden = true;
    btn.hidden = false;
    const r = resolve(p, SITUATION_DATES, BORDER_YEARS, borderIsoDate);
    go = r.date;
    mainEl.textContent = 'Go to ' + situationDateLabel(r.date);
    if (r.outside) {
      subEl.textContent = situationDateLabel(r.target) + ' is outside the timeline (' +
        situationDateLabel(SITUATION_DATES[0]) + ' \u2013 ' + situationDateLabel(SITUATION_DATES[SITUATION_DATES.length - 1]) + ')';
    } else if (!r.exact) {
      subEl.textContent = 'Nearest slider date to ' + situationDateLabel(r.target) + ' (the slider moves monthly)';
    } else {
      subEl.textContent = '';
    }
    subEl.hidden = !subEl.textContent;
  }

  function jump() {
    const timeline = window.situationTimeline;
    if (!go || !timeline) return;
    timeline.setDate(go);
    timeline.el.classList.add('timeline-flash');
    setTimeout(() => timeline.el.classList.remove('timeline-flash'), 900);
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));   // lets js/search.js reset its own list
    input.blur();
    hide();
  }

  // The search box is created by js/search.js after the map starts, so wait for it.
  if (!attach()) {
    const watch = new MutationObserver(() => { if (attach()) watch.disconnect(); });
    watch.observe(document.documentElement, { childList: true, subtree: true });
  }
})();