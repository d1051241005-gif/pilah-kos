# PilahKos — versi Vercel + Gemini

Versi ini mempertahankan antarmuka dan fitur dari HTML asli. Perubahan fungsional hanya pada jalur scan foto: pemanggilan `claude.use()` diganti menjadi `POST /api/scan`, lalu backend Vercel meneruskan foto ke Gemini.

## Struktur

```text
pilahkos/
├── index.html       # UI asli + scan yang diarahkan ke backend
├── api/
│   └── scan.js      # Vercel Function; API key hanya di server
├── package.json
├── vercel.json
├── .env.example
└── README.md
```

## Sebelum deploy

1. Buat API key Gemini di Google AI Studio: https://aistudio.google.com/app/apikey
2. Jangan tempel API key ke `index.html`, GitHub, atau chat publik.
3. Siapkan akun Vercel dan GitHub (keduanya dapat digunakan dengan paket gratis sesuai batas pemakaian masing-masing).

## Publikasi melalui GitHub + Vercel

1. Ekstrak ZIP ini.
2. Buat repository GitHub baru bernama `pilahkos`.
3. Upload seluruh isi folder hasil ekstrak ke root repository. Pastikan `index.html` dan folder `api` berada sejajar di root.
4. Buka https://vercel.com/new, masuk dengan GitHub, lalu pilih repository `pilahkos`.
5. Framework Preset: **Other**. Root Directory: `./`. Build Command dan Output Directory boleh dikosongkan karena ini situs statis dengan Vercel Function.
6. Sebelum deploy pertama (atau sesudah import), buka Project Settings → Environment Variables.
7. Tambahkan:
   - Name: `GEMINI_API_KEY`
   - Value: API key dari Google AI Studio
   - Environments: Production, Preview, Development sesuai kebutuhan.
8. Opsional tambahkan `GEMINI_MODEL` dengan value `gemini-2.5-flash`. Jika tidak ditambahkan, model tersebut menjadi default.
9. Klik Deploy. Jika key ditambahkan setelah deployment, lakukan Redeploy agar variabel berlaku.
10. Buka URL `.vercel.app` yang diberikan Vercel dan uji pencarian teks, kuis, serta scan foto.

## Uji lokal (opsional)

Butuh Node.js dan Vercel CLI:

```bash
npm install -g vercel
vercel login
vercel dev
```

Tambahkan `GEMINI_API_KEY` ke Environment Variables project Vercel atau file `.env.local` lokal (jangan commit file tersebut), lalu jalankan `vercel dev`.

## Cara kerja keamanan

- Browser mengirim foto yang sudah diperkecil ke `/api/scan`.
- `api/scan.js` membaca `GEMINI_API_KEY` dari environment Vercel dan memanggil Gemini.
- Key tidak pernah dikirim ke browser atau dimasukkan ke HTML.
- Pengunjung tidak perlu akun atau login. Endpoint scan tetap publik.
- Backend membatasi format ke JPEG/PNG/WebP dan ukuran foto sekitar 3 MB, menolak metode selain POST, menonaktifkan cache, dan memiliki throttle sederhana per instance.

## Catatan penting untuk akses publik

Akses publik berarti siapa pun dapat memakai endpoint AI. Tidak ada login atau kuota per pengguna di versi ini, jadi penggunaan API dapat menghabiskan kuota/biaya pemilik key. Throttle di kode hanya best-effort per instance serverless dan bukan perlindungan global. Sebelum membagikan URL secara luas:

- Atur batas penggunaan/billing dan pantau pemakaian Gemini di Google AI Studio/Google Cloud.
- Aktifkan rate limiting/firewall pada Vercel jika tersedia di paket/konfigurasi akun.
- Pertimbangkan CAPTCHA atau pembatasan kuota global jika trafik mulai ramai.
- Jangan pernah menaruh API key di file frontend atau repository.

Foto diproses oleh layanan Gemini untuk analisis. Jangan unggah foto yang memuat wajah, dokumen pribadi, atau informasi sensitif.

## Fitur yang dipertahankan

Pencarian sampah lokal, chip pilihan cepat, scan foto, kategori 4 wadah, panduan, kuis, tantangan tujuh hari, tema gelap mengikuti preferensi sistem, dan layout responsif tetap ada dari file HTML sumber.

## Troubleshooting

- **Layanan AI belum dikonfigurasi**: `GEMINI_API_KEY` belum dimasukkan atau deployment belum di-redeploy.
- **Kuota scan sedang penuh**: cek kuota/rate limit Gemini dan billing.
- **404 pada `/api/scan`**: pastikan folder `api` berada di root repository yang sama dengan `index.html` dan deploy ulang sebagai project Vercel.
- **Scan gagal pada foto besar**: coba foto yang lebih kecil; browser sudah mengecilkan sisi terpanjang menjadi maksimal 1024 px.
