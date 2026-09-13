# DramTrack specification — v3

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
- No collection cap. Google account sync, bottle images are pending. Community notes are a placeholder.
- Currency conversion falls back to explicitly labelled USD when unavailable.

## Release
Version 3 loads the public archive automatically. Asset cache key: 3. Live validation snapshot: 53,982 rows, 51,635 accepted ratings, 17,457 bottles. The Pages workflow publishes only public assets. Existing personal CSVs remain local and untracked.
