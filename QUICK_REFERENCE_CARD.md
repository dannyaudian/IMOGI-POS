# QUICK REFERENCE CARD - POS Counter Flow

**Print this card & place on counter desk**

---

## ONE-PAGE FLOW

```
┌─────────────────────────────────────────────────────┐
│ ☀️  MORNING (Pagi)                                   │
├─────────────────────────────────────────────────────┤
│ 1. Open POS App                                      │
│ 2. Select POS Profile                               │
│ 3. Create Opening Entry (if prompt)                 │
│    └─ Input opening cash amount                      │
│ 4. Test Print (Kitchen + Cashier printer)           │
│ 5. ✅ READY TO SERVE                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 🍔 FOR EACH CUSTOMER ORDER                           │
├─────────────────────────────────────────────────────┤
│ 1. Take Order                                        │
│    ├─ Menu items                                     │
│    ├─ Qty                                            │
│    └─ Variant (size, spice, etc)                    │
│                                                      │
│ 2. Create Order in POS                              │
│    ├─ New Order                                      │
│    ├─ Add items + qty + variant                     │
│    └─ System show TOTAL                              │
│                                                      │
│ 3. Confirm Total with Customer                      │
│    └─ "Rp X,XXX,XXX total"                          │
│                                                      │
│ 4. Take Payment                                      │
│    ├─ Cash: input payment amount                    │
│    ├─ Card: swipe/tap                               │
│    └─ QRIS: scan QR code                            │
│                                                      │
│ 5. Automatic Print                                   │
│    ├─ Kitchen: KOT (order ticket)                   │
│    └─ Counter: Receipt (customer copy)              │
│                                                      │
│ 6. Hand Receipt to Customer                         │
│    └─ "Your order number is: XXX"                   │
│                                                      │
│ 7. Customer Wait/Kitchen Prepare                    │
│                                                      │
│ 8. Serve to Customer                                │
│    └─ Verify items match order                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 🌅 EVENING (Sore)                                    │
├─────────────────────────────────────────────────────┤
│ 1. Finish all orders                                 │
│ 2. Count cash in drawer                             │
│ 3. Close Session                                     │
│    └─ Input closing cash amount                      │
│ 4. Verify cash match                                 │
│ 5. Hand over to supervisor                          │
│ 6. Logout from POS                                   │
└─────────────────────────────────────────────────────┘
```

---

## CRITICAL ACTIONS

### 🔴 MUST DO
- ✅ Create opening entry (jika ada prompt)
- ✅ Test printers (KOT + Receipt) BEFORE serve
- ✅ Verify total dengan customer
- ✅ Verify payment amount >= total
- ✅ Wait for both print succeed
- ✅ Close session di end of day

### 🔴 MUST NOT DO
- ❌ Skip opening entry
- ❌ Don't verify printer at start of day
- ❌ Accept payment < total
- ❌ Process order jika printer gagal
- ❌ Close POS without closing session
- ❌ Count cash yourself - trust POS system

---

## PRINTER STATUS CHART

### Green Light (✅ OK)
```
KOT Print → Paper out from kitchen printer
Receipt Print → Paper out from counter printer
Both working → Proceed dengan order
```

### Red Light (🔴 ERROR)
```
KOT Print Failed → Call IT immediately
Receipt Print Failed → Call IT immediately
Can't Test Print → Don't serve customer, call IT
```

---

## PAYMENT QUICK REFERENCE

```
┌────────────────────────────────────────────┐
│ CASH (Tunai) Payment                       │
├────────────────────────────────────────────┤
│ Customer give: Rp 100,000                  │
│ Order total: Rp 65,000                     │
│ System calculate CHANGE: Rp 35,000         │
│ YOU: Give Rp 35,000 change                 │
│                                            │
│ ⚠️ ALWAYS use system calculation!          │
│ ⚠️ Don't count in your head                │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ CARD (Debit) Payment                       │
├────────────────────────────────────────────┤
│ 1. Customer provide card                   │
│ 2. Swipe/tap in reader                     │
│ 3. Input amount = Order total               │
│ 4. Wait for approval                       │
│ 5. Return card + receipt                   │
│ 6. "Terima kasih"                          │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ QRIS (E-Wallet) Payment                    │
├────────────────────────────────────────────┤
│ 1. Show QRIS code to customer              │
│ 2. Customer scan dengan phone/app          │
│ 3. Customer confirm payment                │
│ 4. System received → receipt print         │
│ 5. "Terima kasih"                          │
└────────────────────────────────────────────┘
```

