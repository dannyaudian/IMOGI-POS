frappe.ready(function() {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  
  // Get redirect URL from query parameter or set default
  const urlParams = new URLSearchParams(window.location.search);
  const redirect = urlParams.get('redirect') || '/cashier-console';
  
  // Save the redirect URL for after login
  localStorage.setItem('login_redirect', redirect);
  
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
      showError('Please enter both username and password');
      return;
    }
    
    // Disable form during submission
    setFormDisabled(true);
    
    // Call login API
    frappe.call({
      method: 'login',
      args: {
        usr: username,
        pwd: password,
        device: getDeviceInfo()
      },
      callback: function(response) {
        if (response.exc) {
          // Show error message
          showError('Login failed. Please check your credentials.');
          console.error(response.exc);
          setFormDisabled(false);
        } else if (response.message && response.message.message) {
          // Show message from server if any
          showError(response.message.message);
          setFormDisabled(false);
        } else {
          // Login successful, store session id and redirect
          try {
            let sid = (frappe.session && frappe.session.sid);
            if (!sid) {
              const match = document.cookie.match(/(^|;)\s*sid=([^;]+)/);
              sid = match ? decodeURIComponent(match[2]) : null;
            }
            if (sid) {
              frappe.sid = sid;
              localStorage.setItem('imogi_sid', sid);
            }
            const redirectTo = localStorage.getItem('login_redirect') || '/cashier-console';
            window.location.href = redirectTo;
          } catch (e) {
            console.error("Redirect error:", e);
            window.location.href = '/cashier-console';
          }
        }
      },
      error: function(xhr, textStatus) {
        showError('Login failed. Please try again.');
        console.error(textStatus);
        setFormDisabled(false);
      }
    });
  });
  
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
  }
  
  function setFormDisabled(disabled) {
    const inputs = loginForm.querySelectorAll('input, button');
    inputs.forEach(input => {
      input.disabled = disabled;
    });
    
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    if (disabled) {
      submitBtn.textContent = 'Logging in...';
    } else {
      submitBtn.textContent = 'Login';
    }
  }
  
  function getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height
    };
  }
  
  // Initialize UI enhancements
  document.getElementById('username').focus();
});