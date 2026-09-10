SI ALIF 07.4.9 — UI PURPOSE GATE + SEMI-FORMAL WORDING

Fokus patch
-----------
1. Tujuan dokumentasi sekarang WAJIB dipilih untuk kegiatan baru.
   Tidak ada lagi pilihan Dokumentasi yang tercentang otomatis.
2. Pilihan dibuat lebih jelas:
   - Simpan Dokumentasi
   - Minta Dibuatkan Konten
3. Jika tujuan belum dipilih, SI-ALIF menahan submit, menyorot bagian pilihan,
   dan menampilkan pesan yang jelas.
4. Tombol submit menyesuaikan pilihan:
   - Simpan Dokumentasi
   - Kirim & Ajukan Konten
5. Saat memilih konten, form tetap memakai alur yang sudah ada:
   Post/Reels + Nama Pemohon + Catatan.
6. Wording utama dipoles menjadi semi-formal untuk konteks aplikasi pemerintah,
   tetap ringkas dan tidak terlalu kaku.
7. Istilah UI "Pesanan Medsos" dirapikan menjadi "Permintaan Konten".
8. Copy yang terlalu santai (wkwk/nggak/muter-muter/dll.) di area utama dihapus.
9. Tampilan pilihan tujuan dibuat lebih menonjol dan lebih terbaca di HP.
10. Service-worker cache dan navigation version dibump ke 07.4.9.

Tidak diubah
------------
- Backend / Worker
- Upload chunk video
- Smart submit / exact merge / similar warning
- Galeri Foto / Video / Semua
- Download ZIP
- Admin tools
- Drive / OAuth / secrets

Pasang
------
Extract ZIP ini ke:
D:\PROJECT\Si-ALIF

Overwrite file yang diminta, lalu jalankan:
git ship

Setelah GitHub Pages selesai deploy, refresh sekali. Jika HP/PWA masih memegang
cache lama, tutup-buka aplikasi atau refresh halaman.
