/**
 * Biciadolid - Navegación GPS en Vivo Paso a Paso (Turn-by-Turn)
 * HUD de maniobras en tiempo real, seguimiento GPS con brújula/giroscopio,
 * alertas sonoras y por voz, indicador de cercanía y Drawer de itinerario.
 */

let maneuverHighlightMarker = null;
let orientationListenerActive = false;
let lastHeadingApplied = 0;


function buildFallbackManeuvers(coords, routeLabel = '') {
      if (!Array.isArray(coords) || coords.length < 2) return [];
      const maneuvers = [];
      maneuvers.push({
        instruction: routeLabel ? `Inicia la ruta por ${routeLabel}` : 'Inicia la ruta y sigue el trazado marcado',
        type: 1,
        beginShapeIndex: 0,
        endShapeIndex: Math.min(2, coords.length - 1),
        lengthMeters: 0
      });

      let lastTurnIdx = 0;
      for (let i = 2; i < coords.length - 2; i++) {
        const pPrev = coords[i - 2];
        const pCurr = coords[i];
        const pNext = coords[i + 2];
        const distSinceLast = L.latLng(coords[lastTurnIdx][1], coords[lastTurnIdx][0])
          .distanceTo(L.latLng(pCurr[1], pCurr[0]));
        if (distSinceLast < 55) continue;

        const b1 = computeBearingDeg(pPrev[1], pPrev[0], pCurr[1], pCurr[0]);
        const b2 = computeBearingDeg(pCurr[1], pCurr[0], pNext[1], pNext[0]);
        let diff = ((b2 - b1 + 540) % 360) - 180;

        if (Math.abs(diff) >= 34) {
          const isRight = diff > 0;
          const isSharp = Math.abs(diff) >= 75;
          let type = isRight ? (isSharp ? 10 : 9) : (isSharp ? 15 : 16);
          let text = isRight
            ? (isSharp ? 'Gira a la derecha' : 'Mantente ligeramente a la derecha')
            : (isSharp ? 'Gira a la izquierda' : 'Mantente ligeramente a la izquierda');
          maneuvers.push({
            instruction: text,
            type,
            beginShapeIndex: i,
            endShapeIndex: Math.min(i + 2, coords.length - 1),
            lengthMeters: distSinceLast
          });
          lastTurnIdx = i;
        }
      }

      maneuvers.push({
        instruction: 'Llegarás a tu destino',
        type: 4,
        beginShapeIndex: coords.length - 1,
        endShapeIndex: coords.length - 1,
        lengthMeters: 0
      });

      return maneuvers;
    }

function getManeuverIcon(type, instruction = '') {
      const lower = (instruction || '').toLowerCase();
      if (type === 4 || type === 5 || type === 6 || lower.includes('destino') || lower.includes('llegar')) return '🏁';
      if (type === 26 || type === 27 || lower.includes('rotonda') || lower.includes('glorieta')) return '🔄';
      if (type === 12 || type === 13 || lower.includes('cambio de sentido')) return '↩️';
      if ([10, 11].includes(type) || lower.includes('gira a la derecha') || lower.includes('derecha en')) return '↱';
      if ([14, 15].includes(type) || lower.includes('gira a la izquierda') || lower.includes('izquierda en')) return '↰';
      if (type === 9 || lower.includes('ligeramente a la derecha') || lower.includes('mantente a la derecha')) return '↗️';
      if (type === 16 || lower.includes('ligeramente a la izquierda') || lower.includes('mantente a la izquierda')) return '↖️';
      return '⬆️';
    }

