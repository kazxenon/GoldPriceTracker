# UOB Gold Tracker

Static web app for GitHub Pages and mobile browsers.

## What it does

- shows the latest saved UOB gold prices from `data/history.json`
- charts UOB snapshot movement from the saved history file
- shows a custom global gold history chart with hover tooltips
- lets you compare your UOB purchase prices against the current UOB bank buy price

## GitHub Pages

This app is designed to work as a static site.

- `app.js`, `index.html`, and `styles.css` run directly in the browser
- global gold history is fetched client-side from `FreeGoldAPI` and `Frankfurter`
- UOB data is read from the repo’s `data/history.json`

Because UOB blocks open browser CORS, GitHub Pages cannot fetch UOB live directly from the browser. Instead, this repo includes a GitHub Action that updates `data/history.json` on a schedule.

## Automatic UOB updates

The workflow is in `.github/workflows/update-uob-history.yml`.

It runs every 6 hours and:

1. fetches the latest UOB bullion feed
2. normalizes the gold products
3. appends a new snapshot to `data/history.json` if it changed

The fetch script is in `scripts/update_uob_history.py`.

## Optional local preview

You can still preview it locally with any static server, for example:

```bash
cd /Users/wanghweeli/Documents/uob-gold-tracker
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000`.
