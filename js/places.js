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
      { title: 'WWII - The Slovak National Uprising/Slovenské Národné Povstanie (1944): Every Day', url: 'https://www.youtube.com/watch?v=8hTTudGkePo', date: '1944-08-29 / 1944-10-28' },
      { title: 'Liberation of Czechoslovakia: Every Day [WW2]', url: 'https://www.youtube.com/watch?v=PR6b2PfefMw', date: '1944-08-29 / 1945-05-15' },        
    ]
  }
];