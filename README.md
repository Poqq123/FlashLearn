# FlashLearn

FlashLearn is a flashcard study app with a static multi-page frontend and a FastAPI backend. The current project supports Google sign-in through Supabase, collection-based card management, quiz and study-session flows, profile settings, JSON import/export, and AI-assisted flashcard drafting with Gemini.

## Current Status

- Frontend is a static site organized under `frontend/pages/*`.
- Backend is a FastAPI app in `backend/app/main.py`.
- Auth is handled by Supabase on the frontend and verified on the backend with bearer tokens.
- Data is stored in Postgres via SQLAlchemy, intended for Supabase Postgres.
- The app is currently shaped for a split deployment:
  - Static frontend (for example GitHub Pages)
  - FastAPI backend (for example Render)
  - Supabase Auth + Postgres

## What Ships Today

### Public / shell pages

- `index.html`
  - Entry page that redirects signed-in users to the study app and signed-out users to the marketing home page.
- `home.html`
  - Marketing / landing page.
- `login.html`, `profile.html`, `quiz.html`
  - Thin redirect shims to the real pages under `frontend/pages/...`.

### Frontend app pages

- `frontend/pages/login/login.html`
  - OAuth login flow using Supabase.
- `frontend/pages/study/index.html`
  - Main study dashboard.
  - Create, edit, delete, and browse flashcards.
  - Create, edit, delete, color, and filter collections.
  - Import/export collections as JSON.
  - Generate draft flashcards with Gemini, preview them, and save them into a collection.
  - Toggle static vs dynamic background treatment.
- `frontend/pages/quiz/quiz.html`
  - Quiz dashboard with collection search, scope switching, typed answer checking, and progress stats.
- `frontend/pages/quiz/collection.html`
  - Collection detail page with mastery snapshot and launch point for focused study.
- `frontend/pages/quiz/study-session.html`
  - Dedicated focused review session for one collection with `again` / `easy` review actions.
- `frontend/pages/profile/profile.html`
  - Profile page showing user info, member date, total flashcards, and local avatar preset selection.

### Backend behavior

- Protected API with Supabase bearer token validation.
- Supports both:
  - HS256 verification via `SUPABASE_JWT_SECRET`
  - JWKS-based verification via `SUPABASE_URL`
- Startup schema guard keeps older databases usable by adding missing columns and indexes.
- Review data is stored per card:
  - `review_count`
  - `correct_count`
  - `ease_factor`
  - `interval_days`
  - `due_at`
  - `last_reviewed_at`
  - `streak_current`
  - `streak_best`

## Project Layout

```text
.
├── backend/app/main.py            # Main FastAPI application
├── main.py                        # Compatibility entrypoint for uvicorn
├── frontend/shared/js/app-core.js # Frontend runtime config and auth helpers
├── frontend/pages/login/          # Login page
├── frontend/pages/study/          # Main flashcard dashboard
├── frontend/pages/quiz/           # Quiz, collection, and study-session pages
├── frontend/pages/profile/        # Profile page
├── frontend/pages/home/           # Home page styles
├── home.html                      # Landing page
├── index.html                     # Entry redirect page
└── .env.example                   # Backend env template
```

## Backend API

All endpoints except `GET /` require `Authorization: Bearer <token>`.

### Health

- `GET /`
  - Returns API status.

### Collections

- `GET /collections`
- `POST /collections`
  - Body: `name`, optional `class_name`, optional `color`
- `PUT /collections/{collection_id}`
- `DELETE /collections/{collection_id}`
  - Unassigns cards in that collection before deleting it.
- `GET /collections/{collection_id}/cards`

### Cards

- `GET /cards`
- `GET /cards?collection_id=<id>`
- `POST /cards`
  - Body: `question`, `answer`, optional `collection_id`
- `PUT /cards/{card_id}`
- `DELETE /cards/{card_id}`
- `POST /cards/{card_id}/review`
  - Body: `rating`
  - Supported backend ratings: `again`, `hard`, `good`, `easy`
- `POST /cards/reset-progress`
  - Body: optional `collection_id`

### AI

- `POST /ai/generate-cards`
  - Body: `topic`, `count`, optional `collection_name`
  - Requires `GEMINI_API_KEY`
  - Current limits:
    - topic max length: `180`
    - collection name max length: `60`
    - generated card count: `3-10`

## Data Model

### `collections`

- `id`
- `user_id`
- `name`
- `class_name`
- `color`

### `flashcards`

- `id`
- `user_id`
- `question`
- `answer`
- `collection_id`
- `review_count`
- `correct_count`
- `ease_factor`
- `interval_days`
- `due_at`
- `last_reviewed_at`
- `streak_current`
- `streak_best`

## Local Development

### 1. Install backend dependencies

```bash
pip install -r requirements.txt
```

### 2. Create backend env file

```bash
cp .env.example .env
```

Set the values in `.env`:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_JWT_ISSUER`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

Notes:

- `SUPABASE_ANON_KEY` is used by the frontend, not the FastAPI server directly.
- If your Supabase project signs JWTs with asymmetric keys, backend verification can use JWKS via `SUPABASE_URL`.
- If your Supabase project signs JWTs with HS256, `SUPABASE_JWT_SECRET` must be set.

### 3. Update frontend runtime config

The frontend currently reads its runtime config from:

- `frontend/shared/js/app-core.js`

That file currently contains hardcoded values for:

- `API_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

If you are running against your own backend or Supabase project, update those values there.

### 4. Run the backend

```bash
uvicorn main:app --reload --env-file .env
```

### 5. Serve the frontend over HTTP

Do not open the app from `file://`. Use a local static server instead.

Example:

```bash
python3 -m http.server 4173
```

Then open:

- `http://localhost:4173/index.html`

## Deployment Notes

- Use the Supabase connection pooling URL for `DATABASE_URL`.
- Include `?sslmode=require` in `DATABASE_URL`.
- The backend expects Postgres schema changes to be additive; `ensure_schema()` patches missing columns/indexes on startup.
- The frontend and backend are deployed separately in the current project shape.

## Important Implementation Notes

- `main.py` only re-exports the FastAPI app from `backend/app/main.py` for compatibility with existing `uvicorn main:app` commands.
- `frontend/shared/js/app-core.js` is the central frontend config/auth helper.
- The quiz and study-session UIs currently use simplified review actions even though the backend supports all four spaced-repetition ratings.
- `requirements.txt` currently includes more packages than the strict backend runtime needs; it reflects the project environment as it exists now.
