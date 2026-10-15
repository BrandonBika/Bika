/**
 * @file apps/resident-pwa/src/features/beacon/beacon-icons.js
 * Safe SVG Icon factory for Beacon tab. Zero innerHTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(width, height, viewBox = '0 0 24 24', stroke = 'currentColor', strokeWidth = 2, fill = 'none') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('fill', fill);
  svg.setAttribute('stroke', stroke);
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

export const BeaconIcons = {
  // Map pin icon used in Beacon title, live badge, share buttons
  pin(size = 14, color = 'currentColor', fill = 'none') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2, fill);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 22s7-7.6 7-12.5A7 7 0 0 0 5 9.5C5 14.4 12 22 12 22Z');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '9.5');
    circle.setAttribute('r', '2.3');
    if (fill !== 'none') circle.setAttribute('fill', fill);
    svg.append(path, circle);
    return svg;
  },

  // Map destination marker pin (32px teal pin with white center)
  destinationMarker(size = 32, color = 'var(--beacon, #1C8C99)') {
    const svg = createSvg(size, size, '0 0 24 24', color, 1, color);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z');
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '10');
    circle.setAttribute('r', '2.5');
    circle.setAttribute('fill', '#ffffff');
    svg.append(path, circle);
    return svg;
  },

  // Plus icon
  plus(size = 14, color = 'currentColor', strokeWidth = 2.4) {
    const svg = createSvg(size, size, '0 0 24 24', color, strokeWidth);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 5v14M5 12h14');
    svg.appendChild(path);
    return svg;
  },

  // Speech bubble (message) icon
  message(size = 13, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z');
    svg.appendChild(path);
    return svg;
  },

  // Chevron left (back)
  back(size = 14, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'm15 18-6-6 6-6');
    svg.appendChild(path);
    return svg;
  },

  // Chevron right
  chevronRight(size = 14, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'm9 18 6-6-6-6');
    svg.appendChild(path);
    return svg;
  },

  // Route / path icon
  route(size = 18, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const c1 = document.createElementNS(SVG_NS, 'circle');
    c1.setAttribute('cx', '6');
    c1.setAttribute('cy', '19');
    c1.setAttribute('r', '2.5');
    const c2 = document.createElementNS(SVG_NS, 'circle');
    c2.setAttribute('cx', '18');
    c2.setAttribute('cy', '5');
    c2.setAttribute('r', '2.5');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5');
    svg.append(c1, c2, path);
    return svg;
  },

  // Pencil / draw icon
  pencil(size = 13, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const p1 = document.createElementNS(SVG_NS, 'path');
    p1.setAttribute('d', 'M12 20h9');
    const p2 = document.createElementNS(SVG_NS, 'path');
    p2.setAttribute('d', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z');
    svg.append(p1, p2);
    return svg;
  },

  // Undo icon
  undo(size = 12, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const p1 = document.createElementNS(SVG_NS, 'path');
    p1.setAttribute('d', 'M9 14 4 9l5-5');
    const p2 = document.createElementNS(SVG_NS, 'path');
    p2.setAttribute('d', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11');
    svg.append(p1, p2);
    return svg;
  },

  // Trash / Clear icon
  clear(size = 12, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const p1 = document.createElementNS(SVG_NS, 'path');
    p1.setAttribute('d', 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14');
    svg.appendChild(p1);
    return svg;
  },

  // Checkmark icon
  check(size = 12, color = 'currentColor', strokeWidth = 3) {
    const svg = createSvg(size, size, '0 0 24 24', color, strokeWidth);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'm5 12 5 5 9-10');
    svg.appendChild(path);
    return svg;
  },

  // Warning triangle icon
  warning(size = 15, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const p1 = document.createElementNS(SVG_NS, 'path');
    p1.setAttribute('d', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z');
    const p2 = document.createElementNS(SVG_NS, 'path');
    p2.setAttribute('d', 'M12 9v4M12 17h.01');
    svg.append(p1, p2);
    return svg;
  },

  // Address book / contacts icon
  contacts(size = 16, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const p1 = document.createElementNS(SVG_NS, 'path');
    p1.setAttribute('d', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20');
    const p2 = document.createElementNS(SVG_NS, 'path');
    p2.setAttribute('d', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z');
    svg.append(p1, p2);
    return svg;
  },

  // Magnifier search icon
  search(size = 14, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '11');
    circle.setAttribute('cy', '11');
    circle.setAttribute('r', '7');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'm21 21-4.3-4.3');
    svg.append(circle, path);
    return svg;
  },

  // Info icon in circle
  info(size = 14, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '9');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 8v5M12 16h.01');
    svg.append(circle, path);
    return svg;
  },

  // Privacy lock icon
  lock(size = 14, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '4');
    rect.setAttribute('y', '11');
    rect.setAttribute('width', '16');
    rect.setAttribute('height', '10');
    rect.setAttribute('rx', '2');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M8 11V7a4 4 0 0 1 8 0v4');
    svg.append(rect, path);
    return svg;
  },

  // Send message paper-plane icon
  send(size = 14, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'm22 2-7 20-4-9-9-4Z');
    svg.appendChild(path);
    return svg;
  },

  // Lifeline telephone icon
  phone(size = 16, color = 'currentColor') {
    const svg = createSvg(size, size, '0 0 24 24', color, 2);
    const p1 = document.createElementNS(SVG_NS, 'path');
    p1.setAttribute('d', 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.4 2.1L8 10.3a16 16 0 0 0 6 6l1.5-1.5a2 2 0 0 1 2-.5c1 .3 2 .5 3 .6a2 2 0 0 1 1.5 2Z');
    const p2 = document.createElementNS(SVG_NS, 'path');
    p2.setAttribute('d', 'M14.05 2a9 9 0 0 1 8 7.94');
    const p3 = document.createElementNS(SVG_NS, 'path');
    p3.setAttribute('d', 'M14.05 6A5 5 0 0 1 18 10');
    svg.append(p1, p2, p3);
    return svg;
  }
};
