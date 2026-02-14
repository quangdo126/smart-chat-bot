// embed.js - Include on any website
// Usage: <script src="https://widget.example.com/embed.js" data-tenant="shop-abc" data-theme="light"></script>
(function() {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var tenant = script.getAttribute('data-tenant') || '';
  var position = script.getAttribute('data-position') || 'bottom-right';
  var apiUrl = script.getAttribute('data-api') || '';
  var theme = script.getAttribute('data-theme') || '';
  var widgetUrl = script.getAttribute('data-widget-url') || script.src.replace('/embed.js', '/');

  // Build iframe URL
  var iframeSrc = widgetUrl + '?tenant=' + encodeURIComponent(tenant);
  if (apiUrl) {
    iframeSrc += '&api=' + encodeURIComponent(apiUrl);
  }
  if (theme) {
    iframeSrc += '&theme=' + encodeURIComponent(theme);
  }

  // Create toggle button
  var toggleBtn = document.createElement('button');
  toggleBtn.id = 'smart-chat-toggle';
  toggleBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  toggleBtn.setAttribute('aria-label', 'Open chat');

  var btnPosition = position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;';
  toggleBtn.style.cssText = 'position: fixed; ' + btnPosition + ' bottom: 20px; width: 56px; height: 56px; border-radius: 50%; background: #2563eb; color: white; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4); z-index: 9998; display: flex; align-items: center; justify-content: center; transition: transform 0.2s, box-shadow 0.2s;';

  // Create iframe container
  var container = document.createElement('div');
  container.id = 'smart-chat-container';

  var containerPosition = position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;';
  container.style.cssText = 'position: fixed; ' + containerPosition + ' bottom: 90px; width: 380px; height: 550px; max-height: calc(100vh - 120px); border: none; border-radius: 12px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15); z-index: 9999; overflow: hidden; display: none; background: white;';

  // Create iframe
  var iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('loading', 'lazy');

  container.appendChild(iframe);

  // State
  var isOpen = false;

  // Toggle function
  function toggleChat() {
    isOpen = !isOpen;
    container.style.display = isOpen ? 'block' : 'none';
    toggleBtn.innerHTML = isOpen
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    toggleBtn.setAttribute('aria-label', isOpen ? 'Close chat' : 'Open chat');
  }

  toggleBtn.addEventListener('click', toggleChat);

  // Hover effect
  toggleBtn.addEventListener('mouseenter', function() {
    this.style.transform = 'scale(1.05)';
    this.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.5)';
  });

  toggleBtn.addEventListener('mouseleave', function() {
    this.style.transform = 'scale(1)';
    this.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.4)';
  });

  // Mobile responsive
  function handleResize() {
    if (window.innerWidth < 420) {
      container.style.width = 'calc(100vw - 20px)';
      container.style.left = '10px';
      container.style.right = '10px';
      container.style.bottom = '80px';
    } else {
      container.style.width = '380px';
      container.style.left = position === 'bottom-left' ? '20px' : '';
      container.style.right = position === 'bottom-right' ? '20px' : '';
      container.style.bottom = '90px';
    }
  }

  window.addEventListener('resize', handleResize);
  handleResize();

  // Append to DOM
  document.body.appendChild(toggleBtn);
  document.body.appendChild(container);

  // Expose API
  window.SmartChatWidget = {
    open: function() { if (!isOpen) toggleChat(); },
    close: function() { if (isOpen) toggleChat(); },
    toggle: toggleChat,
    isOpen: function() { return isOpen; }
  };
})();
