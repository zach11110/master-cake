How to add menu images and items

1) Place your images inside the section folder that matches the item:

- cold drinks → `menu/cold_drinks/`
- hot drinks → `menu/hot_drinks/`
- sweets → `menu/sweets/`
- argillies → `menu/argillies/`
- ice cream → `menu/ice_cream/`

2) Edit `menu/manifest.json` and add each item with its bilingual name, description, and the list of image file names. Example:

{
  "id": "iced-latte",
  "arName": "ايسد لاتيه",
  "enName": "Iced Latte",
  "descriptionAr": "حليب بارد، اسبريسو، ثلج.",
  "descriptionEn": "Cold milk, espresso, ice.",
  "images": ["iced-latte-1.jpg", "iced-latte-2.jpg"]
}

3) Images are referenced relative to their section folder. For the example above, put the files in `menu/cold_drinks/`.

4) Click any item in the website to open a gallery modal showing all images and the description. If no images are provided, a soft placeholder is shown.

Local testing tip (file://):
- Some browsers block `fetch` of JSON when opening `index.html` by double-click.
- The app automatically falls back to `menu/manifest.js` if `manifest.json` cannot be loaded.
- To force the fallback, just open `index.html` directly without a local server.
- For production, keep using `manifest.json` (served over HTTP) for easy editing.

