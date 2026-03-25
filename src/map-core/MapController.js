import maplibregl from 'maplibre-gl';
import { CONFIG } from '../config';
import { decodePolyline } from '../utils/polyline';
import { metersToPixels } from '../utils/geo';
import { speak as _speak, setPiperEnabled } from '../utils/tts';
import { isMobile } from '../utils/mobile';
import { EventEmitter } from './EventEmitter';

// Mode-dependent voice trigger distances (meters)
// Early warning: speak verbal_pre_transition_instruction (e.g., "In 800 feet, turn right")
const PRE_TRIGGER_METERS = { auto: 300, bicycle: 150, pedestrian: 60 };
// Close-range alert: speak verbal_transition_alert_instruction (e.g., "Turn right")
const TRIGGER_METERS = { auto: 70, bicycle: 45, pedestrian: 30 };
const ARRIVAL_METERS = { auto: 40, bicycle: 25, pedestrian: 20 };

export class MapController extends EventEmitter {
  constructor(container, opts = {}) {
    super();

    // Configuration
    this._valhallaUrl = opts.valhallaUrl || CONFIG.valhalla;
    this._isochroneUrl = opts.isochroneUrl || CONFIG.isochrone;
    this._peliasUrl = opts.peliasUrl || CONFIG.pelias;
    this._costing = opts.costing || 'auto';

    // MapLibre map
    this.map = new maplibregl.Map({
      container,
      style: opts.style || CONFIG.tiles,
      center: opts.center || [-77.7946, 40.7788],
      zoom: opts.zoom ?? 13,
      pitch: opts.pitch ?? 60,
    });

    // ResizeObserver
    this._resizeObserver = new ResizeObserver(() => this.map?.resize());
    this._resizeObserver.observe(container);

    // Isochrone state
    this._isochroneContours = [];
    this._isochroneAbort = null;

    // Route state
    this._routeCoords = null;
    this._maneuvers = null;
    this._routeSummary = null;
    this._routeStart = null;
    this._routeEnd = null;

    // GPS tracking state
    this._isTracking = false;
    this._isFollowing = true;
    this._gpsWatchId = null;
    this._currentPos = null;
    this._currentAcc = null;
    this._speedMph = 0;
    this._accuracyM = null;
    this._activeStepIdx = -1;

    // Maneuver voice state
    this._nextManeuverIndex = 1;
    this._spokenManeuvers = new Set();

    // Car GeoJSON (reused to avoid GC)
    this._carGeojson = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    };

    // Markers
    this._startMarker = null;
    this._endMarker = null;
    this._searchMarker = null;
    this._reverseMarker = null;
    this._userLocMarker = null;

    // User location (set by locateUser)
    this._userLocation = null;

    // Compass bearing (set externally via setCompassBearing)
    this._compassBearing = null;

    // Cached previous values for change detection
    this._prevSpeed = 0;
    this._prevAccuracy = null;

    // Bind map event handlers
    this._onDragStart = () => {
      if (this._gpsWatchId != null && this._isFollowing) {
        this._setFollowing(false);
      }
    };
    this._onZoom = () => {
      if (this._currentPos && this._currentAcc != null) {
        this._updateHaloRadius(this._currentAcc, this._currentPos[1]);
      }
    };
    this.map.on('dragstart', this._onDragStart);
    this.map.on('zoom', this._onZoom);

