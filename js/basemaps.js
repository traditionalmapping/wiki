// MapTiler key. Restrict it to your site's domain in the MapTiler dashboard
// (Account > API keys) so nobody else can use it.
const MAPTILER_KEY = 'okpdMcXQXKD9GKjumNOC';

// Each `style` is a style object, a URL, or an async function returning one.
const BASEMAPS = {
  dark: {
    label: 'Dark',
    style: `https://api.maptiler.com/maps/streets-v4-dark/style.json?key=${MAPTILER_KEY}`
  },
  osm: {
    label: 'OSM',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
    }
  }
};

function resolveStyle(id) {
  const s = BASEMAPS[id].style;
  return typeof s === 'function' ? s() : Promise.resolve(s);
}