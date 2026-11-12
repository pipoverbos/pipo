// Iconos SVG en línea: corazones, estrellas y el resto de iconos de la interfaz.

export function heartSVG(lost){return '<svg viewBox="0 0 26 24" class="'+(lost?"lost":"")+'" aria-hidden="true"><path d="M13 22C4 15 1.5 11.5 1.5 7.5A5.6 5.6 0 0 1 7 2c2.4 0 4.6 1.4 6 3.6C14.400 3.400 16.600 2 19 2a5.600 5.600 0 0 1 5.500 5.500C24.500 11.500 22 15 13 22z" fill="'+(lost?"none":"var(--heart)")+'" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/></svg>'}
export function starSVG(on){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.300 6.100 20.500l1.200-6.500L2.500 9.400l6.600-.9z" fill="'+(on?"var(--h3)":"none")+'" stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round" opacity="'+(on?1:.4)+'"/></svg>'}
export function starsHTML(n){var h='<div class="stars" role="img" aria-label="'+n+' de 3 estrellas">';for(var i=0;i<3;i++)h+=starSVG(i<n);return h+'</div>'}
export const ICON={
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  check:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.500l3.200 3.200L13 4.500"/></svg>',
  lock:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  sound:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.500 9a4 4 0 0 1 0 6M19 6.500a8 8 0 0 1 0 11"/></svg>',
  mute:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.500l4 5M21 9.500l-4 5"/></svg>'
};
