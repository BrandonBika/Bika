export function attachTileErrorNotice(tileLayer, container) {
  let notice = null;
  tileLayer.on('tileerror', ({ tile }) => {
    const host = tile?.src ? new URL(tile.src).host : 'unknown';
    console.error('Map tile request failed for host:', host);
    if (notice) return;

    notice = document.createElement('p');
    notice.className = 'map-tile-error-note';
    notice.setAttribute('role', 'status');
    notice.textContent = 'Map tiles could not be loaded';
    container.append(notice);
  });
}
