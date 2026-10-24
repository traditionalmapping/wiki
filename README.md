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