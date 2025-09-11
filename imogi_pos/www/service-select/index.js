frappe.ready(() => {
  document.querySelectorAll('.service-link').forEach((link) => {
    const service = link.getAttribute('data-service');
    if (service) {
      link.addEventListener('click', () => {
        localStorage.setItem('imogi_service_type', service);
      });
    }
  });
});
