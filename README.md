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
- Git

#### 1. Clone the repository

Open your terminal, clone the repo to your local machine, and enter the project folder.

```bash
git clone https://github.com/Poqq123/FlashLearn.git
cd FlashLearn
```

#### 2. Install dependencies

```bash
pip install -r requirements.txt
```

#### 3. Create the environment file

```bash
cp .env.example .env
```

#### 4. Configure environment variables

Open your new `.env` file and fill in the required values. You need to set up your own Supabase project. You can find the keys in these specific dashboard locations:

- **`DATABASE_URL`**: Found at *Connect -> Connection String -> Method -> Session pooler* (Must point to your PostgreSQL database).
  
- **`SUPABASE_URL`**: Found at *Connect -> App Frameworks*.
  
- **`SUPABASE_ANON_KEY`**: Found at *Project Settings -> API Keys -> Legacy anon, service_role API Keys Tab*.
  
- **`SUPABASE_JWT_SECRET`**: Found at *Project Settings -> JWT Keys* (Required for HS256 token verification).
  
- **`SUPABASE_JWT_ISSUER`**: Enter your issuer URL.
  
- **`GEMINI_API_KEY`**: Required only for AI card generation.
  
- **`GEMINI_MODEL`**: Enter your target Gemini model name.
  

#### 5. Update frontend runtime config

The frontend runtime config is in: `frontend/shared/js/app-core.js`

Update the following values to match your local `.env` setup if you are not using the existing deployed services:

- `API_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

#### 6. Start the backend

Run the backend server using `Uvicorn` in your current terminal:

```bash
uvicorn main:app --reload --env-file .env
```

(The backend defaults to using the URL: `http://127.0.0.1:8000`, Though your terminal will specify this)

#### 7. Serve the frontend

**Important:** Do not open the app from `file://`.

```bash
python3 -m http.server 4173
```

#### 8. Open the app

Access the server in your browser at: **`http://127.0.0.1:4173/index.html`** (Use whatever local IP & Port your terminal shows)

**Useful local URLs (Update the IP and Port With What your Terminal Displays):**

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

- **Andy:** Completed the primary implementation of the application. Built the frontend and backend logic, configured the Supabase/PostgreSQL database, wrote the automated tests, handed the final GitHub/Render deployments, and completed documentation.
  
- **Bhargav:** Worked on release documentation. Conducted independent bug bashes to report issues. Worked on Initial prototyping to migrate to react, which was later scrapped.
