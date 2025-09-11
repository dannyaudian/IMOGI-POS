frappe.ready(() => {
  document.querySelectorAll('.service-card .select-service').forEach((btn) => {
    const card = btn.closest('.service-card');
    const service = card?.getAttribute('data-service');
    const href = card?.getAttribute('data-href');
    if (service && href) {
      btn.addEventListener('click', () => {
        localStorage.setItem('imogi_service_type', service);
        window.location.href = href;
      });
    }
  });
});
