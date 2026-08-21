export const icon = (name) => {
  const paths = {
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    arrowUp: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m7 9 5 5 5-5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    copy: '<rect x="9" y="9" width="10" height="10" rx="1.5"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
    heart: '<path d="M20.8 8.7c0 5.5-8.8 10.4-8.8 10.4S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    spark: '<path d="m12 3 1.5 6.5L20 11l-6.5 1.5L12 19l-1.5-6.5L4 11l6.5-1.5L12 3Z"/>',
    users: '<path d="M16 20v-1.7a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 18.3V20M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 20v-1.7a3.3 3.3 0 0 0-2.5-3.2M16.5 3.1a4 4 0 0 1 0 7.8"/>',
    camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="13" r="3.3"/>',
    upload: '<path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5"/><path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16"/>',
    download: '<path d="M12 4v12m0 0 4.5-4.5M12 16 7.5 11.5"/><path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16"/>',
    alert: '<path d="M12 9v4.5"/><circle cx="12" cy="16.2" r="0.4" fill="currentColor"/><path d="M10.6 3.9 2.9 17.5A1.6 1.6 0 0 0 4.3 20h15.4a1.6 1.6 0 0 0 1.4-2.5L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z"/>',
    trash: '<path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12.5a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L17 7"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.spark}</svg>`;
};
