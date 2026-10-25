import { requestPasswordReset, signInWithPassword, signOut, signUpWithPassword, updatePassword } from '../features/auth/auth.client.js';
import { supabase } from '../features/supabase.client.js';
import { navigate } from '../router.js';
import { loadOrganizationContext } from '../session.js';

const REGISTRATION_DRAFT_KEY = 'bika-org-registration-draft';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function formField(labelText, name, type = 'text', required = true) {
  const label = node('label', labelText);
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.required = required;
  if (type === 'password') {
    input.autocomplete = name === 'password' ? 'new-password' : 'current-password';
    input.minLength = 8;
  }
  label.append(input);
  return label;
}

function showMessage(target, message, isError = false) {
  target.querySelector('.org-message')?.remove();
  const current = node('p', message, 'org-message');
  current.setAttribute('role', isError ? 'alert' : 'status');
  target.append(current);
}

function authPage(target, title, subtitle) {
  target.replaceChildren();
  const main = node('main', undefined, 'org-auth');
  const card = node('section', undefined, 'org-auth-card');
  card.append(node('h1', title), node('p', subtitle));
  main.append(card);
  target.append(main);
  return card;
}

function links(card, items) {
  const row = node('nav', undefined, 'org-links');
  for (const [label, route] of items) {
    const link = node('a', label);
    link.href = `#/${route}`;
    row.append(link);
  }
  card.append(row);
}

function messageForError(error) {
  return error?.message || 'The request could not be completed. Please try again.';
}

async function completePendingRegistration(draft) {
  const { data, error } = await supabase.functions.invoke('orgs-register', {
    body: draft.organization
  });
  if (error) throw error;
  if (!data?.ok || !data.organization?.id) {
    throw new Error('Organisation registration could not be confirmed.');
  }
  sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
  return data.organization;
}

function readRegistrationDraft() {
  const raw = sessionStorage.getItem(REGISTRATION_DRAFT_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (draft?.organization?.name && draft?.organization?.type
      && draft?.organization?.jurisdiction_level) return draft;
  } catch {
    sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
  }
  return null;
}

export function mountLogin(target, notice = '') {
  const card = authPage(target, 'Sign in to Bika', 'Access your organisation reports and service dashboard.');
  const form = document.createElement('form');
  form.className = 'org-form';
  form.append(formField('Email address', 'email', 'email'), formField('Password', 'password', 'password'));
  const submit = node('button', 'Sign in', 'org-button');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await signInWithPassword(String(values.email).trim(), String(values.password));
      const draft = readRegistrationDraft();
      if (draft) await completePendingRegistration(draft);
      const context = await loadOrganizationContext();
      if (context?.blocked) {
        sessionStorage.setItem('bika-org-blocked-message', context.message);
        sessionStorage.setItem('bika-org-blocked-status', context.status);
        navigate('application-pending');
      } else if (!context) {
        showMessage(card, 'This account is not linked to an organisation. Register an organisation or contact its administrator.', true);
      } else {
        navigate('dashboard');
      }
    } catch (error) {
      showMessage(card, messageForError(error), true);
    } finally {
      submit.disabled = false;
    }
  });
  card.append(form);
  links(card, [['Register an organisation', 'register'], ['Forgot password?', 'forgot-password']]);
  if (notice) showMessage(card, notice);
}

