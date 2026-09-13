# DramTrack

A static browser app hosted on GitHub Pages. No Python, backend, installation or build step.

Site: https://nitinjoshi4u-crypto.github.io/DramTrack/

Import the Whiskeys Google Sheet as CSV using Settings & data. Required columns: Name and Rating; optional columns: Count, Price, Value, Distillery. Import existing rankings and ignored-bottle CSVs from Settings & data. Personal data stays in the browser; download a full backup to transfer it between devices.

Google login and private Sheet synchronization are not connected. Bottle artwork uses placeholders. Currency conversion uses live exchange rates with a labelled USD fallback.

GitHub Actions deploys only index.html, styles.css, logic.js, web.js and Logo.png to Pages on pushes to main. Private data is excluded from deployment and version control.

Validation: JavaScript syntax checks and node logic.test.cjs.
