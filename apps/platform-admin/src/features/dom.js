export async function mountStaticTemplate(root, url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load page template (${response.status}).`);
  }

  const markup = await response.text();
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  const template = parsed.body.firstElementChild;
  if (!template) throw new Error('The page template is empty.');

  root.replaceChildren(document.importNode(template, true));
}

export function setFormMessage(element, message, kind = 'error') {
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = !message;
}
