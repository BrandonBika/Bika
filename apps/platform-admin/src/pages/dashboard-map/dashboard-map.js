import * as L from '../../../vendor/leaflet/leaflet-src.esm.js';
import { createEmptyState, createRetryState } from '../../components/state-message/state-message.js';
import { MAP_CONFIG } from '../../config.js';
import { attachTileErrorNotice } from '../../features/map-tiles.js';
import {
  deleteBoundary,
  downloadBoundary,
  listBoundaries,
  uploadBoundary
} from '../../features/boundaries.client.js';
import { validateBoundaryFile } from '../../features/boundaries.validation.js';
import { listOrganizations, listReports } from '../../features/reports.client.js';
import {
  cloneTree,
  compileTree,
  countCompleteConditions,
  describeNode,
  isCompleteCondition
} from '../../features/filter-engine.js';
import * as filterStore from '../../features/filter-store.js';
import { createQueryBuilderDialog } from '../../features/query-builder-dialog.js';
import { getCategoryLabel, getStatusLabel } from '../../features/status-labels.js';
import { setSafeText } from '../../features/safe-dom.js';
import { withTimeout } from '../../features/with-timeout.js';

const ATTENDED_STATUSES = new Set(['Resolved', 'Rejected', 'Duplicate']);
const CATEGORY_COLOURS = ['#A32D2D', '#2A7F78', '#BA7517', '#185FA5', '#A3A6AC'];
const CHART_COLLAPSED_KEY = 'civicneuro-platform-dashboard-chart-collapsed';
const STATS_COLLAPSED_KEY = 'civicneuro-platform-dashboard-stats-collapsed';

let chartInstance = null;

export async function mountDashboard(target, { staff, onSignOut }) {
  target.classList.add('dashboard-main');
  target.replaceChildren(makeLoadingState());
  try {
    const reports = await listReports();
    if (!target.isConnected) return;
    renderDashboard(target, reports, staff, onSignOut);
  } catch (error) {
    console.error('Could not load dashboard reports.', error);
    renderDashboardError(target, staff, onSignOut, error);
  }
}

