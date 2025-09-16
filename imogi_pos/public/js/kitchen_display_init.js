/**
 * Inisialisasi Kitchen Display System
 * 
 * File ini bertanggung jawab untuk menginisialisasi KDS dengan benar
 * dan memastikan semua dependensi terpenuhi
 */

// Pastikan Font Awesome dimuat untuk ikon
if (!document.querySelector('link[href*="font-awesome"]')) {
  const faLink = document.createElement('link');
  faLink.rel = 'stylesheet';
  faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
  document.head.appendChild(faLink);
}

// Tambahkan CSS kritis untuk memastikan styling dasar
const criticalCSS = document.createElement('style');
criticalCSS.textContent = `
  .hidden {
    display: none !important;
  }
  
  .kitchen-display {
    font-family: 'Roboto', 'Open Sans', sans-serif;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #f5f5f5;
  }
  
  .kitchen-header {
    background-color: #fff;
    padding: 10px 16px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }
  
  .kitchen-columns {
    display: flex;
    flex-grow: 1;
    overflow: hidden;
  }
  
  .kitchen-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #e0e0e0;
    overflow: hidden;
  }
  
  .kot-card {
    background-color: #fff;
    border-radius: 6px;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    border-left: 4px solid #ddd;
  }
  
  .queued { border-left-color: #ff9800; }
  .in-progress { border-left-color: #2196f3; }
  .ready { border-left-color: #4caf50; }
`;
document.head.appendChild(criticalCSS);

// Fungsi untuk menampilkan error dengan jelas
function showInitError(message, details) {
  const container = document.querySelector('#kitchen-display');
  if (!container) return;
  
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; height: 100%;">
      <div style="color: #f44336; font-size: 64px; margin-bottom: 20px;">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h2 style="font-size: 24px; margin-bottom: 16px;">Error Kitchen Display</h2>
      <p style="font-size: 16px; margin-bottom: 20px;">${message || 'Modul Kitchen Display tidak dapat dimuat'}</p>
      ${details ? `<div style="background-color: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 20px; max-width: 600px; text-align: left;"><pre style="margin: 0; white-space: pre-wrap;">${details}</pre></div>` : ''}
      <button onclick="location.reload()" style="background-color: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-sync"></i> Muat Ulang Halaman
      </button>
    </div>
  `;
}

// Fungsi untuk memulai inisialisasi KDS dengan aman
function initializeKitchenDisplay() {
  console.log('Memulai inisialisasi Kitchen Display System...');
  
  try {
    // Pastikan semua dependensi tersedia
    if (typeof frappe === 'undefined') {
      throw new Error('Frappe tidak tersedia. Pastikan framework Frappe dimuat dengan benar.');
    }
    
    if (typeof imogi_pos === 'undefined') {
      throw new Error('Namespace imogi_pos tidak tersedia. Pastikan file kitchen_display.js dimuat dengan benar.');
    }
    
    if (typeof imogi_pos.kitchen_display === 'undefined') {
      throw new Error('Module kitchen_display tidak tersedia. Pastikan kitchen_display.js dimuat dengan benar.');
    }
    
    if (typeof imogi_pos.kitchen_display.lifecycle === 'undefined' || 
        typeof imogi_pos.kitchen_display.lifecycle.init !== 'function') {
      throw new Error('Fungsi inisialisasi kitchen_display tidak tersedia. Pastikan fungsi lifecycle.init tersedia.');
    }
    
    // Inisialisasi KDS dengan opsi yang sesuai
    imogi_pos.kitchen_display.lifecycle.init({
      container: '#kitchen-display',
      kitchenSelector: '#kitchen-selector',
      stationSelector: '#station-selector',
      refreshInterval: 30000
    }).catch(err => {
      throw err; // Teruskan error untuk ditangani di catch berikutnya
    });
    
    console.log('Kitchen Display System berhasil diinisialisasi');
  } catch (error) {
    // Tangani error dengan jelas
    console.error('Error saat menginisialisasi Kitchen Display:', error);
    showInitError(
      'Modul Kitchen Display tidak dapat dimuat', 
      error.message || 'Kesalahan tidak diketahui'
    );
  }
}

// Tunggu hingga DOM sepenuhnya dimuat sebelum menginisialisasi
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM telah dimuat, menginisialisasi Kitchen Display...');
  
  // Tunggu sedikit untuk memastikan semua script dimuat
  setTimeout(initializeKitchenDisplay, 300);
});

// Inisialisasi cadangan jika DOMContentLoaded sudah terjadi
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  console.log('DOM sudah dimuat sebelumnya, menginisialisasi Kitchen Display...');
  setTimeout(initializeKitchenDisplay, 300);
}
