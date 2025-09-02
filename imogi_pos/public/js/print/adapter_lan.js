/**
 * Placeholder LAN print adapter for IMOGI POS.
 * Provides minimal interface so asset requests resolve without 404.
 */

window.IMOGIPrintLANAdapter = {
  connect: function () {
    console.warn('LAN adapter not implemented');
    return Promise.reject('LAN adapter not implemented');
  },
  disconnect: function () {},
  print: function () {
    console.warn('LAN adapter not implemented');
    return Promise.reject('LAN adapter not implemented');
  }
};
