/**
 * @file apps/resident-pwa/src/pages/your-area/your-area.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import {
  clearHomeLocation,
  refreshAreaInsights,
  setHomeLocation
} from '../../features/area/area.client.js';
import { areaStore } from '../../features/area/area.store.js';
import { requestLocationPermission } from '../../features/permissions/permissions.js';
import '../../components/back-button/back-button.js';

export class PageYourArea extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'home' } }));
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Your area' });
    const card = createElement('div');
    card.style.background = '#fff';
    card.style.border = '1px solid #dfe1e6';
    card.style.borderRadius = '12px';
    card.style.padding = '16px';

    const description = createElement('p', {
      text: 'Set a private home area to see nearby community report insights. Your coordinates are not shown.'
    });
    const areaStatus = createElement('p', { attrs: { 'aria-live': 'polite' } });
    const actionStatus = createElement('p', { attrs: { 'aria-live': 'polite' } });
    const setButton = createElement('button', {
      cls: 'cn-btn cn-btn--primary',
      text: 'Use my current location',
      attrs: { type: 'button' }
    });
    const clearButton = createElement('button', {
      cls: 'cn-btn',
      text: 'Remove',
      attrs: { type: 'button' }
    });
    clearButton.style.marginLeft = '8px';
    clearButton.disabled = true;

    const updateAreaStatus = () => {
      const state = areaStore.get();
      areaStatus.textContent = state.homeAreaSet === true
        ? 'Home area set'
        : state.homeAreaSet === false
          ? 'Not set'
          : state.status === 'error'
            ? 'Could not check home area'
            : 'Checking home area…';
      clearButton.disabled = state.homeAreaSet !== true || state.isLoading;
      setButton.disabled = state.isLoading;
    };

    setButton.addEventListener('click', async () => {
      setButton.disabled = true;
      actionStatus.textContent = 'Requesting your location…';
      let permission;
      try {
        permission = await requestLocationPermission();
      } catch (error) {
        actionStatus.textContent = error?.message || 'Your location could not be determined.';
        setButton.disabled = areaStore.get().isLoading;
        return;
      }
      if (!permission.granted) {
        actionStatus.textContent = permission.reason === 'unsupported'
          ? 'Location is not supported by this browser.'
          : permission.reason === 'denied'
            ? 'Location permission was denied. Allow it in your browser settings and try again.'
            : permission.reason === 'timeout'
              ? 'Location request timed out. Try again where your device has a clearer signal.'
              : 'Your location could not be determined. Try again.';
        setButton.disabled = areaStore.get().isLoading;
        return;
      }

      try {
        await setHomeLocation(permission.coords.latitude, permission.coords.longitude);
        actionStatus.textContent = 'Home area set.';
      } catch (error) {
        actionStatus.textContent = error?.message || 'Could not save or refresh your home area.';
      } finally {
        setButton.disabled = areaStore.get().isLoading;
      }
    });

    clearButton.addEventListener('click', async () => {
      clearButton.disabled = true;
      actionStatus.textContent = 'Removing home area…';
      try {
        await clearHomeLocation();
        actionStatus.textContent = 'Home area removed.';
      } catch (error) {
        actionStatus.textContent = error?.message || 'Could not remove your home area.';
      } finally {
        updateAreaStatus();
      }
    });

    card.append(description, areaStatus, setButton, clearButton, actionStatus);
    this.appendChild(h);
    this.appendChild(card);
    updateAreaStatus();
    this._unsubscribeArea = areaStore.subscribe(updateAreaStatus);
    this._refreshArea = () => {
      refreshAreaInsights().catch(() => {
        actionStatus.textContent = 'Area insights could not be refreshed.';
      });
    };
    this._refreshArea();
  }

  disconnectedCallback() {
    if (this._unsubscribeArea) this._unsubscribeArea();
    super.disconnectedCallback();
  }
}
customElements.define('page-your-area', PageYourArea);
