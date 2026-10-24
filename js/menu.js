// Start menu: shown on every page load. Only WW2 is available for now.
const menuEl = document.getElementById('menu');
const ww2Btn = document.getElementById('open-ww2');

function showMenu() {
  menuEl.classList.remove('hidden');
  document.body.classList.add('menu-open');
  ww2Btn.focus({ preventScroll: true });
}

function hideMenu() {
  menuEl.classList.add('hidden');
  document.body.classList.remove('menu-open');
}

ww2Btn.addEventListener('click', hideMenu);
document.body.classList.add('menu-open');
ww2Btn.focus({ preventScroll: true });

// Small button on the map to get back to the menu.
class MenuButtonControl {
  onAdd() {
    this.el = document.createElement('div');
    this.el.className = 'maplibregl-ctrl basemap-switch';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Periods';
    b.addEventListener('click', showMenu);
    this.el.appendChild(b);
    return this.el;
  }
  onRemove() { this.el.remove(); }
}