    // Reverse geocode / click-to-route listener refs
    this._onContextMenu = null;
    this._onTouchStart = null;
    this._onTouchEnd = null;
    this._onTouchMove = null;
    this._pressTimer = null;
    this._reverseNavigateCb = null;
    this._onMapClick = null;
  }

  // ===================== LIFECYCLE =====================

  ready() {
    if (this.map.loaded()) return Promise.resolve();
    return new Promise((resolve) => this.map.once('load', resolve));
  }

  destroy() {
    this.stopTracking();
    this._isochroneAbort?.abort();
    this._isochroneAbort = null;
    this.clearIsochrone();
    this._resizeObserver.disconnect();
    this.map.off('dragstart', this._onDragStart);
    this.map.off('zoom', this._onZoom);
    this._removeReverseGeocodeListeners();
    this._removeClickToRouteListener();
    this._removeMarker('_startMarker');
    this._removeMarker('_endMarker');
    this._removeMarker('_searchMarker');
    this._removeMarker('_reverseMarker');
    this._removeMarker('_userLocMarker');
    this.removeAllListeners();
    this.map.remove();
    this.map = null;
  }

  // ===================== ROUTING =====================

  async setRoute(start, end, mode, { silent = false } = {}) {
    if (mode) this._costing = mode;

    // Store endpoints for reroute()
    this._routeStart = start;
    this._routeEnd = end;

    // Clear any isochrone overlay when navigation starts
    this.clearIsochrone();

    const body = {
      locations: [
        { lat: start.lat, lon: start.lng },
        { lat: end.lat, lon: end.lng },
      ],
      costing: this._costing,
      units: 'km',
    };

    try {
      const res = await fetch(this._valhallaUrl, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.trip) {
        const msg = data.error || `Route request failed (${res.status})`;
        throw new Error(msg);
      }

      const leg = data.trip.legs[0];
      const coordinates = decodePolyline(leg.shape, 6);
      const maneuvers = leg.maneuvers;

      // Extract route summary (Valhalla: length in km, time in seconds)
      const tripSummary = data.trip.summary || {};
      const timeSeconds = tripSummary.time || 0;
      const summary = {
        distanceKm: tripSummary.length || 0,
        distanceMi: (tripSummary.length || 0) * 0.621371,
        timeSeconds,
        arrivalTime: Date.now() + timeSeconds * 1000,
      };

      this._routeCoords = coordinates;
      this._maneuvers = maneuvers;
      this._routeSummary = summary;

      // Fetch per-edge speed limits via trace_attributes, then attach to maneuvers
      this._fetchEdgeSpeedLimits(coordinates, maneuvers);

      this._drawRouteLine(coordinates);
      this.emit('route', { coordinates, maneuvers, summary, costing: this._costing });

      this.startTracking({ silent });

      return { coordinates, maneuvers, summary };
    } catch (err) {
      this.emit('error', { type: 'routing', message: err.message });
      throw err;
    }
  }

  async reroute(mode) {
    if (!this._routeStart || !this._routeEnd) return;
    this.stopTracking();
    this._clearSource('route');
    this._clearSource('car');
    this._routeCoords = null;
    this._maneuvers = null;
    this._routeSummary = null;
    await this.setRoute(this._routeStart, this._routeEnd, mode);
  }

  resetRoute() {
    this.stopTracking();

    this._removeMarker('_startMarker');
    this._removeMarker('_endMarker');
    this._removeMarker('_searchMarker');

    this._clearSource('route');
    this._clearSource('car');

    this._routeCoords = null;
    this._maneuvers = null;
    this._routeSummary = null;
    this._routeStart = null;
    this._routeEnd = null;

    this.emit('route', null);
  }

  _drawRouteLine(coordinates) {
    const geojson = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
    };
    if (this.map.getSource('route')) {
      this.map.getSource('route').setData(geojson);
    } else {
      this.map.addSource('route', { type: 'geojson', data: geojson });
      this.map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#3b9ddd',
          'line-width': 6,
          'line-opacity': 0.6,
        },
      });
    }
  }

  _clearSource(id) {
    if (!this.map) return;
    const src = this.map.getSource(id);
    if (!src) return;
    if (id === 'car') {
      src.setData({ type: 'FeatureCollection', features: [] });
    } else {
      src.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] },
      });
    }
  }

  // ===================== GPS TRACKING =====================

  startTracking({ silent = false } = {}) {
    if (!('geolocation' in navigator)) {
      this.emit('error', { type: 'gps', message: 'Geolocation not supported' });
      return;
    }

    // Reset voice tracking
    this._nextManeuverIndex = 1;
    this._spokenManeuvers = new Set();

    // Speak first instruction and activate step 0 (so speed limit sign shows immediately)
    if (this._maneuvers?.length > 0 && this._maneuvers[0].instruction) {
      const firstStep = this._maneuvers[0];
      if (!silent) {
        this.speak('Starting route. ' + (firstStep.verbal_pre_transition_instruction || firstStep.instruction));
      }
      this._activeStepIdx = 0;
      this.emit('activeStep', { index: 0 });
    }

    this._setTracking(true);
    this._setFollowing(true);

    this._gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => this._onGpsPosition(pos),
      (err) =>
        this.emit('error', { type: 'gps', message: err.message }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  }

  stopTracking() {
    if (this._gpsWatchId != null) {
      navigator.geolocation.clearWatch(this._gpsWatchId);
      this._gpsWatchId = null;
    }

    this._setTracking(false);
    this._speedMph = 0;
    this._accuracyM = null;
    this._activeStepIdx = -1;
    this._prevSpeed = 0;
    this._prevAccuracy = null;

    this.emit('speed', { mph: 0 });
    this.emit('accuracy', { meters: null });
    this.emit('activeStep', { index: -1 });
  }

  recenter() {
    this._setFollowing(true);
    if (this.map && this._currentPos) {
      this.map.flyTo({ center: this._currentPos, zoom: 16 });
    }
  }

  // ===================== GPS POSITION HANDLER =====================

  _onGpsPosition(position) {
    if (!this.map) return;

    const lngLat = [position.coords.longitude, position.coords.latitude];
    const accuracy = position.coords.accuracy;

    this._currentPos = lngLat;
    this._currentAcc = accuracy;

    // Speed (m/s -> mph, only emit on change)
    const s = position.coords.speed;
    const newSpeed =
      typeof s === 'number' && s > 0 ? Math.round(s * 2.23694) : 0;
    if (newSpeed !== this._prevSpeed) {
      this._prevSpeed = newSpeed;
      this._speedMph = newSpeed;
      this.emit('speed', { mph: newSpeed });
    }

    // Accuracy (only emit on change)
    const rounded = accuracy != null ? Math.round(accuracy) : null;
    if (rounded !== this._prevAccuracy) {
      this._prevAccuracy = rounded;
      this._accuracyM = accuracy;
      this.emit('accuracy', { meters: accuracy });
    }

    // Emit updated userLocation so React state stays fresh
    this.emit('userLocation', {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy,
      timestamp: position.timestamp,
    });

    // Imperative map updates
    this._updateCarLocation(lngLat);
    this._updateHaloRadius(accuracy, position.coords.latitude);

    // Follow mode — include compass bearing if active
    if (this._isFollowing) {
      const easeOpts = { center: lngLat, duration: 800 };
      if (this._compassBearing != null) {
        easeOpts.bearing = -this._compassBearing;
        if (this.map.getPitch() < 50) easeOpts.pitch = 60;
      }
      this.map.easeTo(easeOpts);
    }

    // Voice navigation (only when route + maneuvers are both present)
    if (this._routeCoords?.length && this._maneuvers?.length) {
      this._maybeSpeakNextManeuver(lngLat);
      if (this._maybeArrived(lngLat)) {
        this.stopTracking();
        this.emit('arrived', {});
      }
    }
  }

  // ===================== CAR LAYERS =====================

  _ensureCarLayers() {
    if (!this.map.getSource('car')) {
      this.map.addSource('car', {
        type: 'geojson',
        data: this._carGeojson,
      });
    }
    if (!this.map.getLayer('car-halo')) {
      this.map.addLayer({
        id: 'car-halo',
        type: 'circle',
        source: 'car',
        paint: {
          'circle-radius': 0,
          'circle-color': '#007cbf',
          'circle-opacity': 0.2,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#007cbf',
        },
      });
    }
    if (!this.map.getLayer('car-layer')) {
      this.map.addLayer({
        id: 'car-layer',
        type: 'circle',
        source: 'car',
        paint: {
          'circle-radius': 8,
          'circle-color': '#007cbf',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
    }
  }

  _updateCarLocation(lngLat) {
    this._ensureCarLayers();
    this._carGeojson.features[0].geometry.coordinates = lngLat;
    this.map.getSource('car').setData(this._carGeojson);
  }

  _updateHaloRadius(accuracy, latitude) {
    if (!this.map.getLayer('car-halo')) return;
    if (accuracy == null || latitude == null) return;
    const px = metersToPixels(accuracy, latitude, this.map.getZoom());
    this.map.setPaintProperty('car-halo', 'circle-radius', Math.max(px, 0));
  }

  // ===================== ISOCHRONE =====================

  static _isochroneColorExpr(contours) {
    // Build a MapLibre match expression: [match, [to-number, [get, 'contour']], t1, color1, t2, color2, ..., fallback]
    const palette = ['#ff0000', '#ff9900', '#ffcc00', '#44bb44'];
    const sorted = [...contours].sort((a, b) => a - b);
    const pairs = sorted.flatMap((t, i) => [t, palette[Math.min(i, palette.length - 1)]]);
    return ['match', ['to-number', ['get', 'contour']], ...pairs, palette[0]];
  }

  async fetchIsochrone(center, { contours = [5, 10, 15], costing } = {}) {
    // Abort any in-flight request
    this._isochroneAbort?.abort();
    const abort = new AbortController();
    this._isochroneAbort = abort;

    const costingToUse = costing || this._costing;
    const body = {
      locations: [{ lat: center.lat, lon: center.lng }],
      costing: costingToUse,
      polygons: true,
      contours: [...contours].sort((a, b) => a - b).map((time) => ({ time })),
      denoise: 0.5,
      generalize: 150,
    };

    try {
      const res = await fetch(this._isochroneUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!res.ok) throw new Error(`Isochrone HTTP ${res.status}`);
      const geojson = await res.json();
      this._drawIsochrone(geojson, contours);
      this.emit('isochrone', { geojson, center, contours, costing: costingToUse });
      return geojson;
    } catch (err) {
      if (err.name === 'AbortError') return; // superseded by a newer request
      this.emit('error', { type: 'isochrone', message: err.message });
      throw err;
    }
  }

  _drawIsochrone(geojson, contours) {
    if (!this.map?.isStyleLoaded()) return; // style not ready — skip silently

    const colorExpr = MapController._isochroneColorExpr(contours);

    // If source already exists, just swap the data — no layer rebuild needed
    if (this.map.getSource('isochrone')) {
      this.map.getSource('isochrone').setData(geojson);
      // Update paint in case contour set changed
      this.map.setPaintProperty('isochrone-fill', 'fill-color', colorExpr);
      this.map.setPaintProperty('isochrone-line', 'line-color', colorExpr);
      return;
    }

    this.map.addSource('isochrone', { type: 'geojson', data: geojson });

    // Insert under 3d-buildings so buildings stay visible on top
    const beforeLayer = this.map.getLayer('3d-buildings') ? '3d-buildings' : undefined;

    this.map.addLayer(
      {
        id: 'isochrone-fill',
        type: 'fill',
        source: 'isochrone',
        paint: { 'fill-color': colorExpr, 'fill-opacity': 0.25 },
      },
      beforeLayer
    );

    this.map.addLayer(
      {
        id: 'isochrone-line',
        type: 'line',
        source: 'isochrone',
        paint: { 'line-color': colorExpr, 'line-width': 2, 'line-opacity': 0.7 },
      },
      beforeLayer
    );
  }

  clearIsochrone() {
    if (!this.map) return;
    if (this.map.getLayer('isochrone-fill')) this.map.removeLayer('isochrone-fill');
    if (this.map.getLayer('isochrone-line')) this.map.removeLayer('isochrone-line');
    if (this.map.getSource('isochrone')) this.map.removeSource('isochrone');
    this._isochroneContours = [];
    this.emit('isochroneCleared', {});
  }

  // ===================== VOICE NAVIGATION =====================

  _maybeSpeakNextManeuver(lngLat) {
    const maneuvers = this._maneuvers;
    const coords = this._routeCoords;

    if (!maneuvers?.length || !coords?.length) return;

    const preTriggerDist = PRE_TRIGGER_METERS[this._costing] ?? PRE_TRIGGER_METERS.auto;
    const triggerDist = TRIGGER_METERS[this._costing] ?? TRIGGER_METERS.auto;
    const carLoc = new maplibregl.LngLat(lngLat[0], lngLat[1]);

    // Scan forward from _nextManeuverIndex — skip past maneuvers the car
    // already passed (GPS jitter / fast driving may jump over one).
    for (let idx = this._nextManeuverIndex; idx < maneuvers.length; idx++) {
      const nextStep = maneuvers[idx];
      const turnIndex = nextStep.begin_shape_index;

      // Guard: invalid or out-of-range shape index
      if (typeof turnIndex !== 'number' || turnIndex < 0 || turnIndex >= coords.length) {
        continue;
      }

      const turnCoords = coords[turnIndex];
      const turnLoc = new maplibregl.LngLat(turnCoords[0], turnCoords[1]);
      const d = carLoc.distanceTo(turnLoc);

      // Stage 1: Early warning — "In 800 feet, turn right onto Boal Avenue"
      const preKey = 'pre_' + idx;
      if (d <= preTriggerDist && !this._spokenManeuvers.has(preKey)) {
        this._spokenManeuvers.add(preKey);
        this.speak(nextStep.verbal_pre_transition_instruction || nextStep.instruction);
        this._activeStepIdx = idx;
        this.emit('activeStep', { index: idx });
      }

      // Stage 2: Close-range alert — "Turn right"
      if (d <= triggerDist && !this._spokenManeuvers.has(idx)) {
        this._spokenManeuvers.add(idx);
        const alert = nextStep.verbal_transition_alert_instruction;
        if (alert) this.speak(alert);
        this._activeStepIdx = idx;
        this._nextManeuverIndex = idx + 1;
        this.emit('activeStep', { index: idx });
        return; // advance to next maneuver
      }

      // First un-spoken maneuver is still out of range — stop scanning
      if (d > preTriggerDist) break;
    }
  }

  _maybeArrived(lngLat) {
    const coords = this._routeCoords;
    if (!coords?.length) return false;

    const arrivalDist = ARRIVAL_METERS[this._costing] ?? ARRIVAL_METERS.auto;
    const dest = coords[coords.length - 1];
    const carLoc = new maplibregl.LngLat(lngLat[0], lngLat[1]);
    const destLoc = new maplibregl.LngLat(dest[0], dest[1]);

    if (carLoc.distanceTo(destLoc) < arrivalDist) {
      this.speak('You have arrived at your destination.');
      return true;
    }
    return false;
  }

  // Fetch edge-level speed limits from Valhalla trace_attributes and attach to maneuvers
  async _fetchEdgeSpeedLimits(coordinates, maneuvers) {
    try {
      // For short local routes, send all coordinates (trace_attributes needs
      // consecutive points within 2km of each other). For long routes, skip
      // the call entirely — speed limits are most useful for local navigation.
      if (coordinates.length < 2) return;

      // Cap at 500 points but keep them dense enough (< 2km apart)
      const maxPoints = 500;
      const step = Math.max(1, Math.floor(coordinates.length / maxPoints));
      const shape = [];
      for (let i = 0; i < coordinates.length; i += step) {
        shape.push({ lat: coordinates[i][1], lon: coordinates[i][0] });
      }
      const last = coordinates[coordinates.length - 1];
      shape.push({ lat: last[1], lon: last[0] });

      // Skip if route is too long (> ~80 km) — trace_attributes would be unreliable
      if (shape.length > 500) return;

      const res = await fetch('/api/sam/valhalla/trace_attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shape,
          costing: this._costing,
          shape_match: 'map_snap',
          filters: {
            attributes: ['edge.speed_limit', 'edge.begin_shape_index', 'edge.end_shape_index'],
            action: 'include',
          },
        }),
      });

      if (!res.ok) return;
      const data = await res.json();
      const edges = data.edges || [];
      if (!edges.length) return;

      // Map each maneuver to the nearest edge's speed limit
      for (const m of maneuvers) {
        const scaledIdx = Math.floor(m.begin_shape_index / step);
        for (const edge of edges) {
          const begin = edge.begin_shape_index || 0;
          const end = edge.end_shape_index || 0;
          if (scaledIdx >= begin && scaledIdx <= end && edge.speed_limit > 0) {
            m.speed_limit = edge.speed_limit; // km/h
            break;
          }
        }
      }

      // Re-emit route so React picks up the speed limit data
      this.emit('route', {
        coordinates: this._routeCoords,
        maneuvers: this._maneuvers,
        summary: this._routeSummary,
        costing: this._costing,
      });
    } catch (err) {
      console.warn('[MapController] Failed to fetch edge speed limits:', err);
    }
  }

  // ===================== STATE SETTERS WITH EVENTS =====================

  _setTracking(val) {
    if (this._isTracking === val) return;
    this._isTracking = val;
    this.emit('tracking', { active: val });
  }

  _setFollowing(val) {
    if (this._isFollowing === val) return;
    this._isFollowing = val;
    this.emit('following', { active: val });
  }

  // ===================== MARKER MANAGEMENT =====================

  placeRouteMarkers(start, end, endLabel = 'Destination') {
    this._removeMarker('_startMarker');
    this._removeMarker('_endMarker');

    this._startMarker = new maplibregl.Marker({ color: '#3bb2d0' })
      .setLngLat([start.lng, start.lat])
      .setPopup(new maplibregl.Popup().setHTML('Start'))
      .addTo(this.map);

    this._endMarker = new maplibregl.Marker({ color: '#f05c5c' })
      .setLngLat([end.lng, end.lat])
      .setPopup(
        new maplibregl.Popup().setHTML('<b>' + endLabel + '</b>')
      )
      .addTo(this.map);
  }

  placeSearchMarker(coords, label, onNavigate) {
    this._removeMarker('_searchMarker');

    const popupHTML =
      '<b>' + label + '</b>' +
      '<button class="navigate-btn mc-search-nav-btn">Navigate</button>' +
      '<button class="navigate-btn mc-search-iso-btn" style="margin-top:4px;background:#f5a623;">⏱ Drive Time</button>';

    const popup = new maplibregl.Popup().setHTML(popupHTML);
    this._searchMarker = new maplibregl.Marker({ color: '#e74c3c' })
      .setLngLat(coords)
      .setPopup(popup)
      .addTo(this.map);

    this.map.flyTo({ center: coords, zoom: 14 });
    this._searchMarker.togglePopup();

    // Wire buttons via popup element (no document.getElementById)
    const el = popup.getElement();
    if (onNavigate) {
      const btn = el.querySelector('.mc-search-nav-btn');
      if (btn) btn.onclick = () => onNavigate();
    }
    const isoBtn = el.querySelector('.mc-search-iso-btn');
    if (isoBtn) {
      isoBtn.onclick = async () => {
        try {
          await this.fetchIsochrone(
            { lat: coords[1], lng: coords[0] },
            { costing: this._costing }
          );
          popup.remove();
        } catch (e) {
          console.error('Isochrone error:', e);
        }
      };
    }
  }

  getSearchMarkerLngLat() {
    return this._searchMarker ? this._searchMarker.getLngLat() : null;
  }

  removeSearchMarker() {
    this._removeMarker('_searchMarker');
  }

  _removeMarker(field) {
    if (this[field]) {
      this[field].remove();
      this[field] = null;
    }
  }

  // ===================== INITIAL GEOLOCATION =====================

  async locateUser() {
    const showLoc = (lat, lng, label) => {
      this._userLocation = { lat, lng };
      this.map.flyTo({ center: [lng, lat], zoom: 14 });
      this._removeMarker('_userLocMarker');
      this._userLocMarker = new maplibregl.Marker({ color: '#4668F2' })
        .setLngLat([lng, lat])
        .setPopup(new maplibregl.Popup().setHTML(label))
        .addTo(this.map);
      this.emit('userLocation', { lat, lng, timestamp: Date.now() });
    };

    if ('geolocation' in navigator && window.isSecureContext) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          })
        );
        showLoc(pos.coords.latitude, pos.coords.longitude, 'You are here');
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch (_) {
        // fall through to IP fallback
      }
    }

    try {
      const res = await fetch('http://ip-api.com/json/');
      const data = await res.json();
      if (data.status === 'success') {
        showLoc(data.lat, data.lon, 'You are here (approx)');
        return { lat: data.lat, lng: data.lon };
      }
    } catch (err) {
      this.emit('error', { type: 'geolocation', message: err.message });
    }

    return null;
  }

  get userLocation() {
    return this._userLocation || null;
  }

  // ===================== REVERSE GEOCODE =====================

  enableReverseGeocode(onNavigate) {
    this._removeReverseGeocodeListeners();

    this._reverseNavigateCb = onNavigate;

    this._onContextMenu = (e) => {
      this._reverseGeocodeAndShow(e.lngLat.lng, e.lngLat.lat).catch(
        console.error
      );
    };
    this.map.on('contextmenu', this._onContextMenu);

    if (isMobile) {
      this._onTouchStart = (e) => {
        if (!e?.lngLat) return;
        this._pressTimer = setTimeout(() => {
          this._reverseGeocodeAndShow(e.lngLat.lng, e.lngLat.lat).catch(
            console.error
          );
        }, 600);
      };
      this._onTouchEnd = () => {
        clearTimeout(this._pressTimer);
        this._pressTimer = null;
      };
      this._onTouchMove = () => {
        clearTimeout(this._pressTimer);
        this._pressTimer = null;
      };
      this.map.on('touchstart', this._onTouchStart);
      this.map.on('touchend', this._onTouchEnd);
      this.map.on('touchmove', this._onTouchMove);
    }
  }

  async _reverseGeocodeAndShow(lon, lat) {
    const url = `${this._peliasUrl}/reverse?point.lat=${lat}&point.lon=${lon}`;
    const res = await fetch(url);
    const data = await res.json();
    const label =
      data?.features?.[0]?.properties?.label || 'Unknown location';

    this._removeMarker('_reverseMarker');

    const popupHTML = `
      <div style="text-align:center;font-family:sans-serif;">
        <strong style="font-size:14px;display:block;margin-bottom:8px;">${label}</strong>
        <button class="mc-nav-here-btn" style="padding:8px 12px;background:#f05c5c;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:bold;width:100%;margin-bottom:4px;">
          Navigate Here
        </button>
        <button class="mc-iso-here-btn" style="padding:8px 12px;background:#f5a623;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:bold;width:100%;">
          ⏱ Drive Time
        </button>
      </div>
    `;

    const popup = new maplibregl.Popup().setHTML(popupHTML);
    this._reverseMarker = new maplibregl.Marker({ color: '#f5a623' })
      .setLngLat([lon, lat])
      .setPopup(popup)
      .addTo(this.map);
    this._reverseMarker.togglePopup();

    this.emit('reverseGeocode', { lon, lat, label });

    const el = popup.getElement();

    const navBtn = el.querySelector('.mc-nav-here-btn');
    if (navBtn) {
      navBtn.onclick = () => {
        popup.remove();
        this._reverseNavigateCb?.(lon, lat);
      };
    }

    const isoBtn = el.querySelector('.mc-iso-here-btn');
    if (isoBtn) {
      isoBtn.onclick = async () => {
        try {
          await this.fetchIsochrone(
            { lat, lng: lon },
            { costing: this._costing }
          );
          popup.remove();
        } catch (e) {
          console.error('Isochrone error:', e);
        }
      };
    }
  }

  _removeReverseGeocodeListeners() {
    if (this._onContextMenu) {
      this.map?.off('contextmenu', this._onContextMenu);
      this._onContextMenu = null;
    }
    if (isMobile) {
      if (this._onTouchStart)
        this.map?.off('touchstart', this._onTouchStart);
      if (this._onTouchEnd) this.map?.off('touchend', this._onTouchEnd);
      if (this._onTouchMove)
        this.map?.off('touchmove', this._onTouchMove);
      this._onTouchStart = this._onTouchEnd = this._onTouchMove = null;
    }
    this._removeMarker('_reverseMarker');
    clearTimeout(this._pressTimer);
  }

  // ===================== CLICK-TO-ROUTE (DESKTOP) =====================

  enableClickToRoute() {
    if (isMobile) return;
    this._removeClickToRouteListener();

    this._onMapClick = (e) => {
      if (!this._startMarker) {
        this._startMarker = new maplibregl.Marker({ color: '#3bb2d0' })
          .setLngLat(e.lngLat)
          .setPopup(new maplibregl.Popup().setHTML('Start'))
          .addTo(this.map);
      } else if (!this._endMarker) {
        this._endMarker = new maplibregl.Marker({ color: '#f05c5c' })
          .setLngLat(e.lngLat)
          .setPopup(new maplibregl.Popup().setHTML('End'))
          .addTo(this.map);

        const s = this._startMarker.getLngLat();
        const d = this._endMarker.getLngLat();
        this.setRoute(
          { lat: s.lat, lng: s.lng },
          { lat: d.lat, lng: d.lng }
        );
      }
    };
    this.map.on('click', this._onMapClick);
  }

  _removeClickToRouteListener() {
    if (this._onMapClick) {
      this.map?.off('click', this._onMapClick);
      this._onMapClick = null;
    }
  }

  // ===================== 3D BUILDINGS =====================

  toggle3D() {
    if (this.map.getLayer('3d-buildings')) {
      this.map.removeLayer('3d-buildings');
      this.map.easeTo({ pitch: 0, duration: 1000 });
      return false;
    }

    const sources = this.map.getStyle().sources;
    const sourceId = Object.keys(sources).find(
      (s) => sources[s].type === 'vector'
    );
    if (sourceId) {
      this.map.addLayer({
        id: '3d-buildings',
        source: sourceId,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#e3e3e3',
          'fill-extrusion-height': [
            'coalesce',
            ['get', 'render_height'],
            ['get', 'height'],
            10,
          ],
          'fill-extrusion-base': [
            'coalesce',
            ['get', 'render_min_height'],
            ['get', 'min_height'],
            0,
          ],
          'fill-extrusion-opacity': 0.8,
        },
      });
    }
    this.map.easeTo({ pitch: 60, duration: 1000 });
    return true;
  }

  get is3D() {
    return !!this.map?.getLayer('3d-buildings');
  }

  // ===================== TRAFFIC INCIDENTS =====================

  async fetchTrafficIncidents() {
    try {
      const res = await fetch(CONFIG.trafficIncidents);
      if (!res.ok) throw new Error(`Traffic HTTP ${res.status}`);
      const geojson = await res.json();
      this._drawTrafficIncidents(geojson);
      return geojson;
    } catch (err) {
      console.warn('[Traffic] Failed to fetch incidents:', err.message);
    }
  }

  _drawTrafficIncidents(geojson) {
    if (!this.map?.isStyleLoaded()) return;

    if (this.map.getSource('traffic-incidents')) {
      this.map.getSource('traffic-incidents').setData(geojson);
      return;
    }

    this.map.addSource('traffic-incidents', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'traffic-incidents-circle',
      type: 'circle',
      source: 'traffic-incidents',
      paint: {
        'circle-radius': 8,
        'circle-color': [
          'match', ['get', 'severity'],
          'heavy', '#e74c3c',
          'moderate', '#f39c12',
          'low', '#f1c40f',
          '#999999',
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    this.map.addLayer({
      id: 'traffic-incidents-label',
      type: 'symbol',
      source: 'traffic-incidents',
      layout: {
        'text-field': '⚠',
        'text-size': 14,
        'text-allow-overlap': true,
      },
    });

    // Click popup for incident details
    this.map.on('click', 'traffic-incidents-circle', (e) => {
      const props = e.features[0].properties;
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family:sans-serif;">` +
          `<strong>${props.facility || ''}</strong><br/>` +
          `${props.description || ''}<br/>` +
          `<span style="color:${props.severity === 'heavy' ? '#e74c3c' : props.severity === 'moderate' ? '#f39c12' : '#999'};">` +
          `Severity: ${props.severity || 'unknown'}</span>` +
          `</div>`
        )
        .addTo(this.map);
    });

    this.map.on('mouseenter', 'traffic-incidents-circle', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'traffic-incidents-circle', () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  clearTrafficIncidents() {
    if (!this.map) return;
    if (this.map.getLayer('traffic-incidents-label')) this.map.removeLayer('traffic-incidents-label');
    if (this.map.getLayer('traffic-incidents-circle')) this.map.removeLayer('traffic-incidents-circle');
    if (this.map.getSource('traffic-incidents')) this.map.removeSource('traffic-incidents');
  }

  // ===================== VOICE =====================

  speak(text) {
    _speak(text);
  }

  setVoiceMode(mode) {
    setPiperEnabled(mode === 'piper');
  }

  // ===================== COMPASS =====================

  setCompassBearing(heading) {
    this._compassBearing = heading;
    // If following, the bearing will be applied on the next GPS update via easeTo
  }

  clearCompassBearing() {
    this._compassBearing = null;
    if (this.map) {
      this.map.easeTo({ bearing: 0, pitch: 0, duration: 1000 });
    }
  }

  // ===================== READ-ONLY GETTERS =====================

  get isTracking() {
    return this._isTracking;
  }
  get isFollowing() {
    return this._isFollowing;
  }
  get speedMph() {
    return this._speedMph;
  }
  get accuracyM() {
    return this._accuracyM;
  }
  get activeStepIndex() {
    return this._activeStepIdx;
  }
  get routeData() {
    if (!this._routeCoords) return null;
    return {
      coordinates: this._routeCoords,
      maneuvers: this._maneuvers,
      summary: this._routeSummary,
    };
  }
  get currentPosition() {
    return this._currentPos;
  }
  get costing() {
    return this._costing;
  }
}
