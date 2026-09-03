SI ALIF 02.2 — DROP-IN PATCH

Cara pakai:
1. Extract ISI ZIP ini langsung ke:
   D:\PROJECT\SI-ALIF
2. Pilih Replace/Overwrite jika diminta.
3. Buka PowerShell di D:\PROJECT\SI-ALIF
4. Jalankan:
   git ship "SI ALIF 02.2 mobile upload fix"

Yang berubah:
- Tombol Kirim Dokumentasi tidak lagi sticky saat scroll di HP.
- Upload foto tidak lagi memaksa kamera.
- Upload membuka galeri/file picker dan mendukung pilih banyak foto.
- Cache PWA dibump.

Tidak menyentuh:
- assets/js/config.js
- worker/
- secret / .dev.vars
