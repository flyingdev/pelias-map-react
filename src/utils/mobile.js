export const isMobile =
  window.innerWidth <= 768 ||
  ('ontouchstart' in window && window.innerWidth <= 1024);