function renderDashboard(target, reports, staff, onSignOut) {
  const topbar = createDashboardTopbar(staff, onSignOut);
  const toolbar = document.createElement('div');
  toolbar.className = 'map-toolbar';
  const queryButton = createToolbarButton('Query builder', 'M22 3H2l8 9.5V19l4 2v-8.5L22 3Z');
  queryButton.setAttribute('aria-haspopup', 'dialog');
  const queryBuilder = createQueryBuilderDialog({
    reports,
    getCategory: categoryOf,
    loadOrganisations: listOrganizations,
    onOrganisationsLoaded: () => updateDashboardData()
  });
  const clusterControl = createClusterControl();
  const exportButton = createToolbarButton('Export map', 'M12 3v12 M7 10l5 5 5-5 M5 21h14');
  const exportDialog = createExportDialog();
  const boundaryUploadButton = createToolbarButton(
    'Upload / add admin boundary',
    'M12 15V5 M7 9l5-5 5 5 M5 19h14'
  );
  boundaryUploadButton.classList.add('dashed');
  const boundaryListButton = createToolbarButton(
    'List of uploaded boundaries',
    'M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01'
  );
  boundaryListButton.classList.add('solid-accent');
  const uploadDialog = createBoundaryUploadDialog();
  const boundariesDialog = createBoundariesDialog();
  toolbar.append(
    queryButton,
    clusterControl.control,
    exportButton,
    boundaryUploadButton,
    boundaryListButton
  );

  const mapArea = document.createElement('section');
  mapArea.className = 'map-area';
  mapArea.setAttribute('aria-label', 'Map of active reports');
  const mapCanvas = document.createElement('div');
  mapCanvas.className = 'map-canvas';
  mapArea.append(mapCanvas);
  const mapEmpty = createEmptyState({
    title: 'No map-visible reports',
    message: 'Reports without coordinates or marked as attended remain available in the Report sheet.'
  });
  mapEmpty.classList.add('map-empty-state');
  mapArea.append(mapEmpty);

  const bottomPanel = document.createElement('div');
  bottomPanel.className = 'bottom-panel';
  const chartPanel = createChartPanel();
  const statsPanel = createStatsPanel();
  bottomPanel.append(chartPanel.card, statsPanel.card);
  setPanelCollapsed(chartPanel, readCollapsedPreference(CHART_COLLAPSED_KEY));
  setPanelCollapsed(statsPanel, readCollapsedPreference(STATS_COLLAPSED_KEY));
  updateBottomPanelCollapsedState(bottomPanel, chartPanel, statsPanel);

  const boundaryToast = document.createElement('p');
  boundaryToast.className = 'boundary-toast';
  boundaryToast.setAttribute('role', 'status');
  boundaryToast.hidden = true;
  mapArea.append(boundaryToast);

  target.replaceChildren(
    topbar,
    toolbar,
    queryBuilder.dialog,
    mapArea,
    bottomPanel,
    exportDialog.dialog,
    uploadDialog.dialog,
    boundariesDialog.dialog
  );

  const state = {
    clustered: true,
    chartType: 'bar',
    chartReports: [],
    map: null,
    layer: null,
    boundaryLayers: new Map(),
    reports: [],
    markerRequest: 0,
    filterTree: null,
    filterPredicate: null
  };
  let chartRequest = 0;
  const mapResizeObserver = new ResizeObserver(() => {
    if (state.map) requestAnimationFrame(() => state.map?.invalidateSize({ pan: false }));
  });
  mapResizeObserver.observe(mapArea);
  target.closest('.dash')?.addEventListener('platform-rail-resized', () => {
    if (state.map) requestAnimationFrame(() => state.map?.invalidateSize({ pan: false }));
  });
  window.addEventListener('pagehide', () => {
    for (const layer of state.boundaryLayers.values()) layer.remove();
    state.boundaryLayers.clear();
  }, { once: true });
  uploadDialog.dialog.addEventListener('close', () => boundaryUploadButton.focus());
  boundariesDialog.dialog.addEventListener('close', () => boundaryListButton.focus());
  queryBuilder.dialog.addEventListener('close', () => queryButton.focus());
  boundaryUploadButton.addEventListener('click', () => {
    uploadDialog.fileInput.value = '';
    uploadDialog.nameInput.value = '';
    uploadDialog.preview.textContent = 'Choose a .geojson file to preview.';
    uploadDialog.error.hidden = true;
    uploadDialog.dialog.showModal();
    uploadDialog.fileInput.focus();
  });
  uploadDialog.fileInput.addEventListener('change', () => {
    void previewBoundaryFile(uploadDialog.fileInput.files?.[0], uploadDialog);
  });
  uploadDialog.cancelButton.addEventListener('click', () => uploadDialog.dialog.close());
  uploadDialog.uploadButton.addEventListener('click', () => {
    void submitBoundaryUpload(uploadDialog);
  });
  boundaryListButton.addEventListener('click', () => {
    boundariesDialog.dialog.showModal();
    boundariesDialog.closeButton.focus();
    void refreshBoundaries();
  });
  boundariesDialog.closeButton.addEventListener('click', () => boundariesDialog.dialog.close());

  async function previewBoundaryFile(file, dialog) {
    dialog.error.hidden = true;
    if (!file) {
      dialog.preview.textContent = 'Choose a .geojson file to preview.';
      return;
    }
    try {
      const validated = await validateBoundaryFile(file);
      dialog.preview.textContent = `${validated.featureCount} features, ${formatFileSize(file.size)}${
        validated.warnings.length ? ` · ${validated.warnings.join('; ')}` : ''
      }`;
    } catch (error) {
      dialog.preview.textContent = 'File preview unavailable.';
      setSafeText(dialog.error, error.message);
      dialog.error.hidden = false;
    }
  }

  async function submitBoundaryUpload(dialog) {
    dialog.error.hidden = true;
    const file = dialog.fileInput.files?.[0];
    if (!file) {
      setSafeText(dialog.error, 'Choose a .geojson file first.');
      dialog.error.hidden = false;
      return;
    }
    dialog.uploadButton.disabled = true;
    dialog.progress.hidden = false;
    dialog.progress.textContent = 'Uploading boundary…';
    try {
    const uploaded = await uploadBoundary(file, dialog.nameInput.value);
    showBoundary(uploaded.path, uploaded.geojson);
      await refreshBoundaries(false);
      dialog.dialog.close();
      boundaryToast.textContent = 'Boundary uploaded';
      boundaryToast.hidden = false;
      setTimeout(() => { boundaryToast.hidden = true; }, 4000);
    } catch (error) {
      console.error('Could not upload administrative boundary.', error);
      setSafeText(dialog.error, error.message || 'The boundary could not be uploaded.');
      dialog.error.hidden = false;
    } finally {
      dialog.uploadButton.disabled = false;
      dialog.progress.hidden = true;
    }
  }

  async function refreshBoundaries(showLoading = true) {
    const host = boundariesDialog.list;
    if (showLoading) host.replaceChildren(makeBoundaryLoading());
    try {
      const boundaries = await listBoundaries();
      if (!host.isConnected || boundariesDialog.dialog.closed) return;
      host.replaceChildren();
      if (!boundaries.length) {
        const empty = document.createElement('p');
        empty.className = 'boundary-empty';
        empty.textContent = 'No boundaries uploaded yet.';
        host.append(empty);
        return;
      }
      for (const boundary of boundaries) {
        host.append(createBoundaryRow(boundary, {
          onToggle: async (row, isShown) => {
            try {
              if (isShown) {
                const parsed = await downloadBoundary(boundary.path);
                showBoundary(boundary.path, parsed.geojson);
                row.toggleButton.textContent = 'Hide';
                row.toggleButton.setAttribute('aria-pressed', 'true');
              } else {
                hideBoundary(boundary.path);
                row.toggleButton.textContent = 'Show on map';
                row.toggleButton.setAttribute('aria-pressed', 'false');
              }
            } catch (error) {
              setSafeText(row.message, error.message);
              row.message.hidden = false;
            }
          },
          onZoom: async (row) => {
            try {
              const layer = state.boundaryLayers.get(boundary.path)
                ?? await loadBoundaryLayer(boundary.path);
              const bounds = layer.getBounds();
              if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [24, 24] });
              row.toggleButton.textContent = 'Hide';
              row.toggleButton.setAttribute('aria-pressed', 'true');
            } catch (error) {
              setSafeText(row.message, error.message);
              row.message.hidden = false;
            }
          },
          onDelete: async (row) => {
            row.deleteButton.disabled = true;
            try {
              await deleteBoundary(boundary.path);
              hideBoundary(boundary.path);
              row.row.remove();
              boundaryToast.textContent = 'Boundary deleted';
              boundaryToast.hidden = false;
              setTimeout(() => { boundaryToast.hidden = true; }, 4000);
            } catch (error) {
              row.deleteButton.disabled = false;
              setSafeText(row.message, error.message);
              row.message.hidden = false;
            }
          }
        }, state.boundaryLayers.has(boundary.path)));
      }
    } catch (error) {
      console.error('Could not load administrative boundaries.', error);
      host.replaceChildren(createRetryState({
        title: 'Boundaries unavailable',
        message: error.message || 'Could not load uploaded boundaries.',
        onRetry: () => refreshBoundaries()
      }));
    }
  }

  async function loadBoundaryLayer(path) {
    if (!state.map) throw new Error('The map is not ready yet. Please try again.');
    const parsed = await downloadBoundary(path);
    return showBoundary(path, parsed.geojson);
  }

  function showBoundary(path, geojson) {
    if (!state.map) throw new Error('The map is not ready yet. Please try again.');
    hideBoundary(path);
    let featureIndex = 0;
    const layer = L.geoJSON(geojson, {
      pane: 'boundaryPane',
      style: {
        color: '#30363B',
        weight: 1.5,
        fillColor: '#7FA99E',
        fillOpacity: 0.08
      },
      onEachFeature(feature, featureLayer) {
        const popup = document.createElement('span');
        popup.textContent = boundaryFeatureName(feature, ++featureIndex);
        featureLayer.bindPopup(popup);
      }
    });
    layer.addTo(state.map);
    state.boundaryLayers.set(path, layer);
    const bounds = layer.getBounds();
    if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [24, 24] });
    return layer;
  }

  function hideBoundary(path) {
    const layer = state.boundaryLayers.get(path);
    if (layer && state.map) state.map.removeLayer(layer);
    state.boundaryLayers.delete(path);
  }

  chartPanel.collapseButton.addEventListener('click', () => {
    togglePanel(chartPanel, CHART_COLLAPSED_KEY);
  });
  statsPanel.collapseButton.addEventListener('click', () => {
    togglePanel(statsPanel, STATS_COLLAPSED_KEY);
  });

  function togglePanel(panel, preferenceKey) {
    const closed = !panel.card.classList.contains('closed');
    setPanelCollapsed(panel, closed);
    updateBottomPanelCollapsedState(bottomPanel, chartPanel, statsPanel);
    writeCollapsedPreference(preferenceKey, closed);
    requestAnimationFrame(() => {
      state.map?.invalidateSize({ pan: false });
      if (!closed && panel === chartPanel) void updateChart();
    });
  }
  queryButton.addEventListener('click', () => queryBuilder.open());

  exportButton.addEventListener('click', () => {
    exportDialog.dialog.showModal();
    exportDialog.titleInput.focus();
  });
  exportDialog.downloadButton.addEventListener('click', () => {
    void generateMapExport({
      format: exportDialog.formatSelect.value,
      title: exportDialog.titleInput.value,
      orientation: exportDialog.orientationSelect.value,
      includeExtras: exportDialog.includeExtras.checked,
      reports: state.chartReports,
      map: state.map,
      mapArea,
      chartCanvas: chartPanel.canvas,
      statsCard: statsPanel.card,
      status: exportDialog.status
    }).then((success) => {
      if (success) exportDialog.dialog.close();
    });
  });
  clusterControl.button.addEventListener('click', () => {
    state.clustered = !state.clustered;
    clusterControl.setOn(state.clustered);
    updateMapMarkers();
  });
  chartPanel.barButton.addEventListener('click', () => {
    state.chartType = 'bar';
    setChartToggle(chartPanel, state.chartType);
    void updateChart();
  });
  chartPanel.lineButton.addEventListener('click', () => {
    state.chartType = 'line';
    setChartToggle(chartPanel, state.chartType);
    void updateChart();
  });

  function filteredReports() {
    const tree = filterStore.get().attribute.tree;
    if (state.filterTree !== tree) {
      state.filterTree = tree;
      state.filterPredicate = compileTree(tree, {
        now: new Date(),
        getCategory: categoryOf,
        organisations: queryBuilder.getOrganisations()
      });
    }
    return reports.filter(state.filterPredicate);
  }

  function updateDashboardData() {
    const selected = filteredReports();
    const tree = filterStore.get().attribute.tree;
    const filterContext = {
      now: new Date(),
      getCategory: categoryOf,
      organisations: queryBuilder.getOrganisations(),
      reports
    };
    const activeConditions = countCompleteConditions(tree);
    state.chartReports = selected;
    queryButton.classList.toggle('active', activeConditions > 0);
    queryButton.setAttribute('aria-pressed', String(activeConditions > 0));
    statsPanel.update(selected, reports.length, tree, filterContext, (index) => {
      const nextTree = cloneTree(tree);
      nextTree.children.splice(index, 1);
      filterStore.set({
        ...filterStore.get(),
        attribute: { tree: nextTree }
      });
    });
    state.reports = selected.filter(isMapVisible).map((report) => ({
      report,
      latitude: coordinate(report.latitude, report.location_lat),
      longitude: coordinate(report.longitude, report.location_lng)
    }));
    updateMapMarkers();
    void updateChart();
  }

  function updateMapMarkers() {
    if (!state.map) return;
    const request = ++state.markerRequest;
    if (state.layer) state.map.removeLayer(state.layer);
    if (!state.reports.length) {
      state.layer = null;
      mapEmpty.hidden = false;
      return;
    }
    mapEmpty.hidden = true;
    const markerOptions = state.clustered ? loadMarkerClusterGroup() : Promise.resolve(null);
    void markerOptions.then((createClusterGroup) => {
      if (!state.map || !mapArea.isConnected || request !== state.markerRequest) return;
      let layer;
      try {
        layer = createClusterGroup ? createClusterGroup() : window.L.layerGroup();
      } catch (error) {
        console.error('Could not create report clusters; using individual pins.', error);
        layer = window.L.layerGroup();
      }
      const bounds = [];
      for (const entry of state.reports) {
        const point = [entry.latitude, entry.longitude];
        bounds.push(point);
        const marker = window.L.marker(point, { icon: createReportIcon() });
        marker.bindPopup(createReportPopup(entry.report));
        layer.addLayer(marker);
      }
      state.layer = layer;
      layer.addTo(state.map);
      fitMapBounds(state.map, bounds);
      requestAnimationFrame(() => {
        if (mapArea.isConnected) state.map.invalidateSize();
      });
    }).catch((error) => {
      console.error('Marker clustering failed; using individual report pins.', error);
      if (request !== state.markerRequest || !state.map || !mapArea.isConnected) return;
      const fallback = window.L.layerGroup();
      const bounds = [];
      for (const entry of state.reports) {
        const point = [entry.latitude, entry.longitude];
        bounds.push(point);
        fallback.addLayer(window.L.marker(point, { icon: createReportIcon() })
          .bindPopup(createReportPopup(entry.report)));
      }
      state.layer = fallback.addTo(state.map);
      fitMapBounds(state.map, bounds);
    });
  }

  async function updateChart() {
    const request = ++chartRequest;
    if (chartPanel.card.classList.contains('closed')) return;

    try {
      const { Chart } = await withTimeout(
        import('https://cdn.jsdelivr.net/npm/chart.js@4.4.7/auto/+esm'),
        'Chart library load'
      );
      if (request !== chartRequest || !chartPanel.chartHost.isConnected) return;
      if (chartPanel.card.classList.contains('closed')) return;

      const counts = categoryCounts(state.chartReports);
      const labels = [...counts.keys()];
      const values = [...counts.values()];
      if (!values.length) {
        if (chartInstance) chartInstance.destroy();
        chartInstance = null;
        chartPanel.chartHost.replaceChildren(createEmptyState({
          title: 'No reports to chart',
          message: 'Reports will appear here when they match the selected category.'
        }));
        return;
      }

      if (chartInstance) chartInstance.destroy();
      chartInstance = null;
      chartPanel.chartHost.replaceChildren(chartPanel.canvas);
      const colours = labels.map((_, index) => CATEGORY_COLOURS[index % CATEGORY_COLOURS.length]);
      chartInstance = new Chart(chartPanel.canvas, {
        type: state.chartType,
        data: {
          labels,
          datasets: [{
            label: 'Reports',
            data: values,
            backgroundColor: colours,
            borderColor: colours,
            borderWidth: 2,
            borderRadius: state.chartType === 'bar' ? 5 : 0,
            pointRadius: 3,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
            x: { ticks: { maxRotation: 0, autoSkip: true } }
          }
        }
      });
    } catch (error) {
      if (request !== chartRequest) return;
      console.error('Could not load report distribution chart.', error);
      if (chartInstance) chartInstance.destroy();
      chartInstance = null;
      chartPanel.chartHost.replaceChildren(createRetryState({
        title: 'Chart unavailable',
        message: error.message || 'Check your connection and reload the dashboard.',
        onRetry: () => updateChart()
      }));
    }
  }

  const unsubscribeFilters = filterStore.subscribe(updateDashboardData);
  window.addEventListener('pagehide', unsubscribeFilters, { once: true });
  void initializeMap(mapCanvas, state, updateMapMarkers);
}

