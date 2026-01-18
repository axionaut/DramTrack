# Copilot Instructions for DramTrack Pro

## Project Overview
- **DramTrack Pro** is a Streamlit app for personal whiskey rankings, using Google Sheets as the master data source and supporting per-user CSV storage for rankings.
- The app features a binary-search style "duel" UI for ranking new bottles, a disk-backed image cache, and a recommendation engine based on user preferences.

## Architecture & Data Flow
- **Frontend:** Streamlit (single-process web app, all logic in `main.py`).
- **Data sources:**
  - Master whiskey library: Google Sheets (`Your Next Whiskey`, worksheet `Whiskeys`) via `gspread`.
  - User data: CSV files in `user_data/` (logged-in) or `guest_rankings.csv` (guest).
  - Images: Downloaded from Bing, cached in `image_cache/` with atomic lock files for concurrency safety.
- **Session state:** All user state and cache are managed via `st.session_state`.

## Key Files & Directories
- `main.py`: All app logic, UI, and data handling.
- `requirements.txt`: Python dependencies (Streamlit, gspread, pandas, etc.).
- `data/service_account.json`: Google service account credentials (not checked in).
- `user_data/`, `image_cache/`, `guest_rankings.csv`: User and cache data.
- `SPEC.md`: Living specification and change log.

## Critical Workflows
- **Run the app:** `streamlit run main.py`
- **Google Sheets setup:** Share the sheet with the service account email in `data/service_account.json`.
- **Image cache:** Images are fetched and cached on first access; cache is concurrency-safe via lock files.
- **Ranking logic:** New bottles are inserted into the user's list using a binary search duel (see `main.py`, "DUEL ENGINE").
- **Recommendations:** Based on the user's top-ranked bottle, using a weighted rating and value tie-breaker (see `get_recommendations`).

## Project-Specific Patterns
- **No tests or CI by default:** Add tests for image caching and duel logic if extending.
- **Image processing:** Heavy image processing was reverted; only basic caching and format conversion remain.
- **Session state resets:** On login/logout, session state is cleared except for the ignored list.
- **Guest limits:** Guests can only rank up to 10 bottles; prompt to log in for more.
- **Atomic file operations:** Image cache uses lock files and atomic replace to avoid race conditions.

## Integration & Extensibility
- To add new features, extend `main.py` directly.
- For multi-instance deployments, replace local `image_cache/` with shared storage (S3/CDN).
- All user-facing data is stored as CSV; schema changes require migration logic in `main.py`.

## References
- See `SPEC.md` for the latest architecture, data flow, and change log.
- All business logic and UI are in `main.py`.

---

For questions or unclear conventions, review `SPEC.md` and `main.py` for up-to-date patterns. Update this file if you introduce new architectural patterns or workflows.
