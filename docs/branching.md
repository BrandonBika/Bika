# Branching and release checks

## Branching rules

- The default branch is `main`.
- Create every feature, fix, and integration branch from the latest `main`.
- Keep work isolated to its branch. Do not commit directly to `main`.
- Run Supabase CLI commands from the repository root, where `supabase/` and the project configuration live.

## Rollback tags

These tags mark tested Snap & Say states:

- `snap-and-say-working-2026-10-18` — Snap & Say working state before navigation integration.
- `snap-and-say-with-navigation-2026-10-18` — Snap & Say with hamburger/back navigation integration.

## Snap & Say phone regression checklist

1. Open the PWA on a phone over HTTPS and confirm Home renders.
2. Open and close the hamburger menu; verify its navigation works.
3. Open Snap & Say and confirm the permission screen is visible.
4. Grant microphone and location permissions. Test camera permission separately if taking a photo.
5. Record “There's a fire in my kitchen” without a photo and submit it.
6. Confirm the transcript and detected emergency type are shown, then review the confirmation/review state and any emergency guidance.
7. Use Snap & Say's Back button; confirm it returns to the previous screen, or Home when no previous route exists.
8. Refresh, repeat the menu and Snap navigation, and verify the app still renders. Check Language and Reports pages as well.
