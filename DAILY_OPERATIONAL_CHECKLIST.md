# DAILY OPERATIONAL CHECKLIST - Restaurant Counter POS

**Untuk:** Kasir / Supervisor Counter  
**Tujuan:** Memastikan setiap transaksi counter restaurant berjalan dengan benar

---

## ☀️ PAGI (OPENING)

### Sebelum Membuka Counter (Setup)
- [ ] **Verifikasi Sistem Online**
  - Cek koneksi internet
  - Buka aplikasi POS
  - Pastikan tidak ada error message

- [ ] **Pilih POS Profile**
  - Tekan "Select POS Profile"
  - Pilih profile counter yang sesuai (misal: "Counter-Main")
  - Pastikan branch & warehouse tepat

- [ ] **Check Session Requirement**
  - Jika dialog "Buat Opening Entry" muncul → **HARUS** buat opening entry
  - Jika tidak ada dialog → Session tidak required, boleh proceed
  
### Membuat Opening Entry (Jika Diperlukan)
- [ ] **Tekan "Create Opening Entry" atau "Buat Pembukaan"**
  
- [ ] **Isi Form Pembukaan:**
  ```
  Tanggal: [hari ini] ✓
  User: [nama kasir] ✓
  POS Profile: [sesuai pilihan] ✓
  Opening Amount: [uang awal dari box/safe]
  ```
  
  **Contoh:** Rp 500.000 (uang pangkal dari kas besar)

- [ ] **Pilih Cash Account (Akun Kas):**
  - Dropdown "Opening Cash Account"
  - Pilih: **"Kas Kecil - C"** (atau account yang ditunjuk)
  - Jangan asal-asalan, lihat struktur akun yang benar

- [ ] **Tekan "Create" / "Buat"**
  - Tunggu sampai entry berhasil dibuat
  - Status berubah menjadi: **"Open"** ✓
  
### Verifikasi Printer (PENTING!)
- [ ] **Kitchen Printer (KOT)**
  - Nyalakan printer di dapur
  - Cek kertas thermal ada
  - Tekan "Test Print" jika ada tombol
  - **Harapan:** Muncul test receipt
  - **Jika gagal:** Hubungi IT sebelum mulai transaksi

- [ ] **Cashier Printer (Receipt)**
  - Nyalakan printer di counter
  - Cek kertas thermal ada
  - Tekan "Test Print"
  - **Harapan:** Muncul test receipt
  - **Jika gagal:** Hubungi IT sebelum mulai transaksi

### Status Siap Operasi
✅ **OK TO PROCEED** = Semua item diatas checklist

❌ **STOP** = Jika ada yang gagal (printer, opening entry), hubungi supervisor/IT

---

## 🍔 SIANG (OPERATING)

### Untuk Setiap Transaksi Customer

#### TAHAP 1: AMBIL ORDER
- [ ] **Greet Customer**
  - "Selamat datang, apa pesanan anda?"

- [ ] **Customer memberikan order**
  - Catat menu yang dipesan
  - Tanya jumlah (qty)
  - Tanya varian (ukuran, pedas level, dll)

#### TAHAP 2: CREATE ORDER DI SISTEM
- [ ] **Tekan "New Order" / "Order Baru"**

- [ ] **Add Item dari catalog:**
  - Search/cari menu
  - Select item
  - Input Qty
  - Select variant (jika ada dropdown size/spice level)
  - **LIHAT HARGA** - Check harga sudah benar
  
- [ ] **Repeat untuk semua items customer**

- [ ] **ORDER TOTAL MUNCUL**
  - Perhatikan: subtotal, tax, grand total
  - **BILANG KE CUSTOMER:** "Total-nya Rp X,XXX,XXX"

#### TAHAP 3: PAYMENT
- [ ] **Tanya Payment Method:**
  - "Bayar dengan apa? Cash/Debit/QRIS?"

