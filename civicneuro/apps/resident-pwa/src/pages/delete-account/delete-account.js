/**
 * @file apps/resident-pwa/src/pages/delete-account/delete-account.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { goBack } from '../../router.js';
import '../../components/confirm-dialog/confirm-dialog.js';

export class PageDeleteAccount extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-delete-page');

    const deletionUnavailableMessage = "Account deletion isn't available in the app yet. To have your account and data deleted, contact support at [SUPPORT CONTACT - TODO: replace with verified support contact].";
    const dialog = createElement('div', { cls: 'cn-delete-dialog' });
    const icon = createElement('div', { cls: 'cn-delete-icon', text: '⚠', attrs: { 'aria-hidden': 'true' } });
    const title = createElement('h1', { cls: 'cn-delete-title', text: 'Account deletion is not available yet' });
    const body = createElement('p', { cls: 'cn-delete-body', text: deletionUnavailableMessage });

    const exportLink = createElement('button', {
      cls: 'cn-delete-export',
      text: 'Download my data first (POPIA)',
      attrs: { type: 'button' }
    });
    exportLink.addEventListener('click', () => showToast('A POPIA export will be sent to your email within 24 hours.', { type: 'info' }));

    const confirmLabel = createElement('label', { cls: 'cn-delete-verify' });
    confirmLabel.appendChild(createElement('span', { cls: 'cn-delete-field-label', text: 'TYPE DELETE TO CONFIRM' }));
    const input = createElement('input', {
      cls: 'cn-delete-input',
      attrs: { type: 'text', placeholder: 'DELETE', autocomplete: 'off', maxlength: '6' }
    });
    confirmLabel.appendChild(input);

    const actions = createElement('div', { cls: 'cn-delete-actions' });
    const cancelBtn = createElement('button', {
      cls: 'cn-delete-action cn-delete-action--ghost',
      text: 'Cancel',
      attrs: { type: 'button' }
    });
    cancelBtn.addEventListener('click', () => goBack('account'));

    const deleteBtn = createElement('button', {
      cls: 'cn-delete-action cn-delete-action--danger',
      text: 'View deletion options',
      attrs: { type: 'button', disabled: 'disabled' }
    });

    input.addEventListener('input', () => {
      const value = input.value.trim();
      const isMatch = value === 'DELETE';
      deleteBtn.disabled = !isMatch;
      deleteBtn.classList.toggle('is-enabled', isMatch);
      deleteBtn.classList.toggle('is-disabled', !isMatch);
    });

    deleteBtn.addEventListener('click', () => {
      const ConfirmDialog = customElements.get('cn-confirm-dialog');
      if (!ConfirmDialog) throw new Error('Confirmation dialog is unavailable.');
      ConfirmDialog.show({
        title: 'Account deletion is not available yet',
        message: deletionUnavailableMessage,
        confirmText: 'Got it',
        danger: false,
        onConfirm: () => showToast(deletionUnavailableMessage, { type: 'info' })
      });
    });

    actions.append(cancelBtn, deleteBtn);
    dialog.append(icon, title, body, exportLink, confirmLabel, actions);
    this.appendChild(dialog);
  }
}
customElements.define('page-delete-account', PageDeleteAccount);