async function initializeMap(container, state, onReady) {
  try {
    window.L = L;
    if (!container.isConnected) return;
    state.map = L.map(container, { zoomControl: false, scrollWheelZoom: false })
      .setView([MAP_CONFIG.defaultCenter.lat, MAP_CONFIG.defaultCenter.lng], MAP_CONFIG.defaultZoom);
    state.map.createPane('boundaryPane');
    state.map.getPane('boundaryPane').style.zIndex = '350';
    const tileLayer = L.tileLayer(MAP_CONFIG.tileUrlTemplate, {
      maxZoom: MAP_CONFIG.maxZoom,
      attribution: MAP_CONFIG.attribution,
      crossOrigin: 'anonymous'
    });
    attachTileErrorNotice(tileLayer, container);
    tileLayer.addTo(state.map);
    addMapZoomControls(state.map, container.parentElement);
    requestAnimationFrame(() => {
      if (container.isConnected) state.map.invalidateSize();
    });
    onReady();
  } catch (error) {
    console.error('Could not load the report map.', error);
    if (container.isConnected) {
      const errorState = createRetryState({
        title: 'Map unavailable',
        message: error.message || 'Check your connection and reload the dashboard.',
        onRetry: () => {
          const retryCanvas = document.createElement('div');
          retryCanvas.className = 'map-canvas';
          errorState.replaceWith(retryCanvas);
          void initializeMap(retryCanvas, state, onReady);
        }
      });
      container.replaceWith(errorState);
    }
  }
}

function createBoundaryUploadDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'boundary-dialog';
  const heading = document.createElement('h2');
  heading.textContent = 'Upload admin boundary';
  const help = document.createElement('p');
  help.textContent = 'Upload a GeoJSON file containing Polygon or MultiPolygon features (maximum 5 MB).';
  const fileLabel = document.createElement('label');
  fileLabel.textContent = 'GeoJSON file';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.geojson,application/geo+json';
  fileLabel.append(fileInput);
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Boundary name (optional)';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 100;
  nameInput.autocomplete = 'off';
  nameLabel.append(nameInput);
  const preview = document.createElement('p');
  preview.className = 'boundary-preview';
  preview.textContent = 'Choose a .geojson file to preview.';
  const error = document.createElement('p');
  error.className = 'boundary-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const progress = document.createElement('p');
  progress.className = 'boundary-progress';
  progress.setAttribute('role', 'status');
  progress.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'boundary-dialog-actions';
  const cancelButton = createDialogButton('Cancel', 'secondary');
  const uploadButton = createDialogButton('Upload', 'primary');
  actions.append(cancelButton, uploadButton);
  dialog.append(heading, help, fileLabel, nameLabel, preview, error, progress, actions);
  return { dialog, fileInput, nameInput, preview, error, progress, cancelButton, uploadButton };
}

function createBoundariesDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'boundary-dialog boundary-list-dialog';
  const heading = document.createElement('h2');
  heading.textContent = 'Uploaded boundaries';
  const closeButton = createDialogButton('Close', 'secondary');
  closeButton.classList.add('boundary-dialog-close');
  const header = document.createElement('div');
  header.className = 'boundary-list-heading';
  header.append(heading, closeButton);
  const list = document.createElement('div');
  list.className = 'boundary-list';
  list.setAttribute('aria-live', 'polite');
  dialog.append(header, list);
  return { dialog, list, closeButton };
}

function createBoundaryRow(boundary, actions, isShown) {
  const row = document.createElement('article');
  row.className = 'boundary-row';
  const details = document.createElement('div');
  details.className = 'boundary-row-details';
  const name = document.createElement('strong');
  name.textContent = boundary.name;
  const metadata = document.createElement('span');
  metadata.textContent = `${formatFileSize(boundary.size)} · uploaded ${formatBoundaryDate(boundary.createdAt)}`;
  details.append(name, metadata);
  const controls = document.createElement('div');
  controls.className = 'boundary-row-actions';
  const toggleButton = createDialogButton(isShown ? 'Hide' : 'Show on map', 'secondary');
  toggleButton.setAttribute('aria-pressed', String(isShown));
  const zoomButton = createDialogButton('Zoom to', 'secondary');
  const message = document.createElement('p');
  message.className = 'boundary-error boundary-row-error';
  message.setAttribute('role', 'alert');
  message.hidden = true;
  const deleteButton = createDialogButton('Delete', 'danger');
  const confirm = document.createElement('div');
  confirm.className = 'boundary-delete-confirm';
  confirm.hidden = true;
  const prompt = document.createElement('p');
  prompt.textContent = `Delete ${boundary.name}? This cannot be undone.`;
  const confirmActions = document.createElement('div');
  confirmActions.className = 'boundary-row-actions';
  const cancelDeleteButton = createDialogButton('Cancel', 'secondary');
  const confirmDeleteButton = createDialogButton('Delete', 'danger');
  confirmActions.append(cancelDeleteButton, confirmDeleteButton);
  confirm.append(prompt, confirmActions);
  controls.append(toggleButton, zoomButton);
  controls.append(deleteButton);
  row.append(details, controls, confirm, message);
  toggleButton.addEventListener('click', () => {
    message.hidden = true;
    const shown = toggleButton.getAttribute('aria-pressed') === 'true';
    void actions.onToggle({ toggleButton, message }, !shown);
  });
  zoomButton.addEventListener('click', () => {
    message.hidden = true;
    void actions.onZoom({ message, toggleButton });
  });
  deleteButton.addEventListener('click', () => {
    message.hidden = true;
    confirm.hidden = false;
    confirmDeleteButton.focus();
  });
  cancelDeleteButton.addEventListener('click', () => {
    confirm.hidden = true;
    deleteButton.focus();
  });
  confirmDeleteButton.addEventListener('click', () => {
    message.hidden = true;
    void actions.onDelete({
      deleteButton: confirmDeleteButton,
      message,
      row,
      cancelButton: cancelDeleteButton
    });
  });
  return row;
}

