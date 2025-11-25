frappe.ready(() => {
  document.querySelectorAll('.device-link').forEach((link) => {
    const device = link.getAttribute('data-device');
    if (device) {
      link.addEventListener('click', () => {
        localStorage.setItem('imogi_device', device);
      });
    }
  });
});
