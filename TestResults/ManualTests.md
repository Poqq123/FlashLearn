# FlashLearn Manual Tests

Last Updated: March 12, 2026  
Environment: Website `https://github.com/Poqq123/FlashLearn` hosted on GitHub Pages, backend API hosted on Render at `https://flashcardapp-pwic.onrender.com`

## Manual Checks Performed

### 1. Landing page load

- Page tested: `/home.html`
- Result: PASS
- Observed: The page loaded with the `FlashLearn Home` title, marketing hero section, navigation links, and CTA buttons.

### 2. Entry redirect

- Page tested: `/index.html`
- Result: PASS
- Observed: The browser redirected to `/home.html` as expected for a signed-out session.

### 3. Login page render

- Page tested: `/frontend/pages/login/login.html`
- Result: PASS
- Observed: The login screen rendered correctly and showed OAuth provider buttons for Google, Discord, and GitHub, plus a link back to the home page.

### 4. Study dashboard signed-out shell

- Page tested: `/frontend/pages/study/index.html`
- Result: PASS
- Observed: The page loaded, displayed the signed-out empty state, showed collection controls, and disabled collection import/export actions until login.

### 5. Quiz dashboard signed-out shell

- Page tested: `/frontend/pages/quiz/quiz.html`
- Result: PASS
- Observed: The page loaded, displayed zeroed stats, showed the scoped collection UI, and disabled the answer input until login.

## Notes

- These checks confirm page load and basic UI availability.
- These checks do not validate authenticated flows because they require working Supabase and backend credentials.

