SI ALIF 07.3 — ADMIN WORKSPACE + TRASH POLISH

STAFF / NON-ADMIN
- Beranda = Setor Dokumentasi
- Navigasi hanya Setor + Galeri
- Bisa setor dokumentasi / ajukan Pesanan Medsos melalui form
- Bisa melihat Galeri dan download
- Tidak melihat Dashboard, antrean Pesanan, Trash, Edit, Merge, Move, Delete

ADMIN
- Klik tombol 🔒 Admin dan masukkan PIN
- Navigasi menjadi Dashboard + Setor + Galeri + Pesanan
- Semua admin controls Galeri muncul
- Klik 🔓 Admin Aktif untuk mengunci kembali ke tampilan staff

SECURITY
- UI hiding bukan security boundary utama
- Full activity/publication data diambil dari /api/admin/activities yang Worker lindungi token admin
- Public /api/activities tidak membawa publication/order payload

TRASH POLISH
- Empty list benar-benar disembunyikan
- Empty state tidak lagi menambah satu baris putih raksasa
- Modal desktop lebih pendek dan proporsional
- Teks empty state + toolbar dibesarkan