function renderManeuversDrawer() {
      const listEl = document.getElementById('maneuversList');
      const countEl = document.getElementById('maneuversCountPill');
      if (!listEl || !state.activeRoute) return;

      const coords = state.activeRoute.coords || [];
      const maneuvers = (Array.isArray(state.activeRoute.maneuvers) && state.activeRoute.maneuvers.length > 0)
        ? state.activeRoute.maneuvers
        : buildFallbackManeuvers(coords);

      if (countEl) countEl.textContent = `${maneuvers.length} indicaciones`;
      listEl.innerHTML = '';

      maneuvers.forEach((m, idx) => {
        const parts = splitInstruction(m.instruction);
        const icon = getManeuverIcon(m.type, m.instruction);
        const distText = (m.lengthMeters && m.lengthMeters > 0) ? formatMetersText(m.lengthMeters) : '';

        const wayVal = getCurrentWaytypeAtIndex(state.activeRoute.waytypeValues, m.beginShapeIndex || 0);
        const styleInfo = getWaytypeStyle(wayVal);
        let surfaceLabel = '🟢 Carril Bici';
        let surfaceBg = 'rgba(46, 204, 113, 0.2)';
        let surfaceColor = '#86efac';
        if (styleInfo.category === 'ciclo30') {
          surfaceLabel = '🟣 Ciclocarril 30';
          surfaceBg = 'rgba(197, 0, 255, 0.2)';
          surfaceColor = '#f0abfc';
        } else if (styleInfo.category === 'danger') {
          surfaceLabel = '🔴 Calzada ≤50';
          surfaceBg = 'rgba(231, 76, 60, 0.2)';
          surfaceColor = '#fca5a5';
        } else if (styleInfo.category === 'other') {
          surfaceLabel = '🚶 A pie';
          surfaceBg = 'rgba(243, 156, 18, 0.2)';
          surfaceColor = '#fdba74';
        }

        const item = document.createElement('div');
        item.className = 'maneuver-item';
        item.id = `maneuverItem_${idx}`;
        item.innerHTML = `
          <div class="maneuver-item-icon-box">${icon}</div>
          <div class="maneuver-item-info">
            <div class="maneuver-item-action">${parts.action}</div>
            ${parts.street ? `<div class="maneuver-item-street">${parts.street}</div>` : ''}
            <div class="maneuver-item-meta">
              ${distText ? `<span>📏 ${distText}</span>` : ''}
              <span class="maneuver-item-badge" style="background:${surfaceBg}; color:${surfaceColor};">${surfaceLabel}</span>
            </div>
          </div>
        `;

        item.addEventListener('click', () => {
          if (Array.isArray(coords) && m.beginShapeIndex < coords.length) {
            const pt = coords[m.beginShapeIndex];
            const latLng = [pt[1], pt[0]];
            map.setView(latLng, 18, { animate: true });

            if (maneuverHighlightMarker) {
              map.removeLayer(maneuverHighlightMarker);
            }
            maneuverHighlightMarker = L.circleMarker(latLng, {
              radius: 14,
              color: '#38bdf8',
              weight: 3,
              fillColor: '#0ea5e9',
              fillOpacity: 0.5
            }).addTo(map);

            setTimeout(() => {
              if (maneuverHighlightMarker) {
                map.removeLayer(maneuverHighlightMarker);
                maneuverHighlightMarker = null;
              }
            }, 3500);

            closeManeuversDrawer();
            showToast(`📍 Vista previa: ${parts.action} ${parts.street}`, 'info', 2200);
          }
        });

        listEl.appendChild(item);
      });
    }

function highlightActiveDrawerManeuver(activeIdx) {
      const items = document.querySelectorAll('.maneuver-item');
      items.forEach((item, idx) => {
        item.classList.toggle('current', idx === activeIdx);
      });
    }

function openManeuversDrawer() {
      renderManeuversDrawer();
      const drawer = document.getElementById('maneuversDrawer');
      if (drawer) {
        drawer.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
      }
    }

function closeManeuversDrawer() {
      const drawer = document.getElementById('maneuversDrawer');
      if (drawer) {
        drawer.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
      }
    }

function getCurrentWaytypeAtIndex(waytypeValues, idx) {
      if (!Array.isArray(waytypeValues) || waytypeValues.length === 0) return 6;
      for (let i = 0; i < waytypeValues.length; i++) {
        const [s, e, val] = waytypeValues[i];
        if (idx >= s && idx <= e) return val;
      }
      return waytypeValues[0][2] || 6;
    }

