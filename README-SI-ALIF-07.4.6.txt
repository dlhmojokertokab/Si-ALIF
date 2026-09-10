SI ALIF 07.4.6 — GALLERY OPEN HOTFIX

- Keeps 07.4.5 mobile full-width folder cards and Foto | Video | Semua tabs.
- Folder shell is shown immediately and defensively.
- New media-tab DOM is fully null-safe during PWA/service-worker cache transitions.
- Bounded router version bumped to 746 to discard stale navigation state.
- Folder files request has a 20-second timeout with a useful error instead of
  appearing blank forever.
- No data deletion or migration.

IMPORTANT:
Deploy Worker 07.4.6 first, then frontend 07.4.6.
