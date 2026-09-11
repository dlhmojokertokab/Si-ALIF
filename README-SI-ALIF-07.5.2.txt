SI ALIF 07.5.2 — LIGHTBOX BACK NAVIGATION FIX

Masalah yang diperbaiki
-----------------------
Sebelumnya preview media (lightbox) tidak memiliki entry history sendiri.
Akibatnya tombol Back Android/browser ketika preview terbuka justru mundur
dari folder ke daftar Galeri, sedangkan tombol X hanya menutup preview.
Jika pengguna menekan Back lalu X, posisi akhirnya menjadi salah.

Perilaku baru
-------------
1. Saat foto/video dibuka, SI-ALIF membuat satu entry history khusus preview
   dengan URL/hash folder yang tetap sama.
2. Tombol Back Android/browser saat preview terbuka:
   - hanya menutup preview;
   - tetap berada di folder yang sama.
3. Tombol X:
   - menutup preview;
   - membuang entry history preview;
   - tetap berada di folder yang sama.
4. Tombol Escape desktop mengikuti perilaku X.
5. Pindah foto/video dengan Prev/Next tidak menambah history baru.

Tidak berubah
-------------
- Gallery-first 07.5.1
- Tambah Dokumentasi
- Mobile Upload Pause
- Screen Wake Lock
- ZIP download
- Worker 07.4.8 / OAuth / Drive
- Smart merge dan Permintaan Konten

Pasang
------
Extract/overwrite ke:
D:\PROJECT\Si-ALIF

Lalu:
git ship
