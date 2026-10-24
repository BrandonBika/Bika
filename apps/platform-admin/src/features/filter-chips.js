import { describeNode } from './filter-engine.js';

export function renderFilterChips(container, tree, context, onRemove) {
  container.replaceChildren();
  for (const [index, node] of (tree?.children ?? []).entries()) {
    const chip = document.createElement('span');
    chip.className = 'query-chip';
    const label = document.createElement('span');
    label.textContent = describeNode(node, context);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'query-chip-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove filter: ${label.textContent}`);
    remove.addEventListener('click', () => onRemove(index));
    chip.append(label, remove);
    container.append(chip);
  }
}
