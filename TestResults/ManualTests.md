# FlashLearn Manual Tests

Last updated: March 13, 2026  
Environment: Frontend hosted on GitHub Pages at `https://poqq123.github.io/FlashLearn/`, backend hosted on Render at `https://flashcardapp-pwic.onrender.com`

## Direct Manual Browser Checks

These checks were directly verified during documentation review.

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

### 6. Add collection

- Result: PASS
- Observed: A new collection could be created successfully and appeared in the collection list.

### 7. Edit collection

- Result: PASS
- Observed: An existing collection could be edited successfully, and the updated collection details appeared correctly in the interface.

### 8. Delete collection

- Result: PASS
- Observed: A collection could be deleted successfully, and its flashcards were preserved by being unassigned instead of removed.

### 9. Add flashcard

- Result: PASS
- Observed: A new flashcard could be created successfully and displayed in the study view.

### 10. Edit flashcard

- Result: PASS
- Observed: An existing flashcard could be edited successfully, and the updated content appeared correctly in the interface.

### 11. Delete flashcard

- Result: PASS
- Observed: A flashcard could be deleted successfully and no longer appeared in the study flow.

### 12. Static / dynamic background toggle

- Result: PASS
- Observed: The study page background could be switched between static and dynamic modes successfully.

### 13. AI flashcard generation

- Result: PASS
- Observed: The AI feature generated draft flashcards successfully, previewed them correctly, and allowed them to be saved.

### 14. Profile avatar customization

- Result: PASS
- Observed: Avatar preset options could be selected successfully and updated the displayed profile avatar.

### 15. Import / export collections

- Result: PASS
- Observed: Collections could be exported as JSON and imported back into the application successfully.

### 16. Quiz mode answer checking

- Result: PASS
- Observed: Quiz mode accepted answers, evaluated correctness, and updated quiz feedback and statistics as expected.

### 17. Focused study session actions

- Result: PASS
- Observed: A focused study session could be started from a collection, and the review actions worked as expected.

## Notes

- All manual tests listed above were completed successfully.
- Additional user feedback and issue patterns from the bug-bash sessions are summarized in [UserTestingNotes.md](./UserTestingNotes.md).
