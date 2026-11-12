/**
 * Biciadolid - Módulo Cartográfico Principal (Leaflet.js)
 * Inicialización del mapa, selector de mapas base, marcadores y selección sobre el mapa.
 */

const map = L.map('map', {
      zoomControl: false
    }).setView(VALLADOLID_CENTER, VALLADOLID_ZOOM);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

let currentBasemapKey = 'google';

function setBasemap(key, showToastMsg = true) {
      const cfg = BASEMAPS[key];
      if (!cfg) return;

      if (state.baseTileLayer) {
        map.removeLayer(state.baseTileLayer);
      }

      state.baseTileLayer = L.tileLayer(cfg.url, cfg.options).addTo(map);
      state.baseTileLayer.bringToBack();
      currentBasemapKey = key;

      // Actualizar botón flotante de acceso directo
      const quickBtn = document.getElementById('quickBasemapIcon');
      if (quickBtn) {
        quickBtn.textContent = cfg.icon;
      }

      // Actualizar botones de la pestaña de capas
      document.querySelectorAll('.basemap-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.basemap === key);
      });

      if (showToastMsg) {
        showToast(`Mapa de fondo cambiado: ${cfg.name}`, 'info', 2200);
      }
    }

// Inicializar mapa con Google Maps por defecto
setBasemap('google', false);

// Grupos de capas ordenados
    state.gisavaCyclewaysLayer = L.layerGroup().addTo(map);
    state.prohibitedZonesLayer = L.layerGroup().addTo(map);
    state.cyclewaysLayerGroup = L.layerGroup();
    state.geocylProjectedLayer = L.layerGroup();
    state.geocylRouteOverlay = L.layerGroup().addTo(map);
    state.aparcabicisLayer = L.layerGroup();
    state.parkibiciLayer = L.layerGroup();
    state.bikiLayer = L.layerGroup();
    state.savedPlacesLayer = L.layerGroup().addTo(map);
    state.routeLayerGroup = L.layerGroup().addTo(map);

function createMarkerIcon(type) {
      const isOrigin = type === 'origin';
      return L.divIcon({
        className: '',
        html: `<div class="custom-marker ${isOrigin ? 'marker-origin' : 'marker-dest'}">${isOrigin ? 'A' : 'B'}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
    }

function setOriginPoint(lat, lon, label = '') {
      state.origin = { lat: Number(lat), lon: Number(lon), label };

      if (state.originMarker) {
        state.originMarker.setLatLng([lat, lon]);
      } else {
        state.originMarker = L.marker([lat, lon], {
          icon: createMarkerIcon('origin'),
          draggable: true
        }).addTo(map);

        state.originMarker.on('dragend', (ev) => {
          const pos = ev.target.getLatLng();
          setOriginPoint(pos.lat, pos.lng, `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
        });
      }

      document.getElementById('originCoordsLabel').textContent = `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
      if (label) {
        document.getElementById('originInput').value = label;
      }
    }

function setDestinationPoint(lat, lon, label = '') {
      state.destination = { lat: Number(lat), lon: Number(lon), label };

      if (state.destMarker) {
        state.destMarker.setLatLng([lat, lon]);
      } else {
        state.destMarker = L.marker([lat, lon], {
          icon: createMarkerIcon('dest'),
          draggable: true
        }).addTo(map);

        state.destMarker.on('dragend', (ev) => {
          const pos = ev.target.getLatLng();
          setDestinationPoint(pos.lat, pos.lng, `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
        });
      }

      document.getElementById('destCoordsLabel').textContent = `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
      if (label) {
        document.getElementById('destInput').value = label;
      }
    }

function updatePickModeUI(mode) {
      state.pickMode = mode;
      pickOriginBtn.classList.toggle('active', mode === 'origin');
      pickDestBtn.classList.toggle('active', mode === 'destination');
      mapPickBanner.classList.add('visible');
      mapPickModeName.textContent = mode === 'origin' ? 'Origen (A)' : 'Destino (B)';
    }

// Evento de clic sobre el mapa para fijar origen, destino o añadir favorito
map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      const coordText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      const saveDrawer = document.getElementById('savePlaceDrawer');
      if (saveDrawer && saveDrawer.classList.contains('visible')) {
        state.pendingFavCoords = { lat, lon: lng, label: coordText };
        document.getElementById('favAddressInput').value = coordText;
        const hint = document.getElementById('favSourceHint');
        if (hint) {
          hint.textContent = `📍 Punto del mapa listo para guardar (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          hint.style.color = '#4ade80';
        }
      }

      if (!state.origin || state.pickMode === 'origin') {
        setOriginPoint(lat, lng, coordText);
        updatePickModeUI('destination');
        showToast('Origen fijado en el mapa. Ahora toca para fijar el Destino.', 'info', 2500);
      } else {
        setDestinationPoint(lat, lng, coordText);
        showToast('Destino fijado en el mapa.', 'info', 2200);
      }
    });
