import { setSafeText } from '../../features/safe-dom.js';

function createStateMessage(state, title, message) {
  const container = document.createElement('section');
  container.className = 'state-message';
  container.dataset.state = state;
  container.setAttribute('role', state === 'error' ? 'alert' : 'status');

  const heading = document.createElement('h2');
  setSafeText(heading, title);
  const description = document.createElement('p');
  setSafeText(description, message);

  container.append(heading, description);
  return container;
}

export function createEmptyState({
  title = 'Nothing to show yet',
  message = 'There is no data available.'
} = {}) {
  return createStateMessage('empty', title, message);
}

export function createErrorState({
  title = 'Could not load this content',
  message = 'Please try again. If the problem continues, contact a Platform Admin.'
} = {}) {
  return createStateMessage('error', title, message);
}

export function createRetryState({ title, message, onRetry }) {
  const container = createErrorState({ title, message });
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'secondary-button';
  retry.textContent = 'Retry';
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    try {
      await onRetry();
    } catch (error) {
      const description = container.querySelector('p');
      if (description) {
        description.textContent = error instanceof Error
          ? `Retry failed: ${error.message}`
          : 'Retry failed. Please try again.';
      }
    } finally {
      retry.disabled = false;
    }
  });
  container.append(retry);
  return container;
}