function updateNavSurfacePill(waytypeVal) {
      const pill = document.getElementById('navSurfacePill');
      if (!pill) return;
      const styleInfo = getWaytypeStyle(waytypeVal);
      if (styleInfo.category === 'prohibited') {
        pill.textContent = '🚫 ¡VÍA PROHIBIDA! (Desmontar o salir)';
        pill.style.background = 'rgba(239, 68, 68, 0.4)';
        pill.style.borderColor = '#ef4444';
        pill.style.color = '#fff';
      } else if (styleInfo.category === 'safe') {
        pill.textContent = '🟢 Vas por: 1º Carril Bici';
        pill.style.background = 'rgba(46, 204, 113, 0.22)';
        pill.style.borderColor = 'rgba(46, 204, 113, 0.6)';
        pill.style.color = '#86efac';
      } else if (styleInfo.category === 'ciclo30') {
        pill.textContent = '🟣 Vas por: 2º Ciclocarril 30 km/h';
        pill.style.background = 'rgba(197, 0, 255, 0.22)';
        pill.style.borderColor = 'rgba(197, 0, 255, 0.65)';
        pill.style.color = '#f0abfc';
      } else if (styleInfo.category === 'danger') {
        pill.textContent = '🔴 Vas por: 3º Carretera legal (≤50 km/h, carril derecho)';
        pill.style.background = 'rgba(231, 76, 60, 0.22)';
        pill.style.borderColor = 'rgba(231, 76, 60, 0.65)';
        pill.style.color = '#fca5a5';
      } else {
        pill.textContent = '🚶 4º Tramo Peatonal / Acera (A PIE)';
        pill.style.background = 'rgba(243, 156, 18, 0.25)';
        pill.style.borderColor = 'rgba(243, 156, 18, 0.85)';
        pill.style.color = '#fdba74';
      }
    }

