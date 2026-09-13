# DramTrack specification — v2

Static HTML/CSS/JavaScript application published to GitHub Pages by .github/workflows/pages.yml. No server runtime or build dependencies.

## Data and behavior
- Library CSV fields: Name, Rating, Count, Price, Value, Distillery.
- Personal rankings, library, ignored bottles and currency persist in browser localStorage. CSV import and JSON backup/restore support transfer between devices.
- Binary insertion duels place each new bottle in personal preference order.
- Internal scores assign the owned bottles' raw library ratings, sorted descending, in personal rank order.
- Recommendations exclude owned and ignored bottles. Select nearest higher ratings above the top internal score, with Value breaking rating ties; fill remaining slots from nearest equal/lower ratings. Display selected results by descending rating and value.
- Library imports preserve saved scores; adding/removing bottles recomputes scores when a library is available.
- No collection cap. Google account sync, private Sheet fetching and bottle images are pending. Community notes are a placeholder.
- Currency conversion falls back to explicitly labelled USD when unavailable.

## Release
Version 2 removes the Python runtime and local launch tooling. All application assets use cache key 2. The Pages workflow publishes only public assets. Existing personal CSVs remain local and untracked.
