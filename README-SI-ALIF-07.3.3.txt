SI ALIF 07.3.3 — UPLOADKEY 124-BYTE HOTFIX

ROOT CAUSE
Google Drive custom properties limit key + value to 124 UTF-8 bytes.
Frontend 06.8–07.3.2 generated si_alif_upload_key using:
UUID + index + size + lastModified + filename.
Long WhatsApp filenames could exceed the Drive limit, causing every upload to fail.

FIX
- Frontend uploadKey is now only a compact UUID + index.
- No filename/size/timestamp is embedded in Drive appProperties.
- Service Worker/app.js cache is bumped to 07.3.3.

No UI behavior changes.
