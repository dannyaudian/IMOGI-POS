/**
 * Inisialisasi Kitchen Display System
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Kitchen Display System - DOM Loaded');
  
  // Pastikan Font Awesome dimuat
  if (!document.querySelector('link[href*="font-awesome"]')) {
    console.log('Memuat Font Awesome...');
    const faLink = document.createElement('link');
    faLink.rel = 'stylesheet';
    faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
    document.head.appendChild(faLink);
  }
  
  // Terapkan CSS kritis secara inline untuk memastikan efeknya
  const criticalStyles = document.createElement('style');
  criticalStyles.textContent = `
    .hidden {
      display: none !important;
    }
    
    .kitchen-display {
      font-family: 'Roboto', 'Open Sans', sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: #f5f5f5;
      color: #333;
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
    
    .queued {
      border-left-color: #ff9800;
    }
    
    .in-progress {
      border-left-color: #2196f3;
    }
    
    .ready {
      border-left-color: #4caf50;
    }
  `;
  document.head.appendChild(criticalStyles);
  
  // Inisialisasi setelah jeda singkat untuk memastikan semuanya dimuat
  setTimeout(() => {
    initializeKitchenDisplay();
  }, 100);
});

/**
 * Inisialisasi Kitchen Display System
 */
function initializeKitchenDisplay() {
  if (typeof imogi_pos === 'undefined' || 
      typeof imogi_pos.kitchen_display === 'undefined' ||
      typeof imogi_pos.kitchen_display.lifecycle === 'undefined') {
    console.error('Modul Kitchen Display tidak dimuat dengan benar');
    showError('Modul Kitchen Display tidak dapat dimuat');
    return;
  }
  
  try {
    console.log('Menginisialisasi Kitchen Display...');
    imogi_pos.kitchen_display.lifecycle.init({
      container: '#kitchen-display',
      kitchenSelector: '#kitchen-selector',
      stationSelector: '#station-selector',
      refreshInterval: 30000
    }).catch(err => {
      console.error('Error saat menginisialisasi kitchen display:', err);
      showError('Tidak dapat menginisialisasi Kitchen Display: ' + (err.message || err));
    });
  } catch (err) {
    console.error('Gagal menginisialisasi kitchen display:', err);
    showError('Error saat menginisialisasi Kitchen Display: ' + (err.message || err));
  }
}

/**
 * Tampilkan pesan error kepada pengguna
 */
function showError(message) {
  const container = document.querySelector('#kitchen-display');
  if (!container) return;
  
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; height: 100%;">
      <div style="font-size: 48px; color: #f44336; margin-bottom: 20px;">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <h2>Error Kitchen Display</h2>
      <p>${message || 'Terjadi masalah saat menginisialisasi Kitchen Display System.'}</p>
      <button id="retry-button" style="padding: 10px 20px; background-color: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 20px;">
        <i class="fas fa-sync"></i> Muat Ulang Halaman
      </button>
    </div>
  `;
  
  // Tambahkan handler tombol retry
  const retryButton = container.querySelector('#retry-button');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      location.reload();
    });
  }
}
