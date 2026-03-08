Original prompt: Bug fixing stage
One user said when they Put "!@#$%^&*()" as an answer, and when they inputted "!@#$%^&*()" during quiz mode it should've been correct, but it was counted as wrong.

- Investigated quiz answer matching in `frontend/pages/quiz/quiz.js`.
- Root cause: `normalizeAnswerText()` removed all non-word characters, so punctuation-only answers normalized to an empty string and always failed.
- Patched answer normalization to preserve symbol-only tokens while still ignoring casing, extra whitespace, and common wrapper punctuation around alphanumeric answers.
- Verified with a direct Node check:
  - `!@#$%^&*()` vs `!@#$%^&*()` => `true`
  - `Paris!` vs `paris` => `true`
  - `(H2O)` vs `H2O` => `true`
  - `C++` vs `C++` => `true`
  - `c` vs `C++` => `false`
- Verified in the browser on `frontend/pages/quiz/quiz.html` via Playwright that `window.answersMatch()` returns the same results.
- Remaining note: page still logs a missing `favicon.ico` request in local dev; unrelated to this bug.

- Investigated `Reviewed Today` staying at `0` after quiz reviews.
- Root cause: quiz page parsed timezone-less backend timestamps like `2026-03-08T04:30:00` as local browser time instead of UTC. For US evening users, that shifted the review into the next calendar day and caused `isSameLocalDay()` to fail.
- Patched `toDateOrNull()` in `frontend/pages/quiz/quiz.js` to append `Z` for timezone-less timestamps before parsing.
- Verified with a direct Node check and a browser-level Playwright check that:
  - `2026-03-08T04:30:00` now parses to `Sat Mar 07 2026 20:30:00 PST`
  - the parsed review timestamp counts as the same local day for the dashboard logic
- Updated the import collection button hover/accessibility text in `frontend/pages/study/index.html` to `Import Collection (JSON File ONLY)`.
- Added a shared 60-character collection-name limit across backend and frontend create/edit/import/AI flows.
- Added defensive wrapping on quiz collection card titles/subtitles so previously oversized names no longer blow out the layout.
- Verified:
  - 60-character collection names pass
  - 61-character names are rejected with a clear validation error
  - imported/AI retry suffixes stay within 60 characters
  - syntax checks passed for `backend/app/main.py`, `frontend/pages/study/study.js`, and `frontend/pages/quiz/quiz.js`
- Updated the homepage header auth button in `home.html` so it shows `Log In` when signed out and switches to `Profile` when signed in, while the primary CTA remains `Open Dashboard`.
- Verified the landing-page inline script syntax by extracting it to a temp `.js` file and running `node --check`.
