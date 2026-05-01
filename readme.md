# Campus Food Logger — Chrome Extension

A Chrome extension that lets you bulk-upload college dining hall foods to MyFitnessPal. Pull today's menu straight from the Campus Dining API or import your own CSV, select what you want, and upload everything in one click. Optionally log directly to your diary in the right meal.

## Features

- **Dining Hall API** *(College Mode)* — fetch live menus for 15+ Texas universities directly from the Campus Dining backend; no CSV needed
- **Graceful closed-hall handling** — if the dining hall has no menu for the selected meal/time, a friendly message is shown instead of a raw scraper error
- **CSV import** — upload a spreadsheet of foods with nutrition info
- **Template download** — get a pre-formatted CSV to fill in
- **Custom source** — set the brand name that shows up in MFP (e.g. "Dining Hall", "Moody Towers")
- **Duplicate prevention** — foods already uploaded are cached locally and skipped automatically; server-side duplicates are caught and cached too
- **Optional diary logging** — check "Log to diary" to log foods to a specific meal on today's date
- **Dynamic meal names** — meal dropdown is pulled live from your actual MFP diary instead of hardcoded options
- **Zero-calorie filter** — foods with 0 or fewer calories are automatically skipped
- **Upload stats** — shows Added / Duplicates / Skipped after every run
- **Persistent preferences** — source, toggles, and last dining hall selection are remembered between popup opens
- **Select/deselect all** — quickly pick what you actually ate
- **College Mode toggle** — hide the Dining Hall section entirely if you don't use it

## CSV Format

Download the template from the extension, or use this header row:

```
name,serving_size,calories,protein,carbs,fats,sugar
```

Example:

```csv
name,serving_size,calories,protein,carbs,fats,sugar
Chicken Breast,3 oz,140,26,0,3,0
Brown Rice,1/2 cup,110,3,23,1,0
```

The `date`, `protein_per_calorie`, and `calories_per_protein` columns from Dine on Campus exports are accepted but ignored. Missing or `N/A` serving sizes fall back to `"serving"`.

## Setup

1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked** → select the `src/` folder
4. Reload the extension after any code changes

> After reloading the extension, also reload your MFP tab — content scripts only inject into tabs opened after the extension loads.

## Usage

### CSV Import
1. Log in to [MyFitnessPal](https://www.myfitnesspal.com) in your browser
2. Keep an MFP tab open (any page works)
3. Click the extension icon → set the **Source** field
4. Import your CSV and select the foods you want
5. Optionally check **Log to diary** and pick a meal
6. Click **Upload Selected Foods to MFP**

### College Mode (Dining Hall API)
1. Click **⚙** → enable **College Mode**
2. Make sure the Campus Dining backend is running locally
3. Select your **School** → **Hall** → **Meal**
4. Click **Fetch Menu** — the food list populates automatically
5. Select foods and upload as normal

## Project Structure

```
src/
├── manifest.json   # Extension config (Manifest V3)
├── popup.html      # Extension UI
├── popup.css       # Styles (MFP blue #0167EE)
├── popup.js        # All popup logic — CSV, dining API, cache, messaging
├── content.js      # Runs in MFP tab — scrapes CSRF token, fires API requests
└── icons/
    └── icon.png
```

## How It Works

MFP is behind Cloudflare, so automated requests from a backend get blocked. This extension runs entirely in your real browser — `content.js` is injected into the MFP tab where it inherits your session cookies automatically. No tokens are stored or transmitted anywhere.

**Data flow:**

```
popup.js
  → (College Mode) fetches menu from Campus Dining API → foods array
  → (CSV Mode) parses CSV → foods array
  → filters out zero-cal and already-cached foods
  → sends remaining foods via chrome.tabs.sendMessage() → content.js

content.js (injected into MFP page)
  → fetches X-CSRF-Token from GET /api/auth/csrf
  → fetches user ID from GET /api/auth/session
  → POSTs each food to /api/services/foods
  → optionally POSTs to /api/diary/entries for each food
  → reports { loggedNames, duplicateNames, failed } back to popup

popup.js
  → caches loggedNames + duplicateNames in chrome.storage.local
  → displays upload stats
```

## Developer Notes

- **API URL**: The backend URL is hardcoded as `DEFAULT_API_URL = "http://localhost:5001"` at the top of `popup.js`. Update this constant when deploying. Also add the new host to `host_permissions` in `manifest.json`.
- **macOS note**: Port 5000 is blocked by AirPlay Receiver — the default is already set to 5001 to account for this.
- No npm or build tools — plain HTML/CSS/JS only
- MFP automation is a grey area in their TOS — use at your own risk
- The diary entry endpoint (`/api/diary/entries`) is unverified — capture an "Add to Diary" network request from MFP's UI to confirm the correct endpoint and payload

## What's Left

- [ ] **Diary endpoint verification** — `addToDiary()` in `content.js` uses a guessed payload. Capture a real "Add to Diary" network request from MFP to confirm.
- [ ] **Cache management UI** — a "Clear Cache" button for forcing re-upload of an entire menu.
- [ ] **Update `DEFAULT_API_URL`** in `popup.js` once the backend is deployed.