---

## PROBLEM SOLVING

### "KOT Print Failed"
```
❌ Problem: Kitchen printer can't receive order
   
✅ Fix:
   1. Check kitchen printer power ON
   2. Check paper di printer (not empty)
   3. Check network/cable connected
   4. Power OFF/ON printer
   5. If still fail → CALL IT
   
⚠️ Don't process order until KOT prints!
```

### "Receipt Print Failed"
```
❌ Problem: Counter printer can't print receipt
   
✅ Fix:
   1. Check counter printer power ON
   2. Check paper di printer (not empty)
   3. Check network/cable connected
   4. Power OFF/ON printer
   5. If still fail → CALL IT
   
⚠️ Customer still waiting for receipt!
```

### "Can't Add Item to Order"
```
❌ Problem: Item tidak bisa ditambah ke order

✅ Possible Causes:
   - Item out of stock
   - Item not in system
   - Qty = 0 (harus > 0)
   - POS Profile error
   
✅ Fix:
   1. Try add different item
   2. Increase qty value
   3. Check item exist di system
   4. If persist → CALL SUPERVISOR
```

### "Payment Amount Less Than Total"
```
❌ Problem: Customer bayar kurang

✅ Fix:
   - DO NOT process payment
   - Ask customer bayar lagi/kekurangannya
   - Retry payment dengan correct amount
   - Verify change calculation
```

---

## NUMBERS TO CALL

```
┌──────────────────────────────┐
│ Emergency Contacts           │
├──────────────────────────────┤
│ IT Support: _______________  │
│ Supervisor: _______________  │
│ Manager: ___________________  │
│ 24H Hotline: ______________  │
└──────────────────────────────┘
```

---

## DAILY CHECKLIST SUMMARY

### Morning ☀️
- [ ] POS system online
- [ ] POS Profile selected
- [ ] Opening entry created (if needed)
- [ ] Both printers online & paper OK
- [ ] Test print successful

### During Day 🍔
- [ ] Every order: verify price, payment, receipt
- [ ] Track cash drawer
- [ ] Note any issues

### Evening 🌅
- [ ] All orders finished
- [ ] Cash drawer closed
- [ ] Closing session done
- [ ] Cash reconciled
- [ ] Handover to supervisor

---

## KEYBOARD SHORTCUTS (if available)

```
F1: Help / Bantuan
F2: New Order / Order Baru
F3: Search Item
F4: Payment / Bayar
F5: Refresh / Segarkan
F6: Void / Batal Transaksi
F7: Report / Laporan
F8: Settings / Setelan
```

*Check dengan supervisor for actual shortcuts in your system*

---

## TIPS

1. **Speed vs Accuracy** → Accuracy lebih penting
   - Jangan keburu, verify setiap transaksi
   - Kesalahan bisa berakibat financial loss

2. **Customer Service** → Friendly but efficient
   - Greet dengan "Selamat datang"
   - Explain total clearly
   - Confirm receipt received

3. **Cash Handling** → System is your friend
   - POS hitung change, bukan anda
   - Reduce human error
   - Create audit trail

4. **Printer Status** → Prevent problem, not fix
   - Test print di pagi (before problem)
   - Call IT early (before queue builds)
   - Don't wait sampai customer complain

5. **Session Management** → Discipline required
   - Close session exactly pada waktu shift end
   - Tidak boleh skip untuk "cepat pulang"
   - Important untuk cash reconciliation

---

## SYSTEM REQUIREMENTS

**For POS to work correctly:**
- ✅ Internet connection (stable)
- ✅ POS Profile assigned to your user
- ✅ Kitchen printer connected & online
- ✅ Cashier printer connected & online
- ✅ POS Opening Entry status = "Open"
- ✅ Warehouse stock item availability

---

**Print Date:** January 25, 2026  
**Valid Until:** When system changes  
**Keep at:** Counter desk  
**Contact:** IT Support for updates
