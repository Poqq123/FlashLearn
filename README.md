# FlashLearn

FlashLearn is a flashcard study application with a static multi-page frontend and a FastAPI backend. It helps students organize cards into collections, study them in a focused card view, review performance in quiz mode, and generate draft flashcards with AI. Authentication is handled through Supabase OAuth, and the backend stores user data and review progress in PostgreSQL.

## Project Summary

The final project includes:

- A landing page and redirect entry page for signed-in and signed-out users
- Supabase OAuth login with Google, Discord, and GitHub provider options
- A study dashboard for creating, editing, deleting, browsing, and filtering flashcards
- Collection management with optional class name, collection color, and JSON import/export
- AI-assisted flashcard drafting through the Gemini API
- A quiz dashboard with collection search, typed answer checking, mastery statistics, and progress reset
- A collection detail page with mastery overview and a link into a focused study session
- A focused study-session page with card flipping and review actions
- A profile page with account details, flashcard totals, and avatar preset selection
- A protected FastAPI backend for collections, cards, review tracking, progress reset, and AI generation

## Main Technologies

- Frontend: HTML, CSS, JavaScript
- Backend: FastAPI, SQLAlchemy
- Authentication: Supabase Auth
- Database: PostgreSQL
- AI generation: Gemini API

## Repository Layout

```text
.
├── backend/app/main.py            # Main FastAPI application
├── main.py                        # Compatibility entrypoint for uvicorn
├── frontend/shared/js/app-core.js # Frontend runtime config and auth helpers
├── frontend/pages/login/          # Login page
├── frontend/pages/study/          # Main flashcard dashboard
├── frontend/pages/quiz/           # Quiz, collection, and study-session pages
├── frontend/pages/profile/        # Profile page
├── home.html                      # Landing page
├── index.html                     # Entry redirect page
├── README.TXT                     # Submission-style text version
└── TestResults/                   # Testing summary and support files
```

## Features

### Frontend Pages

- `index.html`
  - Redirects signed-in users toward the app and signed-out users to the landing page
- `home.html`
  - Marketing / landing page
- `frontend/pages/login/login.html`
  - OAuth sign-in page
- `frontend/pages/study/index.html`
  - Main study dashboard
  - Card creation, editing, deletion, and browsing
  - Collection creation, editing, deletion, filtering, import, and export
  - AI flashcard drafting and save flow
- `frontend/pages/quiz/quiz.html`
  - Quiz dashboard with collection filtering, progress statistics, and typed answer checking
- `frontend/pages/quiz/collection.html`
  - Collection detail page with mastery snapshot
- `frontend/pages/quiz/study-session.html`
  - Focused study session with review actions
- `frontend/pages/profile/profile.html`
  - Profile page with account information, member date, total flashcards, and avatar presets

### Backend Behavior

- Protected API with Supabase bearer-token validation
- Collection CRUD endpoints
- Card CRUD endpoints
- Card review tracking with progress metrics
- Progress reset endpoint
- AI card generation endpoint
- Schema backfill on startup to keep older databases usable

### Card Progress Data

Each flashcard can store:

- `review_count`
- `correct_count`
- `ease_factor`
- `interval_days`
- `due_at`
- `last_reviewed_at`
- `streak_current`
- `streak_best`

## How to Run the Program

### Option 1: Use the deployed version

Open the live app:

[FlashLearn](https://poqq123.github.io/FlashLearn)

### Option 2: Run locally

#### Prerequisites

- Python 3.9 or newer
- A PostgreSQL database
- A Supabase project
- Internet access for OAuth and AI generation

#### 1. Install dependencies

```bash
pip install -r requirements.txt
```

#### 2. Create the environment file

```bash
cp .env.example .env
```

#### 3. Configure environment variables

Fill in these values in `.env`:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_JWT_ISSUER`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

Notes:

- `DATABASE_URL` should point to your PostgreSQL database
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` must match the frontend project configuration
- `SUPABASE_JWT_SECRET` is required for HS256 token verification
- `GEMINI_API_KEY` is required only for AI card generation

#### 4. Update frontend runtime config

The frontend runtime config is in:

`frontend/shared/js/app-core.js`

Update these values if you are not using the existing deployed services:

- `API_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

#### 5. Start the backend

```bash
uvicorn main:app --reload --env-file .env
```

Backend default URL:

- `http://127.0.0.1:8000`

#### 6. Serve the frontend

Do not open the app from `file://`.

```bash
python3 -m http.server 4173
```

#### 7. Open the app

Open:

- `http://127.0.0.1:4173/index.html`

Useful local URLs:

- Landing page: `http://127.0.0.1:4173/home.html`
- Login page: `http://127.0.0.1:4173/frontend/pages/login/login.html`
- Study page: `http://127.0.0.1:4173/frontend/pages/study/index.html`
- Quiz page: `http://127.0.0.1:4173/frontend/pages/quiz/quiz.html`
- Profile page: `http://127.0.0.1:4173/frontend/pages/profile/profile.html`

## Testing

The formatted testing documents are in [`TestResults/`](/Users/GeneralUse/LinuxHome/FlashcardTest/TestResults):

- [TestSummary.md](/Users/GeneralUse/LinuxHome/FlashcardTest/TestResults/TestSummary.md)
- [KnownIssues.md](/Users/GeneralUse/LinuxHome/FlashcardTest/TestResults/KnownIssues.md)
- [AutomatedTestRunResults.md](/Users/GeneralUse/LinuxHome/FlashcardTest/TestResults/AutomatedTestRunResults.md)
- [ManualTests.md](/Users/GeneralUse/LinuxHome/FlashcardTest/TestResults/ManualTests.md)
- [UserTestingNotes.md](/Users/GeneralUse/LinuxHome/FlashcardTest/TestResults/UserTestingNotes.md)

Plain-text copies are still present for submission compatibility with the original assignment wording.

## Important Notes

- The frontend is static and the backend is deployed separately in the current project setup
- The frontend runtime currently stores service values directly in `app-core.js`
- AI card generation will fail unless the backend has a valid Gemini API key
- Signed-in features require a working Supabase Auth configuration and a reachable backend API
