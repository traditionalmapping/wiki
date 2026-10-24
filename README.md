# Traditional Mapping Wiki

**English** | [Русский](README.ru.md)

An interactive map with video panels pinned to places. Videos appear in two spots:

- as **panels on the map**, pointing at the place
- in the **"Videos" list on the left**, each with a **Show on map** button

## How to add a video

All videos live in one file: **`js/places.js`**. You don't need to touch any other file.

### 1. Get the coordinates

1. Open the map and move it so the **white cross** in the middle of the screen is exactly on the place.
2. Click **Copy** in the top-right coordinates box.
3. You now have the coordinates in the form `lat, lng`, for example `52.22970, 21.01220`.

### 2. Add a new place

Open `js/places.js`, copy one whole `{ ... }` block, and paste it after the last one. Keep a comma between blocks.

```js
{
  coords: '52.22970, 21.01220',
  videos: [
    { title: 'Name of the video', url: 'https://www.youtube.com/watch?v=XXXXXXXXXXX' }
  ]
},
```

| Field    | What to put                                         |
|----------|-----------------------------------------------------|
| `coords` | Paste the coordinates from the **Copy** button      |
| `title`  | The name shown on the panel and in the list         |
| `url`    | Link to the video                                   |

### 3. Add more videos to an existing place

Add more `{ title, url }` lines inside that place's `videos` list, with a comma between them.

```js
videos: [
  { title: 'First video',  url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' },
  { title: 'Second video', url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB' }
]
```

The map panel shows the first video plus a **+N** button that opens the rest. The list on the left shows every video.

### Thumbnails

- **YouTube links:** the thumbnail is automatic.
- **Other sites:** add a `thumb` to that video:

```js
{ title: 'My video', url: 'https://example.com/video', thumb: 'https://example.com/image.jpg' }
```

### Optional: date, tags, place name (author is automatic)

The **Videos** panel on the left can search, group, sort and filter. For that it uses extra fields you can add (all optional):

```js
{
  coords: '52.22970, 21.01220',
  name: 'Warsaw',                       // place name (used by "Group by: Place")
  videos: [
    {
      title: 'Warsaw Uprising (1944)',
      url: 'https://www.youtube.com/watch?v=XXXXXXXXXXX',
      date: '1944-08-01 / 1944-10-02',  // when the events in the video happen
      tags: ['Eastern Front', 'Every day']  // clickable labels + the Tag filter
    }
  ]
},
```

- **Author:** for YouTube links the channel name is found automatically (and remembered in the browser), so you don't write it. You can still add `author: '...'` to override it, and you need it for links from other sites.
- **Date:** the date of the events shown in the video, not the upload date. Use one date or a range: `'1944-08-01'`, `'1944-08'`, `'1944'` or `'1944-08-01 / 1944-10-02'`. Grouping by year and sorting use the start date. It can't be found automatically, so write it yourself.
- **Tags** and **name** are written by hand too.

Videos without a date land in the "Unknown date" group, and are listed last when sorting by date. The **Tag** filter appears once at least one video has a tag.

### Playing videos

Clicking a **YouTube thumbnail** plays the video in a pop-up on the map page, with no need to go to YouTube. Close it with the ✕, a click outside, or **Esc**. Ctrl/Shift-click (or middle-click) opens YouTube in a new tab instead. Links from other sites always open in a new tab.

If the owner of a video disabled embedding, YouTube can't play it in a pop-up. Such a video is detected automatically and its thumbnail opens YouTube in a new tab instead. You can also force this by adding `embed: false` to that video.

> The player needs the site to be opened through `http://` or `https://` (for example GitHub Pages or a local server). Opened directly as a `file://` page, YouTube shows an error instead of the video.

## Common mistakes

- **Missing comma** between two `{ ... }` blocks or two videos. Nothing will show up if the file has a syntax error.
- **Coordinates in the wrong order.** It must be `lat, lng` (the Copy button already gives it in this order).
- **Link without `https://`.** Only normal web links are accepted.
- **Nothing changed in the browser.** Refresh the page (Ctrl+F5) to clear the cache.

If a place doesn't appear, open the browser console (F12). It prints a warning such as `Place #3: bad coords`.

## Files

| File                | Purpose                                              |
|---------------------|------------------------------------------------------|
| `js/places.js`      | **The list of places and videos (edit this one)**    |
| `js/markers.js`     | Draws the map panels and the left-side video list    |
| `js/map.js`         | Map setup and controls                               |
| `js/menu.js`        | Periods menu                                         |
| `js/history.js`     | History map and opacity slider                       |
| `css/style.css`     | All styling                                          |
| `index.html`        | Page structure and the Periods menu                  |