export const CONFIG = {
  tiles: '/styles/basic-preview/style.json',
  pelias: '/v1',
  valhalla: '/route',
  isochrone: '/isochrone',
  wsEndpoint: '/ws-endpoint',           // STOMP handshake path
  wsCommandsTopic: '/topic/map-commands', // STOMP topic Sam broadcasts on
  wsEnabled: false,                    // set true when Sam backend is running
};
