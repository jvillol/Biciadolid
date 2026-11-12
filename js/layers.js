/**
 * Biciadolid - Módulo de Capas GIS
 * Capas oficiales del Ayuntamiento de Valladolid (GISAVA), BIKI, PARKIBICI,
 * aparcabicis municipales, carriles bici de OpenStreetMap (Overpass) y Zonas Prohibidas.
 */


function getGisavaLaneStyle(tipo, sentido, isAlfoz = false) {
      if (isAlfoz) {
        return { color: '#267300', weight: 3.5, dashArray: '6, 6', label: 'Carril bici otros Municipios (Alfoz)' };
      }
      const t = String(tipo || '').toLowerCase().trim();
      const s = String(sentido || '').trim();

      if (t === 'exclusivo' && s === '2') {
        return { color: '#00a884', weight: 3.8, dashArray: null, label: 'Carril bici exclusivo (2 sentidos)' };
      }
      if (t === 'exclusivo' && s === '1') {
        return { color: '#ef4444', weight: 3.5, dashArray: null, label: 'Carril bici exclusivo (1 sentido)' };
      }
      if (t === 'compartido' && s === '2') {
        return { color: '#ffaa00', weight: 3.5, dashArray: null, label: 'Carril compartido / Acera-bici (2 sentidos)' };
      }
      if (t === 'compartido' && s === '1') {
        return { color: '#005ce6', weight: 3.5, dashArray: null, label: 'Carril compartido (1 sentido)' };
      }
      if (t.startsWith('ciclocarri')) {
        return { color: '#c500ff', weight: 3.2, dashArray: '5, 6', label: 'Ciclocarril 30 km/h (Prioridad ciclista)' };
      }
      return { color: '#00a884', weight: 3.2, dashArray: null, label: 'Vía ciclista municipal' };
    }

async function loadGisavaOfficialCycleways() {
      if (state.gisavaCyclewaysLoaded) {
        state.gisavaCyclewaysLayer.addTo(map);
        return;
      }

      try {
        const [resUrban, resAlfoz] = await Promise.all([
          fetch(`${GISAVA_CARRIL_SERVER}/8/query?where=1%3D1&outFields=TIPO,SENTIDO,CONSTRUCCION,SHAPE.LEN&returnGeometry=true&outSR=4326&f=geojson`),
          fetch(`${GISAVA_CARRIL_SERVER}/9/query?where=1%3D1&outFields=TIPO,SENTIDO,SHAPE.LEN&returnGeometry=true&outSR=4326&f=geojson`)
        ]);

        if (!resUrban.ok) throw new Error('Error al conectar con GISAVA Ayuntamiento de Valladolid');
        const dataUrban = await resUrban.json();
        const dataAlfoz = resAlfoz.ok ? await resAlfoz.json() : { features: [] };

        state.gisavaPolylines = [];

        const renderFeature = (feat, isAlfoz) => {
          const props = feat.properties || {};
          const style = getGisavaLaneStyle(props.TIPO, props.SENTIDO, isAlfoz);
          const lenMeters = Math.round(Number(props['SHAPE.LEN']) || 0);
          const yearBadge = props.CONSTRUCCION ? `<br><span style="color:#38bdf8;">🆕 Tramo construido en ${props.CONSTRUCCION}</span>` : '';

          // Guardar geometría para el clasificador de seguridad de rutas
          const geom = feat.geometry;
          if (geom) {
            const t = String(props.TIPO || '').toLowerCase();
            const isCiclo = t.startsWith('ciclocarri');
            const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
            lines.forEach((coordsArr) => {
              if (!coordsArr || coordsArr.length === 0) return;
              let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
              for (let i = 0; i < coordsArr.length; i++) {
                const lon = coordsArr[i][0];
                const lat = coordsArr[i][1];
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
              }
              state.gisavaPolylines.push({
                waytype: isCiclo ? 10 : 6,
                coords: coordsArr, // Array de [lon, lat]
                bbox: [minLat, maxLat, minLon, maxLon]
              });
            });
          }

          const layer = L.geoJSON(feat, {
            style: {
              color: style.color,
              weight: style.weight,
              opacity: 0.85,
              dashArray: style.dashArray
            }
          });

          layer.bindPopup(`
            <div style="font-size:0.8rem;line-height:1.35;">
              <strong>🏛️ ${style.label}</strong><br>
              <span>Longitud del tramo: <b>${lenMeters} m</b></span>
              ${yearBadge}
            </div>
          `);
          layer.addTo(state.gisavaCyclewaysLayer);
        };

        (dataUrban.features || []).forEach((f) => renderFeature(f, false));
        (dataAlfoz.features || []).forEach((f) => renderFeature(f, true));

        state.gisavaCyclewaysLoaded = true;
        state.gisavaCyclewaysLayer.addTo(map);
      } catch (err) {
        console.warn('No se pudo cargar la capa GISAVA inicial:', err);
      }
    }

