import {
  FIELDS,
  cloneTree,
  countCompleteConditions,
  operatorsFor,
  resolveFieldType,
  valueOptions
} from './filter-engine.js';
import * as filterStore from './filter-store.js';
import { discoverFields } from './boundary-lookup.js';

function emptyTree() {
  return { type: 'group', combinator: 'AND', negate: false, children: [] };
}

function emptyCondition() {
  return { type: 'condition', field: '', operator: '', value: '', negate: false };
}

export function createQueryBuilderDialog({
  reports,
  getCategory,
  loadOrganisations,
  onOrganisationsLoaded,
  listBoundaries,
  downloadBoundary,
  onBoundaryLoaded
}) {
  let organisations = new Map();
  let organisationsLoaded = false;
  let boundaries = [];
  let boundariesLoaded = false;
  let boundaryListRequest = null;
  let boundaryFields = [];
  let draftBoundary = null;
  let boundaryRequest = 0;
  let boundaryLoading = false;
  let draft = emptyTree();
  const dialog = document.createElement('dialog');
  dialog.className = 'query-dialog';
  dialog.setAttribute('aria-labelledby', 'query-dialog-title');

  const heading = document.createElement('h2');
  heading.id = 'query-dialog-title';
  heading.textContent = 'Query builder';
  const boundarySetup = document.createElement('div');
  boundarySetup.className = 'query-boundary-setup';
  const boundaryLabel = document.createElement('label');
  boundaryLabel.textContent = 'Boundary file: ';
  const boundarySelect = document.createElement('select');
  boundarySelect.setAttribute('aria-label', 'Boundary file');
  addOption(boundarySelect, '', 'None');
  boundaryLabel.append(boundarySelect);
  const boundaryStatus = document.createElement('p');
  boundaryStatus.className = 'query-boundary-status';
  boundaryStatus.setAttribute('role', 'status');
  boundaryStatus.hidden = true;
  boundarySetup.append(boundaryLabel, boundaryStatus);
  const rows = document.createElement('div');
  rows.className = 'query-condition-list';
  const combineRow = document.createElement('label');
  combineRow.className = 'query-combine-row';
  const combineLabel = document.createElement('span');
  combineLabel.textContent = 'Combine with';
  const combineSelect = document.createElement('select');
  combineSelect.setAttribute('aria-label', 'Combine conditions with');
  for (const value of ['AND', 'OR', 'XOR']) addOption(combineSelect, value, value);
  combineSelect.addEventListener('change', () => {
    draft.combinator = combineSelect.value;
    updateApplyState();
  });
  combineRow.append(combineLabel, combineSelect);

  const addActions = document.createElement('div');
  addActions.className = 'query-builder-add-actions';
  const addButton = makeButton('+ Add condition', 'query-add-button');
  const addGroupButton = makeButton('+ Add group', 'query-add-group-button');
  addActions.append(addButton, addGroupButton);
  const hint = document.createElement('p');
  hint.className = 'query-dialog-hint';
  hint.setAttribute('role', 'status');
  hint.textContent = 'Add a complete condition to apply.';
  const actions = document.createElement('div');
  actions.className = 'query-actions';
  const clearButton = makeButton('Clear all', 'query-clear-button');
  const cancelButton = makeButton('Cancel', 'query-cancel-button');
  const applyButton = makeButton('Apply', 'query-apply-button');
  applyButton.disabled = true;
  actions.append(clearButton, cancelButton, applyButton);
  dialog.append(heading, boundarySetup, combineRow, rows, addActions, hint, actions);

  let renderedRows = [];

  function valueContext() {
    return { getCategory, organisations, fields: boundaryFields, reports };
  }

  function updateBoundaryOptions(selectedPath = '') {
    boundarySelect.replaceChildren();
    addOption(boundarySelect, '', 'None');
    for (const boundary of boundaries) addOption(boundarySelect, boundary.path, boundary.name);
    boundarySelect.value = selectedPath;
  }

  function updateApplyState() {
    const completeCount = countCompleteConditions(draft);
    applyButton.disabled = completeCount === 0 || boundaryLoading;
    hint.hidden = completeCount > 0;
  }

  function updateValueControl(condition, host) {
    host.replaceChildren();
    if (!condition.field || !condition.operator) {
      const placeholder = document.createElement('select');
      placeholder.setAttribute('aria-label', 'Condition value');
      addOption(placeholder, '', 'Value');
      placeholder.disabled = true;
      host.append(placeholder);
      return;
    }
    if (['is null', 'is not null'].includes(condition.operator)) return;
    const type = resolveFieldType(condition.field, reports, valueContext());
    const isBetween = ['between', 'is between'].includes(condition.operator);
    const values = Array.isArray(condition.value)
      ? condition.value
      : [condition.value ?? '', condition.valueTo ?? ''];

    if (type === 'enum' || type === 'organisation' || type === 'derived'
      || (condition.field === 'priority' && type === 'ordinal')) {
      const select = document.createElement('select');
      select.className = 'query-value-select';
      select.setAttribute('aria-label', `${fieldLabel(condition.field, boundaryFields)} value`);
      addOption(select, '', 'Value');
      const options = valueOptions(condition.field, reports, valueContext());
      if (!options.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No values available';
        option.disabled = true;
        select.append(option);
      }
      for (const option of options) addOption(select, option.value, option.label);
      select.value = String(values[0] ?? '');
      select.addEventListener('change', () => {
        condition.value = select.value;
        delete condition.valueTo;
        updateApplyState();
      });
      host.append(select);
      return;
    }

    if (type === 'date' || type === 'numeric') {
      const inputType = type === 'date' ? 'date' : 'number';
      const createInput = (index) => {
        const input = document.createElement('input');
        input.type = inputType;
        input.className = 'query-value-input';
        input.setAttribute('aria-label', `${fieldLabel(condition.field, boundaryFields)} ${isBetween ? index === 0 ? 'start' : 'end' : 'value'}`);
        if (type === 'numeric') input.step = 'any';
        input.value = String(values[index] ?? '');
        input.addEventListener('input', () => {
          if (isBetween) {
            const current = Array.isArray(condition.value)
              ? [...condition.value]
              : [condition.value ?? '', condition.valueTo ?? ''];
            current[index] = input.value;
            condition.value = current;
            delete condition.valueTo;
          } else condition.value = input.value;
          updateApplyState();
        });
        return input;
      };
      host.append(createInput(0));
      if (isBetween) host.append(createInput(1));
      return;
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'query-value-input';
    input.setAttribute('aria-label', `${fieldLabel(condition.field, boundaryFields)} value`);
    input.value = String(condition.value ?? '');
    input.addEventListener('input', () => {
      condition.value = input.value;
      updateApplyState();
    });
    host.append(input);
  }

  function createConditionRow(condition, ownerGroup, index) {
    const row = document.createElement('div');
    row.className = 'query-condition';
    const negateLabel = document.createElement('label');
    negateLabel.className = 'query-negate-control';
    const negate = document.createElement('input');
    negate.type = 'checkbox';
    negate.checked = Boolean(condition.negate);
    negate.setAttribute('aria-label', 'NOT condition');
    negate.addEventListener('change', () => {
      condition.negate = negate.checked;
      updateApplyState();
    });
    negateLabel.append(negate, document.createTextNode('NOT'));

    const fieldSelect = document.createElement('select');
    fieldSelect.className = 'query-field-select';
    fieldSelect.setAttribute('aria-label', 'Condition field');
    addOption(fieldSelect, '', 'Field');
    for (const field of FIELDS) addOption(fieldSelect, field.field, field.label);
    for (const field of boundaryFields) addOption(fieldSelect, field.field, field.label);
    fieldSelect.value = condition.field ?? '';

    const operatorSelect = document.createElement('select');
    operatorSelect.className = 'query-operator-select';
    operatorSelect.setAttribute('aria-label', 'Condition operator');
    const valueHost = document.createElement('div');
    valueHost.className = 'query-value-controls';
    const updateOperators = () => {
      operatorSelect.replaceChildren();
      addOption(operatorSelect, '', 'Operator');
      if (condition.field) {
        for (const operator of operatorsFor(resolveFieldType(condition.field, reports, valueContext()))) {
          const label = operator === 'is null'
            ? 'Unassigned'
            : operator === 'is not null'
              ? 'Assigned'
              : operator;
          addOption(operatorSelect, operator, label);
        }
      }
      operatorSelect.value = condition.operator ?? '';
      updateValueControl(condition, valueHost);
    };
    fieldSelect.addEventListener('change', () => {
      condition.field = fieldSelect.value;
      condition.operator = '';
      condition.value = '';
      delete condition.valueTo;
      updateOperators();
      updateApplyState();
    });
    operatorSelect.addEventListener('change', () => {
      condition.operator = operatorSelect.value;
      condition.value = '';
      delete condition.valueTo;
      updateValueControl(condition, valueHost);
      updateApplyState();
    });
    updateOperators();

    row.append(negateLabel, fieldSelect, operatorSelect, valueHost);
    if (ownerGroup.children.length > 1) {
      const removeButton = makeButton('×', 'query-remove-button');
      removeButton.setAttribute('aria-label', `Remove condition ${index + 1}`);
      removeButton.addEventListener('click', () => {
        ownerGroup.children.splice(index, 1);
        renderRows();
      });
      row.append(removeButton);
    }
    renderedRows.push({ condition, updateValue: () => updateValueControl(condition, valueHost) });
    return row;
  }

  function createGroupBlock(group, index) {
    const block = document.createElement('section');
    block.className = 'query-group-block';
    const header = document.createElement('div');
    header.className = 'query-group-heading';
    const title = document.createElement('strong');
    title.textContent = 'Group';
    const negateLabel = document.createElement('label');
    negateLabel.className = 'query-negate-control';
    const negate = document.createElement('input');
    negate.type = 'checkbox';
    negate.checked = Boolean(group.negate);
    negate.setAttribute('aria-label', 'NOT group');
    negate.addEventListener('change', () => {
      group.negate = negate.checked;
      updateApplyState();
    });
    negateLabel.append(negate, document.createTextNode('NOT'));
    header.append(title, negateLabel);

    if (group.children.length > 1) {
      const combineLabel = document.createElement('label');
      combineLabel.className = 'query-group-combine';
      const combineText = document.createElement('span');
      combineText.textContent = 'Combine with';
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Combine group conditions with');
      for (const value of ['AND', 'OR', 'XOR']) addOption(select, value, value);
      select.value = group.combinator ?? 'AND';
      select.addEventListener('change', () => {
        group.combinator = select.value;
        updateApplyState();
      });
      combineLabel.append(combineText, select);
      header.append(combineLabel);
    }

    const removeGroup = makeButton('Remove group', 'query-remove-group-button');
    removeGroup.setAttribute('aria-label', `Remove group ${index + 1}`);
    removeGroup.addEventListener('click', () => {
      draft.children.splice(index, 1);
      renderRows();
    });
    header.append(removeGroup);

    const groupRows = document.createElement('div');
    groupRows.className = 'query-condition-list query-group-children';
    group.children.forEach((condition, childIndex) => {
      groupRows.append(createConditionRow(condition, group, childIndex));
    });
    const groupAdd = makeButton('+ Add condition', 'query-add-button');
    groupAdd.addEventListener('click', () => {
      group.children.push(emptyCondition());
      renderRows();
      rows.children[index]
        ?.querySelector('.query-group-children .query-condition:last-child select')
        ?.focus();
    });
    const groupActions = document.createElement('div');
    groupActions.className = 'query-group-actions';
    groupActions.append(groupAdd);
    block.append(header, groupRows, groupActions);
    return block;
  }

  function renderRows() {
    renderedRows = [];
    rows.replaceChildren();
    combineRow.hidden = draft.children.length < 2;
    combineSelect.value = draft.combinator ?? 'AND';
    draft.children.forEach((node, index) => {
      rows.append(node.type === 'group'
        ? createGroupBlock(node, index)
        : createConditionRow(node, draft, index));
    });
    updateApplyState();
  }

  function setBoundaryStatus(message, isError = false) {
    boundaryStatus.textContent = message;
    boundaryStatus.hidden = !message;
    boundaryStatus.classList.toggle('error', isError);
  }

  async function loadBoundaryList() {
    if (boundariesLoaded) return boundaries;
    if (boundaryListRequest) return boundaryListRequest;
    if (!listBoundaries) throw new Error('Boundary list is unavailable.');
    boundaryListRequest = listBoundaries().then((items) => {
      boundaries = items;
      boundariesLoaded = true;
      return boundaries;
    }).finally(() => {
      boundaryListRequest = null;
    });
    return boundaryListRequest;
  }

  function withoutDerivedConditions(node, isRoot = true) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'condition') {
      return typeof node.field === 'string' && node.field.startsWith('boundary:') ? null : node;
    }
    if (node.type !== 'group') return node;
    const hadDerivedCondition = node.children.some(containsDerivedCondition);
    node.children = node.children
      .map((child) => withoutDerivedConditions(child, false))
      .filter(Boolean);
    if (!isRoot && hadDerivedCondition && node.children.length === 0) return null;
    return node;
  }

  function containsDerivedCondition(node) {
    if (node?.type === 'condition') {
      return typeof node.field === 'string' && node.field.startsWith('boundary:');
    }
    return node?.type === 'group' && node.children.some(containsDerivedCondition);
  }

  async function loadBoundary(path) {
    if (!downloadBoundary) {
      setBoundaryStatus('Boundary download is unavailable.', true);
      return false;
    }
    const request = ++boundaryRequest;
    const previousPath = draftBoundary?.path ?? '';
    boundaryLoading = true;
    updateApplyState();
    setBoundaryStatus('Loading boundary…');
    try {
      const parsed = await downloadBoundary(path);
      if (request !== boundaryRequest) return false;
      const name = boundaries.find((item) => item.path === path)?.name
        ?? draftBoundary?.name
        ?? path.replace(/^\d+-/, '').replace(/\.geojson$/i, '').replace(/-/g, ' ');
      boundaryFields = discoverFields(parsed.geojson).map((field) => ({
        ...field,
        field: `boundary:${field.key}`,
        baseLabel: field.label,
        label: `${field.label} (${name})`
      }));
      draftBoundary = { path, name, fields: cloneTree(boundaryFields) };
      updateBoundaryOptions(path);
      onBoundaryLoaded?.(path, parsed.geojson, boundaryFields);
      setBoundaryStatus('');
      renderRows();
      return true;
    } catch (error) {
      if (request === boundaryRequest) {
        console.error('Could not load boundary fields for query filters.', error);
        updateBoundaryOptions(previousPath);
        setBoundaryStatus(`Boundary unavailable: ${error.message || 'could not download or parse the file.'}`, true);
      }
      return false;
    } finally {
      if (request === boundaryRequest) {
        boundaryLoading = false;
        updateApplyState();
      }
    }
  }

  async function loadBoundariesForOpen() {
    try {
      const items = await loadBoundaryList();
      if (!dialog.isConnected) return;
      updateBoundaryOptions(draftBoundary?.path ?? '');
      const selected = draftBoundary?.path;
      if (selected && items.some((item) => item.path === selected)) {
        await loadBoundary(selected);
      } else if (selected) {
        setBoundaryStatus('The selected boundary is no longer available. Choose another boundary or None.', true);
      }
    } catch (error) {
      console.error('Could not list boundaries for query filters.', error);
      if (dialog.isConnected) setBoundaryStatus(`Boundary list unavailable: ${error.message}`, true);
    }
  }

  boundarySelect.addEventListener('change', () => {
    const path = boundarySelect.value;
    if (!path) {
      boundaryRequest += 1;
      boundaryLoading = false;
      draftBoundary = null;
      boundaryFields = [];
      draft = withoutDerivedConditions(draft);
      updateBoundaryOptions();
      setBoundaryStatus('');
      renderRows();
      updateApplyState();
      return;
    }
    void loadBoundary(path);
  });

  addButton.addEventListener('click', () => {
    draft.children.push(emptyCondition());
    renderRows();
    const field = rows.lastElementChild?.querySelector('select');
    field?.focus();
  });
  addGroupButton.addEventListener('click', () => {
    draft.children.push({
      type: 'group',
      combinator: 'AND',
      negate: false,
      children: [emptyCondition()]
    });
    renderRows();
    rows.lastElementChild?.querySelector('.query-condition select')?.focus();
  });
  clearButton.addEventListener('click', () => {
    boundaryRequest += 1;
    boundaryLoading = false;
    draft = emptyTree();
    draft.children.push(emptyCondition());
    draftBoundary = null;
    boundaryFields = [];
    updateBoundaryOptions();
    setBoundaryStatus('');
    filterStore.set({
      ...filterStore.get(),
      attribute: { tree: emptyTree(), boundary: null }
    });
    renderRows();
    rows.querySelector('select')?.focus();
  });
  cancelButton.addEventListener('click', () => dialog.close());
  applyButton.addEventListener('click', () => {
    if (applyButton.disabled) return;
    filterStore.set({
      ...filterStore.get(),
      attribute: {
        tree: cloneTree(draft),
        boundary: draftBoundary ? cloneTree(draftBoundary) : null
      }
    });
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    boundaryRequest += 1;
    boundaryLoading = false;
    const attribute = filterStore.get().attribute;
    draft = cloneTree(attribute.tree);
    draftBoundary = attribute.boundary ? cloneTree(attribute.boundary) : null;
    boundaryFields = draftBoundary?.fields ?? [];
    updateBoundaryOptions(draftBoundary?.path ?? '');
    setBoundaryStatus('');
  });

  async function loadOrganisationNames() {
    if (!loadOrganisations || organisationsLoaded) return;
    try {
      const items = await loadOrganisations();
      organisationsLoaded = true;
      organisations = new Map(items
        .filter((item) => item?.id !== null && item?.id !== undefined && item?.name)
        .map((item) => [String(item.id), item.name]));
      for (const row of renderedRows) row.updateValue();
      if (dialog.isConnected) onOrganisationsLoaded?.();
    } catch (error) {
      console.error('Could not load organisation names for query filters.', error);
      if (dialog.isConnected) {
        hint.textContent = `Organisation names unavailable; IDs are shown. ${error.message}`;
        hint.hidden = false;
      }
    }
  }

  function open() {
    const attribute = filterStore.get().attribute;
    draft = cloneTree(attribute.tree);
    draftBoundary = attribute.boundary ? cloneTree(attribute.boundary) : null;
    boundaryFields = draftBoundary?.fields ?? [];
    updateBoundaryOptions(draftBoundary?.path ?? '');
    if (!draft.children?.length) draft.children = [emptyCondition()];
    renderRows();
    dialog.showModal();
    rows.querySelector('input[type="checkbox"], select, input')?.focus();
    void loadBoundariesForOpen();
    void loadOrganisationNames();
  }

  async function loadStoredBoundary() {
    const boundary = filterStore.get().attribute.boundary;
    if (!boundary?.path) return;
    draftBoundary = cloneTree(boundary);
    boundaryFields = draftBoundary.fields ?? [];
    await loadBoundary(boundary.path);
  }

  function forgetBoundary(path) {
    const attribute = filterStore.get().attribute;
    if (attribute.boundary?.path === path) {
      filterStore.set({
        ...filterStore.get(),
        attribute: {
          ...attribute,
          boundary: null,
          tree: withoutDerivedConditions(cloneTree(attribute.tree))
        }
      });
    }
    if (draftBoundary?.path !== path) return;
    draftBoundary = null;
    boundaryFields = [];
    draft = withoutDerivedConditions(draft);
    updateBoundaryOptions();
    renderRows();
  }

  function refreshBoundaryList() {
    boundariesLoaded = false;
    boundaries = [];
    boundaryListRequest = null;
    updateBoundaryOptions(draftBoundary?.path ?? '');
  }

  return {
    dialog,
    open,
    getOrganisations: () => organisations,
    loadStoredBoundary,
    forgetBoundary,
    refreshBoundaryList
  };
}

function fieldLabel(field, boundaryFields = []) {
  return FIELDS.find((item) => item.field === field)?.label
    ?? boundaryFields.find((item) => item.field === field)?.label
    ?? 'Condition';
}

function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = label;
  select.append(option);
}

function makeButton(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}