function updateNavigationProgressAtPoint(userLat, userLon) {
      const route = state.activeRoute;
      if (!route || !Array.isArray(route.coords) || route.coords.length < 2) return;

      const coords = route.coords; // [lon, lat]
      const userLatLng = L.latLng(userLat, userLon);

      // 1. Buscar vértice más cercano en la ruta
      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const d = userLatLng.distanceTo(L.latLng(coords[i][1], coords[i][0]));
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }

      // 2. Si el usuario se desvía más de 48 metros de la ruta, recalcular automáticamente desde su posición GPS
      const now = Date.now();
      if (minDist > 48 && state.destination && now - state.navLastRecalcTime > 12000) {
        state.navLastRecalcTime = now;
        showToast('🔄 Te has desviado de la ruta. Recalculando desde tu GPS...', 'info', 3000);
        speakNavInstruction('Recalculando ruta', `recalc_${Math.floor(now / 12000)}`);
        setOriginPoint(userLat, userLon, 'Mi ubicación GPS (En ruta)');
        calculateRoute();
        return;
      }

      // 3. Dibujar línea del tramo ya recorrido en gris/atenuado para ver claramente el avance
      const traveledLatLngs = coords.slice(0, closestIdx + 1).map(([lon, lat]) => [lat, lon]);
      traveledLatLngs.push([userLat, userLon]);
      if (!state.navTraveledLine) {
        state.navTraveledLine = L.polyline(traveledLatLngs, {
          color: '#64748b',
          weight: 5,
          opacity: 0.75,
          dashArray: '4, 6'
        }).addTo(map);
      } else {
        state.navTraveledLine.setLatLngs(traveledLatLngs);
      }

      // 4. Calcular distancia restante real sumando desde la posición actual hasta el final
      let remMeters = userLatLng.distanceTo(L.latLng(coords[closestIdx][1], coords[closestIdx][0]));
      for (let i = closestIdx; i < coords.length - 1; i++) {
        remMeters += L.latLng(coords[i][1], coords[i][0]).distanceTo(L.latLng(coords[i + 1][1], coords[i + 1][0]));
      }

      const remKm = remMeters / 1000;
      const avgSpeedKmh = state.routeMode === 'fast' ? 21 : 17.5;
      const remMin = Math.max(1, Math.round((remKm / avgSpeedKmh) * 60));
      const etaDate = new Date(Date.now() + remMin * 60000);
      const etaStr = etaDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      document.getElementById('navRemDist').textContent = remMeters < 1000
        ? `${Math.round(remMeters)} m`
        : `${remKm.toFixed(2)} km`;
      document.getElementById('navRemTime').textContent = `${remMin} min`;
      document.getElementById('navEtaClock').textContent = `Llegada ${etaStr}`;

      // 5. Actualizar superficie actual (1º Carril Bici / 2º Ciclocarril 30 / 3º Carretera / 4º Acera)
      const currentWaytype = getCurrentWaytypeAtIndex(route.waytypeValues, closestIdx);
      updateNavSurfacePill(currentWaytype);

      // 6. Comprobar si hemos llegado al destino (a menos de 22 metros del punto final)
      const destPt = coords[coords.length - 1];
      const distToDest = userLatLng.distanceTo(L.latLng(destPt[1], destPt[0]));
      if (distToDest <= 22) {
        document.getElementById('navTurnIcon').textContent = '🏁';
        document.getElementById('navTurnDist').textContent = '0 m';
        document.getElementById('navInstructionAction').textContent = '¡Has llegado!';
        document.getElementById('navInstructionStreet').textContent = 'Destino alcanzado con éxito';
        document.getElementById('navNextStepText').textContent = 'Ruta completada con éxito';
        const progFill = document.getElementById('navTurnProgressFill');
        if (progFill) progFill.style.width = '100%';
        speakNavInstruction('Has llegado a tu destino.', 'arrived_dest', 'arrival');
        showToast('🏁 ¡Has llegado a tu destino!', 'success', 5000);
        return;
      }

      // 7. Buscar la siguiente maniobra pendiente delante del usuario
      const maneuvers = Array.isArray(route.maneuvers) && route.maneuvers.length > 0
        ? route.maneuvers
        : buildFallbackManeuvers(coords);

      let nextManeuverIdx = maneuvers.findIndex((m, idx) => idx > 0 && m.beginShapeIndex > closestIdx);
      if (nextManeuverIdx === -1) {
        nextManeuverIdx = maneuvers.length - 1;
      }
      const nextManeuver = maneuvers[nextManeuverIdx] || maneuvers[0];
      const followingManeuver = maneuvers[nextManeuverIdx + 1] || null;

      // Distancia a la siguiente maniobra siguiendo la polilínea
      const targetVertexIdx = Math.min(
        Math.max(closestIdx, nextManeuver.beginShapeIndex || 0),
        coords.length - 1
      );
      let distToTurn = userLatLng.distanceTo(L.latLng(coords[closestIdx][1], coords[closestIdx][0]));
      for (let i = closestIdx; i < targetVertexIdx; i++) {
        distToTurn += L.latLng(coords[i][1], coords[i][0]).distanceTo(L.latLng(coords[i + 1][1], coords[i + 1][0]));
      }

      const icon = getManeuverIcon(nextManeuver.type, nextManeuver.instruction);
      document.getElementById('navTurnIcon').textContent = icon;
      document.getElementById('navTurnDist').textContent = formatMetersText(distToTurn);

      const parts = splitInstruction(nextManeuver.instruction);
      document.getElementById('navInstructionAction').textContent = parts.action;
      document.getElementById('navInstructionStreet').textContent = parts.street || 'Sigue el trazado marcado';

      // Barra de progreso visual hacia el siguiente giro
      const totalManeuverDist = Math.max(70, nextManeuver.lengthMeters || 150);
      const progressPct = Math.max(0, Math.min(100, Math.round((1 - (distToTurn / totalManeuverDist)) * 100)));
      const progFill = document.getElementById('navTurnProgressFill');
      if (progFill) progFill.style.width = `${progressPct}%`;

      if (followingManeuver) {
        const nextParts = splitInstruction(followingManeuver.instruction);
        const nextIcon = getManeuverIcon(followingManeuver.type, followingManeuver.instruction);
        document.getElementById('navNextStepText').textContent = `${nextIcon} ${nextParts.action} ${nextParts.street}`.trim();
      } else {
        document.getElementById('navNextStepText').textContent = `🏁 Continúa hacia el destino (${formatMetersText(remMeters)})`;
      }

      highlightActiveDrawerManeuver(nextManeuverIdx);

      // 8. Avisos por voz en español con chime previo al aproximarse al giro (a 120m y a 25m)
      if (distToTurn <= 28) {
        speakNavInstruction(`Ahora, ${nextManeuver.instruction}`, `turn_now_${nextManeuverIdx}`, 'turn');
      } else if (distToTurn <= 125) {
        speakNavInstruction(`En ${Math.round(distToTurn / 10) * 10} metros, ${nextManeuver.instruction}`, `turn_soon_${nextManeuverIdx}`, 'turn');
      }
    }

