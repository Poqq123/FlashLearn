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
