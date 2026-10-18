/**
 * @file apps/resident-pwa/src/pages/settings/settings.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

const permissionItems = [
  {
    id: 'location',
    name: 'Location',
    descriptor: 'geolocation',
    available: () => Boolean(globalThis.navigator?.geolocation),
    guidance: 'Allow location in your browser or device settings to share your position.'
  },
  {
    id: 'camera',
    name: 'Camera',
    descriptor: 'camera',
    available: () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia),
    guidance: 'Allow camera access in your browser or device settings to capture report photos.'
  },
  {
    id: 'microphone',
    name: 'Microphone',
    descriptor: 'microphone',
    available: () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia),
    guidance: 'Allow microphone access in your browser or device settings to record audio.'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    descriptor: 'notifications',
    guidance: 'Allow notifications in your browser or device settings to receive alerts.'
  },
  {
    id: 'contacts',
    name: 'Contacts',
    guidance: 'Your browser asks for contacts when you use the contact picker; it does not expose a saved permission status here.'
  },
  {
    id: 'photos-files',
    name: 'Photos & files',
    guidance: 'Your browser asks when you choose a photo or file; it does not expose a saved permission status here.'
  }
];

function toDisplayStatus(state) {
  if (state === 'granted') return 'Allowed';
  if (state === 'denied') return 'Blocked';
  if (state === 'prompt') return 'Not asked yet';
  return 'Status unavailable';
}

async function readPermissionState(item) {
  if (item.descriptor && globalThis.navigator?.permissions?.query) {
    try {
      const status = await globalThis.navigator.permissions.query({ name: item.descriptor });
      return status.state;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  }

  if (item.id === 'notifications' && globalThis.Notification) {
    return globalThis.Notification.permission === 'default'
      ? 'prompt'
      : globalThis.Notification.permission;
  }
  return null;
}

function requestGeolocation() {
  return new Promise((resolve) => {
    globalThis.navigator.geolocation.getCurrentPosition(
      () => resolve({ state: 'granted' }),
      (error) => resolve({
        state: error.code === error.PERMISSION_DENIED ? 'denied' : null,
        message: error.code === error.PERMISSION_DENIED
          ? 'Location access was blocked. Change it in your browser or device settings.'
          : 'Location could not be checked. Try again or review your browser/device settings.'
      }),
      { timeout: 8000 }
    );
  });
}

async function requestMediaPermission(constraint) {
  const stream = await globalThis.navigator.mediaDevices.getUserMedia(constraint);
  stream.getTracks().forEach((track) => track.stop());
  return { state: 'granted' };
}

async function requestPermission(item) {
  if (item.id === 'location') return requestGeolocation();
  if (item.id === 'camera') return requestMediaPermission({ video: true });
  if (item.id === 'microphone') return requestMediaPermission({ audio: true });
  if (item.id === 'notifications' && globalThis.Notification?.requestPermission) {
    const state = await globalThis.Notification.requestPermission();
    return { state: state === 'default' ? 'prompt' : state };
  }
  return null;
}

function getRequestErrorMessage(error, item) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return `${item.name} access was blocked. Change it in your browser or device settings.`;
  }
  return `${item.name} access could not be requested. Try again or review your browser/device settings.`;
}

export class PageSettings extends BaseElement {
  connectedCallback() {
    this.classList.add('cn-settings-page');
    this.render();
  }

  async render() {
    clearChildren(this);
    this.append(
      createElement('cn-back-button', { attrs: { fallback: 'menu' } }),
      createElement('h1', { cls: 'cn-settings-title', text: 'Settings' }),
      createElement('p', {
        cls: 'cn-settings-intro',
        text: 'Permission status is reported by your browser when supported. Browser permissions apply to this site, not just this app.'
      })
    );

    const list = createElement('div', { cls: 'cn-settings-list', attrs: { 'aria-live': 'polite' } });
    this.appendChild(list);

    const states = await Promise.all(permissionItems.map(async (item) => {
      try {
        return { item, state: await readPermissionState(item) };
      } catch (error) {
        console.error(`Could not read ${item.name.toLowerCase()} permission status.`, error);
        return { item, state: null };
      }
    }));

    if (!this.isConnected) return;
    clearChildren(list);
    for (const { item, state } of states) {
      const row = createElement('section', { cls: 'cn-settings-row' });
      const details = createElement('div', { cls: 'cn-settings-row__details' });
      details.append(
        createElement('h2', { cls: 'cn-settings-row__name', text: item.name }),
        createElement('p', {
          cls: 'cn-settings-row__status',
          text: toDisplayStatus(state)
        })
      );

      const guidance = createElement('p', {
        cls: 'cn-settings-row__guidance',
        text: !item.available || item.available()
          ? item.guidance
          : 'This browser or device does not provide this permission.'
      });
      details.appendChild(guidance);

      const requestable = item.available?.()
        || (item.id === 'notifications' && Boolean(globalThis.Notification?.requestPermission));
      if (requestable && state !== 'granted' && state !== 'denied') {
        const requestButton = createElement('button', {
          cls: 'cn-settings-request',
          text: `Allow ${item.name.toLowerCase()}`,
          attrs: { type: 'button' }
        });
        requestButton.addEventListener('click', async () => {
          requestButton.disabled = true;
          try {
            const result = await requestPermission(item);
            if (result?.state) {
              row.querySelector('.cn-settings-row__status').textContent = toDisplayStatus(result.state);
            }
            const message = result?.message
              || (result?.state === 'granted' ? `${item.name} access allowed.` : '');
            if (message) row.querySelector('.cn-settings-row__guidance').textContent = message;
          } catch (error) {
            console.error(`Could not request ${item.name.toLowerCase()} permission.`, error);
            row.querySelector('.cn-settings-row__guidance').textContent = getRequestErrorMessage(error, item);
          } finally {
            requestButton.disabled = false;
          }
        });
        details.appendChild(requestButton);
      } else if (state === 'denied') {
        guidance.textContent = `${item.guidance} This site cannot request it again until you change that setting.`;
      }

      row.appendChild(details);
      list.appendChild(row);
    }
  }
}

customElements.define('page-settings', PageSettings);
