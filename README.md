# epub-reder
membuka file epub di browser lokal

https://baguzzz.github.io/epub-reder/


# 📖 EPUB Reader Offline – Mode Dua Halaman

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**EPUB Reader Offline** adalah aplikasi web ringkas untuk membaca buku digital (EPUB) langsung di browser, **tanpa perlu internet** dan **tanpa server**. Buka file `.epub` dari perangkat Anda dan nikmati membaca dengan tampilan yang nyaman.

---

## ✨ Fitur Utama

| Fitur | Keterangan |
|-------|------------|
| 📴 **Sepenuhnya Offline** | Tidak membutuhkan koneksi internet. Semua parsing dilakukan di sisi klien. |
| 📦 **Parser ZIP & EPUB Mandiri** | Mengekstrak file EPUB (format ZIP) dan membaca struktur OPF, Spine, dan konten HTML/CSS/gambar secara internal. |
| 📄 **Render Konten Asli** | Menampilkan isi buku seperti aslinya: teks, gambar, dan gaya CSS dari EPUB disuntikkan sebagai data URI. |
| 📚 **Dua Mode Tampilan** | **Satu halaman** (lebar penuh) atau **Dua halaman** (split kiri‑kanan) untuk EPUB yang mempunyai potongan halaman terpisah (`…_split_000.html` & `…_split_001.html`). |
| 🧭 **Daftar Isi Interaktif** | Sidebar yang menampilkan semua bagian (spine) buku. Klik sekali untuk melompat ke bagian tersebut. |
| ⏮️ **Navigasi Mudah** | Tombol **Sebelumnya** / **Selanjutnya**, serta **drag‑and‑drop** file EPUB ke jendela browser. |
| 🎨 **Kustomisasi Tampilan** | Panel pengaturan untuk mengubah **font**, **ukuran teks**, **spasi baris**, **margin**, dan **mode malam (night mode)**. Semua preferensi disimpan otomatis di `localStorage`. |
| 💾 **Pengaturan Tersimpan** | Pengaturan tampilan akan tetap diingat meskipun browser ditutup dan dibuka kembali. |
| 🖥️ **Antarmuka Responsif** | Tampilan menyesuaikan layar desktop maupun perangkat seluler. |

---

## 🚀 Cara Menggunakan

1. **Unduh** atau **kloning** repositori ini.
2. Pastikan ketiga file berada dalam satu folder yang sama:
   - `index.html`
   - `style.css`
   - `script.js`
   - `tampilan.js`
3. Buka `index.html` di browser modern (Chrome, Firefox, Edge, Safari) – **cukup klik dua kali**.
4. Klik tombol **📂 Pilih File EPUB** (atau seret langsung file `.epub` ke jendela browser).
5. Buku akan langsung terbuka! Gunakan sidebar untuk navigasi dan tombol **🎨 Tampilan** untuk menyesuaikan kenyamanan membaca.

---

## 📁 Struktur File

├── index.html # Halaman utama (struktur HTML)
├── style.css # Tata letak dan tema antarmuka
├── script.js # Logika utama: parser ZIP, EPUB, render, navigasi, mode dua halaman
├── tampilan.js # Modul pengaturan tampilan (font, ukuran, mode malam, localStorage)
└── README.md # Dokumentasi (file ini)


---

## ⚙️ Detail Teknis

### 1. Parser ZIP Internal
- Mencari **End of Central Directory Record (EOCD)** untuk membaca daftar file dalam arsip EPUB.
- Mendukung metode kompresi **Store** (tanpa kompresi) dan **Deflate**.
- Data file diekstrak menggunakan `DecompressionStream` (Web API) menjadi `Uint8Array`.

### 2. Parser EPUB
- Membaca `META-INF/container.xml` untuk mendapatkan path file OPF.
- Mengurai OPF untuk mengambil metadata (judul, penulis), **manifest** (daftar semua file), dan **spine** (urutan halaman).
- Semua resource (HTML, CSS, gambar, font) dikonversi menjadi **data URI** atau disimpan sebagai teks, siap dirender.

### 3. Proses Render
- Setiap bagian (spine item) diubah menjadi dokumen HTML, lalu resource di‑*remap*:
  - Tag `<img>` dan `<image>` (SVG) → `src`/`href` diganti dengan data URI.
  - Tag `<link rel="stylesheet">` → di‑*inline* menjadi `<style>`.
  - URL di dalam CSS (`url(...)`) dan atribut `style` juga di‑*resolve* dan diganti data URI.
- Hasil akhir disuntikkan ke dalam **`<iframe srcdoc>`** agar aman (sandbox).

### 4. Mode Dua Halaman
- Saat diaktifkan, reader mengambil **dua spine item bersebelahan** (misal `_split_000` dan `_split_001`) dan menampilkannya dalam dua kolom berdampingan.
- Navigasi **Next/Previous** otomatis lompat 2 indeks.
- Daftar Isi menampilkan gabungan dua bagian sekaligus.
- Indeks ganjil otomatis disesuaikan saat beralih ke mode dual.

### 5. Kontrol Tampilan (`tampilan.js`)
- Mengelola pengaturan:
  - **fontFamily**: `Georgia`, `Segoe UI`, `Courier New`
  - **fontSize**: 12–24 px
  - **lineHeight**: 1.2–2.5
  - **margin**: 0.5–4 rem
  - **nightMode**: `true`/`false`
- Menyimpan ke `localStorage` dan menghasilkan string CSS yang diinjeksi ke dalam iframe setiap kali halaman dirender.
- Event `tampilan-changed` memungkinkan komponen lain menyesuaikan diri.

---

## 🖼️ Pratinjau Antarmuka
┌──────────────────────────────────────┐
│ 📚 EPUB Reader │ [Pilih EPUB] ◀ ▶ │
│ │ [Dua Halaman] [Daftar Isi] │
├────────────┬─────────────────────────┤
│ 📖 Daftar Isi │ │
│ │ Konten Buku │
│ 1. Title │ (satu halaman │
│ 2. Chapter 1 │ atau dua kolom) │
│ 3. Chapter 2 │ │
│ ... │ │
└──────────────┴───────────────────────┘


---

## 🔧 Kemungkinan Pengembangan

- [ ] Penanganan EPUB dengan fitur lanjutan (fixed layout, script interaktif).
- [ ] Bookmark dan penyimpanan posisi terakhir membaca.
- [ ] Pencarian teks.
- [ ] Ekspor pengaturan ke file.
- [ ] Dukungan format buku lain (MOBI, PDF) – memerlukan parser tambahan.

---

## 📜 Lisensi

Proyek ini dilisensikan di bawah **[MIT License](LICENSE)**. Silakan digunakan, dimodifikasi, dan disebarkan secara bebas.

---

## 🙏 Ucapan Terima Kasih

- **EPUB.js** – inspirasi awal render EPUB di browser (meskipun di sini menggunakan parser mandiri).
- Komunitas pengembang web yang telah mendokumentasikan struktur format ZIP dan EPUB.

---

**Selamat membaca!** 📚  
Jika ada pertanyaan atau menemukan kendala, jangan sungkan untuk membuka *issue* di repositori ini.
