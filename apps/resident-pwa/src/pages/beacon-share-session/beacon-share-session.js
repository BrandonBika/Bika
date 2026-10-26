/**
 * @file apps/resident-pwa/src/pages/beacon-share-session/beacon-share-session.js
 * Server-backed Beacon live-share controls for the sharer.
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getCurrentUser } from '@civicneuro/supabase-client';
import { listCircle } from '../../features/beacon/beacon-circle.client.js';
import {
  getActiveSharesForMe,
  setLivePath,
  stopLiveShare,
  stopLiveShareLocationWatch,
  subscribeToLiveShares,
  watchLiveShareLocation
} from '../../features/beacon/beacon-live-share.client.js';
import { navigate } from '../../router.js';

export class PageBeaconShareSession extends BaseElement {
  init(params) {
    this._params = params || {};
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-session-page', 'bc-live-share-page');
    this.appendChild(createElement('p', {
      cls: 'bc-live-share-loading',
      text: 'Opening live sharing…'
    }));
    if (!this._params?.shareId) {
      navigate('beacon-home');
      return;
    }
    this.connectServerLiveShare().catch(() => {
      console.error('Could not open Beacon live sharing.');
      showToast('This sharing session is no longer available.', { type: 'info' });
      navigate('beacon-home');
    });
  }

  async connectServerLiveShare() {
    this._shareId = this._params.shareId;
    const shares = await getActiveSharesForMe();
    this._liveShare = shares.find((share) =>
      share.id === this._shareId && share.sharerId === getCurrentUser()?.id
    );
    if (!this._liveShare) {
      navigate('beacon-home');
      return;
    }
    if (!this.isConnected) {
      await stopLiveShare(this._shareId);
      return;
    }

    try {
      const members = await listCircle();
      this._recipientName = members.find((member) =>
        member.id === this._liveShare.recipientId
      )?.name || 'your circle contact';
    } catch {
      console.error('Could not load the Beacon recipient name.');
      this._recipientName = 'your circle contact';
    }
    if (!this.isConnected) {
      await stopLiveShare(this._shareId);
      return;
    }

    this.renderServerLiveShare();
    try {
      this.startLocationWatch();
    } catch {
      console.error('Could not start Beacon location updates.');
      showToast('Could not access your location. Sharing has stopped.', { type: 'error' });
      await stopLiveShare(this._shareId);
      navigate('beacon-home');
      return;
    }
    this._liveShareSubscription = subscribeToLiveShares((updatedShares) => {
      if (!this.isConnected) return;
      const activeShare = updatedShares.find((share) =>
        share.id === this._shareId && share.sharerId === getCurrentUser()?.id
      );
      if (!activeShare) {
        this._liveShare = null;
        this.renderServerShareEnded();
        return;
      }
      this._liveShare = activeShare;
      this.renderServerLiveShare();
    }, () => {
      console.error('Could not refresh Beacon live sharing.');
    });
    this._liveShareSubscription.ready.catch(() => {
      console.error('Beacon live-share Realtime subscription failed.');
    });
    this._liveShareTimer = setInterval(() => this.updateLiveShareCountdown(), 1000);
  }

  startLocationWatch() {
    this._stopWatchingLiveShare = watchLiveShareLocation(this._liveShare, () => {
      console.error('Beacon live location updates stopped.');
      if (!this.isConnected) return;
      showToast('Live location updates stopped. You can try sharing again.', { type: 'error' });
      this.renderServerShareEnded();
    });
  }

  disconnectedCallback() {
    this._liveShareSubscription?.unsubscribe();
    clearInterval(this._liveShareTimer);
    clearTimeout(this._endNavigationTimer);
    if (this._stopWatchingLiveShare) this._stopWatchingLiveShare();
    super.disconnectedCallback();
  }

  renderServerLiveShare() {
    clearChildren(this);
    const card = createElement('section', {
      cls: 'bc-session-card',
      attrs: { 'aria-labelledby': 'bc-live-share-title' }
    });
    card.append(
      createElement('div', {
        cls: 'bcs-title',
        attrs: { id: 'bc-live-share-title' },
        text: `Sharing with ${this._recipientName}`
      }),
      createElement('p', {
        cls: 'bcs-sub',
        attrs: { id: 'bc-live-share-countdown' }
      }),
      createElement('p', {
        cls: 'bcs-sub',
        attrs: { id: 'bc-live-share-last-update' }
      }),
      createElement('p', {
        cls: 'bc-live-share-honest-copy',
        text: 'Your location updates only while Bika is open. No location history is shown.'
      })
    );
    if (this._liveShare.plannedPath?.length) {
      if (this._params.routeShared === 'true') {
        card.appendChild(createElement('p', {
          cls: 'bc-live-share-route-status',
          attrs: { role: 'status' },
          text: `Planned route shared with ${this._recipientName}`
        }));
      }
      card.appendChild(createElement('p', {
        cls: 'bc-live-share-honest-copy',
        text: `Your planned route is shown to ${this._recipientName} while you share. Off-path alerts are not available. Removing or blocking ${this._recipientName} stops it immediately.`
      }));
    }
    const routeButton = createElement('button', {
      cls: 'bcs-route-action',
      attrs: { type: 'button', id: 'bc-planned-route-action' },
      text: this._liveShare.plannedPath?.length
        ? 'Update planned route'
        : 'Add planned route'
    });
    routeButton.disabled = Boolean(this._updatingLivePath);
    routeButton.onclick = () => {
      stopLiveShareLocationWatch(this._shareId);
      this._stopWatchingLiveShare = null;
      navigate('beacon-draw-path', { shareId: this._shareId });
    };
    card.appendChild(routeButton);
    if (this._liveShare.plannedPath?.length) {
      const removeRouteButton = createElement('button', {
        cls: 'bcs-route-action',
        attrs: { type: 'button', id: 'bc-remove-planned-route' },
        text: this._updatingLivePath ? 'Removing route…' : 'Remove planned route'
      });
      removeRouteButton.disabled = Boolean(this._updatingLivePath);
      removeRouteButton.onclick = () => this.removePlannedRoute();
      card.appendChild(removeRouteButton);
    }
    const stopButton = createElement('button', {
      cls: 'bcs-stop',
      attrs: { type: 'button', id: 'bc-stop-live-share' },
      text: this._stoppingLiveShare ? 'Stopping…' : 'Stop sharing'
    });
    stopButton.disabled = Boolean(this._stoppingLiveShare);
    stopButton.onclick = () => this.stopServerLiveShare();
    card.appendChild(stopButton);
    this.appendChild(card);
    this.updateLiveShareCountdown();
  }

  async removePlannedRoute() {
    if (this._updatingLivePath || !this._liveShare?.plannedPath?.length) return;
    this._updatingLivePath = true;
    this.renderServerLiveShare();
    try {
      await setLivePath(this._shareId, null);
      this._liveShare = { ...this._liveShare, plannedPath: null };
      showToast('Planned route removed.', { type: 'success' });
    } catch {
      console.error('Could not remove the planned Beacon route.');
      showToast('Could not remove the planned route. Please try again.', { type: 'error' });
    } finally {
      this._updatingLivePath = false;
      if (this.isConnected) this.renderServerLiveShare();
    }
  }

  updateLiveShareCountdown() {
    const share = this._liveShare;
    if (!share || !this.isConnected) return;
    const remainingSeconds = Math.max(
      0,
      Math.ceil((Date.parse(share.expiresAt) - Date.now()) / 1000)
    );
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const countdown = this.querySelector('#bc-live-share-countdown');
    if (countdown) {
      countdown.textContent = remainingSeconds > 0
        ? `Ends in ${minutes}:${String(seconds).padStart(2, '0')}`
        : 'Sharing has expired';
    }
    const lastUpdate = this.querySelector('#bc-live-share-last-update');
    if (lastUpdate) {
      lastUpdate.textContent = share.lastAt
        ? `Last update ${new Date(share.lastAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'Waiting for a precise GPS fix. This works best on a phone with location turned on.';
    }
    if (remainingSeconds === 0) {
      clearInterval(this._liveShareTimer);
      this._liveShareTimer = null;
      this._stopWatchingLiveShare?.();
      this._stopWatchingLiveShare = null;
      this.renderServerShareEnded();
    }
  }

  renderServerShareEnded() {
    this._stopWatchingLiveShare?.();
    this._stopWatchingLiveShare = null;
    clearInterval(this._liveShareTimer);
    clearChildren(this);
    this.appendChild(createElement('section', {
      cls: ['bc-session-card', 'bc-live-share-ended'],
      attrs: { role: 'status' },
      text: 'Sharing ended'
    }));
    this._endNavigationTimer = setTimeout(() => {
      if (this.isConnected) navigate('beacon-home');
    }, 1500);
  }

  async stopServerLiveShare() {
    if (this._stoppingLiveShare) return;
    this._stoppingLiveShare = true;
    this.renderServerLiveShare();
    try {
      await stopLiveShare(this._shareId);
      this._liveShare = null;
      this._stopWatchingLiveShare = null;
      showToast('Live location sharing stopped.', { type: 'success' });
      navigate('beacon-home');
    } catch {
      this._stoppingLiveShare = false;
      showToast('Could not stop sharing. Please try again.', { type: 'error' });
      try {
        this.startLocationWatch();
      } catch {
        console.error('Could not resume Beacon location updates after stop failed.');
      }
      if (this.isConnected) this.renderServerLiveShare();
    }
  }
}

customElements.define('page-beacon-share-session', PageBeaconShareSession);
