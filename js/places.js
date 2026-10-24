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
//
//  Optional extras. The "Videos" panel on the left uses them to group, sort
//  and filter. Videos without them still work, they just land in "Unknown".
//    name    - (on the place) place name, e.g. name: 'Warsaw'
//    author  - (on a video) channel name. Not needed for YouTube links: it is
//              found automatically. Write it only to override, or for other sites.
//    date    - (on a video) when the events in the video happen. One date or a
//              range: '1944-08-01', '1944-08', '1944' or '1944-08-01 / 1944-10-02'
//    tags    - (on a video) short labels, e.g. tags: ['Eastern Front', 'Every day']
//    embed   - (on a video) embed: false makes the thumbnail open YouTube instead of
//              the pop-up player. For videos whose owner disabled embedding (this is
//              also detected automatically when the author is looked up).
//
//  Full example:
//    { title: 'My video', url: 'https://www.youtube.com/watch?v=XXXXXXXXXXX',
//      date: '1944-08-01 / 1944-10-02', tags: ['Eastern Front'] }
// ============================================================================

const PLACES = [
  {
    coords: '52.22970, 21.01220',
    name: 'Warsaw',
    videos: [
      { title: 'WWII - The Invasion of Poland (1939): Every Hour', url: 'https://www.youtube.com/watch?v=FirMsHqDrHc', date: '1939-09-01 / 1939-11-21' },
      { title: 'Warsaw Uprising (1944) : Every Hour', url: 'https://www.youtube.com/watch?v=53Yc5BPLXdU', date: '1944-08-01 / 1944-10-02' },
      { title: 'Vistula-Oder Offensive: Every Day [WW2]', url: 'https://www.youtube.com/watch?v=drRyUWYjB_k', date: '1945-01-11 / 1945-02-02' }
    ]
  },
  {
    coords: '50.08720, 14.42225',
    name: 'Prague',
    videos: [
      { title: 'Liberation of Czechoslovakia: Every Day [WW2]', url: 'https://www.youtube.com/watch?v=PR6b2PfefMw', date: '1944-08-29 / 1945-05-15' }
    ]
  },
  {
    coords: '50.45010, 30.52340',
    name: 'Kyiv',
    videos: [
      { title: 'World War II in Ukraine & Aftermath 【1939 - 1960】 — EVERYDAY', url: 'https://www.youtube.com/watch?v=RRonflgdy1o', date: '1939-09-01 / 1944-11-27' }
    ]
  },
  {
    coords: '52.51568, 13.39247',
    name: 'Berlin',
    videos: [
      { title: '[4K] WWII - The Downfall of Nazi Germany: Every Day [Minor Errors]', url: 'https://www.youtube.com/watch?v=sLI9RFyRul0', date: '1945-01-01 / 1945-05-13' }
    ]
  },
  {
    coords: '55.68587, 12.56937',
    name: 'Copenhagen',
    videos: [
      { title: 'German Invasion of Denmark: Every Minute (NEW)', url: 'https://www.youtube.com/watch?v=WW-baHu5aiA', date: '1940-04-09 / 1940-04-09' }
    ]
  },
  {
    coords: '48.70717, 44.51455',
    name: 'Stalingrad',
    videos: [
      { title: 'The War of Annihilation - Battle of Stalingrad & Caucasus / Война на Уничтожение - Битва за Кавказ', url: 'https://www.youtube.com/watch?v=MsOZef3DMno', date: '1942-05-12 / 1943-10-10' }
    ]
  },
  {
    coords: '49.61197, 6.12887',
    name: 'Luxembourg',
    videos: [
      { title: 'Invasion of Luxembourg - Every Hour', url: 'https://www.youtube.com/watch?v=4DDtmYAVPoA', date: '1940-05-10 / 1940-05-10' }
    ]
  },
  {
    coords: '52.37639, 4.89320',
    name: 'Amsterdam',
    videos: [
      { title: 'The invasion of the Netherlands 1940, every hour', url: 'https://www.youtube.com/watch?v=_jIBmUMuadM', date: '1940-05-10 / 1940-05-27' }
    ]
  },
  {
    coords: '48.85520, 2.34945',
    name: 'Paris',
    videos: [
      { title: 'World War II, Western Front 1940, Every Hour', url: 'https://www.youtube.com/watch?v=Zg7ZuET6oe4', date: '1940-05-10 / 1940-07-11' }
    ]
  },
  {
    coords: '59.91310, 10.74040',
    name: 'Oslo',
    videos: [
      { title: 'WW2: Operation Weserübung: Norwegian Campaign Mapped: Every Day', url: 'https://www.youtube.com/watch?v=BOtaegVT2nY', author: 'Jumlesss Mapping', date: '1940-04-08 / 1940-07-23' }
    ]
  },
  {
    coords: '39.66467, 20.85110',
    name: 'Ionnina',
    videos: [
      { title: 'WWII - Balkans Campaign, Every Day (1940-1941) / 巴爾幹戰役', url: 'https://www.youtube.com/watch?v=z7bUu-RUcMg', date: '1940-10-28 / 1941-03-24' }
    ]
  },
  {
    coords: '44.81729, 20.45751',
    name: 'Belgrade',
    videos: [
      { title: 'Axis Invasion on Yugoslavia(April War): Every Day', url: 'https://www.youtube.com/watch?v=wI85VvbGpuw', date: '1941-03-25 / 1941-04-25' }
    ]
  },
  {
    coords: '37.97531, 23.73648',
    name: 'Athens',
    videos: [
      { title: '[4K] WWII - The Invasion of Greece: Every 2 Hours/Every Day', url: 'https://www.youtube.com/watch?v=SsXpNV9_Byg', date: '1941-04-06 / 1941-06-01' }
    ]
  },
  {
    coords: '41.89563, 12.48847',
    name: 'Roma',
    videos: [
      { title: 'World War II - Italian Campaign (1943-1945): Every Day Map', url: 'https://www.youtube.com/watch?v=xb8RNYXwd4E', date: '1943-06-11 / 1945-05-08' }
    ]
  },
  {
    coords: '56.95047, 24.11333',
    name: 'Riga',
    videos: [
      { title: 'WW2: Baltic Offensive Mapped: Every Day', url: 'https://www.youtube.com/watch?v=05lesbm_nTA', date: '1944-09-14 / 1941-12-26' }
    ]
  },
  {
    coords: '59.93876, 30.31560',
    name: 'Leningrad',
    videos: [
      { title: 'The War of Annihilation - Siege of Leningrad / Война на Уничтожение - Блокада Ленинграда', url: 'www.youtube.com/watch?v=xEuUUYlRGag', date: '1944-06-22 / 1944 -10-01' }
    ]
  },
  {
    coords: '44.43742, 26.10037',
    name: 'Bucharest',
    videos: [
      { title: 'World War II - Partition of Romania (1940) Map', url: 'https://www.youtube.com/watch?v=SCs_kf0qyqQ', date: '1940-06-28 / 1941-07-06' }
    ]
  },
  {
    coords: '60.17177, 24.93551',
    name: 'Helsinki',
    videos: [
      { title: 'WW2: The Continuation War: Every Day (Remake) [25.06.41 – 19.09.44] [4K]', url: 'https://www.youtube.com/watch?v=0WvPIYi2pVU', author: 'Jumlesss Mapping', date: '1941-06-25 / 1944-09-19' },
      { title: 'WWII - The Winter War/Советско-финляндская война/Talvisota (1939-1940): Every Day', url: 'https://www.youtube.com/watch?v=A94GgeX-FKI', date: '1939-11-30 / 1944-03-13' }
    ]
  },
  {
    coords: '55.75040, 37.61734',
    name: 'Moscow',
    videos: [
      { title: 'WW2: Operation Barbarossa MAPPED【22.06.41 - 05.12.41】- EVERY DAY',
        url: 'https://www.youtube.com/watch?v=n4uHL6BOhzY',
        author: 'Jumlesss Mapping',
        date: '1941-06-22 / 1941-12-05',
        embed: false }, 
      { title: 'The War of Annihilation - Battle of Moscow / Война на Уничтожение - Битва за Москву', url: 'https://www.youtube.com/watch?v=TRdV-gm7PEc', date: '1941-06-22 / 1943-04-01' }
    ]
  },
  {
    coords: '49.19081, 37.27984',
    name: 'Izium',
    videos: [
      { title: 'World War 2: Eastern Front / Barvenkovo-Lozovaya Offensive & Aftermath', url: 'https://www.youtube.com/watch?v=eZE3WiHGomc', date: '1942-01-18 / 1942-06-01' }
    ]
  },
  {
    coords: '48.14090, 17.10549',
    name: 'Bratislava',
    videos: [
      { title: 'WWII - The Slovak National Uprising/Slovenské Národné Povstanie (1944): Every Day', url: 'https://www.youtube.com/watch?v=8hTTudGkePo', date: '1944-08-29 / 1944-10-28' }       
    ]
  }
];