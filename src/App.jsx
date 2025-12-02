import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';

// Import CSS for MapLibre and the Geocoder
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';

import './App.css'; // Ensure this file has basic map styles (see below)

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(-73.9857); // NYC coordinates
  const [lat] = useState(40.7486);
  const [zoom] = useState(12);

  useEffect(() => {
    if (map.current) return; // Initialize map only once

    // 1. Initialize the Map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      // Free vector tiles style (no API key needed for dev)
      style: 'https://demotiles.maplibre.org/style.json',
      center: [lng, lat],
      zoom: zoom,
    });

    // 2. Define the Custom Geocoder API Call
    const customGeocoderApi = {
      forwardGeocode: async (config) => {
        const features = [];
        try {
          // Pointing to YOUR local Pelias API
          const request = `http://localhost:3100/v1/search?text=${config.query}&size=10`;
          const response = await fetch(request);
          const geojson = await response.json();

          // Map Pelias GeoJSON to MapLibre Geocoder format
          for (const feature of geojson.features) {
            const center = feature.geometry.coordinates;
            const point = {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: center },
              place_name: feature.properties.label, // The nice label Pelias generates
              properties: feature.properties,
              text: feature.properties.name,
              place_type: [feature.properties.layer],
              center: center,
            };
            features.push(point);
          }
        } catch (e) {
          console.error("Failed to fetch results:", e);
        }
        return { features };
      },
    };

    // 3. Add the Geocoder Control
    const geocoder = new MaplibreGeocoder(customGeocoderApi, {
      maplibregl: maplibregl,
      showResultMarkers: true,
      limit: 10,
      placeholder: 'Search your Pelias...',
      // Optional: collapsed: true (to hide until clicked)
    });

    map.current.addControl(geocoder, 'top-left');

    // Add navigation controls (zoom +/-)
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

  }, [lng, lat, zoom]);

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
    </div>
  );
}

export default App;
