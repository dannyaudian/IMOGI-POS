/**
 * Perbaikan untuk Kitchen Display System
 * Simpan file ini di server Anda sebagai /assets/imogi_pos/js/fix_kitchen_display.js
 * Kemudian tambahkan ke template HTML
 */

// Tunggu sampai dokumen dimuat sepenuhnya
document.addEventListener('DOMContentLoaded', function() {
  console.log('Fix Kitchen Display script loaded');
  
  // Beri sedikit waktu untuk memastikan semua file JS dimuat
  setTimeout(function() {
    initializeKitchenDisplay();
  }, 300);
});

// Fungsi untuk menginisialisasi Kitchen Display
function initializeKitchenDisplay() {
  console.log('Mencoba inisialisasi Kitchen Display...');
  
  // Periksa apakah namespace imogi_pos tersedia
  if (typeof imogi_pos === 'undefined') {
    console.error('ERROR: imogi_pos tidak tersedia');
    showError('Namespace imogi_pos tidak tersedia. Pastikan file JavaScript dimuat dengan benar.');
    return;
  }
  
  // Jika perlu, buat namespace kitchen_display
  if (typeof imogi_pos.kitchen_display === 'undefined') {
    console.log('Membuat namespace kitchen_display...');
    imogi_pos.kitchen_display = {};
  }
  
  // Periksa apakah kitchen_display.js dimuat dengan benar
  const hasInit = typeof imogi_pos.kitchen_display.init === 'function';
  const hasFetchTickets = typeof imogi_pos.kitchen_display.fetchTickets === 'function';
  const hasRenderColumns = typeof imogi_pos.kitchen_display.renderColumns === 'function';
  const hasBindEvents = typeof imogi_pos.kitchen_display.bindEvents === 'function';
  
  if (!hasInit || !hasFetchTickets || !hasRenderColumns || !hasBindEvents) {
    console.error('ERROR: kitchen_display.js tidak dimuat dengan benar');
    showError('File kitchen_display.js tidak dimuat dengan benar. Fungsi-fungsi penting tidak tersedia.');
    return;
  }
  
  // Buat objek lifecycle jika belum ada
  if (typeof imogi_pos.kitchen_display.lifecycle === 'undefined') {
    console.log('Membuat objek lifecycle secara manual...');
    
    imogi_pos.kitchen_display.lifecycle = {
      init: function(options) {
        console.log('Memanggil init melalui lifecycle...');
        return imogi_pos.kitchen_display.init.call(imogi_pos.kitchen_display, options);
      },
      fetchTickets: function() {
        return imogi_pos.kitchen_display.fetchTickets.call(imogi_pos.kitchen_display);
      },
      renderColumns: function() {
        return imogi_pos.kitchen_display.renderColumns.call(imogi_pos.kitchen_display);
      },
      bindEvents: function() {
        return imogi_pos.kitchen_display.bindEvents.call(imogi_pos.kitchen_display);
      }
    };
    
    console.log('Objek lifecycle berhasil dibuat:', imogi_pos.kitchen_display.lifecycle);
  }
  
  // Pastikan Font Awesome dimuat
  if (!document.querySelector('link[href*="font-awesome"]')) {
    console.log('Memuat Font Awesome...');
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
    document.head.appendChild(faLink);
  }
  
  // Inisialisasi Kitchen Display
  try {
    console.log('Menjalankan inisialisasi Kitchen Display...');
    
    // Coba gunakan lifecycle.init terlebih dahulu
    if (typeof imogi_pos.kitchen_display.lifecycle.init === 'function') {
      imogi_pos.kitchen_display.lifecycle.init({
        container: '#kitchen-display',
        kitchenSelector: '#kitchen-selector',
        stationSelector: '#station-selector',
        refreshInterval: 30000
      });
    } 
    // Jika lifecycle.init tidak tersedia, gunakan init langsung
    else if (typeof imogi_pos.kitchen_display.init === 'function') {
      console.log('Memanggil init langsung...');
      imogi_pos.kitchen_display.init({
        container: '#kitchen-display',
        kitchenSelector: '#kitchen-selector',
        stationSelector: '#station-selector',
        refreshInterval: 30000
      });
    } 
    else {
      throw new Error('Fungsi init tidak tersedia');
    }
    
    console.log('Kitchen Display berhasil diinisialisasi!');
  } catch (error) {
    console.error('Error saat inisialisasi Kitchen Display:', error);
    showError('Error saat inisialisasi: ' + (error.message || String(error)));
  }
}

// Fungsi untuk menampilkan pesan error
function showError(message) {
  const container = document.getElementById('kitchen-display');
  if (!container) return;
  
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; height: 100%;">
      <div style="color: #f44336; font-size: 64px; margin-bottom: 20px;">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h2 style="font-size: 24px; margin-bottom: 16px;">Error Kitchen Display</h2>
      <p style="font-size: 16px; margin-bottom: 20px;">Fungsi inisialisasi Kitchen Display tidak tersedia</p>
      <div style="background-color: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 20px; max-width: 600px; text-align: left;">
        <p style="margin: 0;">${message}</p>
      </div>
      <button onclick="location.reload()" style="background-color: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-sync"></i> Muat Ulang Halaman
      </button>
    </div>
  `;
}
