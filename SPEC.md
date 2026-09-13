# DramTrack specification — v4

Static HTML/CSS/JavaScript application published to GitHub Pages by .github/workflows/pages.yml. No server runtime or build dependencies.

## Data and behavior
- Library source: public Reddit Whisky Network Review Archive, sheet 1X1HTxkI6SqsdpNSkSSivMzpxNT-oeTbjFFDdEkXD30o, gid 695409533. archive.js fetches and aggregates in a Web Worker without credentials.
- Group by trimmed, case-insensitive name; average nonblank finite numeric ratings in [0,100] without rescaling. Count accepted rows; exclude invalid ratings. Price and Value are unavailable because currency is unspecified.
- Cache the archive for 24 hours; refresh on next opening or manual Refresh archive. Failures retain saved data. No library import in the UI.
- Personal rankings, library, ignored bottles and currency persist in browser localStorage. CSV import and JSON backup/restore support transfer between devices.
- Binary insertion duels place each new bottle in personal preference order.
- Internal scores assign the owned bottles' raw library ratings, sorted descending, in personal rank order.
- Recommendations exclude owned and ignored bottles. Select nearest higher ratings above the top internal score, with Value breaking rating ties; fill remaining slots from nearest equal/lower ratings. Display selected results by descending rating and value.
- Library imports preserve saved scores; adding/removing bottles recomputes scores when a library is available.
- No collection cap. Google account sync, account synchronization is pending. Community notes are a placeholder.
- Currency conversion falls back to explicitly labelled USD when unavailable.

## Release
Version 3 loads the public archive automatically. Asset cache key: 6. Live validation snapshot: 53,982 rows, 51,635 accepted ratings, 17,457 bottles. The Pages workflow publishes only public assets. Existing personal CSVs remain local and untracked.

## Bottle images (v4)
- Restore original Bing bottle-name lookup in recommendations, duels, details and collection thumbnails.
- images.js stores validated image blobs in IndexedDB for 30 days, coalesces duplicate requests and limits downloads to three at once. Images load near the viewport. Failed refreshes retain cached images.
- Refresh image reloads the lookup and updates visible copies for that bottle; search results are supplied by Bing and are not guaranteed to identify every bottle correctly.
- Image cache stays separate from saved rankings. No credentials, backend or installation.

## Full-width layout (v5)
- Header and main content use the full viewport width with 32px desktop side padding and 18px mobile padding. Removed the 1200px cap.
- Five desktop recommendation columns share the available width with zero-minimum grid tracks to avoid content forcing oversized columns.

## Shelf layout (v6)
- Replace the collection table with ranked bottle cards; highlight the first-ranked favourite and show taste score below each bottle.
- Desktop: a flexible collection grid alongside a compact recommendation column. Tablet/mobile: stacked sections, with two collection cards per mobile row.
- Compact heading and search bring the collection closer to the top. Move source status below the workspace.
- Bottle details open from images or names. Collection More menus contain refresh/remove; recommendation cards expose Tried it and Skip, with image refresh in details.
- Ranking, recommendation, archive and persistence behavior unchanged.