function updateNavUserPuck(lat, lon, accuracyMeters = 15, headingDeg = null) {
      const latLng = [lat, lon];
      const rot = Number.isFinite(headingDeg) ? headingDeg : (state.currentRiderHeading || 0);

      const puckHtml = `
        <div class="user-location-container">
          <div class="user-location-wrapper" id="navRiderPuck" style="transform: rotate(${rot}deg);">
            <div class="user-vision-cone"></div>
            <div class="user-puck-dot">
              <div class="user-puck-arrow">▲</div>
            </div>
          </div>
        </div>
      `;

      if (!state.navUserMarker) {
        const icon = L.divIcon({
          className: '',
          html: puckHtml,
          iconSize: [64, 64],
          iconAnchor: [32, 32]
        });
        state.navUserMarker = L.marker(latLng, { icon, zIndexOffset: 1500 }).addTo(map);
      } else {
        state.navUserMarker.setLatLng(latLng);
        const puckEl = document.getElementById('navRiderPuck');
        if (puckEl) {
          puckEl.style.transform = `rotate(${rot}deg)`;
        } else {
          const icon = L.divIcon({
            className: '',
            html: puckHtml,
            iconSize: [64, 64],
            iconAnchor: [32, 32]
          });
          state.navUserMarker.setIcon(icon);
        }
      }

      if (!state.navAccuracyCircle) {
        state.navAccuracyCircle = L.circle(latLng, {
          radius: Math.min(Math.max(accuracyMeters, 6), 80),
          color: '#38bdf8',
          weight: 1,
          fillColor: '#38bdf8',
          fillOpacity: 0.14
        }).addTo(map);
      } else {
        state.navAccuracyCircle.setLatLng(latLng);
        state.navAccuracyCircle.setRadius(Math.min(Math.max(accuracyMeters, 6), 80));
      }
    }

function updateRiderPuckRotation(targetHeading) {
      if (!Number.isFinite(targetHeading)) return;
      state.currentRiderHeading = targetHeading;
      const puckEl = document.getElementById('navRiderPuck');
      if (puckEl) {
        puckEl.style.transform = `rotate(${Math.round(targetHeading * 10) / 10}deg)`;
      }
    }

function onDeviceOrientationEvent(e) {
      let heading = null;
      if (typeof e.webkitCompassHeading === 'number') {
        heading = e.webkitCompassHeading; // iOS Safari
      } else if (typeof e.alpha === 'number') {
        heading = (360 - e.alpha) % 360; // Android Chrome brújula absoluta
      }

      if (heading === null || isNaN(heading)) return;
      state.gyroAvailable = true;

      // Si nos movemos a velocidad ciclista (> 3.8 km/h), el rumbo GPS de la marcha tiene preferencia
      let target = heading;
      if (state.navLastSpeedKmh > 3.8 && typeof state.navLastGpsHeading === 'number' && !isNaN(state.navLastGpsHeading)) {
        target = state.navLastGpsHeading;
      }

      const diff = ((target - lastHeadingApplied + 540) % 360) - 180;
      if (Math.abs(diff) >= 1.2) {
        lastHeadingApplied = (lastHeadingApplied + diff * 0.38 + 360) % 360;
        updateRiderPuckRotation(lastHeadingApplied);
      }
    }

