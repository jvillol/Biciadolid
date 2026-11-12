/**
 * Biciadolid - Módulo de Lugares Guardados y Buscador GISAVA
 * Gestión de favoritos (Casa, Trabajo, Personalizados) con LocalStorage y
 * geocodificador inteligente oficial de Valladolid (GISAVA Buscador + Nominatim OSM).
 */


function getSavedPlaces() {
      try {
        const raw = localStorage.getItem(SAVED_PLACES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

function savePlacesToStorage(places) {
      try {
        localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(places));
      } catch (_) {}
    }

function renderSavedPlacesMarkers(places) {
      if (!state.savedPlacesLayer) return;
      state.savedPlacesLayer.clearLayers();

      places.forEach((p) => {
        const icon = L.divIcon({
          className: '',
          html: `<div class="poi-badge" style="background:#1e293b;border-color:#fde047;width:26px;height:26px;font-size:0.85rem;">${p.icon || '⭐'}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const safeLabel = `${p.icon || '⭐'} ${p.name} (${p.address || ''})`.replace(/'/g, "\\'");
        L.marker([p.lat, p.lon], { icon })
          .bindPopup(`
            <div style="font-size:0.8rem;min-width:185px;">
              <strong>${p.icon || '⭐'} ${p.name}</strong><br>
              <span style="color:#64748b;">📍 ${p.address || `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`}</span>
              <div class="popup-btn-group">
                <button class="popup-btn origin" onclick="setPointFromPopup('origin', ${p.lat}, ${p.lon}, '${safeLabel}')">Salir de aquí (A)</button>
                <button class="popup-btn dest" onclick="setPointFromPopup('dest', ${p.lat}, ${p.lon}, '${safeLabel}')">Ir aquí (B)</button>
              </div>
            </div>
          `)
          .addTo(state.savedPlacesLayer);
      });
    }

function renderSavedPlacesUI() {
      const container = document.getElementById('savedPlacesList');
      if (!container) return;

      const places = getSavedPlaces();
      renderSavedPlacesMarkers(places);
      container.innerHTML = '';

      // Asegurar que siempre aparezcan accesos directos para "Casa" y "Trabajo" aunque aún no estén configurados
      const defaultSlots = [
        { name: 'Casa', icon: '🏠' },
        { name: 'Trabajo', icon: '💼' }
      ];

      defaultSlots.forEach((slot) => {
        const existing = places.find((p) => p.name.toLowerCase() === slot.name.toLowerCase());
        if (!existing) {
          const emptyChip = document.createElement('div');
          emptyChip.className = 'saved-chip empty-slot';
          emptyChip.title = `Configurar ubicación exacta de ${slot.name}`;
          emptyChip.innerHTML = `<span>${slot.icon} ${slot.name} <small style="opacity:0.75;">(Guardar)</small></span>`;
          emptyChip.addEventListener('click', () => {
            openSavePlaceDrawer({
              name: slot.name,
              icon: slot.icon,
              sourcePoint: state.destination || state.origin || null
            });
          });
          container.appendChild(emptyChip);
        }
      });

      // Renderizar todos los sitios guardados
      places.forEach((p) => {
        const chip = document.createElement('div');
        chip.className = 'saved-chip';
        chip.title = `${p.name}: ${p.address} (Toca para ir como Destino, o pulsa A para Origen)`;
        chip.innerHTML = `
          <span class="saved-chip-main" data-role="dest">${p.icon || '⭐'} ${p.name}</span>
          <span class="saved-chip-act" data-role="origin" title="Usar como Punto de Origen (A)">A</span>
          <span class="saved-chip-del" data-role="delete" title="Borrar o cambiar ubicación">&times;</span>
        `;

        // Tocar el nombre -> Fijar como Destino (y si ya hay Origen, calcular ruta automáticamente)
        chip.querySelector('[data-role="dest"]').addEventListener('click', (e) => {
          e.stopPropagation();
          const fullLabel = `${p.icon || '⭐'} ${p.name} (${p.address})`;
          setDestinationPoint(p.lat, p.lon, fullLabel);
          map.setView([p.lat, p.lon], 15);
          if (state.origin) {
            calculateRoute();
          } else {
            showToast(`Destino fijado en ${p.icon || ''} ${p.name}. Selecciona tu Origen o pulsa GPS.`, 'success', 2600);
          }
        });

        // Tocar la "A" -> Fijar como Origen
        chip.querySelector('[data-role="origin"]').addEventListener('click', (e) => {
          e.stopPropagation();
          const fullLabel = `${p.icon || '⭐'} ${p.name} (${p.address})`;
          setOriginPoint(p.lat, p.lon, fullLabel);
          map.setView([p.lat, p.lon], 15);
          showToast(`Origen (A) fijado en ${p.icon || ''} ${p.name}.`, 'info', 2200);
          if (state.destination) {
            calculateRoute();
          }
        });

        // Tocar "×" -> Eliminar sitio guardado
        chip.querySelector('[data-role="delete"]').addEventListener('click', (e) => {
          e.stopPropagation();
          const updated = getSavedPlaces().filter((item) => item.id !== p.id);
          savePlacesToStorage(updated);
          renderSavedPlacesUI();
          showToast(`Sitio "${p.name}" eliminado. Puedes guardar una nueva ubicación.`, 'info', 2200);
        });

        container.appendChild(chip);
      });
    }

function openSavePlaceDrawer({ name = 'Casa', icon = '🏠', sourcePoint = null } = {}) {
      const drawer = document.getElementById('savePlaceDrawer');
      const nameInput = document.getElementById('favNameInput');
      const addrInput = document.getElementById('favAddressInput');
      const hint = document.getElementById('favSourceHint');

      drawer.classList.add('visible');
      nameInput.value = name;

      // Marcar icono activo
      document.querySelectorAll('#favIconPicker .icon-opt-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.icon === icon);
      });

      if (sourcePoint && typeof sourcePoint.lat === 'number') {
        state.pendingFavCoords = {
          lat: sourcePoint.lat,
          lon: sourcePoint.lon,
          label: sourcePoint.label || `${sourcePoint.lat.toFixed(5)}, ${sourcePoint.lon.toFixed(5)}`
        };
        addrInput.value = state.pendingFavCoords.label;
        hint.textContent = `📍 Coordenadas listas (${sourcePoint.lat.toFixed(4)}, ${sourcePoint.lon.toFixed(4)})`;
        hint.style.color = '#4ade80';
      } else {
        state.pendingFavCoords = null;
        addrInput.value = '';
        hint.textContent = 'Escribe la calle y nº, o selecciona primero en el mapa';
        hint.style.color = '#94a3b8';
        addrInput.focus();
      }
    }

async function searchGisavaOfficialSuggestions(queryText) {
      const raw = queryText.trim();
      if (raw.length < 2) return [];

      const items = [];

      // 0. Buscar primero en Mis Sitios Guardados (ej: "casa", "trabajo"...)
      const savedMatches = getSavedPlaces().filter(
        (p) =>
          p.name.toLowerCase().includes(raw.toLowerCase()) ||
          (p.address && p.address.toLowerCase().includes(raw.toLowerCase()))
      );
      savedMatches.forEach((p) => {
        items.push({
          label: `${p.icon || '⭐'} ${p.name} (${p.address})`,
          badge: '⭐ Guardado',
          lat: p.lat,
          lon: p.lon
        });
      });

      if (raw.length < 3) return items;

      // Limpiar números de portal y sufijos de barrio para buscar también en el callejero oficial GISAVA
      const streetPart = raw
        .split(',')[0]
        .replace(/\b(calle|avenida|avda|paseo|plaza|c\/|pza)\b/gi, '')
        .replace(/\b\d+[a-zA-Z]?\b/g, '')
        .trim();

      const cleanGisava = (streetPart.length >= 3 ? streetPart : raw)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/'/g, '');

      try {
        const whereStreets = encodeURIComponent(`UPPER(DESCNORMAL) LIKE '%${cleanGisava}%' OR UPPER(DESCUSUARIO) LIKE '%${cleanGisava}%'`);
        const wherePoi = encodeURIComponent(`UPPER(DESCNORMAL) LIKE '%${cleanGisava}%' OR UPPER(DESCRIPCIO) LIKE '%${cleanGisava}%'`);
        const whereBarrios = encodeURIComponent(`UPPER(DESNORMAL) LIKE '%${cleanGisava}%' OR UPPER(NOMBRE_BAR) LIKE '%${cleanGisava}%'`);
        const nominatimQuery = /valladolid|españa/i.test(raw) ? raw : `${raw}, Valladolid, España`;

        const [resStreets, resPoi, resBarrios, resNom] = await Promise.all([
          fetch(`${GISAVA_SEARCH_SERVER}/1/query?where=${whereStreets}&outFields=DESCUSUARIO,NOM_CALLE&returnGeometry=true&outSR=4326&resultRecordCount=4&f=geojson`).catch(() => ({ ok: false })),
          fetch(`${GISAVA_SEARCH_SERVER}/2/query?where=${wherePoi}&outFields=DESCRIPCIO,EDIFICIO&returnGeometry=true&outSR=4326&resultRecordCount=2&f=geojson`).catch(() => ({ ok: false })),
          fetch(`${GISAVA_SEARCH_SERVER}/3/query?where=${whereBarrios}&outFields=NOMBRE_BAR,BARRIO_COMPLETO&returnGeometry=true&outSR=4326&resultRecordCount=2&f=geojson`).catch(() => ({ ok: false })),
          fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(nominatimQuery)}&limit=3`, { headers: { 'Accept': 'application/json' } }).catch(() => ({ ok: false }))
        ]);

        if (resStreets.ok) {
          const d = await resStreets.json();
          (d.features || []).forEach((f) => {
            const pt = extractCenterFromGeometry(f.geometry);
            if (pt) items.push({ label: f.properties.DESCUSUARIO || f.properties.NOM_CALLE, badge: 'Calle Ayto.', ...pt });
          });
        }
        if (resBarrios.ok) {
          const d = await resBarrios.json();
          (d.features || []).forEach((f) => {
            const pt = extractCenterFromGeometry(f.geometry);
            if (pt) items.push({ label: f.properties.BARRIO_COMPLETO || f.properties.NOMBRE_BAR, badge: 'Barrio', ...pt });
          });
        }
        if (resPoi.ok) {
          const d = await resPoi.json();
          (d.features || []).forEach((f) => {
            const pt = extractCenterFromGeometry(f.geometry);
            if (pt) items.push({ label: f.properties.DESCRIPCIO || f.properties.EDIFICIO, badge: 'Lugar interés', ...pt });
          });
        }
        if (resNom.ok) {
          const nomList = await resNom.json();
          (nomList || []).forEach((n) => {
            const shortLabel = n.display_name.split(',').slice(0, 3).join(',').trim();
            items.push({
              label: shortLabel,
              badge: 'Mapa / GPS',
              lat: parseFloat(n.lat),
              lon: parseFloat(n.lon)
            });
          });
        }
        return items.slice(0, 8);
      } catch (_) {
        return items;
      }
    }

async function geocodeStreetInValladolid(queryText) {
      const cleanQuery = queryText.trim();
      if (!cleanQuery) return null;

      // 0. Comprobar primero si coincide con un Sitio Guardado ("Casa", "Trabajo", etc.)
      const savedPlace = getSavedPlaces().find(
        (p) =>
          p.name.toLowerCase() === cleanQuery.toLowerCase() ||
          `${p.icon || '⭐'} ${p.name} (${p.address})`.toLowerCase() === cleanQuery.toLowerCase()
      );
      if (savedPlace) {
        return {
          lat: savedPlace.lat,
          lon: savedPlace.lon,
          display_name: `${savedPlace.icon || '⭐'} ${savedPlace.name} (${savedPlace.address})`
        };
      }

      const coordMatch = cleanQuery.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
      if (coordMatch) {
        return {
          lat: parseFloat(coordMatch[1]),
          lon: parseFloat(coordMatch[3]),
          display_name: cleanQuery
        };
      }

      const firstSegment = cleanQuery.split(',')[0].trim();
      const candidateQueries = [];
      if (!/valladolid/i.test(cleanQuery)) {
        candidateQueries.push(`${cleanQuery}, Valladolid, España`);
      }
      candidateQueries.push(`${cleanQuery}, España`);
      candidateQueries.push(cleanQuery);
      if (firstSegment && firstSegment !== cleanQuery) {
        candidateQueries.push(`${firstSegment}, Valladolid, España`);
      }

      // 1. Intentar con Nominatim OpenStreetMap (local en Valladolid o ubicación lejana)
      for (const q of candidateQueries) {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
          const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
          if (response.ok) {
            const results = await response.json();
            if (results && results.length > 0) {
              return {
                lat: parseFloat(results[0].lat),
                lon: parseFloat(results[0].lon),
                display_name: results[0].display_name.split(',').slice(0, 2).join(',').trim()
              };
            }
          }
        } catch (_) {}
      }

      // 2. Respaldo con el Callejero Oficial GISAVA del Ayuntamiento de Valladolid (soporta "Calle Villanubla 50, La Victoria")
      const gisavaMatches = await searchGisavaOfficialSuggestions(cleanQuery);
      if (gisavaMatches.length > 0) {
        return {
          lat: gisavaMatches[0].lat,
          lon: gisavaMatches[0].lon,
          display_name: gisavaMatches[0].label
        };
      }

      return null;
    }

function setupAutocomplete(inputId, listId, onSelectPoint) {
      const inputEl = document.getElementById(inputId);
      const listEl = document.getElementById(listId);
      let debounceTimer = null;

      inputEl.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const val = inputEl.value.trim();
        if (val.length < 2) {
          listEl.classList.remove('visible');
          return;
        }
        debounceTimer = setTimeout(async () => {
          const suggestions = await searchGisavaOfficialSuggestions(val);
          if (suggestions.length === 0) {
            listEl.classList.remove('visible');
            return;
          }
          listEl.innerHTML = '';
          suggestions.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'suggestion-item';
            row.innerHTML = `<span>${item.label}</span><span class="suggestion-badge">${item.badge}</span>`;
            row.addEventListener('click', () => {
              onSelectPoint(item.lat, item.lon, item.label);
              listEl.classList.remove('visible');
              inputEl.blur();
              map.setView([item.lat, item.lon], 15);
            });
            listEl.appendChild(row);
          });
          listEl.classList.add('visible');
        }, 240);
      });

      document.addEventListener('click', (e) => {
        if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
          listEl.classList.remove('visible');
        }
      });
    }