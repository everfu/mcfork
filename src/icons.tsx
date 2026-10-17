const paths: Record<string, string> = {
  chevron: 'm6 9 6 6 6-6',
  lock: 'M6 10h12v11H6V10Z M8 10V6a4 4 0 0 1 8 0v4',
  unlock: 'M6 10h12v11H6V10Z M8 10V6a4 4 0 0 1 8 0',
  refresh: 'M20 8a8 8 0 1 0 1 7 M20 3v6h-6',
  branch: 'M5 4v5c0 3 3 3 7 3h3 M5 9v11 M15 7l5 5-5 5 M5 4h.01 M5 20h.01',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14', close: 'm6 6 12 12 M6 18 18 6',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
  train: 'M7 3h10a2 2 0 0 1 2 2v12H5V5a2 2 0 0 1 2-2Z M5 11h14 M9 3v8 M15 3v8 M8 17l-2 4 M16 17l2 4 M8 14h.01 M16 14h.01',
  food: 'M4 3v6c0 3 6 3 6 0V3 M7 3v18 M4 6h6 M18 3c-3 4-3 8 1 8v10 M19 3v8',
  file: 'M14 2H5v20h14V7l-5-5Z M14 2v6h5 M8 12h8 M8 16h8',
  mail: 'M3 5h18v14H3V5Z m0 1 9 7 9-7',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 15v6h16v-6',
  arrow: 'm14 5-7 7 7 7', check: 'm5 12 4 4 10-10',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  external: 'M14 3h7v7 M10 14 21 3 M10 3H3v18h18v-7',
  copy: 'M8 3h12v14 M4 7h12v14H4V7Z',
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.info} /></svg>;
}
export function Pin({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 40" aria-hidden="true"><path d="M16 1A15 15 0 0 0 1 16c0 10 15 23 15 23s15-13 15-23A15 15 0 0 0 16 1Z" fill="#c93c31" /><circle cx="16" cy="15" r="5.5" fill="white" /></svg>;
}
