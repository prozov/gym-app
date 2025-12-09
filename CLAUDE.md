# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Russian-language workout diary PWA (Progressive Web App) for tracking gym exercises, sets, reps, and weights. The app uses Google Sheets as a database via Google Apps Script API.

## Architecture

**Frontend (Static files, no build process):**
- `index.html` - Main SPA with embedded JavaScript for all app logic
- `js/api.js` - API client module for Google Apps Script backend
- `css/styles.css` - Mobile-first CSS with CSS custom properties
- `prototype.html` - Static UI mockup (not connected to API)

**Backend:**
- `google-apps-script/Code.gs` - Google Apps Script code that runs as a web app
- Data stored in Google Sheets with two sheets: `Workouts` and `Exercises`

**Data Flow:**
1. Frontend calls `API.get()` or `API.post()` methods
2. Requests go to deployed Google Apps Script web app URL
3. Script reads/writes to Google Sheets and returns JSON

## Development

No build tools required. Open `index.html` directly in browser or serve via local server.

To test with backend:
1. Create a Google Sheet
2. Open Extensions → Apps Script
3. Paste `google-apps-script/Code.gs` content
4. Update `SPREADSHEET_ID` and `SECRET_KEY` constants
5. Deploy as web app (access: "Anyone")
6. Update `BASE_URL` and `SECRET_KEY` in `js/api.js`

## App Pages

- **Тренировка (Workout)**: Create workout session, add exercises and sets
- **История (History)**: View past workouts grouped by date
- **Статистика (Statistics)**: Per-exercise stats with Chart.js weight progress chart
- **Упражнения (Exercises)**: Browse exercises by category (base/isolation)

## Key Patterns

- Single-page app with manual page switching via `showPage()` function
- State stored in global variables (`exercises`, `currentWorkout`, `lastWorkoutData`)
- Exercises grouped by category and type (`base` vs `isolation`)
- Auto-fill sets with data from last workout for each exercise
- Rest timer with circular SVG progress and audio beep on completion
