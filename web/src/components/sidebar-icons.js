const paths = {
  home: `<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-8h6v8"/>`,
  view: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`,
  guests: `<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M16 5a3 3 0 0 1 0 6"/><path d="M18 14a5 5 0 0 1 3 5v1"/>`,
  messaging: `<path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-4.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 4 7.5 7.5 0 0 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/>`,
  marketing: `<path d="m3 10 12-5v14L3 14z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="m6 15 2 6h3l-2-5"/>`,
  availability: `<path d="M4 20V11"/><path d="M9 20V5"/><path d="M14 20v-8"/><path d="M19 20V3"/><path d="M2 20h20"/>`,
  reports: `<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>`,
  integrations: `<rect x="8" y="8" width="8" height="8" rx="2"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="12" cy="3" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/>`,
  account: `<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0"/>`,
  setup: `<path d="M10 3h4l.6 2.2 2 1.2 2.2-.6 2 3.4-1.6 1.6v2.4l1.6 1.6-2 3.4-2.2-.6-2 1.2L14 21h-4l-.6-2.2-2-1.2-2.2.6-2-3.4 1.6-1.6v-2.4L3.2 9.2l2-3.4 2.2.6 2-1.2z"/><circle cx="12" cy="12" r="3"/>`,
  support: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4"/><path d="M12 17h.01"/>`,
};

export function sidebarIcon(name) {
  const path = paths[name] || paths.view;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}