function createDialogButton(label, variant) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `boundary-dialog-button ${variant}`;
  button.textContent = label;
  return button;
}

function makeBoundaryLoading() {
  const loading = document.createElement('p');
  loading.className = 'boundary-progress';
  loading.setAttribute('role', 'status');
  loading.textContent = 'Loading boundaries…';
  return loading;
}

function boundaryFeatureName(feature, index) {
  const properties = feature?.properties ?? {};
  for (const key of ['name', 'NAME', 'Ward', 'ward', 'WARD_ID']) {
    const value = properties[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return `Feature ${index}`;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBoundaryDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

async function loadMarkerClusterGroup() {
  if (window.L?.markerClusterGroup) return createClusterGroup;
  try {
    window.L = L;
    await withTimeout(
      loadScript('https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'),
      'Marker clustering plugin load',
      10_000
    );
    if (!window.L?.markerClusterGroup) throw new Error('Marker cluster plugin did not register with Leaflet.');
    return createClusterGroup;
  } catch (error) {
    console.error('Could not load marker clustering; using individual pins.', error);
    return null;
  }
}

function createClusterGroup() {
  return window.L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    iconCreateFunction(cluster) {
      const contents = document.createElement('span');
      contents.className = 'map-pin cluster';
      contents.textContent = String(cluster.getChildCount());
      return window.L.divIcon({
        html: contents,
        className: 'cluster-icon-shell',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
    }
  });
}

function fitMapBounds(map, bounds) {
  if (bounds.length === 1) map.setView(bounds[0], 14);
  else if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Marker cluster script failed to load.'));
    document.head.append(script);
  });
}

function createReportIcon() {
  const pin = document.createElement('span');
  pin.className = 'map-pin';
  return window.L.divIcon({
    html: pin,
    className: 'report-pin-shell',
    iconSize: [22, 28],
    iconAnchor: [11, 26],
    popupAnchor: [0, -24]
  });
}

function createReportPopup(report) {
  const wrapper = document.createElement('div');
  wrapper.className = 'map-popup';
  const tracking = document.createElement('strong');
  tracking.textContent = report.tracking_number || 'Report';
  const category = document.createElement('span');
  category.textContent = categoryOf(report);
  const status = document.createElement('span');
  status.textContent = getStatusLabel(report.status);
  const link = document.createElement('a');
  link.href = `#/report-detail/${encodeURIComponent(report.id)}`;
  link.textContent = 'Open report';
  wrapper.append(tracking, category, status, link);
  return wrapper;
}

function createDashboardTopbar(staff, onSignOut) {
  const header = document.createElement('header');
  header.className = 'dash-topbar dashboard-topbar';
  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Dashboard';
  const subtitle = document.createElement('div');
  subtitle.className = 'sub';
  subtitle.textContent = 'Map overview of South Africa · Durban region';
  titleWrap.append(title, subtitle);

  const right = document.createElement('div');
  right.className = 'dash-topbar-right';
  const search = document.createElement('input');
  search.className = 'dash-search';
  search.type = 'search';
  search.placeholder = 'Search records, posts, users…';
  search.disabled = true;
  search.setAttribute('aria-label', 'Search records, posts, and users');
  const bell = document.createElement('button');
  bell.type = 'button';
  bell.className = 'icon-circle';
  bell.disabled = true;
  bell.setAttribute('aria-label', 'No notifications');
  bell.append(icon('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'));
  const user = document.createElement('div');
  user.className = 'topbar-user';
  const avatar = document.createElement('span');
  avatar.className = 'dash-avatar';
  avatar.textContent = initials(staff.fullName, staff.role);
  const name = document.createElement('span');
  name.className = 'org-name';
  name.textContent = staff.fullName || staff.email || 'Platform staff';
  user.append(avatar, name);
  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'dashboard-signout';
  signOut.textContent = 'Sign out';
  signOut.addEventListener('click', onSignOut);
  right.append(search, bell, user, signOut);
  header.append(titleWrap, right);
  return header;
}

function createClusterControl() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'switch-field';
  button.setAttribute('aria-pressed', 'true');
  const label = document.createElement('span');
  label.textContent = 'Cluster markers';
  const switchMark = document.createElement('span');
  switchMark.className = 'switch on';
  switchMark.setAttribute('aria-hidden', 'true');
  button.append(label, switchMark);
  return {
    control: button,
    button,
    setOn(on) {
      switchMark.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
    }
  };
}

function createToolbarButton(label, pathData) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tbtn';
  button.append(icon(pathData));
  const text = document.createElement('span');
  text.textContent = label;
  button.append(text);
  button.setAttribute('aria-label', label);
  return button;
}

function createExportDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'map-export-dialog';
  const heading = document.createElement('h2');
  heading.textContent = 'Export options';
  const titleLabel = document.createElement('label');
  titleLabel.htmlFor = 'map-export-title';
  titleLabel.textContent = 'Map title';
  const titleInput = document.createElement('input');
  titleInput.id = 'map-export-title';
  titleInput.type = 'text';
  titleInput.className = 'map-export-title';
  titleInput.placeholder = 'e.g., Incident distribution — Durban Central';
  titleInput.value = 'Map export';
  const formatLabel = document.createElement('label');
  formatLabel.htmlFor = 'map-export-format';
  formatLabel.textContent = 'Export format';
  const formatSelect = document.createElement('select');
  formatSelect.id = 'map-export-format';
  formatSelect.className = 'map-export-select';
  addOption(formatSelect, 'image', 'Image');
  addOption(formatSelect, 'csv', 'CSV');
  const pdfOption = document.createElement('option');
  pdfOption.value = 'pdf';
  pdfOption.textContent = 'PDF (Coming soon)';
  pdfOption.disabled = true;
  formatSelect.append(pdfOption);
  addOption(formatSelect, 'geojson', 'GeoJSON');
  const orientationLabel = document.createElement('label');
  orientationLabel.htmlFor = 'map-export-orientation';
  orientationLabel.textContent = 'Page orientation';
  const orientationSelect = document.createElement('select');
  orientationSelect.id = 'map-export-orientation';
  orientationSelect.className = 'map-export-select';
  addOption(orientationSelect, 'portrait', 'Portrait A4');
  addOption(orientationSelect, 'landscape', 'Landscape A4');
  const includeLabel = document.createElement('label');
  includeLabel.className = 'map-export-checkbox';
  const includeExtras = document.createElement('input');
  includeExtras.type = 'checkbox';
  includeExtras.checked = true;
  const includeText = document.createElement('span');
  includeText.textContent = 'Include graphs & stats';
  includeLabel.append(includeExtras, includeText);
  const status = document.createElement('p');
  status.className = 'map-export-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'map-export-actions';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'tbtn';
  closeButton.textContent = 'Cancel';
  closeButton.addEventListener('click', () => dialog.close());
  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'tbtn solid-accent';
  downloadButton.textContent = 'Generate export';
  actions.append(closeButton, downloadButton);
  const fields = document.createElement('div');
  fields.className = 'map-export-fields';
  fields.append(
    titleLabel, titleInput,
    formatLabel, formatSelect,
    orientationLabel, orientationSelect,
    includeLabel
  );
  dialog.append(heading, fields, status, actions);
  formatSelect.addEventListener('change', () => {
    const imageOptionsEnabled = formatSelect.value === 'image';
    orientationSelect.disabled = !imageOptionsEnabled;
    includeExtras.disabled = !imageOptionsEnabled;
  });
  return {
    dialog,
    titleInput,
    formatSelect,
    orientationSelect,
    includeExtras,
    downloadButton,
    status
  };
}

async function generateMapExport({
  format,
  title,
  orientation,
  includeExtras,
  reports,
  map,
  mapArea,
  chartCanvas,
  statsCard,
  status
}) {
  status.hidden = true;
  status.textContent = '';
  try {
    const filename = exportFilename(title, format);
    if (format === 'csv') {
      downloadBlob(createCsvBlob(reports), filename);
      return true;
    }
    if (format === 'geojson') {
      downloadBlob(createGeoJsonBlob(title, reports), filename);
      return true;
    }
    if (format === 'image') {
      return await exportMapImage(map, mapArea, chartCanvas, statsCard, {
        title: title.trim() || 'Map export',
        orientation,
        includeExtras,
        filename
      });
    }
    return false;
  } catch (error) {
    console.error('Could not generate the map export.', error);
    setSafeText(status, format === 'image'
      ? 'Map image could not be exported. Try CSV or GeoJSON.'
      : 'The export could not be generated. Please try again.');
    status.hidden = false;
    return false;
  }
}

function createCsvBlob(reports) {
  const columns = [
    ['id', (report) => report.id],
    ['tracking_number', (report) => report.tracking_number],
    ['status', (report) => report.status],
    ['status_label', (report) => getStatusLabel(report.status)],
    ['category', categoryOf],
    ['urgency', (report) => report.urgency],
    ['assigned_organization_id', (report) => report.assigned_organization_id],
    ['latitude', (report) => coordinate(report.latitude, report.location_lat)],
    ['longitude', (report) => coordinate(report.longitude, report.location_lng)],
    ['location_name', (report) => report.location_name],
    ['created_at', (report) => report.created_at]
  ];
  const rows = [
    columns.map(([name]) => csvCell(name)).join(','),
    ...reports.map((report) => columns.map(([, value]) => csvCell(value(report))).join(','))
  ];
  return new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function createGeoJsonBlob(title, reports) {
  const features = reports.flatMap((report) => {
    const latitude = coordinate(report.latitude, report.location_lat);
    const longitude = coordinate(report.longitude, report.location_lng);
    if (latitude === null || longitude === null) return [];
    return [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: exportReportProperties(report)
    }];
  });
  return new Blob([JSON.stringify({
    type: 'FeatureCollection',
    name: title.trim() || 'Map export',
    features
  }, null, 2)], { type: 'application/geo+json;charset=utf-8' });
}

function exportReportProperties(report) {
  return {
    id: report.id ?? null,
    tracking_number: report.tracking_number ?? null,
    status: report.status ?? null,
    status_label: getStatusLabel(report.status) ?? null,
    category: categoryOf(report),
    urgency: report.urgency ?? null,
    assigned_organization_id: report.assigned_organization_id ?? null,
    latitude: coordinate(report.latitude, report.location_lat),
    longitude: coordinate(report.longitude, report.location_lng),
    location_name: report.location_name ?? null,
    created_at: report.created_at ?? null
  };
}

