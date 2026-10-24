// MapTiler key: used by the place search and, while CARTO_KEY is empty, by the Dark base map.
// Restrict it to your site's domain in the MapTiler dashboard (Account > API keys).
const MAPTILER_KEY = 'okpdMcXQXKD9GKjumNOC';

// Optional: free CARTO key for the dark OSM base map (https://carto.com/basemaps/apikey/).
// Give them the domain of your site. While this is empty, Dark uses MapTiler's dark style.
const CARTO_KEY = '';

// Each `style` is a style object, a URL, or an async function returning one.
const BASEMAPS = {
  dark: {
    label: 'Dark',
    style: () => CARTO_KEY
      ? {
          // Dark version of OpenStreetMap (CARTO tiles, OSM data)
          version: 8,
          sources: {
            'osm-dark': {
              type: 'raster',
              tiles: ['https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=' + CARTO_KEY],
              tileSize: 256,
              maxzoom: 19,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
            }
          },
          layers: [{ id: 'osm-dark', type: 'raster', source: 'osm-dark' }]
        }
      : `https://api.maptiler.com/maps/streets-v4-dark/style.json?key=${MAPTILER_KEY}`
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