export function mountRegistration(target) {
  const card = authPage(target, 'Register your organisation', 'Complete three steps to submit an application for Platform Admin review.');
  const form = document.createElement('form');
  form.className = 'org-form';
  let step = 0;
  const panels = [
    [
      formField('Organisation name', 'name'),
      formField('Organisation type', 'type'),
      formField('Jurisdiction level', 'jurisdiction_level'),
      formField('Province (optional)', 'province', 'text', false),
      formField('Municipality (optional)', 'municipality', 'text', false)
    ],
    [
      formField('Administrator name', 'admin_name'),
      formField('Administrator email', 'email', 'email'),
      formField('Create password', 'password', 'password')
    ],
    [node('p', 'Review the organisation and administrator details before submitting.')],
  ];
  const stepLabel = node('p', 'Step 1 of 3', 'org-role-note');
  const panel = node('div');
  const note = node('p', 'Boundary upload is optional and is not available yet.', 'org-role-note');
  const buttons = node('div', undefined, 'org-links');
  const back = node('button', 'Back', 'org-button secondary');
  back.type = 'button';
  const next = node('button', 'Continue', 'org-button');
  next.type = 'button';
  buttons.append(back, next);
  form.append(stepLabel, panel, note, buttons);

  const render = () => {
    stepLabel.textContent = `Step ${step + 1} of 3`;
    panel.replaceChildren(...panels[step]);
    back.hidden = step === 0;
    next.textContent = step === 2 ? 'Submit application' : 'Continue';
  };
  const gatherValues = () => {
    const values = {};
    for (const field of panels.flat()) {
      const input = field.querySelector?.('input');
      if (input) values[input.name] = input.value;
    }
    return values;
  };
  render();

  back.addEventListener('click', () => {
    if (step > 0) step -= 1;
    render();
  });
  next.addEventListener('click', async () => {
    if (step < 2) {
      const invalid = panel.querySelector('input:invalid');
      if (invalid) {
        invalid.reportValidity();
        return;
      }
      step += 1;
      render();
      return;
    }
    const values = gatherValues();
    if (panels.slice(0, 2).flat().some((field) => {
      const input = field.querySelector?.('input');
      return input?.required && !input.checkValidity();
    })) {
      showMessage(card, 'Complete all required fields before submitting.', true);
      return;
    }
    next.disabled = true;
    try {
      const draft = {
        organization: {
          name: String(values.name).trim(),
          type: String(values.type).trim(),
          jurisdiction_level: String(values.jurisdiction_level).trim(),
          province: String(values.province || '').trim() || null,
          municipality: String(values.municipality || '').trim() || null
        }
      };
      sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
      const signup = await signUpWithPassword(
        String(values.email).trim(),
        String(values.password),
        String(values.admin_name).trim()
      );
      if (!signup.session) {
        showMessage(card, 'Confirm your email, then sign in here to finish submitting the organisation application.');
        return;
      }
      const organization = await completePendingRegistration(draft);
      await signOut();
      sessionStorage.setItem('bika-org-blocked-message', organization.status === 'pending'
        ? 'Application pending. Dashboard access starts after Platform Admin approval.'
        : `Application status: ${organization.status}.`);
      sessionStorage.setItem('bika-org-blocked-status', organization.status);
      navigate('application-pending');
    } catch (error) {
      showMessage(card, messageForError(error), true);
    } finally {
      next.disabled = false;
    }
  });
  card.append(form);
  links(card, [['Already have an account? Sign in', 'login']]);
}

export function mountApplicationPending(target) {
  const card = authPage(target, 'Application pending', 'Your organisation cannot access the dashboard until Platform Admin approval.');
  const message = sessionStorage.getItem('bika-org-blocked-message')
    || 'Sign in to check the current organisation application status.';
  showMessage(card, message);
  const actions = node('div', undefined, 'org-links');
  const check = node('a', 'Check status');
  check.href = '#/login';
  const signOutButton = node('button', 'Sign out', 'org-button secondary');
  signOutButton.type = 'button';
  signOutButton.addEventListener('click', async () => {
    try {
      await signOut();
      navigate('login');
    } catch (error) {
      showMessage(card, messageForError(error), true);
    }
  });
  actions.append(check, signOutButton);
  card.append(actions);
}

export function mountForgotPassword(target) {
  const card = authPage(target, 'Reset your password', 'We will email a secure reset link if the account is eligible.');
  const form = document.createElement('form');
  form.className = 'org-form';
  form.append(formField('Email address', 'email', 'email'));
  const submit = node('button', 'Send reset link', 'org-button');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await requestPasswordReset(String(new FormData(form).get('email')).trim());
      showMessage(card, 'If the account can be reset, a link has been sent.');
    } catch (error) {
      showMessage(card, messageForError(error), true);
    } finally {
      submit.disabled = false;
    }
  });
  card.append(form);
  links(card, [['Back to sign in', 'login']]);
}

export function mountResetPassword(target) {
  const card = authPage(target, 'Choose a new password', 'Use the secure reset link to update your account password.');
  const form = document.createElement('form');
  form.className = 'org-form';
  form.append(formField('New password', 'password', 'password'));
  const submit = node('button', 'Update password', 'org-button');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await updatePassword(String(new FormData(form).get('password')));
      showMessage(card, 'Password updated. Sign in to continue.');
      await signOut();
    } catch (error) {
      showMessage(card, messageForError(error), true);
    } finally {
      submit.disabled = false;
    }
  });
  card.append(form);
  links(card, [['Back to sign in', 'login']]);
}

export function mountSessionExpired(target) {
  const card = authPage(target, 'Session expired', 'Your session ended. Sign in again to continue.');
  const link = node('a', 'Sign in to Bika');
  link.href = '#/login';
  card.append(link);
}

export function mountInviteUnavailable(target, expired = false) {
  const card = authPage(
    target,
    expired ? 'Invitation expired' : 'Employee invitations',
    expired
      ? 'This invitation is expired or unavailable. Ask an organisation administrator for a new invitation.'
      : 'Employee invitation acceptance is not available yet.'
  );
  const link = node('a', 'Return to sign in');
  link.href = '#/login';
  card.append(link);
}