function exportFilename(title, format) {
  const slug = String(title ?? '').trim().toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'map-export';
  const date = new Date().toISOString().slice(0, 10);
  const extension = format === 'geojson' ? 'geojson' : format === 'image' ? 'png' : format;
  return `${slug}-${date}.${extension}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportMapImage(map, mapArea, chartCanvas, statsCard, options) {
  if (!map) throw new Error('The map is not ready yet.');
  const bounds = mapArea.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const tiles = [...mapArea.querySelectorAll('.leaflet-tile')].filter(
    (tile) => tile.complete && tile.naturalWidth > 0
  );
  if (!tiles.length) throw new Error('Map tiles are not ready yet.');

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = Math.round(bounds.width * scale);
  mapCanvas.height = Math.round(bounds.height * scale);
  const mapContext = mapCanvas.getContext('2d');
  if (!mapContext) throw new Error('The browser could not prepare the map image.');
  mapContext.scale(scale, scale);
  mapContext.fillStyle = '#E9EAEC';
  mapContext.fillRect(0, 0, bounds.width, bounds.height);
  for (const tile of tiles) {
    const rect = tile.getBoundingClientRect();
    mapContext.drawImage(tile, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height);
  }
  drawExportMarkers(mapContext, mapArea, bounds);
  const attribution = mapArea.querySelector('.leaflet-control-attribution')?.textContent?.trim();
  if (attribution) {
    mapContext.font = '10px sans-serif';
    const width = mapContext.measureText(attribution).width + 12;
    mapContext.fillStyle = 'rgba(255, 255, 255, .85)';
    mapContext.fillRect(bounds.width - width, bounds.height - 18, width, 18);
    mapContext.fillStyle = '#333';
    mapContext.fillText(attribution, bounds.width - width + 6, bounds.height - 6);
  }

  const pageRatio = options.orientation === 'landscape' ? 1.414 : 1 / 1.414;
  const outputWidth = 1200;
  const outputHeight = Math.round(outputWidth / pageRatio);
  const output = document.createElement('canvas');
  output.width = outputWidth;
  output.height = outputHeight;
  const context = output.getContext('2d');
  if (!context) throw new Error('The browser could not prepare the export image.');
  context.fillStyle = '#FFF';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.fillStyle = '#202124';
  context.font = '600 26px sans-serif';
  context.fillText(options.title, 48, 54, outputWidth - 96);
  const extrasHeight = options.includeExtras ? Math.round(outputHeight * 0.24) : 0;
  const mapLeft = 48;
  const mapTop = 82;
  const mapWidth = outputWidth - 96;
  const mapHeight = outputHeight - mapTop - extrasHeight - 36;
  context.drawImage(mapCanvas, mapLeft, mapTop, mapWidth, mapHeight);
  if (options.includeExtras) drawExportSummary(context, chartCanvas, statsCard, {
    left: mapLeft,
    top: mapTop + mapHeight + 18,
    width: mapWidth,
    height: extrasHeight - 18
  });
  const blob = await canvasBlob(output);
  downloadBlob(blob, options.filename);
  return true;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser did not produce an image.'));
    }, 'image/png');
  });
}

function drawExportSummary(context, chartCanvas, statsCard, bounds) {
  const chartWidth = Math.round(bounds.width * 0.58);
  const chartHeight = bounds.height;
  const title = statsCard.querySelector('.panel-head h3')?.textContent || 'Report stats';
  context.fillStyle = '#202124';
  context.font = '600 15px sans-serif';
  context.fillText('Report distribution', bounds.left, bounds.top + 14);
  if (chartCanvas.width && chartCanvas.height) {
    context.drawImage(chartCanvas, bounds.left, bounds.top + 20, chartWidth, chartHeight - 20);
  }
  context.fillText(title, bounds.left + chartWidth + 24, bounds.top + 14);
  const stats = [...statsCard.querySelectorAll('.stat-box')].map((box) => box.textContent.trim());
  context.font = '12px sans-serif';
  stats.forEach((text, index) => {
    context.fillText(text, bounds.left + chartWidth + 24, bounds.top + 38 + index * 20, bounds.width - chartWidth - 24);
  });
}

function drawExportMarkers(context, mapArea, bounds) {
  for (const marker of mapArea.querySelectorAll('.leaflet-marker-icon')) {
    const rect = marker.getBoundingClientRect();
    const cluster = marker.querySelector('.map-pin.cluster');
    if (cluster) {
      const centerX = rect.left - bounds.left + rect.width / 2;
      const centerY = rect.top - bounds.top + rect.height / 2;
      context.beginPath();
      context.arc(centerX, centerY, 15, 0, Math.PI * 2);
      context.fillStyle = '#A32D2D';
      context.fill();
      context.fillStyle = '#FFF';
      context.font = '700 11px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(cluster.textContent, centerX, centerY);
    } else {
      const centerX = rect.left - bounds.left + rect.width / 2;
      const top = rect.top - bounds.top + 3;
      context.beginPath();
      context.moveTo(centerX, top + 25);
      context.bezierCurveTo(centerX - 2, top + 17, centerX - 11, top + 10, centerX - 11, top + 7);
      context.arc(centerX, top + 7, 11, Math.PI, 0);
      context.bezierCurveTo(centerX + 11, top + 10, centerX + 2, top + 17, centerX, top + 25);
      context.fillStyle = '#A32D2D';
      context.fill();
      context.strokeStyle = '#FFF';
      context.lineWidth = 2;
      context.stroke();
    }
  }
}

function createChartPanel() {
  const card = document.createElement('section');
  card.className = 'panel-card chart-card';
  const head = createPanelHead('Report distribution');
  const toggles = document.createElement('div');
  toggles.className = 'panel-toggle-btns';
  const barButton = makeSegment('Bar', true);
  const lineButton = makeSegment('Line', false);
  toggles.append(barButton, lineButton);
  head.right.append(toggles);
  const body = document.createElement('div');
  body.className = 'panel-body';
  const chartHost = document.createElement('div');
  chartHost.className = 'chart-host';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Report distribution by category');
  canvas.setAttribute('role', 'img');
  chartHost.append(canvas);
  body.append(chartHost);
  card.append(head.element, body);
  return { card, body, collapseButton: head.collapseButton, title: 'Report distribution', barButton, lineButton, chartHost, canvas };
}

function createStatsPanel() {
  const card = document.createElement('section');
  card.className = 'panel-card stats-card';
  const head = createPanelHead('Report stats');
  const body = document.createElement('div');
  body.className = 'panel-body';
  const showing = document.createElement('div');
  showing.className = 'stats-showing';
  const chips = document.createElement('div');
  chips.className = 'query-chips';
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  const statBoxes = [
    createStatBox('s-total', 'Total'),
    createStatBox('s-pending', 'Pending (not attended)'),
    createStatBox('s-high', 'High pri.'),
    createStatBox('s-attended', 'Attended')
  ];
  for (const stat of statBoxes) grid.append(stat.box);
  const meta = document.createElement('div');
  meta.className = 'stat-meta';
  const location = document.createElement('div');
  const locationValue = document.createElement('b');
  location.append(document.createTextNode('Location: '), locationValue);
  const category = document.createElement('div');
  const categoryValue = document.createElement('b');
  category.append(document.createTextNode('Category: '), categoryValue);
  meta.append(location, category);
  const footnote = document.createElement('p');
  footnote.className = 'stats-footnote';
  footnote.textContent = '"Attended" reports (Resolved, Rejected or Duplicate) remain included in Total but are hidden from the map. See the Report sheet’s Historical tab.';
  const emptyState = createEmptyState({
    title: 'No reports match this query',
    message: 'Adjust or clear the query conditions to see reports.'
  });
  emptyState.classList.add('stats-empty-state');
  body.append(showing, chips, emptyState, grid, meta, footnote);
  card.append(head.element, body);
  return {
    card,
    body,
    collapseButton: head.collapseButton,
    title: 'Report stats',
    update(reports, totalCount, tree, context, onRemoveCondition) {
      const hasQuery = countCompleteConditions(tree) > 0;
      const attended = reports.filter((report) => ATTENDED_STATUSES.has(report.status)).length;
      const pending = reports.length - attended;
      const highPriority = reports.filter((report) => String(report.urgency ?? '').toLocaleLowerCase() === 'high').length;
      statBoxes[0].value.textContent = String(reports.length);
      statBoxes[1].value.textContent = String(pending);
      statBoxes[2].value.textContent = String(highPriority);
      statBoxes[3].value.textContent = String(attended);
      showing.textContent = hasQuery
        ? `Showing: filtered reports (${reports.length} of ${totalCount})`
        : `Showing: all reports (${reports.length})`;
      chips.replaceChildren();
      for (const [index, condition] of tree.children.entries()) {
        const chip = document.createElement('span');
        chip.className = 'query-chip';
        const label = document.createElement('span');
        label.textContent = describeNode(condition, context);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'query-chip-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove filter: ${label.textContent}`);
        remove.addEventListener('click', () => onRemoveCondition(index));
        chip.append(label, remove);
        chips.append(chip);
      }
      const isEmpty = reports.length === 0;
      emptyState.hidden = !isEmpty;
      grid.hidden = isEmpty;
      meta.hidden = isEmpty;
      footnote.hidden = isEmpty;
      locationValue.textContent = mostCommonLocation(reports);
      const categoryCondition = findFilterCondition(tree, 'category');
      categoryValue.textContent = categoryCondition
        ? describeNode(categoryCondition, context).replace(/^(NOT )?Category (is|is not) /, '$1')
        : 'All';
    }
  };
}

