import { mountStaticTemplate, setFormMessage } from '../../features/dom.js';
import { signInWithPassword } from '../../features/auth/auth.client.js';
import { loadStaffContext } from '../../session.js';
import { NAVIGATION } from '../../config.js';
import { createRetryState } from '../../components/state-message/state-message.js';
import { RequestTimeoutError } from '../../features/with-timeout.js';

export async function mountLogin(root, { notice = '' } = {}) {
  await mountStaticTemplate(root, new URL('./login.html', import.meta.url));
  const form = root.querySelector('.auth-form');
  const message = root.querySelector('.form-message');
  if (notice) setFormMessage(message, notice);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setFormMessage(message, '');
    const formData = new FormData(form);
    try {
      await signInWithPassword(String(formData.get('email')).trim(), String(formData.get('password')));
      const staff = await loadStaffContext();
      const dashboardEnabled = NAVIGATION[staff.role]?.some(
        (item) => item.id === 'dashboard' && item.enabled
      );
      window.location.hash = dashboardEnabled ? '/dashboard' : '/home';
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        const retryState = createRetryState({
          title: 'Sign-in timed out',
          message: error.message,
          onRetry: () => {
            retryState.replaceWith(message);
            form.requestSubmit();
          }
        });
        message.replaceWith(retryState);
      } else {
        setFormMessage(message, error.message || 'Sign-in failed. Please try again.');
      }
    } finally {
      submit.disabled = false;
    }
  });
}