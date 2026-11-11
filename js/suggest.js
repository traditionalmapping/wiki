// ============================================================================
//  SUGGESTIONS  (the "Suggest" button on the map)
//
//  Visitors can:
//    - Send tab : pick a category, write what they want, optionally pin a place
//                 on the map (the cross at the centre of the screen)
//    - Board tab: see approved suggestions, upvote them, jump to their pin
//
//  Everything is stored in Firebase Firestore (free Spark plan).
//  Setup (once, about 5 minutes):
//    1. console.firebase.google.com > Add project (Google Analytics: off)
//    2. Build > Firestore Database > Create database (production mode)
//    3. Firestore > Rules tab: paste the contents of firestore.rules > Publish
//    4. Project settings (gear) > Your apps > </> Web app > register, then copy
//       the values of firebaseConfig into SUGGEST_FIREBASE below.
//       (These values are not secret. The rules are what protect the data.)
//
//  Approving: a new suggestion is saved with status 'new' and is NOT public.
//  In the Firestore console open the suggestion and change status to
//    'open'     shows on the Board
//    'planned'  shows on the Board with a "Planned" badge
//    'done'     shows on the Board with a "Done" badge
//  To remove one, delete the document.
//
//  While projectId is empty the Suggest button stays hidden.
// ============================================================================
const SUGGEST_FIREBASE = {
  apiKey: 'AIzaSyCqITfDELJPjCrQpSN2r3JyGGKaVFz7YRY',
  authDomain: 'wiki-3c3c9.firebaseapp.com',
  projectId: 'wiki-3c3c9',
  appId: '1:219154782123:web:5b48675941cbd16de3e4ee'
};

const SUGGEST_CATEGORIES = ['Event', 'Video', 'Country', 'Feature', 'Bug'];
const SUGGEST_HINTS = {
  Event: 'Which event should we add? Say what happened and when.',
  Video: 'Paste a link to a video and say what it shows.',
  Country: 'Which country, and what is missing or wrong?',
  Feature: 'What would make the site better?',
  Bug: 'What went wrong, and on which device?'
};
const SUGGEST_VISIBLE = ['open', 'planned', 'done'];
const SUGGEST_BADGE = { planned: 'Planned', done: 'Done' };

// ---------------------------------------------------------------------------
//  Everything below is code. You normally don't need to edit it.
// ---------------------------------------------------------------------------
class SuggestControl {
  constructor(onClick) { this.onClick = onClick; }
  onAdd() {
    this.el = document.createElement('div');
    this.el.className = 'maplibregl-ctrl suggest-ctrl';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suggest-btn';
    b.textContent = 'Suggest';
    b.title = 'Tell us what we should add';
    b.addEventListener('click', this.onClick);
    this.el.appendChild(b);
    return this.el;
  }
  onRemove() { this.el.remove(); }
}

