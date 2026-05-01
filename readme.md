# UH Food Logger — Chrome Extension

A Chrome extension that lets you bulk-upload UH dining hall foods to MyFitnessPal. Import a CSV, select what you want, and upload everything in one click. Optionally log directly to your diary in the right meal.

## Features

- **CSV import** — upload a spreadsheet of foods with nutrition info
- **Template download** — get a pre-formatted CSV to fill in
- **Custom source** — set the brand name that shows up in MFP (e.g. "Dining Hall", "Moody Towers")
- **Duplicate prevention** — foods already uploaded are cached locally and skipped automatically; server-side duplicates are caught and cached too
- **Optional diary logging** — check "Also log to diary" to log foods to a specific meal on today's date
- **Dynamic meal names** — meal dropdown is pulled live from your actual MFP diary (e.g. "Supplements // Pre-Workout", "Lunch", "Dinner") instead of hardcoded options
- **Zero-calorie filter** — foods with 0 or fewer calories are automatically skipped
- **Upload stats** — shows Added / Duplicates / Skipped after every run
- **Persistent preferences** — source name and diary toggle are remembered between popup opens
- **Select/deselect all** — quickly pick what you actually ate
- **Dine on Campus import** *(coming soon)* — pull today's menu directly from dineoncampus.com/uh

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

1. Log in to [MyFitnessPal](https://www.myfitnesspal.com) in your browser
2. Keep an MFP tab open (any page works)
3. Click the extension icon in your toolbar
4. Set the **Source** field (saved automatically for next time)
5. Import your CSV and select the foods you want
6. Optionally check **Also log to diary** and pick a meal
7. Click **Upload Selected Foods to MFP**

## Project Structure

```
src/
├── manifest.json   # Extension config (Manifest V3)
├── popup.html      # Extension UI
├── popup.css       # Styles (MFP blue #0167EE)
├── popup.js        # CSV parsing, cache logic, template download, messaging
├── content.js      # Runs in MFP tab — scrapes CSRF token, fires API requests
└── icons/
    └── icon.png
```

## How It Works

MFP is behind Cloudflare, so automated requests from a backend get blocked. This extension runs entirely in your real browser — `content.js` is injected into the MFP tab where it inherits your session cookies automatically. No tokens are stored or transmitted anywhere.

**Data flow:**

```
popup.js
  → loads cache from chrome.storage.local
  → filters out zero-cal and already-cached foods
  → sends remaining foods via chrome.tabs.sendMessage() → content.js

content.js (injected into MFP page)
  → fetches X-CSRF-Token from GET /api/auth/csrf
  → fetches user ID from GET /api/auth/session
  → POSTs each food to /api/services/foods
  → optionally POSTs to /api/diary/entries for each food
  → reports { loggedNames, duplicateNames, failed, diaryed } back to popup

popup.js
  → caches loggedNames + duplicateNames in chrome.storage.local
  → displays upload stats
```

## Notes

- No npm or build tools — plain HTML/CSS/JS only
- MFP automation is a grey area in their TOS — use at your own risk
- The diary entry endpoint (`/api/diary/entries`) is unverified — capture an "Add to Diary" network request from MFP's UI to confirm the correct endpoint and payload
