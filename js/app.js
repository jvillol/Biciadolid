/**
 * Biciadolid - Aplicación Principal y Orquestador de Eventos
 * Vinculación de listeners del DOM, inicialización del ciclo de vida y arranque.
 */

document.addEventListener('DOMContentLoaded', () => {

    // Cambiar mapa base desde la pestaña
    document.querySelectorAll('.basemap-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setBasemap(btn.dataset.basemap, true);
      });
    });

    // Botón flotante para alternar rápidamente entre Google Maps Callejero, Satélite y OSM
    document.getElementById('quickBasemapToggleBtn')?.addEventListener('click', () => {
      const nextKey = currentBasemapKey === 'google' ? 'google_sat' : (currentBasemapKey === 'google_sat' ? 'osm' : 'google');
      setBasemap(nextKey, true);
    });

    // Navegación por pestañas
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetId)?.classList.add('active');
      });
    });

    // Control de plegado del panel superior
    const topPanel = document.getElementById('topPanel');
    const togglePanelText = document.getElementById('togglePanelText');
    const togglePanelIcon = document.getElementById('togglePanelIcon');

    function toggleTopPanel() {
      const isCollapsed = topPanel.classList.toggle('collapsed');
      if (togglePanelText) togglePanelText.textContent = isCollapsed ? 'Expandir' : 'Plegar';
      if (togglePanelIcon) togglePanelIcon.textContent = isCollapsed ? '▼' : '▲';
    }

    document.getElementById('panelHeader')?.addEventListener('click', (e) => {
      if (e.target.closest('#topPanelToggleBtn')) return;
      toggleTopPanel();
    });
    document.getElementById('topPanelToggleBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTopPanel();
    });


    // Gestión del Modal de API Key ORS
    document.getElementById('toggleOrsInputBtn')?.addEventListener('click', () => {
      const modal = document.getElementById('apiKeyModal');
      const backdrop = document.getElementById('apiKeyBackdrop');
      const input = document.getElementById('customApiKeyInput');
      if (input) input.value = state.customApiKey;
      if (modal) modal.classList.add('active');
      if (backdrop) backdrop.classList.add('active');
    });

    function closeApiKeyModal() {
      document.getElementById('apiKeyModal')?.classList.remove('active');
      document.getElementById('apiKeyBackdrop')?.classList.remove('active');
    }

    document.getElementById('closeApiKeyModalBtn')?.addEventListener('click', closeApiKeyModal);
    document.getElementById('apiKeyBackdrop')?.addEventListener('click', closeApiKeyModal);

    document.getElementById('saveApiKeyBtn')?.addEventListener('click', () => {
      const input = document.getElementById('customApiKeyInput');
      const val = input ? input.value.trim() : '';
      if (val) {
        localStorage.setItem('biciadolid_ors_key', val);
        state.customApiKey = val;
        showToast('API Key personalizada guardada con éxito.', 'success', 3000);
      } else {
        localStorage.removeItem('biciadolid_ors_key');
        state.customApiKey = '';
        showToast('API Key eliminada. Se usará el enrutador libre por defecto.', 'info', 3000);
      }
      updateApiKeyUI();
      closeApiKeyModal();
    });

    document.getElementById('clearApiKeyBtn')?.addEventListener('click', () => {
      localStorage.removeItem('biciadolid_ors_key');
      state.customApiKey = '';
      const input = document.getElementById('customApiKeyInput');
      if (input) input.value = '';
      updateApiKeyUI();
      showToast('API Key borrada.', 'info', 2500);
      closeApiKeyModal();
    });


    // Interruptores de capas GIS
    document.getElementById('gisavaCyclewayToggle')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!state.gisavaCyclewaysLoaded) {
          loadGisavaOfficialCycleways();
        } else {
          map.addLayer(state.gisavaCyclewaysLayer);
          showToast('Red oficial GISAVA activada.', 'info', 2200);
        }
      } else {
        map.removeLayer(state.gisavaCyclewaysLayer);
        showToast('Red oficial GISAVA ocultada.', 'info', 2000);
      }
    });

    document.getElementById('bikiToggle')?.addEventListener('change', (e) => {
      toggleBikiLayer(e.target.checked);
    });

    document.getElementById('parkibiciToggle')?.addEventListener('change', (e) => {
      toggleParkibiciLayer(e.target.checked);
    });

    document.getElementById('aparcabicisToggle')?.addEventListener('change', (e) => {
      toggleAparcabicisLayer(e.target.checked);
    });

    document.getElementById('geocylProjectedToggle')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!state.geocylProjectedLoaded) {
          state.geocylProjectedLayer.clearLayers();
          GEOCYL_PROJECTED_LINES.forEach((line) => {
            const poly = L.polyline(line.coords, {
              color: '#f59e0b',
              weight: 4,
              opacity: 0.9,
              dashArray: '6, 6'
            }).addTo(state.geocylProjectedLayer);
            poly.bindPopup(`<b>Tramo Proyectado GEOCyL</b><br>${line.name}<br><i>Estudio de Movilidad Ciclista</i>`);
          });
          state.geocylProjectedLoaded = true;
        }
        map.addLayer(state.geocylProjectedLayer);
        showToast('Red Ciclista Proyectada activada (17 tramos clave).', 'info', 3000);
      } else {
        map.removeLayer(state.geocylProjectedLayer);
        showToast('Red Proyectada ocultada.', 'info', 2000);
      }
    });

    const cyclewayToggle = document.getElementById('cyclewayToggle');
    if (cyclewayToggle) {
      cyclewayToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          fetchAndRenderCycleways();
        } else {
          map.removeLayer(state.cyclewaysLayerGroup);
          showToast('Capa Overpass OSM ocultada.', 'info', 2000);
        }
      });
    }

    const prohibitedToggle = document.getElementById('prohibitedZonesToggle');
    if (prohibitedToggle) {
      prohibitedToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          map.addLayer(state.prohibitedZonesLayer);
          showToast('Capa de Zonas y Túneles Prohibidos activada.', 'info', 2200);
        } else {
          map.removeLayer(state.prohibitedZonesLayer);
          showToast('Capa de Zonas Prohibidas ocultada.', 'info', 2000);
        }
      });
    }


    // Intercambio de puntos Origen <-> Destino
    document.getElementById('swapPointsBtn')?.addEventListener('click', () => {
      const tempOrigin = state.origin ? { ...state.origin } : null;
      const tempDest = state.destination ? { ...state.destination } : null;

      if (tempDest) {
        setOriginPoint(tempDest.lat, tempDest.lon, tempDest.label);
      } else {
        state.origin = null;
        if (state.originMarker) {
          map.removeLayer(state.originMarker);
          state.originMarker = null;
        }
        const oInp = document.getElementById('originInput');
        if (oInp) oInp.value = '';
      }

      if (tempOrigin) {
        setDestinationPoint(tempOrigin.lat, tempOrigin.lon, tempOrigin.label);
      } else {
        state.destination = null;
        if (state.destMarker) {
          map.removeLayer(state.destMarker);
          state.destMarker = null;
        }
        const dInp = document.getElementById('destInput');
        if (dInp) dInp.value = '';
      }

      showToast('Puntos de Origen y Destino invertidos.', 'info', 1800);
    });

    // Botones de selección en el mapa
    const pickOriginBtn = document.getElementById('pickOriginBtn');
    const pickDestBtn = document.getElementById('pickDestBtn');
    const cancelMapPickBtn = document.getElementById('cancelMapPickBtn');

    pickOriginBtn?.addEventListener('click', () => updatePickModeUI('origin'));
    pickDestBtn?.addEventListener('click', () => updatePickModeUI('dest'));
    cancelMapPickBtn?.addEventListener('click', () => updatePickModeUI('none'));

    // Botón GPS: Ubicación actual del usuario
    const gpsBtn = document.getElementById('gpsOriginBtn');
    gpsBtn?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Tu navegador no soporta geolocalización GPS.', 'error');
        return;
      }
      gpsBtn.disabled = true;
      showToast('Obteniendo posición GPS precisa...', 'info', 2500);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsBtn.disabled = false;
          const { latitude, longitude, accuracy } = pos.coords;
          setOriginPoint(latitude, longitude, 'Mi ubicación actual (GPS)');
          showToast(`Ubicación GPS fijada (Precisión ±${Math.round(accuracy)}m).`, 'success');
        },
        (err) => {
          gpsBtn.disabled = false;
          let msg = 'No se pudo obtener la posición GPS.';
          if (err.code === 1) msg = 'Permiso de geolocalización denegado en el navegador.';
          else if (err.code === 2) msg = 'Posición GPS no disponible actualmente.';
          else if (err.code === 3) msg = 'Tiempo de espera GPS agotado.';
          showToast(msg, 'error', 4500);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
      );
    });

    // Inicializar autocompletado en los campos de búsqueda
    setupAutocomplete('originInput', 'originSuggestions', setOriginPoint);
    setupAutocomplete('destInput', 'destSuggestions', setDestinationPoint);


    // Gestión del Drawer para guardar Favoritos
    document.getElementById('favQuickChip')?.addEventListener('click', () => {
      openSavePlaceDrawer();
    });

    function closeSavePlaceDrawer() {
      document.getElementById('savePlaceDrawer')?.classList.remove('active');
      document.getElementById('savePlaceBackdrop')?.classList.remove('active');
      state.pendingFavCoords = null;
    }

    document.getElementById('closeSavePlaceBtn')?.addEventListener('click', closeSavePlaceDrawer);
    document.getElementById('savePlaceBackdrop')?.addEventListener('click', closeSavePlaceDrawer);

    // Selección de iconos en el Drawer
    document.querySelectorAll('.icon-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.icon-choice-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Guardar nuevo sitio favorito
    document.getElementById('submitSavePlaceBtn')?.addEventListener('click', async () => {
      const nameVal = document.getElementById('savePlaceNameInput')?.value.trim();
      const addrVal = document.getElementById('savePlaceAddrInput')?.value.trim();
      const activeIconBtn = document.querySelector('.icon-choice-btn.active');
      const iconVal = activeIconBtn ? activeIconBtn.dataset.icon : '📍';

      if (!nameVal) {
        showToast('Por favor, indica un nombre para el sitio (ej. Gimnasio, Facultad...)', 'warning');
        return;
      }

      let targetLat = null;
      let targetLon = null;
      let targetAddress = addrVal || '';

      if (state.pendingFavCoords) {
        targetLat = state.pendingFavCoords.lat;
        targetLon = state.pendingFavCoords.lon;
      } else if (addrVal) {
        showToast('Localizando dirección en Valladolid...', 'info', 2000);
        const geo = await geocodeStreetInValladolid(addrVal);
        if (geo) {
          targetLat = geo.lat;
          targetLon = geo.lon;
          targetAddress = geo.label;
        } else {
          showToast('No se encontró esa dirección en Valladolid. Intenta seleccionarlo en el mapa.', 'error', 3800);
          return;
        }
      } else if (state.origin) {
        targetLat = state.origin.lat;
        targetLon = state.origin.lon;
        targetAddress = state.origin.label;
      } else {
        showToast('Escribe una calle o haz clic en el mapa para marcar el sitio.', 'warning', 3500);
        return;
      }

      const places = getSavedPlaces();
      const existingIdx = places.findIndex((p) => p.name.toLowerCase() === nameVal.toLowerCase());
      const newEntry = {
        name: nameVal,
        address: targetAddress,
        icon: iconVal,
        lat: targetLat,
        lon: targetLon
      };

      if (existingIdx >= 0) {
        places[existingIdx] = newEntry;
      } else {
        places.push(newEntry);
      }

      savePlacesToStorage(places);
      renderSavedPlacesUI();
      renderSavedPlacesMarkers();
      closeSavePlaceDrawer();
      showToast(`Sitio guardado: "${nameVal}" (${targetAddress.split(',')[0]})`, 'success', 3500);
    });


    // Selector de tipo de vehículo
    document.getElementById('btnVehicleScooter')?.addEventListener('click', () => setVehicleType('scooter'));
    document.getElementById('btnVehicleBicycle')?.addEventListener('click', () => setVehicleType('bicycle'));

    // Selector de modo de ruta
    document.getElementById('btnModeSafe')?.addEventListener('click', () => setRouteMode('safe'));
    document.getElementById('btnModeCiclo30')?.addEventListener('click', () => setRouteMode('ciclo30'));
    document.getElementById('btnModeFast')?.addEventListener('click', () => setRouteMode('fast'));

    // Botón de cálculo de ruta y atajo tecla Enter
    document.getElementById('calcRouteBtn')?.addEventListener('click', calculateRoute);

    ['originInput', 'destInput'].forEach((id) => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          calculateRoute();
        }
      });
    });

    // Plegado de la leyenda detallada
    const legendHeader = document.getElementById('legendHeader');
    const legendDetailsPanel = document.getElementById('legendDetailsPanel');
    const legendToggleText = document.getElementById('legendToggleText');

    if (legendHeader && legendDetailsPanel) {
      legendHeader.addEventListener('click', () => {
        const isVisible = legendDetailsPanel.style.display !== 'none';
        legendDetailsPanel.style.display = isVisible ? 'none' : 'block';
        if (legendToggleText) {
          legendToggleText.textContent = isVisible ? 'Ver detalles ▼' : 'Ocultar ▲';
        }
      });
    }


    // Recentrar mapa si el usuario se desplaza durante la navegación
    map.on('dragstart', () => {
      if (state.navActive) {
        state.navFollowUser = false;
        document.getElementById('recenterNavBtn')?.classList.add('visible');
      }
    });

    document.getElementById('recenterNavBtn')?.addEventListener('click', () => {
      state.navFollowUser = true;
      document.getElementById('recenterNavBtn')?.classList.remove('visible');
      if (state.navLastLatLng) {
        map.setView([state.navLastLatLng.lat, state.navLastLatLng.lon], 17, { animate: true });
      } else if (state.origin) {
        map.setView([state.origin.lat, state.origin.lon], 17, { animate: true });
      }
    });

    // Control de apertura y cierre del Drawer de Itinerario
    document.getElementById('navHudMainClickable')?.addEventListener('click', openManeuversDrawer);
    document.getElementById('navHudStepsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openManeuversDrawer();
    });
    document.getElementById('openManeuversDrawerBtn')?.addEventListener('click', openManeuversDrawer);
    document.getElementById('closeManeuversDrawerBtn')?.addEventListener('click', closeManeuversDrawer);
    document.getElementById('maneuversBackdrop')?.addEventListener('click', closeManeuversDrawer);

    // Activar o silenciar síntesis y alertas por voz
    document.getElementById('navVoiceToggleBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.navVoiceEnabled = !state.navVoiceEnabled;
      const btn = document.getElementById('navVoiceToggleBtn');
      if (btn) {
        btn.textContent = state.navVoiceEnabled ? '🔊' : '🔇';
        btn.classList.toggle('muted', !state.navVoiceEnabled);
      }
      if (!state.navVoiceEnabled && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
      showToast(state.navVoiceEnabled ? '🔊 Indicaciones por voz activadas' : '🔇 Indicaciones por voz silenciadas', 'info', 2000);
    });

    document.getElementById('startLiveNavBtn')?.addEventListener('click', startLiveNavigation);
    document.getElementById('stopLiveNavBtn')?.addEventListener('click', () => stopLiveNavigation(true));


    // Asegurar renderizado completo de teselas en móvil y cambio de orientación
    window.addEventListener('resize', () => map.invalidateSize());
    window.addEventListener('orientationchange', () => setTimeout(() => map.invalidateSize(), 200));
    setTimeout(() => map.invalidateSize(), 250);

    // Inicialización al arrancar la SPA
    updateApiKeyUI();
    updateCalcButtonLabel(state.routeMode);
    renderSavedPlacesUI();
    buildPresetRoutesCatalog();
    loadGisavaOfficialCycleways();
    loadProhibitedZonesLayer();

});
