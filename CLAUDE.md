# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Russian-language workout diary PWA (Progressive Web App) for tracking gym exercises, sets, reps, and weights. The app uses Google Sheets as a database via Google Apps Script API.

## Architecture

**Frontend (Static files, no build process):**
- `index.html` - Main SPA with embedded JavaScript for all app logic
- `js/api.js` - API client module for Google Apps Script backend
- `css/styles.css` - Mobile-first CSS with CSS custom properties

**Backend:**
- `google-apps-script/Code.gs` - Google Apps Script code that runs as a web app
- Data stored in Google Sheets with four sheets: `Users`, `Workouts`, `Exercises`, `BodyMetrics`

**Authentication:**
- Google OAuth via Google Identity Services (GSI) library
- Token stored in localStorage and sent with each API request
- Backend verifies Google ID token via `oauth2.googleapis.com/tokeninfo`
- Demo mode available for trying the app without authentication

**Data Flow:**
1. User authenticates via Google Sign-In, receives ID token
2. Frontend calls `API.get()` or `API.post()` methods with token
3. Backend verifies token, extracts user_id, filters data by user
4. Script reads/writes to Google Sheets and returns JSON

## Development

No build tools required. Open `index.html` directly in browser or serve via local server.

To test with backend:
1. Create a Google Cloud project and enable OAuth consent screen
2. Create OAuth 2.0 Client ID (Web application type)
3. Create a Google Sheet
4. Open Extensions → Apps Script
5. Paste `google-apps-script/Code.gs` content
6. Update `SPREADSHEET_ID` and `GOOGLE_CLIENT_ID` constants in Code.gs
7. Deploy as web app (access: "Anyone")
8. Update `BASE_URL` in `js/api.js`
9. Update `GOOGLE_CLIENT_ID` in `index.html` (search for `google.accounts.id.initialize`)

## App Pages

- **Авторизация (Auth)**: Google Sign-In or demo mode entry
- **Тренировка (Workout)**: Create workout session, add exercises and sets
- **История (History)**: View past workouts grouped by date
- **Статистика (Statistics)**: Per-exercise stats with Chart.js weight progress chart
- **Упражнения (Exercises)**: Browse exercises by category (base/isolation)
- **Замеры (Body Metrics)**: Track body measurements (height, weight, neck, waist, body fat %)

## Key Patterns

- Single-page app with manual page switching via `showPage()` function
- State stored in global variables (`exercises`, `currentWorkout`, `lastWorkoutData`)
- Exercises grouped by category and type (`base` vs `isolation`)
- Custom exercises are per-user (`user_id` column in Exercises sheet)
- Auto-fill sets with data from last workout for each exercise
- Rest timer with circular SVG progress and audio beep on completion
