SI ALIF 07.3.1 — APP ICON SYNC

Fix:
- PWA manifest no longer uses old assets/icons/icon.svg (logo A).
- Canonical app/install icons now use:
  - assets/icons/si-alif-favicon-192.png
  - assets/icons/si-alif-favicon-512.png
- icon.svg legacy path is overwritten with the Alif doodle favicon too.
- icon.png legacy fallback is also the Alif doodle favicon.
- manifest + favicon/app assets cache-busted to v=0731.
- Service Worker cache bumped.

Important:
Existing installed PWA/home-screen shortcuts may keep their old OS-cached icon.
After deploy, remove/uninstall the existing SI-ALIF app/shortcut once, then install/add
it again so Android/Windows picks up the new manifest icon.