async function toggleBikiLayer(enabled) {
      if (!enabled) {
        map.removeLayer(state.bikiLayer);
        return;
      }
      if (state.bikiLoaded) {
        state.bikiLayer.addTo(map);
        showToast('101 estaciones BIKI visibles en el mapa.', 'info', 2200);
        return;
      }

      try {
        const res = await fetch(`${GISAVA_CARRIL_SERVER}/1/query?where=1%3D1&outFields=DESCRIPCIO,TIPOVIA,DESVIA,NUMVIA&returnGeometry=true&outSR=4326&f=geojson`);
        if (!res.ok) throw new Error('Error al cargar BIKI');
        const data = await res.json();

        const icon = L.divIcon({
          className: '',
          html: '<div class="poi-badge poi-biki">B</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        (data.features || []).forEach((f) => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          const title = p.DESCRIPCIO || `Estación BIKI (${p.TIPOVIA || ''} ${p.DESVIA || ''})`;
          const safeTitle = title.replace(/'/g, "\\'");

          L.marker([lat, lon], { icon })
            .bindPopup(`
              <div style="font-size:0.8rem;min-width:190px;">
                <strong>🚲 ${title}</strong>
                <div class="popup-btn-group">
                  <button class="popup-btn origin" onclick="setPointFromPopup('origin', ${lat}, ${lon}, '${safeTitle}')">Usar Origen</button>
                  <button class="popup-btn dest" onclick="setPointFromPopup('dest', ${lat}, ${lon}, '${safeTitle}')">Usar Destino</button>
                </div>
              </div>
            `)
            .addTo(state.bikiLayer);
        });

        state.bikiLoaded = true;
        state.bikiLayer.addTo(map);
        showToast(`Cargadas ${data.features.length} estaciones oficiales BIKI.`, 'success', 2800);
      } catch (err) {
        console.error(err);
        document.getElementById('bikiToggle').checked = false;
        showToast('No se pudieron cargar las estaciones BIKI desde GISAVA.', 'error');
      }
    }

async function toggleParkibiciLayer(enabled) {
      if (!enabled) {
        map.removeLayer(state.parkibiciLayer);
        return;
      }
      if (state.parkibiciLoaded) {
        state.parkibiciLayer.addTo(map);
        showToast('40 aparcamientos seguros PARKIBICI visibles.', 'info', 2200);
        return;
      }

      try {
        const res = await fetch(`${GISAVA_CARRIL_SERVER}/2/query?where=1%3D1&outFields=NOMBRE,LOCALIZACI,PLAZAS&returnGeometry=true&outSR=4326&f=geojson`);
        if (!res.ok) throw new Error('Error al cargar PARKIBICI');
        const data = await res.json();

        const icon = L.divIcon({
          className: '',
          html: '<div class="poi-badge poi-parkibici">P</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        (data.features || []).forEach((f) => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          const title = `PARKIBICI ${p.NOMBRE || ''}`.trim();
          const safeTitle = title.replace(/'/g, "\\'");

          L.marker([lat, lon], { icon })
            .bindPopup(`
              <div style="font-size:0.8rem;min-width:190px;">
                <strong>🔒 ${title}</strong><br>
                <span>📍 ${p.LOCALIZACI || 'Valladolid'}</span><br>
                <span>🚲 Capacidad: <b>${p.PLAZAS || '-'} plazas</b></span>
                <div class="popup-btn-group">
                  <button class="popup-btn origin" onclick="setPointFromPopup('origin', ${lat}, ${lon}, '${safeTitle}')">Usar Origen</button>
                  <button class="popup-btn dest" onclick="setPointFromPopup('dest', ${lat}, ${lon}, '${safeTitle}')">Usar Destino</button>
                </div>
              </div>
            `)
            .addTo(state.parkibiciLayer);
        });

        state.parkibiciLoaded = true;
        state.parkibiciLayer.addTo(map);
        showToast(`Cargados ${data.features.length} aparcamientos seguros PARKIBICI.`, 'success', 2800);
      } catch (err) {
        console.error(err);
        document.getElementById('parkibiciToggle').checked = false;
        showToast('No se pudieron cargar los puntos PARKIBICI desde GISAVA.', 'error');
      }
    }

async function toggleAparcabicisLayer(enabled) {
      if (!enabled) {
        map.removeLayer(state.aparcabicisLayer);
        return;
      }
      if (state.aparcabicisLoaded) {
        state.aparcabicisLayer.addTo(map);
        showToast('164 aparcabicis municipales visibles.', 'info', 2200);
        return;
      }

      try {
        const res = await fetch(`${GISAVA_CARRIL_SERVER}/0/query?where=1%3D1&outFields=TIPO,EDIFICIO,NOMBRE_VIA,N_POLICIA,PLAZAS&returnGeometry=true&outSR=4326&f=geojson`);
        if (!res.ok) throw new Error('Error al cargar Aparcabicis');
        const data = await res.json();

        const icon = L.divIcon({
          className: '',
          html: '<div class="poi-badge poi-aparcabicis">🚲</div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        (data.features || []).forEach((f) => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          const title = p.EDIFICIO || `${p.NOMBRE_VIA || 'Aparcabicis'} ${p.N_POLICIA || ''}`.trim();
          const safeTitle = title.replace(/'/g, "\\'");

          L.marker([lat, lon], { icon })
            .bindPopup(`
              <div style="font-size:0.8rem;min-width:185px;">
                <strong>🅿️ Aparcabicis: ${title}</strong><br>
                <span>📍 ${p.NOMBRE_VIA || ''} ${p.N_POLICIA || ''}</span><br>
                <span>🔧 Tipo: ${p.TIPO || 'Estándar'} · <b>${p.PLAZAS || '-'} plazas</b></span>
                <div class="popup-btn-group">
                  <button class="popup-btn origin" onclick="setPointFromPopup('origin', ${lat}, ${lon}, '${safeTitle}')">Usar Origen</button>
                  <button class="popup-btn dest" onclick="setPointFromPopup('dest', ${lat}, ${lon}, '${safeTitle}')">Usar Destino</button>
                </div>
              </div>
            `)
            .addTo(state.aparcabicisLayer);
        });

        state.aparcabicisLoaded = true;
        state.aparcabicisLayer.addTo(map);
        showToast(`Cargados ${data.features.length} aparcabicis municipales.`, 'success', 2800);
      } catch (err) {
        console.error(err);
        document.getElementById('aparcabicisToggle').checked = false;
        showToast('No se pudieron cargar los aparcabicis desde GISAVA.', 'error');
      }
    }

async function fetchAndRenderCycleways() {
      if (state.cyclewaysLoaded) {
        state.cyclewaysLayerGroup.addTo(map);
        showToast('Red de carriles bici OpenStreetMap visible en el mapa.', 'info', 2500);
        return;
      }

      cyclewayToggle.disabled = true;
      const originalText = cyclewayBtnText.textContent;
      cyclewayBtnText.textContent = 'Cargando red de carriles bici...';

      const overpassQuery = `[out:json];(way["highway"="cycleway"](${VALLADOLID_BBOX});way["cycleway"~"track|lane|shared_lane"](${VALLADOLID_BBOX}););out geom;`;

      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          },
          body: 'data=' + encodeURIComponent(overpassQuery)
        });

        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status} al consultar Overpass API`);
        }

        const data = await response.json();
        const elements = data.elements || [];
        let count = 0;

        elements.forEach((el) => {
          if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length > 1) {
            const latLngs = el.geometry.map((pt) => [pt.lat, pt.lon]);
            L.polyline(latLngs, {
              color: '#00d2ff',
              weight: 2.5,
              opacity: 0.78,
              interactive: false
            }).addTo(state.cyclewaysLayerGroup);
            count++;
          }
        });

        state.cyclewaysLoaded = true;
        state.cyclewaysLayerGroup.addTo(map);
        state.routeLayerGroup.bringToFront?.();

        showToast(`Se han cargado ${count} tramos de carril bici de OpenStreetMap.`, 'success');
      } catch (err) {
        console.error(err);
        cyclewayToggle.checked = false;
        showToast('No se pudo cargar la red de carriles bici desde Overpass API. Inténtalo de nuevo.', 'error');
      } finally {
        cyclewayToggle.disabled = false;
        cyclewayBtnText.textContent = originalText;
      }
    }

function checkProhibitedZoneAtPoint(lat, lon, vehicle = state.vehicleType) {
      for (const zone of PROHIBITED_VALLADOLID_AREAS) {
        if (zone.scope === 'all_strict') {
          if (pointInPolygon(lat, lon, zone.polygon)) return zone;
        } else if (zone.scope === 'scooter_strict' && vehicle === 'scooter') {
          if (pointInPolygon(lat, lon, zone.polygon)) return zone;
        } else if (zone.scope === 'pedestrian_walk') {
          // Tanto en patinete como en bici montada está prohibido / requiere ir a pie
          if (pointInPolygon(lat, lon, zone.polygon)) return zone;
        }
      }
      return null;
    }

function loadProhibitedZonesLayer() {
      if (!state.prohibitedZonesLayer) return;
      state.prohibitedZonesLayer.clearLayers();

      PROHIBITED_VALLADOLID_AREAS.forEach((zone) => {
        const isTunnel = zone.type === 'tunnel';
        const color = isTunnel ? '#ef4444' : '#f97316';

        // 1. Si tiene trazado lineal (eje exacto del túnel o calle peatonal), pintar línea precisa
        if (Array.isArray(zone.line)) {
          const polyline = L.polyline(zone.line, {
            color,
            weight: 5,
            dashArray: '6, 6',
            opacity: 0.85
          }).addTo(state.prohibitedZonesLayer);

          polyline.bindPopup(`
            <div style="font-size:0.82rem;line-height:1.35;">
              <strong style="color:${color};">${isTunnel ? '🚇' : '🚶'} ${zone.name}</strong><br>
              <span style="font-size:0.75rem;color:#cbd5e1;">${zone.desc}</span><br>
              <small style="color:#94a3b8;">⚖️ Ordenanza Movilidad Valladolid</small>
            </div>
          `);
        } else if (Array.isArray(zone.polygon)) {
          // Solo para parques interiores: perímetro fino y transparente para no tapar el mapa
          const poly = L.polygon(zone.polygon, {
            color,
            weight: 1.5,
            dashArray: '4, 4',
            fillColor: color,
            fillOpacity: 0.12
          }).addTo(state.prohibitedZonesLayer);

          poly.bindPopup(`
            <div style="font-size:0.82rem;line-height:1.35;">
              <strong style="color:${color};">🌳 ${zone.name}</strong><br>
              <span style="font-size:0.75rem;color:#cbd5e1;">${zone.desc}</span>
            </div>
          `);
        }

        // 2. Icono compacto de señalización en el punto exacto
        const iconHtml = `<div style="background:${color};color:#fff;border-radius:999px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;box-shadow:0 2px 6px rgba(0,0,0,0.45);border:1.5px solid #fff;">${isTunnel ? '🚇' : '🚶'}</div>`;
        const marker = L.marker(zone.center, {
          icon: L.divIcon({
            className: '',
            html: iconHtml,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          })
        }).addTo(state.prohibitedZonesLayer);

        marker.bindPopup(`
          <div style="font-size:0.82rem;">
            <strong style="color:${color};">${isTunnel ? '🚇' : '🚶'} ${zone.name}</strong><br>
            <span style="font-size:0.75rem;">${zone.desc}</span>
          </div>
        `);
      });
    }