SI ALIF 07.5.3 — SERVER-SIDE ZIP FRONTEND

Bulk download tidak lagi fetch setiap file ke RAM browser lalu membuat ZIP di HP.
Frontend mengirim pilihan file lewat form POST biasa, lalu browser menerima attachment ZIP langsung dari Worker.
Tujuan: menghindari Cannot fetch, RAM penuh, dan tab mobile tersiksa saat puluhan foto/video diunduh.

WAJIB deploy Worker 07.5.3 terlebih dahulu sebelum frontend ini.

Tambahan mobile:
- download satu media sekarang langsung ke browser, tanpa fetch->Blob di JavaScript.
- preview lightbox memakai URL streaming inline; video tidak lagi harus ditampung sebagai Blob JS.