async function startGyroscopeListener() {
      if (orientationListenerActive) return;

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') {
            console.warn('Permiso de orientación denegado en el navegador');
            return;
          }
        } catch (err) {
          console.warn('Error al solicitar permiso de giroscopio:', err);
          return;
        }
      }

      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', onDeviceOrientationEvent, true);
      } else if ('DeviceOrientationEvent' in window) {
        window.addEventListener('deviceorientation', onDeviceOrientationEvent, true);
      }

      orientationListenerActive = true;
    }

function stopGyroscopeListener() {
      if (!orientationListenerActive) return;
      if ('ondeviceorientationabsolute' in window) {
        window.removeEventListener('deviceorientationabsolute', onDeviceOrientationEvent, true);
      }
      if ('DeviceOrientationEvent' in window) {
        window.removeEventListener('deviceorientation', onDeviceOrientationEvent, true);
      }
      orientationListenerActive = false;
    }

function onLiveGpsPosition(pos) {
      if (!state.navActive) return;
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      const now = Date.now();

      // Calcular velocidad en km/h (desde el sensor GPS o por delta de posición)
      let speedKmh = 0;
      if (typeof speed === 'number' && speed >= 0) {
        speedKmh = speed * 3.6;
      } else if (state.navLastLatLng && state.navLastTimestamp) {
        const dtSec = (now - state.navLastTimestamp) / 1000;
        if (dtSec > 0.4) {
          const distM = L.latLng(state.navLastLatLng.lat, state.navLastLatLng.lon)
            .distanceTo(L.latLng(latitude, longitude));
          speedKmh = (distM / dtSec) * 3.6;
        }
      }
      if (speedKmh < 1.2 || speedKmh > 65) speedKmh = 0;
      document.getElementById('navSpeedVal').textContent = Math.round(speedKmh);
      state.navLastSpeedKmh = speedKmh;

      // Calcular rumbo (heading) si el móvil no lo entrega directamente
      let riderHeading = (typeof heading === 'number' && !Number.isNaN(heading)) ? heading : null;
      if (riderHeading === null && state.navLastLatLng) {
        const movedDist = L.latLng(state.navLastLatLng.lat, state.navLastLatLng.lon)
          .distanceTo(L.latLng(latitude, longitude));
        if (movedDist > 2.5) {
          riderHeading = computeBearingDeg(state.navLastLatLng.lat, state.navLastLatLng.lon, latitude, longitude);
        }
      }
      if (typeof riderHeading === 'number' && !isNaN(riderHeading)) {
        state.navLastGpsHeading = riderHeading;
        if (speedKmh > 3.0) {
          lastHeadingApplied = riderHeading;
          updateRiderPuckRotation(riderHeading);
        }
      }

      state.navLastLatLng = { lat: latitude, lon: longitude };
      state.navLastTimestamp = now;

      const accLabel = document.getElementById('navGpsAccuracyLabel');
      if (accLabel) {
        accLabel.textContent = `📡 GPS ±${Math.round(accuracy || 10)} m`;
      }

      updateNavUserPuck(latitude, longitude, accuracy || 12, riderHeading);

      if (state.navFollowUser) {
        map.setView([latitude, longitude], Math.max(map.getZoom(), 17), { animate: true });
      }

      updateNavigationProgressAtPoint(latitude, longitude);
    }

function onLiveGpsError(err) {
      console.warn('Error en GPS en vivo:', err);
      const accLabel = document.getElementById('navGpsAccuracyLabel');
      if (accLabel) {
        accLabel.textContent = '⚠️ Buscando señal GPS...';
      }
    }