function createPanelHead(title) {
  const element = document.createElement('div');
  element.className = 'panel-head';
  const heading = document.createElement('h3');
  setSafeText(heading, title);
  const left = document.createElement('div');
  left.className = 'panel-head-left';
  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.className = 'panel-collapse-button';
  collapseButton.setAttribute('aria-label', `Collapse ${title}`);
  collapseButton.setAttribute('aria-expanded', 'true');
  collapseButton.append(createChevronIcon());
  left.append(heading, collapseButton);
  const right = document.createElement('div');
  right.className = 'panel-head-right';
  element.append(left, right);
  return { element, right, collapseButton };
}

function createChevronIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('chev');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 9l6 6 6-6');
  svg.append(path);
  return svg;
}

function setPanelCollapsed(panel, closed) {
  panel.card.classList.toggle('closed', closed);
  panel.body.hidden = closed;
  panel.collapseButton.setAttribute('aria-expanded', String(!closed));
  panel.collapseButton.setAttribute(
    'aria-label',
    `${closed ? 'Expand' : 'Collapse'} ${panel.title}`
  );
}

function updateBottomPanelCollapsedState(bottomPanel, chartPanel, statsPanel) {
  bottomPanel.classList.toggle(
    'all-panels-closed',
    chartPanel.card.classList.contains('closed') && statsPanel.card.classList.contains('closed')
  );
}

function readCollapsedPreference(key) {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedPreference(key, closed) {
  try {
    window.localStorage.setItem(key, String(closed));
  } catch {
    // The panel remains usable for this session if storage is unavailable.
  }
}

function createStatBox(className, label) {
  const box = document.createElement('div');
  box.className = `stat-box ${className}`;
  const value = document.createElement('div');
  value.className = 's-value';
  value.textContent = '0';
  const caption = document.createElement('div');
  caption.className = 's-label';
  caption.textContent = label;
  box.append(value, caption);
  return { box, value };
}

function makeSegment(label, active) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = active ? 'seg active' : 'seg';
  button.textContent = label;
  return button;
}

function setChartToggle(panel, type) {
  panel.barButton.classList.toggle('active', type === 'bar');
  panel.lineButton.classList.toggle('active', type === 'line');
}

function addMapZoomControls(map, parent) {
  const zoom = document.createElement('div');
  zoom.className = 'map-zoom';
  for (const [label, action] of [['+', () => map.zoomIn()], ['−', () => map.zoomOut()]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', label === '+' ? 'Zoom in' : 'Zoom out');
    button.addEventListener('click', action);
    zoom.append(button);
  }
  parent.append(zoom);
}

function renderDashboardError(target, staff, onSignOut, error) {
  const topbar = createDashboardTopbar(staff, onSignOut);
  const errorPanel = document.createElement('div');
  errorPanel.className = 'dashboard-error-panel';
  errorPanel.append(createRetryState({
    title: 'No access: check your staff account',
    message: error.message || 'Could not load reports. Please verify that this staff account has access.',
    onRetry: () => mountDashboard(target, { staff, onSignOut })
  }));
  target.replaceChildren(topbar, errorPanel);
}

function makeLoadingState() {
  const loading = document.createElement('p');
  loading.className = 'dashboard-loading';
  loading.textContent = 'Loading reports…';
  return loading;
}

function categoryCounts(reports) {
  const counts = new Map();
  for (const report of reports) {
    const category = categoryOf(report);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

function findFilterCondition(node, field) {
  if (node?.type === 'condition') {
    return node.field === field && isCompleteCondition(node) ? node : null;
  }
  if (node?.type !== 'group') return null;
  for (const child of node.children ?? []) {
    const match = findFilterCondition(child, field);
    if (match) return match;
  }
  return null;
}

function categoryOf(report) {
  return getCategoryLabel(
    report.category ?? report.issue_category ?? report.user_selected_category ?? report.ai_category
  );
}

function isMapVisible(report) {
  return !ATTENDED_STATUSES.has(report.status)
    && coordinate(report.latitude, report.location_lat) !== null
    && coordinate(report.longitude, report.location_lng) !== null;
}

function coordinate(primary, fallback) {
  const value = primary ?? fallback;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mostCommonLocation(reports) {
  const locations = new Map();
  for (const report of reports) {
    if (report.location_name) {
      const name = String(report.location_name).trim();
      if (name) locations.set(name, (locations.get(name) ?? 0) + 1);
    }
  }
  return [...locations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Captured location';
}

function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function initials(fullName, role) {
  if (fullName) return fullName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase()).join('');
  return role === 'platform_admin' ? 'PA' : 'PE';
}

function icon(pathData) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}
