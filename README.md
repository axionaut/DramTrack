# DramTrack

A static browser app hosted on GitHub Pages. No Python, backend, installation or build step.

Site: https://axionaut.github.io/DramTrack/

The library loads automatically from the public Reddit Whisky Network Review Archive:
https://docs.google.com/spreadsheets/d/1X1HTxkI6SqsdpNSkSSivMzpxNT-oeTbjFFDdEkXD30o/edit#gid=695409533

No library import, Google credentials or account is needed. The app groups bottle names ignoring case and surrounding whitespace, averages numeric review ratings within 0-100, and counts accepted reviews. It refreshes its cached archive after 24 hours on opening; Settings & data also provides Refresh archive. If downloading fails, the saved library remains available.

Personal rankings remain on this device. Rankings/ignored CSV imports and full JSON backup/restore are available for transferring personal data. Archive refresh never rewrites personal ranking order or saved scores. Prices and Value are unavailable because the archive does not provide reliable currency metadata.

Google login and account synchronization are not connected. Bottle images use the original Bing lookup with a 30-day IndexedDB cache, lazy loading and a Refresh image control. Currency conversion uses live exchange rates with a labelled USD fallback.

GitHub Actions deploys only index.html, styles.css, logic.js, web.js, archive.js, images.js and Logo.png to Pages on pushes to main. Private data is excluded from deployment and version control.

Validation: JavaScript syntax checks and node logic.test.cjs.