function startLiveNavigation() {
      if (!state.activeRoute || !Array.isArray(state.activeRoute.coords) || state.activeRoute.coords.length < 2) {
        showToast('Primero calcula una ruta para iniciar la navegación en vivo.', 'error');
        return;
      }

      state.navActive = true;
      state.navFollowUser = true;
      state.navLastSpokenKey = '';
      state.navLastRecalcTime = Date.now();

      // Guardar capas de información activas para restaurarlas al finalizar la navegación
      state.navSavedLayers = {
        gisava: state.gisavaCyclewaysLayer && map.hasLayer(state.gisavaCyclewaysLayer),
        prohibited: state.prohibitedZonesLayer && map.hasLayer(state.prohibitedZonesLayer),
        cycleways: state.cyclewaysLayerGroup && map.hasLayer(state.cyclewaysLayerGroup),
        geocylProj: state.geocylProjectedLayer && map.hasLayer(state.geocylProjectedLayer),
        geocylOverlay: state.geocylRouteOverlay && map.hasLayer(state.geocylRouteOverlay),
        aparcabicis: state.aparcabicisLayer && map.hasLayer(state.aparcabicisLayer),
        parkibici: state.parkibiciLayer && map.hasLayer(state.parkibiciLayer),
        biki: state.bikiLayer && map.hasLayer(state.bikiLayer),
        savedPlaces: state.savedPlacesLayer && map.hasLayer(state.savedPlacesLayer)
      };

      // Quitar capas de carriles e información secundaria: dejar SOLO la ruta seleccionada
      if (state.gisavaCyclewaysLayer && map.hasLayer(state.gisavaCyclewaysLayer)) map.removeLayer(state.gisavaCyclewaysLayer);
      if (state.prohibitedZonesLayer && map.hasLayer(state.prohibitedZonesLayer)) map.removeLayer(state.prohibitedZonesLayer);
      if (state.cyclewaysLayerGroup && map.hasLayer(state.cyclewaysLayerGroup)) map.removeLayer(state.cyclewaysLayerGroup);
      if (state.geocylProjectedLayer && map.hasLayer(state.geocylProjectedLayer)) map.removeLayer(state.geocylProjectedLayer);
      if (state.geocylRouteOverlay && map.hasLayer(state.geocylRouteOverlay)) map.removeLayer(state.geocylRouteOverlay);
      if (state.aparcabicisLayer && map.hasLayer(state.aparcabicisLayer)) map.removeLayer(state.aparcabicisLayer);
      if (state.parkibiciLayer && map.hasLayer(state.parkibiciLayer)) map.removeLayer(state.parkibiciLayer);
      if (state.bikiLayer && map.hasLayer(state.bikiLayer)) map.removeLayer(state.bikiLayer);
      if (state.savedPlacesLayer && map.hasLayer(state.savedPlacesLayer)) map.removeLayer(state.savedPlacesLayer);
      map.closePopup();

      // Plegar panel superior y mostrar interfaz de navegador paso a paso
      topPanel.classList.add('collapsed');
      togglePanelText.textContent = 'Controles';
      togglePanelIcon.textContent = '▼';

      document.getElementById('routeSummary').classList.remove('visible');
      document.getElementById('navHudBanner').classList.add('visible');
      document.getElementById('navActiveBar').classList.add('visible');
      document.getElementById('recenterNavBtn').classList.remove('visible');

      requestScreenWakeLock();

      // Activar giroscopio para la orientación de la flecha/cono del usuario
      startGyroscopeListener();

      // Asegurar maniobras y renderizar el itinerario
      if (!Array.isArray(state.activeRoute.maneuvers) || state.activeRoute.maneuvers.length === 0) {
        state.activeRoute.maneuvers = buildFallbackManeuvers(state.activeRoute.coords);
      }
      renderManeuversDrawer();

      const progFill = document.getElementById('navTurnProgressFill');
      if (progFill) progFill.style.width = '0%';

      // Posición inicial provisional en el punto de origen hasta que entre el primer fix de GPS en tiempo real
      const startCoord = state.origin
        ? [state.origin.lat, state.origin.lon]
        : [state.activeRoute.coords[0][1], state.activeRoute.coords[0][0]];

      updateNavUserPuck(startCoord[0], startCoord[1], 15, 0);
      map.setView(startCoord, 17, { animate: true });
      updateNavigationProgressAtPoint(startCoord[0], startCoord[1]);

      const firstManeuver = state.activeRoute.maneuvers?.[0]?.instruction || 'Inicia la ruta y sigue el camino indicado';
      const firstParts = splitInstruction(firstManeuver);
      document.getElementById('navInstructionAction').textContent = firstParts.action;
      document.getElementById('navInstructionStreet').textContent = firstParts.street || 'Sigue el trazado marcado';
      speakNavInstruction(`Iniciando navegación en Biciadolid. ${firstManeuver}`, 'start_nav');

      if ('geolocation' in navigator) {
        if (state.navWatchId !== null) {
          navigator.geolocation.clearWatch(state.navWatchId);
        }
        state.navWatchId = navigator.geolocation.watchPosition(
          onLiveGpsPosition,
          onLiveGpsError,
          {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 10000
          }
        );
      } else {
        showToast('Tu navegador no soporta geolocalización GPS en tiempo real.', 'error');
      }

      showToast('🚀 Navegación GPS activada (Vista despejada con flecha giroscópica).', 'success', 2800);
    }