- [ ] **INPUT PAYMENT:**
  
  **Jika CASH (Tunai):**
  - Customer sebutkan nominal yang diserahkan
  - INPUT payment amount
  - **SISTEM AKAN CALCULATE CHANGE**
  - **LAKUKAN:** Kasih kembalian sesuai perubahan dari sistem
  - ✅ **STATUS:** Invoice created, ready untuk print
  
  **Jika CARD/DEBIT:**
  - Swipe/tap kartu
  - Input amount (otomatis = total)
  - Tunggu approval
  - ✅ **STATUS:** Invoice created, ready untuk print
  
  **Jika QRIS/E-WALLET:**
  - Scan QR code customer
  - Input amount
  - Tunggu customer confirm di phone
  - ✅ **STATUS:** Invoice created, ready untuk print

#### TAHAP 4: PRINTING
- [ ] **AUTOMATIC PRINT KOT (Kitchen Order Ticket):**
  - Sistem otomatis kirim ke kitchen printer
  - **HARAPAN:** Printer di dapur bunyi, keluar kertas dengan order
  - **CHECK:** Dapur terima order, items jelas, notes/customizations visible
  
  **Jika GAGAL PRINT KOT:**
  - ⚠️ **WARNING:** "KOT Print Failed"
  - Call IT immediately sebelum customer pergi
  - Jangan lanjut dengan order sampai KOT berhasil

- [ ] **AUTOMATIC PRINT RECEIPT (Struk):**
  - Sistem otomatis print ke cashier printer
  - **HARAPAN:** Printer counter bunyi, keluar kertas receipt
  - **CHECK:** Customer detail, items, total, payment method, CHANGE AMOUNT jelas
  
  **Jika GAGAL PRINT RECEIPT:**
  - ⚠️ **WARNING:** "Receipt Print Failed"
  - Call IT
  - Print ulang dari menu jika ada

#### TAHAP 5: SERAH KE CUSTOMER
- [ ] **Serahkan Receipt ke Customer**
  - "Terima kasih, pesanannya akan siap di [waktu estimasi]"
  - "Nomor order Anda adalah: [order number dari receipt]"

- [ ] **CUSTOMER TUNGGU DI MEJA/AREA CUSTOMER**

- [ ] **DAPUR SIAPKAN PESANAN**
  - Lihat KOT yang printed
  - Siapkan semua items
  - Panggil/display order number

- [ ] **SERAH MAKANAN KE CUSTOMER**
  - Panggil berdasarkan order number
  - Verifikasi items sesuai order
  - "Terima kasih, selamat menikmati!"

---

### IMPORTANT - SETIAP TRANSAKSI

#### ✅ SELALU CHECK:
1. **PRICE CORRECT?**
   - Lihat harga muncul di sistem
   - Compare dengan menu board
   - Jika ada promo/discount → lihat di sistem

2. **PAYMENT AMOUNT?**
   - Jika cash: payment >= total
   - Change calculated correctly
   - Tidak ada underpayment

3. **PRINTER STATUS?**
   - KOT printed successfully?
   - Receipt printed successfully?
   - Jika error → report immediately

4. **CUSTOMER SATISFIED?**
   - Got receipt
   - Tahu order number
   - Tahu expected wait time

#### ⚠️ JIKA ADA ERROR:
- **Pricing Issue:** Hubungi supervisor, jangan charge customer
- **Printer Failure:** Hubungi IT, print ulang dari system
- **Payment Issue:** Supervisor handle, verify payment method
- **Underpayment:** Ask customer bayar kekurangan, jangan process

---

## 🌅 SORE (CLOSING)

### End of Shift Procedure

#### SEBELUM CLOSE POS PROFILE:
- [ ] **Finish semua pending orders**
  - Pastikan tidak ada order dalam proses
  - Semua customer sudah serve & pergi

- [ ] **Verify Cash Drawer**
  - Count uang di drawer
  - Write down final amount
  - Compare dengan sistem

- [ ] **Close Out Session:**
  - Tekan "Close Session" / "Tutup Sesi"
  - Input closing amount (total uang di drawer)
  - **SISTEM COMPARE:**
    - Expected: Opening amount + sales - payment out
    - Actual: Closing amount yang anda input
  - Jika ada variance, **explain to supervisor**
  - Submit closing entry

