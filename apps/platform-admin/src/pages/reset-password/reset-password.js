import { mountStaticTemplate, setFormMessage } from '../../features/dom.js';
import { signOut, updatePassword } from '../../features/auth/auth.client.js';
import { createRetryState } from '../../components/state-message/state-message.js';
import { RequestTimeoutError } from '../../features/with-timeout.js';

export async function mountResetPassword(root) {
  await mountStaticTemplate(root, new URL('./reset-password.html', import.meta.url));
  const form = root.querySelector('.auth-form');
  const message = root.querySelector('.form-message');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const password = String(formData.get('password'));
    const confirmation = String(formData.get('confirmPassword'));
    if (password !== confirmation) {
      setFormMessage(message, 'The passwords do not match.');
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setFormMessage(message, '');
    try {
      await updatePassword(password);
      sessionStorage.setItem('civicneuro-platform-notice', 'Password updated. You can now sign in.');
      await signOut();
      window.location.hash = '/login';
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        const retryState = createRetryState({
          title: 'Password update timed out',
          message: error.message,
          onRetry: () => {
            retryState.replaceWith(message);
            form.requestSubmit();
          }
        });
        message.replaceWith(retryState);
      } else {
        setFormMessage(message, error.message || 'Could not update your password.');
      }
    } finally {
      submit.disabled = false;
    }
  });
}
