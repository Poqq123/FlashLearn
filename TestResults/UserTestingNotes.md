# FlashLearn User Testing Notes

Status date: March 12, 2026

This summary is based on the FlashLearn entries in the `Project` sheet of the bug-bash workbook `Green Bug Bash.xlsx`.

## Session Overview

- Test type: Bug bash / user testing
- Project under test: `Green (Flashcards)` / FlashLearn
- Most recent test date found in the workbook: March 4, 2026
- Total FlashLearn entries reviewed: 35
- Unique testers represented: 16

## What Testers Did

Testers interacted with the live app and reported issues while performing realistic user actions such as:

- Opening the site in a signed-out state
- Using the profile menu and logout flow
- Creating flashcards and collections
- Entering long names or long card content
- Using quiz mode and checking answers
- Trying JSON import/export flows
- Changing collection colors and reviewing card visibility

## Main Findings

- Signed-out state confusion was a major issue. Multiple testers reported seeing profile/logout controls before clearly signing in.
- Long text handling was a repeated problem. Testers found overflow issues in collection names, card content, and layout containers.
- Quiz feedback needed improvement. Testers expected clearer right/wrong feedback and found edge cases around answer checking.
- JSON import/export instructions were unclear for new users.
- Some color choices created visibility/readability issues.
- Collection/class-name display behavior caused usability confusion in several reports.

## Severity Snapshot

- `P0 (Critical)`: 3 reports
- `P1 (Important)`: 16 reports
- `P2 (Nice to have)`: 8 reports
- `P3 (Nit-picky)`: 8 reports

## Bug-Type Snapshot

- `UI`: 16 reports
- `UX`: 10 reports
- `Functional`: 8 reports
- `Security`: 1 report

## Overall Takeaway

The bug-bash results show that users were able to explore the app and exercise the main study, quiz, and profile flows, but they also exposed several usability issues. The highest-value improvements were around authentication state clarity, text overflow handling, quiz feedback, and clearer import/export guidance.

## Supporting Evidence

- `Green Bug Bash.xlsx` workbook for detailed entries, tester comments, and issue descriptions.