#### VERIFICATION:
- [ ] **Confirm Session Closed**
  - Status berubah jadi "Closed"
  - Tidak bisa add order lagi
  - System print closing summary (opsional)

- [ ] **Reconciliation:**
  - Check jumlah transaksi
  - Check total sales
  - Check payment methods breakdown
  - Tanda tangan closing sheet

#### PREPARE UNTUK NEXT SHIFT:
- [ ] **Lock the POS Profile**
  - Logout dari system
  - Close aplikasi POS
  
- [ ] **Prepare Cash:**
  - Segregate opening amount untuk next shift
  - Lock closing amount di safe
  - Hand over to supervisor

---

## 🚨 TROUBLESHOOTING QUICK REFERENCE

### Printer Error Messages

| Error | What It Means | Fix |
|-------|---------------|-----|
| "KOT Print Failed" | Kitchen printer tidak terima | Power on printer, check paper, call IT |
| "Receipt Print Failed" | Cashier printer tidak terima | Power on printer, check paper, call IT |
| "Printer Not Found" | Printer disconnected | Check network/USB cable, power on |
| "Low Paper" | Printer kertas habis | Ganti thermal paper |

**ACTION:** Jika tidak bisa fix sendiri dalam 2 menit → **CALL IT**

---

### Payment Issues

| Issue | What to Do |
|-------|-----------|
| Customer bayar kurang | Ask for additional payment before submit |
| Change calculation wrong | Report to supervisor, check POS settings |
| Payment method not available | Check POS Profile config untuk payment mode |
| QRIS scan fail | Try scan lagi, atau switch ke payment method lain |

---

### Order Issues

| Issue | What to Do |
|-------|-----------|
| Item tidak ada di catalog | Check menu configuration, add item jika perlu |
| Harga salah di sistem | Don't charge customer, report to supervisor |
| Can't add item to order | Check quantity, check warehouse stock |
| Order not showing in kitchen | Check KOT printed, restart printer |

---

## 📊 DAILY REPORT

**Kasir:** _______________  
**Tanggal:** _______________  
**Shift:** ☐ Pagi ☐ Siang ☐ Malam

### Opening
- Opening Amount: Rp ________________
- Opening Time: ________________
- Opening Entry Status: ☑ Success ☐ Failed

### Operations
- Total Orders Today: ________
- Total Sales: Rp ________________
- Issues Encountered: ________________
- Notes: ________________

### Closing
- Closing Amount: Rp ________________
- Variance (if any): Rp ________________
- Closing Time: ________________
- Closing Status: ☑ Success ☐ Failed

### Printer Status
- Kitchen Printer: ☑ OK ☐ Issue → ________________
- Cashier Printer: ☑ OK ☐ Issue → ________________

### Supervisor Signature: ________________ Date: ________________

---

## 📞 CONTACT QUICK REFERENCE

**Technical Issues:**
- IT Support: [ext. XXX]
- Printer Issue: Call IT immediately

**Operational Issues:**
- Supervisor: [ext. XXX]
- Manager: [ext. XXX]

**After Hours:**
- Emergency: [phone number]

---

## 💡 TIPS & BEST PRACTICES

1. **Opening Entry is MANDATORY**
   - Jangan skip untuk proceed cepat
   - Penting untuk cash reconciliation
   - Opening amount harus EXACT

2. **Always CHECK PRINTER STATUS Pagi**
   - Printer issue detected pagi lebih baik daripada tengah operasi
   - Test print sebelum mulai serve customer

3. **When Cash Payment - Always Verify CHANGE**
   - Jangan hitung sendiri, percaya sistem
   - Sistem hitung = reduce human error
   - Double-check sebelum serah customer

4. **Reconciliation Harian**
   - Closing amount HARUS match expected amount
   - Jika variance, investigate immediately
   - Don't hide variance, report to supervisor

5. **Payment Method is IMPORTANT**
   - Jangan asal klik payment method
   - Customer bayar cash ≠ select card
   - Accuracy penting untuk reporting

---

**Last Updated:** January 25, 2026  
**Version:** 1.0  
**For Questions:** Contact IT Support or Supervisor
