/**
 * Legacy custom-element alias; the router now sends #alerts to #notifications.
 */
import { PageNotifications } from '../notifications/notifications.js';

export class PageAlerts extends PageNotifications {}
customElements.define('page-alerts', PageAlerts);
