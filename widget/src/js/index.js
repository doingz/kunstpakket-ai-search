import { initWidget } from './widget.js';

// Feature flag check: only load if ?f=1 or session enabled
const checkFeatureFlag = () => {
  const enabled = sessionStorage.getItem('kp_widget_enabled');
  const params = new URLSearchParams(window.location.search);
  
  if (params.get('f') === '1') {
    sessionStorage.setItem('kp_widget_enabled', '1');
    return true;
  }
  
  return enabled === '1';
};

// Initialize widget if enabled
if (checkFeatureFlag()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
}
