SI ALIF 07.5.1 — GALLERY-FIRST + MOBILE UPLOAD PAUSE

Perubahan utama
---------------
1. Pengguna non-admin sekarang masuk ke Galeri sebagai halaman awal.
2. Tombol "Tambah Dokumentasi" tersedia langsung di header Galeri.
3. Urutan navigasi pengguna menjadi Galeri -> Tambah Dokumentasi.
4. Wording utama "Setor Dokumentasi" dirapikan menjadi "Tambah Dokumentasi".
5. Saat upload aktif dan SI-ALIF masuk background:
   - langkah upload berikutnya ditahan;
   - ketika pengguna kembali, muncul konfirmasi:
     "Upload akan terjeda saat SI-ALIF tidak aktif. Apakah Anda ingin melanjutkan upload?"
   - jika dilanjutkan, upload meneruskan proses;
   - jika tidak, item yang belum selesai ditandai agar dapat dilanjutkan melalui
     "Coba Lagi yang Gagal".
6. Screen Wake Lock 07.5.0 tetap aktif selama halaman terlihat.
7. Peringatan tutup/reload dan banner transfer tetap dipertahankan.

Catatan teknis
--------------
Browser/PWA tidak dapat menampilkan dialog di atas aplikasi lain setelah
pengguna berpindah aplikasi. Karena itu konfirmasi muncul saat pengguna
kembali ke SI-ALIF. Ini adalah perilaku yang dapat diandalkan di web mobile.

Tidak berubah
-------------
- Worker 07.4.8 / OAuth
- Google Drive
- chunk upload 4 MB
- smart merge
- Gallery Foto/Video/Semua
- ZIP original quality
- Permintaan Konten 07.4.9
- Admin tools

Pasang
------
Extract/overwrite ke:
D:\PROJECT\Si-ALIF

Lalu:
git ship
