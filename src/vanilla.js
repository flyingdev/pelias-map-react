import 'maplibre-gl/dist/maplibre-gl.css';
import { MapController } from './map-core';

// --- MOBILE DETECTION ---
const isMobile =
  window.innerWidth <= 768 ||
  ('ontouchstart' in window && window.innerWidth <= 1024);

// --- CREATE MAP CONTROLLER ---
const mc = new MapController(document.getElementById('map'), {
  center: [-77.86, 40.7934],
  zoom: 12,
  pitch: 0,
});

// --- DOM REFERENCES ---
const searchInput = document.getElementById('search-input');
const resultsList = document.getElementById('results-list');
const mobileNavBar = document.getElementById('mobile-nav-bar');
const mobileDestLabel = document.getElementById('mobile-dest-label');
const toggleBtn = document.getElementById('toggle-3d-btn');
const turnByTurn = document.getElementById('turn-by-turn');
const directionsList = document.getElementById('directions-list');
const recenterBtn = document.getElementById('recenter-btn');
const speedometer = document.getElementById('speedometer');
const modeSelectorEl = document.getElementById('mode-selector');

// --- STATE ---
let searchDestLabel = '';

// =========================
// SEARCH / AUTOCOMPLETE
// =========================
searchInput.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (query.length < 3) {
    resultsList.style.display = 'none';
    return;
  }

  try {
    const res = await fetch(
      `${mc._peliasUrl}/autocomplete?text=${encodeURIComponent(query)}`
    );
    const data = await res.json();

    resultsList.innerHTML = '';
    if (data.features && data.features.length > 0) {
      resultsList.style.display = 'block';
      data.features.forEach((feature) => {
        const li = document.createElement('li');
        li.textContent = feature.properties.label;
        li.onclick = () => {
          const coords = feature.geometry.coordinates;
          const label = feature.properties.label;

          searchDestLabel = label;

          mc.placeSearchMarker(coords, label, () => navigateToSearchPin());

          resultsList.style.display = 'none';
          searchInput.value = label;

          // Show mobile nav bar
          mobileDestLabel.textContent = label;
          mobileNavBar.classList.add('visible');
        };
        resultsList.appendChild(li);
      });
    }
  } catch (err) {
    console.error('Search error:', err);
  }
});

// =========================
// NAVIGATE TO SEARCH PIN
// =========================
function navigateToSearchPin() {
  const dest = mc.getSearchMarkerLngLat();
  if (!dest) {
    alert('No destination selected. Please search for a place first.');
    return;
  }
  const userLoc = mc.userLocation;
  if (!userLoc) {
    alert(
      'Your location is not available yet. Please allow location access and try again.'
    );
    return;
  }

  const start = { lat: userLoc.lat, lng: userLoc.lng };
  const endLabel = searchDestLabel || 'Destination';

  mc.resetRoute();

  mc.placeRouteMarkers(start, { lat: dest.lat, lng: dest.lng }, endLabel);
  mc.setRoute(start, { lat: dest.lat, lng: dest.lng });

  hideMobileNavBar();
}
window.navigateToSearchPin = navigateToSearchPin;

// =========================
// MOBILE NAV BAR
// =========================
function hideMobileNavBar() {
  mobileNavBar.classList.remove('visible');
}

function clearMobileNav() {
  mc.removeSearchMarker();
  searchDestLabel = '';
  hideMobileNavBar();
  searchInput.value = '';
}
window.clearMobileNav = clearMobileNav;

// =========================
// RESET ROUTE
// =========================
function resetRoute() {
  mc.resetRoute();
  searchDestLabel = '';
  hideMobileNavBar();
  searchInput.value = '';
}
window.resetRoute = resetRoute;

// =========================
// 3D TOGGLE
// =========================
function toggle3D() {
  const is3D = mc.toggle3D();
  toggleBtn.textContent = is3D ? '2D' : '3D';
}
window.toggle3D = toggle3D;