function initSuggest(map) {
  const cfg = SUGGEST_FIREBASE;
  if (!cfg.projectId || typeof firebase === 'undefined') {
    console.info('js/suggest.js: Firebase is not set up yet, so the Suggest button is hidden.');
    return;
  }
  let db;
  try {
    const app = firebase.apps.find(a => a.name === 'suggest') || firebase.initializeApp(cfg, 'suggest');
    db = app.firestore();
  } catch (err) {
    console.error('Suggest: Firebase failed to start:', err);
    return;
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ----- state -----
  let tab = 'send';
  const draft = { category: 'Event', text: '', name: '', pin: null };
  const voted = new Set(store.get('sg-voted', []));
  let boardCache = null;
  let boardFilter = 'All';

  // ----- the pop-up -----
  const back = el('div', 'sg-back');
  back.hidden = true;
  const panel = el('div', 'sg-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Suggestions');
  const close = el('button', 'sg-close', '\u2715');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  const tabs = el('div', 'sg-tabs');
  const tabSend = el('button', 'sg-tab', 'Send');
  const tabBoard = el('button', 'sg-tab', 'Board');
  [tabSend, tabBoard].forEach(b => { b.type = 'button'; });
  tabs.append(tabSend, tabBoard);
  const body = el('div', 'sg-body');
  panel.append(close, tabs, body);
  back.append(panel);
  document.body.append(back);

  const isOpen = () => !back.hidden;
  const openModal = t => {
    if (t) tab = t;
    if (tab === 'board') boardCache = null;
    render();
    back.hidden = false;
    close.focus({ preventScroll: true });
  };
  const closeModal = () => { back.hidden = true; };
  close.addEventListener('click', closeModal);
  back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  tabSend.addEventListener('click', () => { tab = 'send'; render(); });
  tabBoard.addEventListener('click', () => { tab = 'board'; boardCache = null; render(); });

  // ----- pinning a place: the cross in the middle of the map -----
  const pinbar = el('div', 'sg-pinbar');
  pinbar.hidden = true;
  const pinText = el('span', 'sg-pin-text');
  const pinOk = el('button', 'sg-pin-ok', 'Use this location');
  const pinNo = el('button', 'sg-pin-no', 'Cancel');
  [pinOk, pinNo].forEach(b => { b.type = 'button'; });
  pinbar.append(el('span', 'sg-pin-hint', 'Move the map so the cross is on the place'), pinText, pinOk, pinNo);
  document.body.append(pinbar);

  let pinning = false;
  const centerText = () => {
    const c = map.getCenter();
    return c.lat.toFixed(5) + ', ' + c.lng.toFixed(5);
  };
  map.on('move', () => { if (pinning) pinText.textContent = centerText(); });
  const startPin = () => {
    pinning = true;
    closeModal();
    pinText.textContent = centerText();
    pinbar.hidden = false;
  };
  const stopPin = () => { pinning = false; pinbar.hidden = true; };
  pinOk.addEventListener('click', () => {
    const c = map.getCenter();
    draft.pin = { lat: Number(c.lat.toFixed(5)), lng: Number(c.lng.toFixed(5)) };
    stopPin();
    openModal('send');
  });
  pinNo.addEventListener('click', () => { stopPin(); openModal('send'); });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (pinning) { stopPin(); openModal('send'); }
    else if (isOpen()) closeModal();
  });

  // ----- Send tab -----
  const sendView = () => {
    const f = el('div', 'sg-form');

    f.append(el('div', 'sg-label', 'What is it about?'));
    const chips = el('div', 'sg-chips');
    const ta = el('textarea', 'sg-text');
    SUGGEST_CATEGORIES.forEach(c => {
      const b = el('button', 'sg-chip' + (draft.category === c ? ' on' : ''), c);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(draft.category === c));
      b.addEventListener('click', () => {
        draft.category = c;
        ta.placeholder = SUGGEST_HINTS[c];
        chips.querySelectorAll('.sg-chip').forEach(x => {
          const on = x.textContent === c;
          x.classList.toggle('on', on);
          x.setAttribute('aria-pressed', String(on));
        });
      });
      chips.append(b);
    });
    f.append(chips);

    ta.maxLength = 500;
    ta.rows = 5;
    ta.placeholder = SUGGEST_HINTS[draft.category];
    ta.value = draft.text;
    ta.setAttribute('aria-label', 'Your suggestion');
    ta.addEventListener('input', () => { draft.text = ta.value; });
    f.append(ta);

    const loc = el('div', 'sg-loc');
    const drawLoc = () => {
      loc.replaceChildren();
      if (draft.pin) {
        loc.append(el('span', 'sg-pinchip', '\uD83D\uDCCD ' + draft.pin.lat + ', ' + draft.pin.lng));
        const again = el('button', 'sg-link', 'Change');
        again.type = 'button';
        again.addEventListener('click', startPin);
        const rm = el('button', 'sg-link', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', () => { draft.pin = null; drawLoc(); });
        loc.append(again, rm);
      } else {
        const b = el('button', 'sg-secondary', 'Pin a place on the map');
        b.type = 'button';
        b.addEventListener('click', startPin);
        loc.append(b, el('span', 'sg-note', 'Optional. Great for events.'));
      }
    };
    drawLoc();
    f.append(loc);

    const name = el('input', 'sg-name');
    name.type = 'text';
    name.maxLength = 40;
    name.placeholder = 'Your name or contact (optional)';
    name.setAttribute('aria-label', 'Your name or contact');
    name.value = draft.name;
    name.addEventListener('input', () => { draft.name = name.value; });
    f.append(name);

    // hidden trap for bots
    const hp = el('input', 'sg-hp');
    hp.type = 'text';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    f.append(hp);

    const msg = el('div', 'sg-msg');
    const setMsg = (t, kind) => { msg.textContent = t; msg.className = 'sg-msg' + (kind ? ' ' + kind : ''); };
    const submit = el('button', 'sg-submit', 'Send suggestion');
    submit.type = 'button';
    submit.addEventListener('click', async () => {
      if (hp.value) { setMsg('Thanks!', 'ok'); return; }
      const text = draft.text.trim();
      if (text.length < 4) { setMsg('Please write a little more.', 'err'); return; }
      const wait = 30000 - (Date.now() - store.get('sg-last', 0));
      if (wait > 0) { setMsg('Please wait ' + Math.ceil(wait / 1000) + ' s before sending another one.', 'err'); return; }
      submit.disabled = true;
      setMsg('Sending...');
      const doc = {
        category: draft.category,
        text: text.slice(0, 500),
        votes: 0,
        status: 'new',
        created: firebase.firestore.FieldValue.serverTimestamp()
      };
      const who = draft.name.trim();
      if (who) doc.name = who.slice(0, 40);
      if (draft.pin) { doc.lat = draft.pin.lat; doc.lng = draft.pin.lng; }
      try {
        await db.collection('suggestions').add(doc);
        store.set('sg-last', Date.now());
        draft.text = '';
        draft.pin = null;
        ta.value = '';
        drawLoc();
        setMsg('Thank you! It shows on the Board once it is approved.', 'ok');
      } catch (err) {
        console.error('Suggest: could not send:', err);
        setMsg('Could not send it. Please try again later.', 'err');
      }
      submit.disabled = false;
    });
    f.append(submit, msg);
    return f;
  };

  // ----- Board tab -----
  const boardView = () => {
    const wrap = el('div', 'sg-board');
    const chips = el('div', 'sg-chips');
    const list = el('div', 'sg-list');

    const draw = () => {
      list.replaceChildren();
      if (!boardCache) return;
      const rows = boardCache.filter(s => boardFilter === 'All' || s.category === boardFilter);
      if (!rows.length) {
        list.append(el('div', 'sg-empty', boardCache.length ? 'Nothing in this category yet.' : 'No suggestions on the board yet. Be the first!'));
        return;
      }
      rows.forEach(s => {
        const item = el('div', 'sg-item');

        const vote = el('button', 'sg-vote');
        vote.type = 'button';
        const num = el('span', 'sg-vote-n', String(s.votes || 0));
        vote.append(el('span', 'sg-vote-arrow', '\u25B2'), num);
        vote.setAttribute('aria-label', 'Upvote');
        const markVoted = () => { vote.classList.add('on'); vote.disabled = true; };
        if (voted.has(s.id)) markVoted();
        vote.addEventListener('click', async () => {
          if (voted.has(s.id)) return;
          voted.add(s.id);
          store.set('sg-voted', Array.from(voted));
          s.votes = (s.votes || 0) + 1;
          num.textContent = String(s.votes);
          markVoted();
          try {
            await db.collection('suggestions').doc(s.id).update({ votes: firebase.firestore.FieldValue.increment(1) });
          } catch (err) {
            console.error('Suggest: vote failed:', err);
            voted.delete(s.id);
            store.set('sg-voted', Array.from(voted));
            s.votes -= 1;
            num.textContent = String(s.votes);
            vote.classList.remove('on');
            vote.disabled = false;
          }
        });

        const main = el('div', 'sg-item-main');
        const meta = el('div', 'sg-meta');
        meta.append(el('span', 'sg-tag', s.category || 'Idea'));
        if (SUGGEST_BADGE[s.status]) meta.append(el('span', 'sg-badge ' + s.status, SUGGEST_BADGE[s.status]));
        main.append(meta, el('div', 'sg-item-text', s.text || ''));

        const foot = el('div', 'sg-item-foot');
        if (s.name) foot.append(el('span', 'sg-by', 'by ' + s.name));
        if (typeof s.lat === 'number' && typeof s.lng === 'number') {
          const go = el('button', 'sg-link', 'Show on map');
          go.type = 'button';
          go.addEventListener('click', () => {
            closeModal();
            map.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 6) });
          });
          foot.append(go);
        }
        if (foot.childNodes.length) main.append(foot);

        item.append(vote, main);
        list.append(item);
      });
    };

    ['All'].concat(SUGGEST_CATEGORIES).forEach(c => {
      const b = el('button', 'sg-chip' + (boardFilter === c ? ' on' : ''), c);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(boardFilter === c));
      b.addEventListener('click', () => {
        boardFilter = c;
        chips.querySelectorAll('.sg-chip').forEach(x => {
          const on = x.textContent === c;
          x.classList.toggle('on', on);
          x.setAttribute('aria-pressed', String(on));
        });
        draw();
      });
      chips.append(b);
    });
    wrap.append(chips, list);

    if (boardCache) {
      draw();
    } else {
      list.append(el('div', 'sg-empty', 'Loading...'));
      db.collection('suggestions').where('status', 'in', SUGGEST_VISIBLE).limit(200).get()
        .then(snap => {
          boardCache = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
          boardCache.sort((a, b) =>
            (b.votes || 0) - (a.votes || 0) ||
            ((b.created && b.created.seconds) || 0) - ((a.created && a.created.seconds) || 0));
          if (tab === 'board') draw();
        })
        .catch(err => {
          console.error('Suggest: could not load the board:', err);
          list.replaceChildren(el('div', 'sg-empty', 'Could not load the board. Please try again later.'));
        });
    }
    return wrap;
  };

  const render = () => {
    tabSend.classList.toggle('on', tab === 'send');
    tabBoard.classList.toggle('on', tab === 'board');
    tabSend.setAttribute('aria-pressed', String(tab === 'send'));
    tabBoard.setAttribute('aria-pressed', String(tab === 'board'));
    body.replaceChildren(tab === 'send' ? sendView() : boardView());
    body.scrollTop = 0;
  };

  map.addControl(new SuggestControl(() => openModal()), 'top-left');
}