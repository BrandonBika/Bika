import { supabase } from '../../features/supabase.client.js';

export async function mountChat(target, { context }) {
  target.replaceChildren();
  try {
    const { data, error } = await supabase
      .from('conversation_members')
      .select('conversation_id,joined_at,conversations(id,title,kind,created_at)')
      .eq('user_id', context.userId)
      .order('joined_at', { ascending: false });
    if (error) throw error;
    if (!target.isConnected) return;
    const threads = (data || []).map((row) => row.conversations).filter(Boolean);
    if (!threads.length) {
      const empty = document.createElement('p');
      empty.className = 'org-empty';
      empty.textContent = 'No conversations are available to this signed-in member.';
      target.append(empty);
      return;
    }
    const layout = document.createElement('div');
    layout.className = 'org-chat-layout';
    const list = document.createElement('nav');
    list.className = 'org-chat-list';
    list.setAttribute('aria-label', 'Conversations');
    const panel = document.createElement('section');
    panel.className = 'org-card org-chat-thread';
    layout.append(list, panel);
    target.append(layout);
    for (const thread of threads) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'org-button secondary';
      button.textContent = thread.title || `Conversation ${thread.id.slice(0, 8)}`;
      button.addEventListener('click', () => void renderThread(panel, thread, context.userId));
      list.append(button);
    }
    await renderThread(panel, threads[0], context.userId);
  } catch (error) {
    renderError(target, error);
  }
}

async function renderThread(target, thread, userId) {
  target.replaceChildren();
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id,sender_id,type,body,created_at')
      .eq('conversation_id', thread.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const title = document.createElement('h2');
    title.textContent = thread.title || 'Conversation';
    const list = document.createElement('ol');
    list.className = 'org-chat-messages';
    if (!data?.length) {
      const empty = document.createElement('li');
      empty.className = 'org-empty';
      empty.textContent = 'No messages in this conversation.';
      list.append(empty);
    }
    for (const message of data || []) {
      const item = document.createElement('li');
      item.textContent = `${message.sender_id === userId ? 'You' : 'Member'} · ${formatDate(message.created_at)}: ${message.body || `[${message.type} message]`}`;
      list.append(item);
    }
    const form = document.createElement('form');
    form.className = 'org-form';
    const label = document.createElement('label');
    label.textContent = 'Reply';
    const input = document.createElement('textarea');
    input.required = true;
    input.maxLength = 4000;
    label.append(input);
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'org-button';
    send.textContent = 'Send reply';
    const feedback = document.createElement('p');
    feedback.setAttribute('aria-live', 'polite');
    form.append(label, send, feedback);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        const { error: insertError } = await supabase.from('messages').insert({
          conversation_id: thread.id,
          type: 'text',
          body
        });
        if (insertError) throw insertError;
        await renderThread(target, thread, userId);
      } catch (error) {
        feedback.textContent = error.message || 'Could not send your reply.';
        feedback.setAttribute('role', 'alert');
        send.disabled = false;
      }
    });
    target.append(title, list, form);
  } catch (error) {
    renderError(target, error);
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function renderError(target, error) {
  target.replaceChildren();
  const message = document.createElement('p');
  message.className = 'org-message';
  message.setAttribute('role', 'alert');
  message.textContent = error.message || 'Could not load conversations.';
  target.append(message);
}