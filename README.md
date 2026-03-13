# FlashLearn

FlashLearn is a flashcard study application with a static multi-page frontend and a FastAPI backend. It helps students organize cards into collections, study them in a focused card view, review performance in quiz mode, and generate draft flashcards with AI. Authentication is handled through Supabase OAuth, and the backend stores user data and review progress in PostgreSQL.

## Project Summary

FlashLearn is built to help students organize study material and review it in multiple ways. After signing in, users can build their own flashcard sets, group cards into collections, generate flashcard sets with Gemini, practice in a normal study view, switch into quiz mode to check recall, and track progress over time.

## What Users Can Do

- AI flashcard set generation (min: 3 cards, max: 15 cards)
- AI-generated flashcard preview
- AI-generated flashcard saving
- Assign flashcards to a specific collection
- Authentication via Google/GitHub/Discord OAuth providers
- Avatar (profile picture) customization with preset choices
- Collection color customization
- Collection detail page
- Create/Edit/Delete flashcard collections
- Create/Edit/Delete flashcards
- Deleting a collection preserves flashcards by unassigning them
- Display flashcards/collections
- Filter study sessions by all cards or a selected collection
- Flip the flashcard to show the answer or the question
- Focused study session with Still Learning and Got It review actions
- Header profile menu for quick profile access and logout
- Homepage with information and dynamic image
- Import/Export collections as JSON file
- Move to previous or next flashcard
- Optional class name for collections
- Profile page that shows account info (name, email, member since, total flashcards)
- Quiz mode statistics (Total cards, total sets, average mastery, reviewed today)
- Quiz mode that allows you to evaluate your knowledge of a collection
- Reset progress stats for all cards or the currently selected collection
- Scrollable sidebar with collections and flashcards
- Search collections on the quiz page and focus on a specific set
- Stay logged in across sessions
- Study session completion summary with mastery percentage
- Switch between static and dynamic background

## Main Technologies

- Frontend: HTML, CSS, JavaScript
- Backend: FastAPI, SQLAlchemy
- Authentication: Supabase Auth
- Database: PostgreSQL
- AI generation: Gemini API

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


## Important Notes

- The frontend is static and the backend is deployed separately in the current project setup
- The frontend runtime currently stores service values directly in `app-core.js`
- AI card generation will fail unless the backend has a valid Gemini API key
- Signed-in features require a working Supabase Auth configuration and a reachable backend API

## Project Credits

Primary implementation, testing, documentation, and release preparation by `Andy`.