// =========================
// MODE SELECTOR
// =========================
function switchMode(newMode) {
  modeSelectorEl.querySelectorAll('.mode-selector-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === newMode);
  });
  mc.reroute(newMode);
}
window.switchMode = switchMode;

// =========================
// CLICK-TO-ROUTE (DESKTOP)
// =========================
mc.enableClickToRoute();

// =========================
// REVERSE GEOCODE
// =========================
mc.enableReverseGeocode((lon, lat) => {
  const userLoc = mc.userLocation;
  if (!userLoc) {
    alert('Waiting for GPS lock... try again in a moment.');
    return;
  }
  mc.placeRouteMarkers(
    { lat: userLoc.lat, lng: userLoc.lng },
    { lat, lng: lon }
  );
  mc.setRoute({ lat: userLoc.lat, lng: userLoc.lng }, { lat, lng: lon });
});

// =========================
// LOCATE USER
// =========================
mc.locateUser();

// =========================
// EVENT SUBSCRIPTIONS
// =========================

// Helpers
function formatDuration(seconds) {
  if (seconds < 60) return '< 1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}
function formatArrival(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Route → directions panel + mode selector visibility
mc.on('route', (data) => {
  if (!data) {
    turnByTurn.style.display = 'none';
    directionsList.innerHTML = '';
    modeSelectorEl.classList.remove('visible');
    return;
  }

  // Route summary header
  directionsList.innerHTML = '';
  const { summary } = data;
  if (summary) {
    const header = turnByTurn.querySelector('.route-summary');
    const html =
      `<span>${summary.distanceMi.toFixed(1)} mi</span>` +
      `<span class="route-eta">${formatDuration(summary.timeSeconds)}` +
      (summary.arrivalTime
        ? ` <span class="route-arrival">\u00b7 ${formatArrival(summary.arrivalTime)}</span>`
        : '') +
      `</span>`;
    if (header) {
      header.innerHTML = html;
    } else {
      const div = document.createElement('div');
      div.className = 'route-summary';
      div.innerHTML = html;
      turnByTurn.insertBefore(div, directionsList);
    }
  }

  data.maneuvers.forEach((step) => {
    const li = document.createElement('li');
    li.innerHTML =
      '<b>' +
      step.instruction +
      '</b><br><small>' +
      (step.length ? (step.length * 0.621371).toFixed(1) + ' mi' : '') +
      '</small>';
    directionsList.appendChild(li);
  });
  turnByTurn.style.display = 'block';
  modeSelectorEl.classList.add('visible');
});

// Active step → highlight in directions list
mc.on('activeStep', ({ index }) => {
  const items = directionsList.querySelectorAll('li');
  items.forEach((li, i) => {
    li.classList.toggle('active', i === index);
  });
  // Auto-scroll
  if (items[index]) {
    items[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// Speed → speedometer
mc.on('speed', ({ mph }) => {
  speedometer.innerHTML = `${mph}<br><span>MPH</span>`;
});

// Accuracy → speedometer subtitle
mc.on('accuracy', ({ meters }) => {
  if (meters != null) {
    speedometer.innerHTML =
      `${mc.speedMph}<br><span>MPH</span>` +
      `<span class="accuracy">\u00b1${Math.round(meters)}m</span>`;
  }
});

// Tracking → show/hide speedometer
mc.on('tracking', ({ active }) => {
  speedometer.style.display = active ? 'block' : 'none';
  if (!active) {
    recenterBtn.style.display = 'none';
  }
});

// Following → show/hide recenter button
mc.on('following', ({ active }) => {
  recenterBtn.style.display = !active && mc.isTracking ? 'block' : 'none';
});

// Recenter button
recenterBtn.onclick = () => {
  mc.recenter();
};

// Arrived
mc.on('arrived', () => {
  // Route is already stopped by MapController
});
