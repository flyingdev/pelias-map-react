import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Client } from '@stomp/stompjs';
import { CONFIG } from '../config';

// Geocode a free-text query via Pelias /search, return { lat, lng, label } or null
async function geocodePlace(query, peliasUrl) {
  try {
    const res = await fetch(
      `${peliasUrl}/search?text=${encodeURIComponent(query)}&size=1`
    );
    const data = await res.json();
    const f = data?.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { lat, lng, label: f.properties.label };
  } catch {
    return null;
  }
}

// Build an absolute ws:// or wss:// URL from a relative path
function buildWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

/**
 * Subscribes to CONFIG.wsCommandsTopic via STOMP and dispatches typed map
 * commands to the MapController (mcRef.current).
 *
 * Spring config: @EnableWebSocketMessageBroker + /ws-endpoint handshake
 * Sam broadcasts to: /topic/map-commands
 *
 * Supported command types:
 *   ISOCHRONE        { locationQuery?, minutes?, mode? }
 *   CLEAR_ISOCHRONE  {}
 *   ROUTE_TO         { locationQuery }
 *   RECENTER         {}
 *   SHOW_PLACES      { payload: [{ name, lat, lng, address }] }
 */
export function useMapCommands(mcRef, userLocation) {
  // Keep a stable ref to the latest userLocation so the STOMP effect never
  // needs to restart every time GPS updates.
  const userLocationRef = useRef(userLocation);
  const poiMarkersRef = useRef([]);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    if (!CONFIG.wsEnabled) return; // Sam backend not deployed yet — skip silently

    async function dispatch(cmd) {
      const mc = mcRef.current;
      if (!mc) return;

      switch (cmd.type) {
        case 'ISOCHRONE': {
          // If Sam gave a place name, geocode it; otherwise use current GPS position
          let center = userLocationRef.current;
          if (cmd.locationQuery) {
            center = await geocodePlace(cmd.locationQuery, mc._peliasUrl);
            if (!center) {
              console.warn('[useMapCommands] ISOCHRONE: could not geocode', cmd.locationQuery);
              return;
            }
          }
          if (!center) {
            console.warn('[useMapCommands] ISOCHRONE: no location available');
            return;
          }
          await mc.fetchIsochrone(center, {
            contours: cmd.minutes || [5, 10],
            costing: cmd.mode || mc.costing,
          });
          break;
        }

        case 'CLEAR_ISOCHRONE':
          mc.clearIsochrone();
          break;

        case 'ROUTE_TO': {
          const start = userLocationRef.current;
          if (!start) {
            console.warn('[useMapCommands] ROUTE_TO: waiting for GPS lock');
            return;
          }
          if (!cmd.locationQuery) {
            console.warn('[useMapCommands] ROUTE_TO: missing locationQuery');
            return;
          }
          const dest = await geocodePlace(cmd.locationQuery, mc._peliasUrl);
          if (!dest) {
            console.warn('[useMapCommands] ROUTE_TO: could not geocode', cmd.locationQuery);
            return;
          }
          mc.placeRouteMarkers(start, dest, dest.label);
          await mc.setRoute(start, dest, undefined, { silent: true });
          break;
        }

        case 'RECENTER':
          mc.recenter();
          break;

        case 'SHOW_PLACES': {
          const places = cmd.payload || [];

          // Clear previous POI markers
          poiMarkersRef.current.forEach((m) => m.remove());
          poiMarkersRef.current = [];

          if (!places.length) break;

          const bounds = new maplibregl.LngLatBounds();

          places.forEach((place) => {
            // Build interactive popup with Navigate Here button
            const container = document.createElement('div');
            container.style.textAlign = 'center';
            container.style.fontFamily = 'system-ui, sans-serif';
            container.innerHTML = `
              <strong style="font-size:14px;color:#333;">${place.name}</strong><br/>
              <div style="font-size:11px;color:#868e96;margin-bottom:8px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${place.address}
              </div>
              <button class="poi-nav-btn" style="
                background:#228be6;color:white;border:none;padding:6px 12px;
                border-radius:20px;font-weight:600;font-size:12px;cursor:pointer;
                width:100%;box-shadow:0 2px 4px rgba(0,0,0,0.1);
              ">Navigate Here</button>
            `;

            const navBtn = container.querySelector('.poi-nav-btn');
            navBtn.addEventListener('click', () => {
              const start = userLocationRef.current;
              if (!start) {
                console.warn('[useMapCommands] SHOW_PLACES navigate: no GPS');
                return;
              }
              const dest = { lat: place.lat, lng: place.lng };
              mc.placeRouteMarkers(start, dest, place.name);
              mc.setRoute(start, dest);
              // Clear POI markers after selecting one
              poiMarkersRef.current.forEach((m) => m.remove());
              poiMarkersRef.current = [];
            });

            const popup = new maplibregl.Popup({ offset: 25, closeButton: false })
              .setDOMContent(container);

            const marker = new maplibregl.Marker({ color: '#228be6' })
              .setLngLat([place.lng, place.lat])
              .setPopup(popup)
              .addTo(mc.map);

            poiMarkersRef.current.push(marker);
            bounds.extend([place.lng, place.lat]);
          });

          mc.map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 1200 });
          console.info('[useMapCommands] SHOW_PLACES:', places.length, 'markers');
          break;
        }

        default:
          console.warn('[useMapCommands] Unknown command type:', cmd.type);
      }
    }

    const client = new Client({
      brokerURL: buildWsUrl(CONFIG.wsEndpoint),
      reconnectDelay: 5000, // @stomp/stompjs handles reconnect automatically

      onConnect: () => {
        console.info('[useMapCommands] STOMP connected →', CONFIG.wsCommandsTopic);
        client.subscribe(CONFIG.wsCommandsTopic, (message) => {
          let cmd;
          try {
            cmd = JSON.parse(message.body);
          } catch {
            console.warn('[useMapCommands] Received non-JSON STOMP message');
            return;
          }
          dispatch(cmd).catch(console.error);
        });
      },

      onDisconnect: () => {
        console.info('[useMapCommands] STOMP disconnected — will retry in 5 s');
      },

      onStompError: (frame) => {
        console.error('[useMapCommands] STOMP error:', frame.headers?.message);
      },
    });

    client.activate();

    return () => {
      client.deactivate();
    };
  }, [mcRef]); // only re-run if mcRef identity changes (effectively mount-only)
}
