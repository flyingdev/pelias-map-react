import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../App.css';

import { isMobile } from '../utils/mobile';

import { useMap } from '../hooks/useMap';
import { useGeolocation } from '../hooks/useGeolocation';
import { useGpsTracking } from '../hooks/useGpsTracking';
import { useReverseGeocode } from '../hooks/useReverseGeocode';
import { useMapCommands } from '../hooks/useMapCommands';
import { useWakeLock } from '../hooks/useWakeLock';
import { useCompass } from '../hooks/useCompass';
import { useFavorites } from '../hooks/useFavorites';
import { ActionIcon } from '@mantine/core';
import { IconCompass } from '@tabler/icons-react';

import SearchBar from './SearchBar';
import InstructionsBox from './InstructionsBox';
import Toggle3DButton from './Toggle3DButton';
import ModeSelector from './ModeSelector';
import MobileNavBar from './MobileNavBar';
import DirectionsPanel from './DirectionsPanel';
import RecenterButton from './RecenterButton';
import Speedometer from './Speedometer';
import SpeedLimitSign from './SpeedLimitSign';
import HighwaySign from './HighwaySign';
import IsochronePanel from './IsochronePanel';
import SamChat from './SamChat';
import SamCards from './SamCards';

export default function ScisboMap({
  initialCenter,
  mode = 'auto',
  voiceMode = 'piper',
}) {
  const mapContainerRef = useRef(null);

  // Build opts once — only used on initial mount
  const mapOpts = useMemo(
    () => ({
      ...(initialCenter && { center: initialCenter }),
      costing: mode,
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps -- mount-only
  );

  const mcRef = useMap(mapContainerRef, mapOpts);

  // Wire voiceMode to controller
  useEffect(() => {
    mcRef.current?.setVoiceMode(voiceMode);
  }, [mcRef, voiceMode]);

  // Isochrone config
  const ISO_CONTOURS = [5, 10]; // minutes

  // React-level UI state
  const [routeData, setRouteData] = useState(null);
  const [searchDestination, setSearchDestination] = useState(null);
  const [activeCosting, setActiveCosting] = useState(mode);
  const [isochroneEnabled, setIsochroneEnabled] = useState(false);

  // Hooks (all take mcRef now)
  const userLocation = useGeolocation(mcRef);
  const {
    speedMph,
    accuracyM,
    isTracking,
    isFollowing,
    activeStepIndex,
    stopTracking,
    recenter,
  } = useGpsTracking(mcRef);

  // Subscribe to route events for React state
  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;
    return mc.on('route', (data) => setRouteData(data));
  }, [mcRef]);

  // Show routing errors to the user
  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;
    return mc.on('error', ({ type, message }) => {
      if (type === 'routing') alert(`Routing failed: ${message}`);
    });
  }, [mcRef]);

  // Load traffic incidents on map ready
  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;
    mc.ready().then(() => mc.fetchTrafficIncidents());
  }, [mcRef]);

  // Reset isochrone toggle when controller clears the layer
  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;
    return mc.on('isochroneCleared', () => setIsochroneEnabled(false));
  }, [mcRef]);

  // --- getRoute (delegates to MapController) ---
  const getRoute = useCallback(
    async (start, end, endLabel) => {
      const mc = mcRef.current;
      if (!mc) return;
      mc.placeRouteMarkers(start, end, endLabel);
      await mc.setRoute(start, end);
    },
    [mcRef]
  );

  // --- Mode change → reroute ---
  const handleModeChange = useCallback(
    (newMode) => {
      setActiveCosting(newMode);
      mcRef.current?.reroute(newMode);
    },
    [mcRef]
  );

  // --- resetRoute ---
  const resetRoute = useCallback(() => {
    mcRef.current?.resetRoute();
    setSearchDestination(null);
  }, [mcRef]);

  // --- Search selection ---
  const handleSearchSelect = useCallback(
    (feature) => {
      const mc = mcRef.current;
      if (!mc) return;

      const coords = feature.geometry.coordinates;
      const label = feature.properties.label;

      mc.placeSearchMarker(coords, label, () => navigateToSearchPin());
      setSearchDestination({ lngLat: { lng: coords[0], lat: coords[1] }, label });
    },
    [mcRef]
  );

  // --- Navigate to search pin ---
  const navigateToSearchPin = useCallback(() => {
    const mc = mcRef.current;
    if (!mc) return;

    const dest = mc.getSearchMarkerLngLat();
    if (!dest) {
      alert('No destination selected. Please search for a place first.');
      return;
    }
    if (!userLocation) {
      alert(
        'Your location is not available yet. Please allow location access and try again.'
      );
      return;
    }

    const start = { lat: userLocation.lat, lng: userLocation.lng };
    const endLabel = searchDestination?.label || 'Destination';

    mc.resetRoute();
    setSearchDestination(null);

    mc.placeRouteMarkers(start, { lat: dest.lat, lng: dest.lng }, endLabel);
    mc.setRoute(start, { lat: dest.lat, lng: dest.lng });
  }, [mcRef, userLocation, searchDestination]);

  // --- Clear mobile nav ---
  const clearMobileNav = useCallback(() => {
    mcRef.current?.removeSearchMarker();
    setSearchDestination(null);
  }, [mcRef]);

  // --- Desktop click-to-route ---
  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;
    mc.enableClickToRoute();
    return () => mc._removeClickToRouteListener();
  }, [mcRef]);

  // --- Reverse geocode ---
  const handleReverseNavigate = useCallback(
    (lon, lat) => {
      if (!userLocation) {
        alert('Waiting for GPS lock... try again in a moment.');
        return;
      }
      const mc = mcRef.current;
      if (!mc) return;
      mc.placeRouteMarkers(
        { lat: userLocation.lat, lng: userLocation.lng },
        { lat, lng: lon }
      );
      mc.setRoute(
        { lat: userLocation.lat, lng: userLocation.lng },
        { lat, lng: lon }
      );
    },
    [mcRef, userLocation]
  );

  useReverseGeocode(mcRef, handleReverseNavigate);
  useWakeLock(isTracking);
  const { heading, isCompassActive, toggleCompass } = useCompass();
  const { favorites, addFavorite, removeFavorite } = useFavorites();
  useMapCommands(mcRef, userLocation, heading, isTracking, addFavorite);

  // Feed compass heading into MapController (applied inside easeTo, not separately)
  useEffect(() => {
    const mc = mcRef.current;
    if (!mc) return;
    if (isCompassActive && isFollowing) {
      mc.setCompassBearing(heading);
    }
  }, [heading, isCompassActive, isFollowing, mcRef]);

  // Reset compass when deactivated
  useEffect(() => {
    const mc = mcRef.current;
    if (!isCompassActive && mc) {
      mc.clearCompassBearing();
    }
  }, [isCompassActive, mcRef]);

  // Derive speed limit and highway sign from current maneuver
  const activeManeuver = routeData?.maneuvers?.[activeStepIndex] || null;

  const currentSpeedLimit = useMemo(() => {
    if (!activeManeuver?.speed_limit) return null;
    const rawMph = activeManeuver.speed_limit * 0.621371;
    return Math.round(rawMph / 5) * 5; // snap to nearest 5 MPH
  }, [activeManeuver]);

  const activeSign = activeManeuver?.sign || null;

  return (
    <div className="map-wrap">
      <div ref={mapContainerRef} className="map" />

      <div className="top-left-stack">
        <div className="top-row">
          <SearchBar onSelect={handleSearchSelect} />
          <Toggle3DButton mcRef={mcRef} />
        </div>
        {routeData && (
          <ModeSelector activeMode={activeCosting} onChange={handleModeChange} />
        )}
      </div>

      {!isMobile && <InstructionsBox onReset={resetRoute} />}

      <MobileNavBar
        destination={searchDestination}
        onNavigate={navigateToSearchPin}
        onClear={clearMobileNav}
      />

      {routeData && (
        <DirectionsPanel
          maneuvers={routeData.maneuvers}
          activeIndex={activeStepIndex}
          summary={routeData.summary}
        />
      )}

      <IsochronePanel
        mcRef={mcRef}
        userLocation={userLocation}
        activeCosting={activeCosting}
        contours={ISO_CONTOURS}
        enabled={isochroneEnabled}
        onEnabledChange={setIsochroneEnabled}
      />

      {/* Highway sign — top center, pushed below search bar */}
      <HighwaySign signData={activeSign} />

      {/* Telemetry dashboard — speedometer + speed limit grouped side-by-side */}
      {isTracking && (
        <div style={{
          position: 'absolute',
          bottom: routeData ? 'calc(42vh + 20px)' : 40,
          left: 16,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          transition: 'bottom 0.3s ease-in-out',
        }}>
          <Speedometer speed={speedMph} accuracy={accuracyM} visible={isTracking} />
          <SpeedLimitSign limit={currentSpeedLimit} />
        </div>
      )}

      {/* Action buttons — right side, stacked vertically */}
      <div style={{
        position: 'absolute',
        bottom: routeData ? 'calc(42vh + 20px)' : 40,
        right: 16,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'bottom 0.3s ease-in-out',
      }}>
        {isTracking && (
          <ActionIcon
            onClick={toggleCompass}
            variant={isCompassActive ? 'filled' : 'light'}
            color={isCompassActive ? 'red' : 'blue'}
            size="xl"
            radius="xl"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
            aria-label="Toggle compass"
          >
            <IconCompass size={24} />
          </ActionIcon>
        )}
        <RecenterButton
          visible={!isFollowing && isTracking}
          onRecenter={recenter}
        />
      </div>

      <SamChat userLocation={userLocation} favorites={favorites} onRemoveFavorite={removeFavorite} />
      <SamCards />
    </div>
  );
}
