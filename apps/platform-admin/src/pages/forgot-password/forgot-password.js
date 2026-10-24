import { mountStaticTemplate, setFormMessage } from '../../features/dom.js';
import { sendPasswordReset } from '../../features/auth/auth.client.js';
import { createRetryState } from '../../components/state-message/state-message.js';
import { RequestTimeoutError } from '../../features/with-timeout.js';

export async function mountForgotPassword(root) {
  await mountStaticTemplate(root, new URL('./forgot-password.html', import.meta.url));
  const form = root.querySelector('.auth-form');
  const message = root.querySelector('.form-message');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    setFormMessage(message, '');
    try {
      const email = String(new FormData(form).get('email')).trim();
      await sendPasswordReset(email);
      setFormMessage(
        message,
        'If this email belongs to an account, a reset link has been sent.',
        'success'
      );
      form.reset();
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        const retryState = createRetryState({
          title: 'Password reset request timed out',
          message: error.message,
          onRetry: () => {
            retryState.replaceWith(message);
            form.requestSubmit();
          }
        });
        message.replaceWith(retryState);
      } else {
        setFormMessage(message, error.message || 'Could not send the reset link.');
      }
    } finally {
      submit.disabled = false;
    }
  });
}
