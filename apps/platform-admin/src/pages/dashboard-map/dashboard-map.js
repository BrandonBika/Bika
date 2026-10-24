import * as L from '../../../vendor/leaflet/leaflet-src.esm.js';
import { createEmptyState, createRetryState } from '../../components/state-message/state-message.js';
import { MAP_CONFIG } from '../../config.js';
import { attachTileErrorNotice } from '../../features/map-tiles.js';
import { listReports } from '../../features/reports.client.js';
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
  const queryBuilder = createQueryBuilder(reports);
  const queryButton = createToolbarButton('Query builder', 'M22 3H2l8 9.5V19l4 2v-8.5L22 3Z');
  queryButton.setAttribute('aria-expanded', 'false');
  queryButton.setAttribute('aria-controls', 'dashboard-query-panel');
  const clusterControl = createClusterControl();
  const exportButton = createToolbarButton('Export map', 'M12 3v12 M7 10l5 5 5-5 M5 21h14');
  const exportDialog = createExportDialog();
  const boundaryUploadButton = createToolbarButton(
    'Upload / add admin boundary',
    'M12 15V5 M7 9l5-5 5 5 M5 19h14'
  );
  boundaryUploadButton.classList.add('dashed');
  boundaryUploadButton.disabled = true;
  boundaryUploadButton.title = 'Coming soon';
  const boundaryListButton = createToolbarButton(
    'List of uploaded boundaries',
    'M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01'
  );
  boundaryListButton.classList.add('solid-accent');
  boundaryListButton.disabled = true;
  boundaryListButton.title = 'Coming soon';
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

  target.replaceChildren(topbar, toolbar, queryBuilder.panel, mapArea, bottomPanel, exportDialog.dialog);

  const state = {
    category: '',
    clustered: true,
    chartType: 'bar',
    chartReports: [],
    map: null,
    layer: null,
    reports: [],
    markerRequest: 0
  };
  let chartRequest = 0;
  const mapResizeObserver = new ResizeObserver(() => {
    if (state.map) requestAnimationFrame(() => state.map?.invalidateSize({ pan: false }));
  });
  mapResizeObserver.observe(mapArea);
  target.closest('.dash')?.addEventListener('platform-rail-resized', () => {
    if (state.map) requestAnimationFrame(() => state.map?.invalidateSize({ pan: false }));
  });

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
  queryButton.addEventListener('click', () => {
    const open = queryBuilder.panel.hidden;
    queryBuilder.panel.hidden = !open;
    queryButton.setAttribute('aria-expanded', String(open));
    if (open) queryBuilder.categorySelect.focus();
  });
  queryBuilder.categorySelect.addEventListener('change', () => {
    state.category = queryBuilder.categorySelect.value;
    updateDashboardData();
  });
  queryBuilder.clearButton.addEventListener('click', () => {
    queryBuilder.categorySelect.value = '';
    state.category = '';
    updateDashboardData();
  });
  exportButton.addEventListener('click', () => exportDialog.dialog.showModal());
  exportDialog.downloadButton.addEventListener('click', () => {
    void exportMapImage(state.map, mapArea, exportDialog.status);
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
    return state.category
      ? reports.filter((report) => categoryOf(report) === state.category)
      : reports;
  }

  function updateDashboardData() {
    const selected = filteredReports();
    state.chartReports = selected;
    statsPanel.update(selected, state.category);
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

  void initializeMap(mapCanvas, state, updateMapMarkers);
  updateDashboardData();
}

async function initializeMap(container, state, onReady) {
  try {
    window.L = L;
    if (!container.isConnected) return;
    state.map = L.map(container, { zoomControl: false, scrollWheelZoom: false })
      .setView([MAP_CONFIG.defaultCenter.lat, MAP_CONFIG.defaultCenter.lng], MAP_CONFIG.defaultZoom);
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

function createQueryBuilder(reports) {
  const panel = document.createElement('section');
  panel.id = 'dashboard-query-panel';
  panel.className = 'query-builder-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Report query builder');
  const condition = document.createElement('div');
  condition.className = 'query-condition';
  const label = document.createElement('label');
  label.htmlFor = 'dashboard-category-condition';
  label.textContent = 'Category';
  const operator = document.createElement('span');
  operator.className = 'query-operator';
  operator.textContent = 'is';
  const categorySelect = document.createElement('select');
  categorySelect.id = 'dashboard-category-condition';
  categorySelect.className = 'query-category-select';
  addOption(categorySelect, '', 'All categories');
  for (const category of uniqueCategories(reports)) addOption(categorySelect, category, category);
  condition.append(label, operator, categorySelect);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'query-clear-button';
  clearButton.textContent = 'Clear';
  panel.append(condition, clearButton);
  return { panel, categorySelect, clearButton };
}

function createExportDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'map-export-dialog';
  const heading = document.createElement('h2');
  heading.textContent = 'Export map';
  const description = document.createElement('p');
  description.textContent = 'Download the current map view, including visible report markers, as a PNG image.';
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
  downloadButton.textContent = 'Download PNG';
  actions.append(closeButton, downloadButton);
  dialog.append(heading, description, status, actions);
  return { dialog, downloadButton, status };
}

async function exportMapImage(map, mapArea, status) {
  status.hidden = true;
  status.textContent = '';
  if (!map) {
    setSafeText(status, 'The map is not ready yet. Please try again.');
    status.hidden = false;
    return;
  }

  const bounds = mapArea.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    setSafeText(status, 'Your browser could not prepare the map image.');
    status.hidden = false;
    return;
  }
  context.scale(scale, scale);
  context.fillStyle = '#E9EAEC';
  context.fillRect(0, 0, bounds.width, bounds.height);

  const tiles = [...mapArea.querySelectorAll('.leaflet-tile')].filter(
    (tile) => tile.complete && tile.naturalWidth > 0
  );
  if (!tiles.length) {
    setSafeText(status, 'Map tiles are not ready yet. Please wait and try again.');
    status.hidden = false;
    return;
  }

  try {
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      context.drawImage(
        tile,
        rect.left - bounds.left,
        rect.top - bounds.top,
        rect.width,
        rect.height
      );
    }
    drawExportMarkers(context, mapArea, bounds);
    const attribution = mapArea.querySelector('.leaflet-control-attribution')?.textContent?.trim();
    if (attribution) {
      context.font = '10px sans-serif';
      const width = context.measureText(attribution).width + 12;
      context.fillStyle = 'rgba(255, 255, 255, .85)';
      context.fillRect(bounds.width - width, bounds.height - 18, width, 18);
      context.fillStyle = '#333';
      context.fillText(attribution, bounds.width - width + 6, bounds.height - 6);
    }
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('The browser did not produce an image.'));
      }, 'image/png');
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'civicneuro-map.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('Could not export the report map image.', error);
    setSafeText(status, 'The map image could not be exported. Check the tile connection and try again.');
    status.hidden = false;
  }
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
  body.append(showing, grid, meta, footnote);
  card.append(head.element, body);
  return {
    card,
    body,
    collapseButton: head.collapseButton,
    title: 'Report stats',
    update(reports, selectedCategory) {
      const attended = reports.filter((report) => ATTENDED_STATUSES.has(report.status)).length;
      const pending = reports.length - attended;
      const highPriority = reports.filter((report) => String(report.urgency ?? '').toLocaleLowerCase() === 'high').length;
      statBoxes[0].value.textContent = String(reports.length);
      statBoxes[1].value.textContent = String(pending);
      statBoxes[2].value.textContent = String(highPriority);
      statBoxes[3].value.textContent = String(attended);
      showing.textContent = `Showing: all reports (${reports.length})`;
      locationValue.textContent = mostCommonLocation(reports);
      categoryValue.textContent = selectedCategory || 'All';
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

function uniqueCategories(reports) {
  return [...new Set(reports.map(categoryOf))].sort((a, b) => a.localeCompare(b));
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
