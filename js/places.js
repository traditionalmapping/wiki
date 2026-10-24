// ============================================================================
//  PLACES WITH VIDEOS  (edit this file to add a new panel on the map)
//
//  To add a place: copy one whole { ... } block below, paste it after the
//  last one (keep the comma between blocks), then change:
//    coords  - paste "lat, lng" straight from the Copy button on the map
//    title   - name shown on the panel
//    url     - link to the video
//
//  Several videos at one place: add more { title, url } lines inside `videos`.
//  The panel shows the first one, plus a "+N" button that opens the full list.
//
//  Thumbnails are automatic for YouTube links. For any other site, add
//  thumb: 'https://link-to-an-image.jpg' to that video.
// ============================================================================

const PLACES = [
  {
    coords: '52.22970, 21.01220',
    videos: [
      { title: 'WWII - The Invasion of Poland (1939): Every Hour', url: 'https://www.youtube.com/watch?v=FirMsHqDrHc' },
      { title: 'Warsaw Uprising (1944) : Every Hour', url: 'https://www.youtube.com/watch?v=53Yc5BPLXdU' },
      { title: 'Vistula-Oder Offensive: Every Day [WW2]', url: 'https://www.youtube.com/watch?v=drRyUWYjB_k' }
    ]
  },
  {
    coords: '50.45010, 30.52340',
    videos: [
      { title: 'World War II in Ukraine & Aftermath 【1939 - 1960】 — EVERYDAY', url: 'https://www.youtube.com/watch?v=RRonflgdy1o' }
    ]
  },
  {
    coords: '55.75040, 37.61734',
    videos: [
      { title: 'WW2: Operation Barbarossa MAPPED【22.06.41 - 05.12.41】- EVERY DAY', url: 'https://www.youtube.com/watch?v=n4uHL6BOhzY' },
      { title: 'The War of Annihilation - Battle of Moscow / Война на Уничтожение - Битва за Москву', url: 'https://www.youtube.com/watch?v=TRdV-gm7PEc' }
    ]
  }
];