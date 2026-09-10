SI ALIF 07.4.4 — SPLIT PHOTO / VIDEO PREVIEW

Perubahan:
- Preview media dipisah menjadi dua bagian:
  Foto (N)
  Video (N)
- Video kembali punya preview VISUAL berupa satu frame asli dari video.
- Durasi video ikut tampil jika metadata berhasil dibaca.
- Video diproses satu per satu agar tidak membebani HP/browser.
- Queue video diprioritaskan; preview foto tetap dibuat ringan secara paralel (maks 3).
- Maks preview visual: 15 foto dan 12 video; sisanya ditampilkan sebagai +N.
- Jika codec video tidak bisa dipreview browser, kartu VIDEO tetap muncul sebagai fallback.
- File upload tetap ORIGINAL; tidak ada resize/compress pada media yang dikirim.

Frontend only.
Worker tetap SI ALIF 07.4.1.
