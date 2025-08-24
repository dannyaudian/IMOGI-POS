IMOGI POS — ERPNext v15 (Best‑Practice
Blueprint)
Tujuan: modular, scalable, minimal customisasi (tanpa core patching). Billing satu jalur via
Sales Invoice (is_pos=1). Status dokumen via Workflow. Tracking per‑item dengan KOT Item
(unit level). Mode layanan dikontrol oleh POS Profile (native) untuk multi‑outlet &
multi‑brand.
Catatan Lingkup: dokumen ini memfokuskan POS Restaurant. Di app yang sama
( imogi_pos ) akan ada varian POS non‑restaurant (Retail/Service) pada fase berikutnya.
Struktur/penamaan disiapkan agar modular tanpa konflik (namespace restaurant/* vs
rencana retail/* ), Workspace/Settings dipisah per domain, dan fixtures dibedakan per
modul.
1) Prinsip Arsitektur
•
•
•
•
•
•
•
No core patching: semua lewat DocTypes, fixtures, workflows, custom fields, hooks.py
(doc_events/whitelist), dan frappe.publish_realtime.
POS Profile‑first: perilaku (Table/Counter/Kiosk/Self‑Order), printing, branding, defaults di‑override
per outlet/device.
Domain switch via POS Profile:
imogi_pos_domain (Select: Restaurant/Retail/Service) mengontrol fitur. Restaurant
mengaktifkan Table/Kitchen/KOT; domain lain akan ditambahkan kemudian tanpa bentrok.
Template‑first catalog: katalog/search hanya Item Template & item tanpa variant. Template →
Variant Picker → baris replace ke Variant. Item tanpa variant bisa dipilih langsung. Scan barcode
Variant → map ke Template → buka picker.
Branch‑aware: semua objek membawa branch ; UI selalu terfilter.
Single billing path: Sales Invoice (is_pos=1) + Payments/Payment Entry sesuai mode.
Native POS Session: opsional enforce; SI/PE otomatis link ke POS Session aktif; checkout ditolak
bila sesi tidak aktif (kecuali kebijakan cashless).
2) Mode & Strategy (via POS Profile)
•
•
•
•
Domain (POS Profile): imogi_pos_domain menentukan paket fitur.\ ▸ Restaurant → aktifkan
Table/Kitchen/KOT, Table Layout, Waiter Order, Customer Display.\ ▸ Retail/Service (coming) →
sembunyikan fitur restaurant; gunakan katalog, cashier, kiosk generic.
Mode: Table Service , Counter/Takeaway, Kiosk , `` (dipilih di POS Profile). Device/login
memilih profil sesuai area/skenario.
Order Type: Dine‑in / Takeaway / Kiosk tersimpan di POS Order (default dari profil).
Self‑Order (QR): scan Order QR → halaman /so/\<token|slug> → pilih item (Template‑first) → kirim
KOT (Table) atau checkout (Takeaway) sesuai profil.
1
•
•
Kiosk: bayar dulu → build SI → KOT → auto‑print Receipt + Queue Ticket; sesi reset.
Counter/Takeaway: boleh KOT dulu atau bayar dulu (kebijakan outlet). Katalog tetap Template +
single‑SKU.
3) Struktur Repo (rapi & konsisten)
repo-root/
├─ MANIFEST.in | setup.py | README.md | LICENSE
│ (opsional: pyproject.toml)
└─ imogi_pos/
├─ fixtures/ # workspaces, desk pages, print formats, item
attributes, custom fields, workflows, dashboard charts
├─ app.json | requirements.txt | CHANGELOG.md | DEPLOYMENT.md | setup.cfg
└─ imogi_pos/ # python package = app_name (semua source di dalam
sini)
├─ __init__.py | hooks.py | modules.txt | patches.txt
├─ config/
│ └─ desktop.py # optional; v15 utamanya pakai Workspace (DocType)
├─ api/
│ ├─ __init__.py
│ ├─ public.py
│ ├─ orders.py # create/switch/merge/split,
open_or_create_for_table, set_order_type
│ ├─ kot.py # send/update KOT, unit states
│ ├─ billing.py # generate_invoice, list_orders, prepare_draft,
get_active_pos_session, request_payment
│ ├─ layout.py # get/save table layout, table status
│ ├─ customer_display.py
│ ├─ variants.py # picker config, list, choose (replace → variant)
│ ├─ customers.py # find by phone, quick-create customer/contact,
attach
│ └─ printing.py # print_kot/customer_bill/receipt/queue/test,
get_print_capabilities
├─ utils/
│ ├─ __init__.py
│ ├─ printing.py # server-side builders/adapters
│ └─ qr.py # build QR payload, sign/verify (Order QR)
├─ doctype/ # kitchen, kot_*, pos_order*, restaurant_*,
table_layout_*, customer_display_*, kiosk_*, self_order_*
├─ billing/
│ └─ invoice_builder.py
├─ kitchen/
│ ├─ kot_service.py
│ └─ sla.py
2
├─ table/
│ └─ layout_service.py
├─ public/
│ ├─ js/
│ │ ├─ nav.js # header/back, profile/branch switcher, logo load
│ │ ├─ auth.js # login helper (/api/method/login), session checks
│ │ ├─ branch.js # branch context (get/set, subscribe)
│ │ ├─ print/
│ │ │ ├─ service.js # pilih adapter (LAN/Bluetooth/OS), test print
│ │ │ ├─ adapter_bluetooth.js # Web Bluetooth API
│ │ │ ├─ adapter_bridge.js # HTTP bridge → local agent
│ │ │ └─ adapter_spool.js # window.print (OS spooler)
│ │ ├─ cashier_console.js | customer_display.js | kiosk.js |
kitchen_display.js
│ │ └─ table_display.js | table_layout_editor.js | self_order.js |
waiter_order.js
│ └─ css/
│ ├─ base.css # tokens, reset, utilities
│ ├─ components.css # header, buttons, cards, inputs
│ └─ cashier_console.css | customer_display.css | kiosk.css |
kitchen_display.css | table_display.css | self_order.css | waiter_order.css
├─ www/
│ ├─ cashier-console/
│ │ └─ index.(py|html|js)
│ ├─ customer-display/
│ │ └─ index.(py|html|js)
│ ├─ kiosk/
│ │ └─ index.(py|html|js)
│ ├─ imogi-login/
│ │ └─ index.(py|html|js) # login form (ERPNext auth)
│ └─ so/
│ └─ index.(py|html|js) # dynamic Self‑Order page (/so/<token|slug>)
# optional: jinja/html (web/desk) & includes
└─ templates/ v15 best practice: semua source berada di dalam paket imogi_pos/imogi_pos/
(module), termasuk config/desktop.py, api/, utils/ , doctype/, public/ , dan
www/ . Fixtures tetap di imogi_pos/fixtures/. Workflows/Pages/Workspaces
didistribusikan via fixtures (tidak perlu folder workflow/ terpisah).
3
4) Data Model (DocTypes & Status)
POS Order (parent)
•
•
Fields: branch* , table? , order_type, pos_profile, customer , totals (RO), link
sales_invoice (RO), pos_session (Link POS Session, RO), workflow_state (RO),
last_edited_by (RO).
Workflow: [Draft → Sent to Kitchen → In Progress → Ready → Served → Closed → Cancelled/
Returned].
POS Order Item (child)
•
•
Fields: item , qty, rate/amount , notes (persist end‑to‑end; tampil di KOT; cetak di Counter/
Kiosk, disembunyikan di Table Bill), routing kitchen/station , counters (sent/preparing/ready/
served/cancelled/returned), last_edited_by (RO).
Variant rule: jika Item.has_variants=1 → wajib pilih Variant via Picker → baris replace ke
Variant. Item tanpa variant dapat dipilih langsung.
KOT Ticket / KOT Item
•
•
Workflow: [Queued → Preparing → Ready → Served → Cancelled].
Reprint audit: printer, copies, user, timestamp.
Kitchen / Kitchen Station
•
•
SLA, mapping printer & copies.
Printer interface: interface (Select: LAN/Bluetooth/OS) ; LAN: lan_host, lan_port ;
Bluetooth: bt_device_name, bt_mac (opsional), bt_vendor_profile (ESC/POS/CPCL/
ZPL) ; OS: tanpa field.
Restaurant Floor / Table
•
Inventaris meja/status; current_pos_order (RO); `` (opsional untuk Self‑Order).
Table Layout Profile / Node
•
Layout lantai (draggable) & node.
Customer Display Profile/Device/Block
•
Pairing device dan komposisi blok.
Kiosk Profile/Device
•
Tema/fitur/allowed groups, timeout, printers (receipt/queue).
4
Self Order Session (NEW)
•
Token/slug, branch , table? , pos_profile, expires_on, order_linkage (POS Order),
is_guest, last_ip, user_agent.
Restaurant Settings
•
Defaults global & toggles.
branch wajib bila enforcement aktif.
5) Guards & Validasi
•
•
•
•
•
Domain guard: surface/endpoint Restaurant (Table/Kitchen/KOT/Layout/Waiter Order) hanya aktif
bila pos_profile.imogi_pos_domain == 'Restaurant'.
Tolak KOT/Invoice jika ada baris Template (belum pilih Variant).
Merge table ditolak jika ada item Ready.
Split bill: validasi rounding, service charge, konsistensi branch .
POS Session: jika imogi_require_pos_session=1 , pembuatan SI/PE (Cashier/Kiosk/Counter)
hanya diizinkan bila ada POS Session aktif (scope: User/Device/POS Profile); Self‑Order Takeaway
boleh tanpa sesi bila imogi_kiosk_cashless_only=1.
6) UI Surfaces
Domain gating: Surface bertanda (Restaurant only) tampil bila imogi_pos_domain =
Restaurant . Surface generik (Cashier/Kiosk/Customer Display) tersedia lintas domain.
Shared Header (kecuali Customer Display & Self‑Order publik)\ Back, Home, POS Profile switcher, Branch
selector, Brand logo, User menu.
•
Logo & Tokens: prioritas POS Profile.brand → Restaurant Settings.imogi_brand_logo →
Company.company_logo → System Settings.brand_html; nav.js menyuntik CSS vars
--brand , --accent (dark mode → imogi_brand_logo_dark ).
Table Display (Desk Page) (Restaurant only)
•
•
Floor plan, order panel (merge/split/switch), realtime, Print Customer Bill, Reprint KOT.
Line Notes: dapat diedit; tidak tampil di Table Bill.
Kitchen Display (Desk Page) (Restaurant only)
•
•
Kolom Queued/Preparing/Ready, aksi besar, SLA badge, Print/Reprint KOT per station.
Line Notes tampil jelas di kartu item.
5
Waiter Order (Desk Page) (Restaurant only)
•
•
Akses dari Table Display (klik meja).
Ringkas: summary meja, Customer selector by phone (search/quick‑create & attach), catalog
template‑first + variant picker → replace, item notes, KOT/reprint/hold/serve/switch; realtime status
via table:{id} ; guards branch/pos session/variant.
Cashier Console (Web)
•
•
•
•
•
Daftar order ready/served → split preview/commit → build SI (is_pos=1) → Print Receipt/Customer
Bill.
Customer lookup by phone (search/quick‑create & attach).
Payment: tombol Request Payment → Payment Request → terima payload Xendit (Dynamic QR/
link) → push ke Customer Display (realtime).
Katalog Template + single‑SKU; Template → Choose Variant → replace; single‑SKU langsung.
Line Notes dicetak di Counter Receipt.
Kiosk (Web)
•
•
•
Mirip POS bawaan (grid item, filter kiri, cart kanan, keypad, Pay).
Variant picker inline; Line Notes opsional → tercetak di Kiosk Receipt; optional Queue Ticket.
UI Payment: Dynamic QR Xendit ditampilkan di Kiosk (dimirror ke Customer Display). Webhook
paid → PE otomatis → auto‑print & reset sesi.
Self‑Order (Web via Order QR)
•
•
•
•
Publik /so/\<token|slug> (tanpa header; minimal navigasi), Template‑first, cart ringan, variant
picker, item notes.
Table mode (Restaurant only): Submit → KOT; bayar di kasir.
Takeaway mode: Checkout → SI (is_pos=1) + Payment (gateway/Xendit) → KOT; dukung Queue
Ticket.
UI Payment: menampilkan Payment QR/link dari Xendit (bila gateway aktif); tidak membuat QR
sendiri.
Customer Display (Web)
•
•
•
Viewer publik (brand, order summary, tips, ticker, ads/promo). Fullscreen.
Payment Block (Xendit): hanya merender QR/link yang dikirim IMOGI Xendit Connect (Dynamic/
Static Fallback); POS tidak pernah membuat QR bayar sendiri.
Realtime channel: payment:pr:{payment_request_name} untuk update status awaiting →
paid/expired.
Customer Display Editor (Desk Page)
•
Drag‑drop blocks, grid/snap; simpan ke Profile/Block.
6
6.1 Auth & Branch Guard
•
•
•
•
Jika frappe.session.user == 'Guest' → /imogi-login (custom) atau /login (native).
Form ke /api/method/login ( usr , pwd ).
Self‑Order: allow_guest berbasis token/slug (verifikasi signature, expiry, branch). Akses discope ke
objek terkait.
Role per page: Table (Manager/Waiter), Kitchen (Kitchen Staff/Manager), Cashier (Cashier/Manager),
Kiosk (Device/Manager), Customer Display (Device), Self‑Order (Guest via token).
Branch guard: hormati User Permissions; fallback POS Profile.imogi_branch . Context
disimpan di session cache + localStorage.
6.2 Self‑Order Flow (ringkas)
1.
2.
3.
4.
5.
6.
QR Provisioning (Order QR): generate QR untuk Table/Branch (hanya untuk membuka /so/,
bukan untuk bayar). Payload: slug/token, branch , table? , pos_profile, expiry .\
Simpan qr_slug pada Restaurant Table; QR sheet via Print Format: Self‑Order QR Sheet.
Open /so/\<token|slug>: server verify token → load branding & katalog Template‑first.
Attach Session: buat/ambil Self Order Session; attach ke POS Order yang open atau buat baru.
Add Items: Template → picker → replace; isi notes.
Submit: Table mode → KOT; Takeaway → SI + Payment (gateway) → KOT → (optional) Receipt/
Queue.
Track: realtime status item Queued/Preparing/Ready ; token expiry menutup aksi.
Order QR (buka /so/) berbeda dari Payment QR (Xendit, dibawa via realtime).
7) Printing (LAN + Bluetooth + OS)
•
•
•
•
•
•
•
•
•
•
Prioritas: Device/Station → POS Profile → Settings (fallback).
Interfaces:
LAN (TCP/IPP/raw).
Bluetooth:
◦
Web Bluetooth (tanpa agent): public/js/print/adapter_bluetooth.js (Chrome/
Edge/Android, HTTPS).
◦
Print Bridge (dengan agent lokal): adapter_bridge.js POST → IMOGI Print Bridge
(opsional) untuk akses Bluetooth/serial OS.
OS Spooler: window.print() dari Print Format HTML (user pilih printer Bluetooth yang dipair di
OS).
Pemilihan adapter: public/js/print/service.js membaca interface dari Kitchen
Station/POS Profile → pilih Bluetooth/LAN/OS; tombol Test Print tersedia.
Formats: KOT Ticket , Customer Bill (pro‑forma SI), Payment Receipt (SI), , , ``.
Auto‑print: on KOT submit / on Invoice submit / on Kiosk checkout (toggle).
Notes rules: selalu di KOT; ON di Counter/Kiosk Receipt; OFF di Table Bill. Builder menyalin notes →
Sales Invoice Item.description (Counter/Kiosk).
Compat: Web Bluetooth perlu HTTPS; Bridge cocok Windows/macOS/Linux; OS Spooler tergantung
pairing OS.
7
8) API Surface (whitelisted)
•
•
•
•
•
•
•
•
•
orders.py: create_order, open_or_create_for_table, switch_table, merge_tables,
set_order_type.
kot.py: send_items_to_kitchen, update_kot_item_state,
bulk_update_kot_item_state, update_kot_status.
billing.py: generate_invoice, list_orders_for_cashier, prepare_invoice_draft
(salin notes ke SI Item.description untuk Counter/Kiosk), get_active_pos_session , `` (build
Payment Request → delegasi Xendit → return payload QR/link).
layout.py: get_table_layout, save_table_layout, get_table_status.
customer_display.py: register_display_device, link_display_to_order,
get_customer_display_config, post_display_heartbeat,
publish_customer_display_update.
variants.py: get_variant_picker_config, get_item_variants,
choose_variant_for_order_item (replace line → Variant; tidak menerima add Variant langsung).
customers.py: find_customer_by_phone, quick_create_customer_with_contact,
attach_customer_to_order_or_invoice.
printing.py: print_kot, print_customer_bill, print_receipt, print_queue_ticket,
test_print, get_print_capabilities.
self_order.py: create_session, add_item, update_item, remove_item,
submit_table_order (→ KOT), checkout_takeaway (→ SI+Payment→KOT), get_status,
end_session.
9) Realtime Channels
•
•
•
•
•
•
Table: table:{id} ; Floor: table_display:floor:{floor}.
Kitchen: kitchen:station:{name} dan kitchen:{kitchen}.
Customer display: customer_display:device:{device_id}, customer_display:order:
{pos_order}.
Payment: payment:pr:{payment_request_name} (payload dari Xendit Connect: QR/link,
amount, expiry, status).
Self‑Order: self_order:session:{session_id} (cart/status), self_order:table:{table}
(mirror ke waiter/kitchen).
Semua payload membawa branch (viewers abaikan lintas branch).
10) Billing (Single Path: Sales Invoice POS)
•
•
•
•
•
Build SI (is_pos=1) sesuai POS Profile (tax/service).
Cash/Card: isi child Payments di SI; Deferred: kosong → Payment Entry saat settle/On Submit.
Kiosk: SI saat checkout; bisa trigger Queue Ticket.
Self‑Order:\ ▸ Table mode: tanpa payment → KOT; bayar di kasir (SI/PE saat settle).\ ▸ Takeaway
mode: wajib payment → SI (is_pos=1) + Payment (gateway) → KOT; Receipt/Queue (opsional).
Split bill: preview → commit hasilkan banyak SI (link balik ke POS Order).
8
•
•
•
Variant guard: tolak KOT/Invoice jika ada baris Template.
POS Session binding: saat membuat SI/PE, otomatis set Profile). Cancel/return mengikuti sesi (native closing).
Auto‑print mengikuti profil & settings.
pos_session (scope: User/Device/POS
10.1 Payment Gateway — IMOGI Xendit Connect (tanpa duplikasi QR)
•
•
•
•
•
•
Alur: SI → Payment Request (PR) → Xendit Invoice/Checkout (Dynamic QR) → Webhook paid →
Payment Entry otomatis.
Satu‑satunya sumber QR pembayaran: Xendit Connect. Customer Display/Kiosk/Self‑Order
hanya merender QR/link dari realtime; POS tidak menggambar QR bayar.
Mapping idempotent: external_id = Payment Request.name (unik).
Webhook: pembayaran sukses → Payment Entry ke akun bank Xendit → alokasi ke SI.
Static QR Fallback: jika Dynamic gagal, Xendit mengirim payload image+instruksi; POS merender
apa adanya (matcher tetap di modul Xendit).
Auto‑print sesudah paid: Receipt/Queue sesuai profil; update status order ke Paid/Closed; clear
cart/sesi Kiosk.
11) Table Ops
•
•
Merge: gabungkan order antar meja → 1 POS Order; sumber dicancel (audit trail); mengikuti target.
branch
Split: by item/qty/amount; preview alokasi → commit (SI jamak) dengan rounding konsisten.
12) Settings & Custom Fields (POS Profile override)
Domain Switch (POS Profile)
•
imogi_pos_domain (Select: Restaurant/Retail/Service; default Restaurant)
Mengendalikan visibilitas field & fitur. Frontend membaca nilai ini untuk menampilkan/hide
surface Restaurant.
Mode & Layout
•
•
•
•
•
•
imogi_mode (Select: Table/Counter/Kiosk/Self‑Order)
imogi_branch (Link Branch)
imogi_use_table_display (Check) (depends_on: eval:doc.imogi_pos_domain=="Restaurant")
imogi_enable_kot (Check) (depends_on: eval:doc.imogi_pos_domain=="Restaurant")
imogi_default_floor (Link) (depends_on: eval:doc.imogi_pos_domain=="Restaurant")
imogi_default_layout_profile (Link) (depends_on:
eval:doc.imogi_pos_domain=="Restaurant")
9
Branding (per POS Profile)
•
•
Self‑Order (QR)
imogi_brand_logo (Attach Image), imogi_brand_logo_dark (Attach Image),
imogi_brand_name (Data), imogi_brand_home_url (Data),
imogi_show_header_on_pages (Check),
imogi_brand_color_primary (Color), imogi_brand_color_accent (Color),
imogi_brand_header_bg (Color), (opsional) imogi_brand_typography (Select),
imogi_brand_css_vars (Code).
•
•
•
•
•
•
•
•
•
imogi_enable_self_order (Check)
imogi_self_order_mode (Select: Table/Takeaway) (opsi Table hanya relevan bila domain =
Restaurant)
imogi_self_order_require_payment (Check)
imogi_self_order_allow_guest (Check)
imogi_self_order_token_ttl (Int, minutes)
imogi_self_order_regenerate_on_close (Check)
imogi_self_order_brand_profile (Link)
imogi_self_order_disclaimer (Small Text)
imogi_self_order_rate_limit (Int/min)
POS Session (native)
•
•
imogi_require_pos_session (Check), imogi_pos_session_scope (Select: User/
Device/POS Profile)
imogi_enforce_session_on_cashier (Check), imogi_enforce_session_on_kiosk
(Check), imogi_enforce_session_on_counter (Check)
Payment Gateway (Xendit Connect)
•
•
•
•
•
imogi_enable_payment_gateway (Check)
imogi_payment_gateway_account (Link Payment Gateway Account)
imogi_checkout_payment_mode (Select: Prompt QR/Cash Only/Mixed)
imogi_show_payment_qr_on_customer_display (Check)
(Opsional) imogi_payment_timeout_seconds (Int)
Catatan: Payment QR selalu berasal dari Xendit Connect; POS hanya merender. Static QR
Fallback & matching diatur di modul Xendit.
Printing (Interfaces & Formats)
•
•
Interface selectors: imogi_printer_cashier_interface (Select: LAN/Bluetooth/OS),
imogi_printer_kitchen_interface (Select).
LAN: imogi_printer_cashier (Data), imogi_printer_kitchen (Data),
imogi_printer_port (Int, opsional).
10
•
•
•
•
Bluetooth: imogi_bt_cashier_device_name (Data), imogi_bt_kitchen_device_name
(Data) ,\ imogi_bt_cashier_vendor_profile (Select: ESC/POS/CPCL/ZPL),
imogi_bt_kitchen_vendor_profile (Select) ,\ imogi_bt_retry (Int),
imogi_print_bridge_url (Data), imogi_print_bridge_token (Password) (opsional bila
pakai Bridge).
OS Spooler: tanpa field khusus (menggunakan printer default OS).
Formats: imogi_receipt_format (Link Print Format), imogi_customer_bill_format
(Link), imogi_kot_format (Link), imogi_queue_format (Link) , copies.
Notes flags: imogi_print_notes_on_receipt (ON),
imogi_print_notes_on_kiosk_receipt (ON), imogi_hide_notes_on_table_bill (ON),
imogi_self_order_qr_sheet_format (Link Print Format).
Sales Invoice (context RO)
•
imogi_pos_order (Link POS Order), table (Link), floor (Link), branch (Link),
pos_session (Link POS Session).
Item (routing)
•
menu_category (Select), photo (Attach Image), default_kitchen (Link),
default_kitchen_station (Link).
12.1) Domain Switch (POS Profile) — Guarding
•
•
•
Depends On (Restaurant‑only fields):\ ▸ imogi_use_table_display, imogi_enable_kot,
imogi_default_floor, imogi_default_layout_profile → (depends_on:
eval:doc.imogi_pos_domain=="Restaurant")\ ▸ imogi_self_order_mode → opsi Table hanya bila
domain Restaurant.
Frontend guard: page Table/Kitchen/Waiter/Layout hanya tampil bila domain Restaurant.
Server guard: API KOT & Table Ops menolak akses bila domain ≠ Restaurant.
13) Security & Permissions
•
•
•
Roles: Restaurant Manager (full), Cashier (billing), Waiter (order/serve/table ops), Kitchen Staff
(KOT states), Viewer (reports), Kiosk/Display Device (web role minimal bila perlu).
Permission Manager: batasi akses per Role + Branch; link fields menghormati User Permissions.
Web pages (www/*): validasi session+role; hanya method aman yang allow_guest (Self‑Order
publik via token).
Authorization Matrix
Page Roles Guest
Desk Page: Table Display Manager, Waiter Tidak
11
Page Roles Guest
Desk Page: Kitchen
Display Kitchen Staff, Manager Tidak
Desk Page: Waiter Order Waiter, Manager Tidak
/www/cashier-console Cashier, Manager Tidak
/www/kiosk Kiosk Device, Manager
(opsional)
Boleh (jika
imogi_kiosk_allow_guest )
/www/customer-display Customer Display Device Boleh
/www/so Self‑Order (token) Boleh (token valid)
/www/imogi-login Semua Boleh
14) Branch & Audit
•
•
•
Branch filter di setiap query/UI; default dari POS Profile.
Auditability: track_changes=1 (POS Order/Item, KOT Ticket/Item, Table, Layout Profile/Node).
last_edited_by (RO) disinkron dari modified_by ( before_save ); gunakan Comments
untuk aksi penting (merge/split/void/reprint).
15) Frontend — HTML/CSS terpisah (Modern · Classy · Minimal)
•
•
•
•
•
HTML: www/<page>/index.html.
CSS: public/css/<page>.css + base.css (tokens) + components.css (komponen).
JS: www/<page>/index.js ; shared: public/js/nav.js, auth.js, branch.js, print
adapters.
A11y: WCAG AA, target 44×44px, focus ring jelas, prefers-reduced-motion.
Print styles: thermal 58/80mm & A4; Notes hanya Counter/Kiosk; KOT selalu tampil.
15.1 Workspaces (v15 best‑practice)
Standar: gunakan Workspace (DocType) sebagai sumber utama navigasi Desk, bukan config/
desktop.py. desktop.py hanya untuk menampilkan module di Launcher.
Prinsip
•
•
•
•
•
Simpan sebagai fixtures (JSON): imogi_pos/fixtures/workspace_*.json.
Public workspaces dengan kontrol akses via Role Permissions (role‑based visibility).
Sequence via sequence_id agar urutan konsisten.
Gunakan Shortcuts, Links, Reports, Dashboards, Cards di content JSON.
Tidak override core; gunakan pola compose (link ke Page/List/Report) bukan patch.
12
Domainized Workspaces
•
•
Restaurant: paket workspace berisi Table/Kitchen/Waiter/Layouts.
Retail/Service (coming): paket workspace tanpa surface Restaurant.
Distribusi sebagai fixtures terpisah: workspace_restaurant_*.json,
workspace_retail_*.json.
Rancangan Workspaces
1.
2.
3.
4.
5.
IMOGI POS (Overview, Manager) — Shortcuts: Table Display, Kitchen Display, Cashier Console,
Kiosk, POS Orders, KOT Tickets; Reports: POS Sales Today, KOT Throughput, Payment Summary;
Charts: Sales by Hour, Orders by Status.
Kitchen Ops (Kitchen Staff) — Shortcuts: Kitchen Display, KOT Tickets; Reports: KOT SLA.
Table Service (Waiter) — Shortcuts: Table Display, Waiter Order, POS Orders (My Floor); Links:
Restaurant Tables, Floors, Layout Editor.
Cashier Ops (Cashier) — Shortcuts: Cashier Console, POS Orders (To Bill), Sales Invoices (Today);
Reports: POS Sales, Payments, Refunds.
Reporting (Manager) — Dashboards: Sales & Operations; Reports: Item‑wise Sales, Variant Mix,
Payment Method Split.
15.2 Waiter Order (Desk Page) — alur dari Table Display
Tujuan: klik meja di Table Display → buat/lanjutkan POS Order meja tsb.
Letak & Nama
•
•
•
Flow Navigasi
Desk Page: waiter-order (fixtures: page_waiter_order.json ).
Script/UI: public/js/waiter_order.js, public/css/waiter_order.css (opsional).
Route: #waiter-order?table=<TABLE>&floor=<FLOOR>&pos_profile=<PROFILE>.
1.
2.
3.
4.
Klik meja → panggil ``.
Jika ada POS Order open → attach; jika tidak → buat baru (default order_type = Dine‑in ).
(Jika sesi wajib) ambil ` untuk konteks pos_session`.
Route ke #waiter-order?pos_order=POS-ORD-0001.
Fitur
•
•
•
•
Header (Back ke Table Display) + brand + branch.
Summary meja, waktu duduk, link ke POS Order.
Customer selector (by phone): cari via Contact & Customer.mobile_no ; bila tak ada → Quick
Create Customer + Contact → attach.
Catalog template‑first + variant picker → replace; item notes; KOT/reprint/hold/serve/switch;
realtime; guards branch/pos session/variant.
13
16) Fixtures
•
•
•
•
•
•
Workspace & Pages: page_table_display.json, page_kitchen_display.json,
page_waiter_order.json, page_table_layout_editor.json,
page_customer_display.json, page_customer_display_editor.json , (opsional)
page_kiosk_admin.json.
Print Formats: print_format_kot_ticket.json, print_format_customer_bill.json,
print_format_payment_receipt.json, , , ``.
Item Attributes: item_attribute_doneness.json (contoh steak doneness).
Custom Fields: custom_field.json (POS Profile, Sales Invoice, Item; sesuai §12).
Web Pages: www/imogi-login/index.(py|html|js) , ``.
Workflows: imogi_pos_order_workflow.json, imogi_kot_ticket_workflow.json.
17) Testing
•
•
•
•
•
•
•
•
•
•
•
POS flow (order → KOT → serve → billing) per Branch & Mode.
Domain switch: saat imogi_pos_domain ≠ 'Restaurant' , halaman Table/Kitchen/Waiter/
Layout tersembunyi; endpoint KOT menolak akses; Cashier/Kiosk tetap berjalan.
Waiter Order flow: Table Display → klik meja → open_or_create_for_table → Waiter Order →
add items (template‑first) → KOT → kembali ke Table Display.
Customer Lookup: search by phone (match Contact/Customer), Quick Create bila tidak ada, attach
ke POS Order/SI; edge case: nomor ganda, normalisasi +62/0.
Merge/Split guards & totals.
Layout serialize/validate & permissions.
Customer Display: register/pair/unpair, heartbeat, render blocks, realtime, privacy.
Variant flow: Template → picker → replace; guard kirim KOT/billing.
Kiosk: checkout → SI → auto‑print; queue ticket jika aktif.
Printing Adapters:\ ▸ LAN: socket/IPP, timeout, retry, paper width.\ ▸ Bluetooth (Web Bluetooth):
pairing dialog, reconnect, HTTPS, vendor profile ESC/POS/CPCL/ZPL.\ ▸ Bluetooth (Bridge):
endpoint URL/token, service up/down, retry.\ ▸ OS Spooler: kompatibilitas thermal; dialog OS;
default printer Bluetooth.
Payment Gateway (Xendit):\ ▸ Dynamic QR: PR dibuat → QR tampil di Cashier/Kiosk/Customer
Display → webhook paid → PE otomatis → auto‑print.\ ▸ Expired/Retry: PR kadaluarsa → buat
ulang → QR update realtime.\ ▸ Static QR Fallback: Xendit kirim image+instruksi; POS render;
matching oleh modul Xendit.
18) Deployment & Ops
•
•
•
•
FC/VPS: install → migrate → load fixtures → setup POS Profile & templates → assign roles.
bench build → bench setup production.
Hooks: after_migrate untuk load default fixtures; scheduler opsional untuk SLA rollup.
IMOGI Print Bridge (opsional): service lokal untuk Bluetooth/serial bila Web Bluetooth tidak
memadai.
14
19) Acceptance Criteria
•
•
•
•
•
•
•
•
•
•
•
•
Mode via POS Profile mengubah perilaku (Table/Counter/Kiosk/Self‑Order) tanpa deploy ulang.
Domain switch:\ ▸ Jika imogi_pos_domain = Restaurant → surface dan field restoran muncul
& berfungsi.\ ▸ Jika ≠ Restaurant → surface restoran tersembunyi; API KOT nonaktif; cashier/kiosk
normal.
POS Session compliance: bila diaktifkan, semua checkout/cancel/refund mengikuti sesi; SI/PE
ter‑link dan terbaca di closing voucher; Self‑Order Takeaway mengikuti kebijakan cashless.
Waiter Order flow: dari Table Display, klik meja membuka Waiter Order; jika belum ada order maka
dibuat (Dine‑in, branch & pos_profile sesuai konteks), jika ada maka attach; KOT via tombol; Back
kembali ke Table Display dengan state ter‑update.
Customer Lookup by phone: cari Customer via nomor telepon (Contact & Customer.mobile_no );
bila tidak ditemukan, Quick Create Customer + Contact; otomatis ter‑attach ke POS Order/SI.
Katalog Template‑first: item tanpa variant bisa dipilih langsung; scan Variant → map ke Template
→ picker.
Self‑Order (QR): token diverifikasi; Table → KOT; Takeaway → SI + Payment (gateway/Xendit) →
KOT.
Payment QR no‑duplicate: Payment QR hanya dari Xendit Connect; UI POS/Customer Display
tidak membuat QR bayar sendiri; realtime payment:pr:* sinkron.
Printing: Table/Counter (Customer Bill/Receipt), Kitchen (KOT), Kiosk (Receipt/Queue), Self‑Order QR
Sheet; mendukung LAN, Bluetooth (Web Bluetooth/Bridge), OS Spooler; Test Print bekerja;
auto‑print & prioritas sesuai profil.
Line Notes: tampil di Kitchen/KOT; cetak di Counter/Kiosk Receipt; sembunyikan di Table Bill;
builder menyalin ke SI Item.description (Counter/Kiosk/Takeaway Self‑Order).
Branch & Audit: isolasi data, Version aktif, last_edited_by konsisten.
Billing: SI (is_pos=1) terbit; Payments/PE sesuai mode; split bill benar; link balik ke POS Order.
1