function stopLiveNavigation(showMsg = true) {
      state.navActive = false;
      state.navFollowUser = false;

      stopGyroscopeListener();

      if (state.navWatchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(state.navWatchId);
        state.navWatchId = null;
      }

      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }

      releaseScreenWakeLock();

      if (state.navUserMarker) {
        map.removeLayer(state.navUserMarker);
        state.navUserMarker = null;
      }
      if (state.navAccuracyCircle) {
        map.removeLayer(state.navAccuracyCircle);
        state.navAccuracyCircle = null;
      }
      if (state.navTraveledLine) {
        map.removeLayer(state.navTraveledLine);
        state.navTraveledLine = null;
      }

      // Restaurar las capas de carriles e información que estaban activas antes de iniciar ruta
      if (state.navSavedLayers) {
        if (state.navSavedLayers.gisava && state.gisavaCyclewaysLayer) state.gisavaCyclewaysLayer.addTo(map);
        if (state.navSavedLayers.prohibited && state.prohibitedZonesLayer) state.prohibitedZonesLayer.addTo(map);
        if (state.navSavedLayers.cycleways && state.cyclewaysLayerGroup) state.cyclewaysLayerGroup.addTo(map);
        if (state.navSavedLayers.geocylProj && state.geocylProjectedLayer) state.geocylProjectedLayer.addTo(map);
        if (state.navSavedLayers.geocylOverlay && state.geocylRouteOverlay) state.geocylRouteOverlay.addTo(map);
        if (state.navSavedLayers.aparcabicis && state.aparcabicisLayer) state.aparcabicisLayer.addTo(map);
        if (state.navSavedLayers.parkibici && state.parkibiciLayer) state.parkibiciLayer.addTo(map);
        if (state.navSavedLayers.biki && state.bikiLayer) state.bikiLayer.addTo(map);
        if (state.navSavedLayers.savedPlaces && state.savedPlacesLayer) state.savedPlacesLayer.addTo(map);
        state.navSavedLayers = null;
      }

      closeManeuversDrawer();
      if (maneuverHighlightMarker) {
        map.removeLayer(maneuverHighlightMarker);
        maneuverHighlightMarker = null;
      }

      document.getElementById('navHudBanner').classList.remove('visible');
      document.getElementById('navActiveBar').classList.remove('visible');
      document.getElementById('recenterNavBtn').classList.remove('visible');

      if (state.activeRoute && state.activeRoute.coords?.length > 1) {
        document.getElementById('routeSummary').classList.add('visible');
        const allLatLngs = state.activeRoute.coords.map(([lon, lat]) => [lat, lon]);
        map.fitBounds(L.latLngBounds(allLatLngs), {
          paddingTopLeft: [30, 210],
          paddingBottomRight: [30, 170]
        });
      }

      if (showMsg) {
        showToast('⏹ Navegación en vivo finalizada.', 'info', 2400);
      }
    }