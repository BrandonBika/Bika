/**
 * @file apps/resident-pwa/src/components/confirm-dialog/confirm-dialog.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnConfirmDialog extends BaseElement {
  static show({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) {
    const dialog = createElement('div');
    dialog.style.position = 'fixed';
    dialog.style.inset = '0';
    dialog.style.background = 'rgba(22, 36, 31, 0.5)';
    dialog.style.zIndex = '2000';
    dialog.style.display = 'flex';
    dialog.style.alignItems = 'center';
    dialog.style.justifyContent = 'center';
    dialog.style.padding = '18px';
    dialog.style.backdropFilter = 'saturate(0.7)';

    const card = createElement('div');
    card.style.background = '#fff';
    card.style.borderRadius = '16px';
    card.style.padding = '22px 18px 18px';
    card.style.maxWidth = '360px';
    card.style.width = '100%';
    card.style.boxShadow = '0 25px 50px rgba(0,0,0,0.3)';
    card.style.boxSizing = 'border-box';

    const iconWrap = createElement('div');
    iconWrap.style.width = '44px';
    iconWrap.style.height = '44px';
    iconWrap.style.margin = '0 auto 12px';
    iconWrap.style.borderRadius = '50%';
    iconWrap.style.background = danger ? '#FCEBEB' : '#E1F5EE';
    iconWrap.style.display = 'grid';
    iconWrap.style.placeItems = 'center';
    iconWrap.style.color = danger ? '#A32D2D' : '#0F6E56';
    iconWrap.style.fontSize = '20px';
    iconWrap.textContent = danger ? '⚠' : '✓';

    const h = createElement('h3', {
      text: title,
      attrs: { style: 'margin: 0 0 6px; text-align: center; font-family: "Source Serif 4", serif; font-size: 16px; line-height: 1.3; color: #16241F;' }
    });
    const p = createElement('p', {
      text: message,
      attrs: { style: 'margin: 0 0 14px; text-align: center; color: #3E4A44; font-size: 11.5px; line-height: 1.55;' }
    });
    const btnRow = createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.marginTop = '0';

    const cancelBtn = createElement('button', {
      cls: 'cn-btn cn-btn--secondary',
      text: 'Cancel',
      attrs: { type: 'button', style: 'flex: 1 1 0; background: #fff; color: #3E4A44; border: 1px solid #DAD5C6; border-radius: 10px; padding: 11px 12px; font-size: 12px; font-weight: 700;' }
    });
    cancelBtn.onclick = () => document.body.removeChild(dialog);

    const confBtn = createElement('button', {
      cls: `cn-btn ${danger ? 'cn-btn--danger' : 'cn-btn--primary'}`,
      text: confirmText,
      attrs: { type: 'button', style: `flex: 1 1 0; border-radius: 10px; padding: 11px 12px; font-size: 12px; font-weight: 700; ${danger ? 'background: #A32D2D; color: #fff; border-color: #A32D2D;' : 'background: #0F6E56; color: #fff;'}` }
    });
    confBtn.onclick = () => {
      document.body.removeChild(dialog);
      if (onConfirm) onConfirm();
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confBtn);
    card.appendChild(iconWrap);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(btnRow);
    dialog.appendChild(card);
    document.body.appendChild(dialog);
  }
}
customElements.define('cn-confirm-dialog', CnConfirmDialog);
