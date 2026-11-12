/**
 * Biciadolid - Motor de Rutas y Navegación Ciclista
 * Cálculo de trayectos seguros (carril bici exclusivo, ciclocarril 30, calzada),
 * análisis de jerarquía y seguridad vial, motor híbrido Valhalla/ORS y catálogo de rutas.
 */


function getWaytypeStyle(waytypeValue) {
      // 0: VÍA PROHIBIDA POR ORDENANZA MUNICIPAL (Túneles para patinetes, autovías, carril bus no segregado)
      if (waytypeValue === 99) {
        return {
          color: '#991b1b',
          category: 'prohibited',
          priority: 99,
          label: '🚫 Vía Prohibida (Ordenanza Valladolid - Prohibido circular)',
          walkRequired: true
        };
      }
      // 1ª PRIORIDAD: Verde (#2ecc71 - Carril Bici / Senda ciclista segregada): 6 (Cycleway), 5 (Track), 7 (Path)
      if ([5, 6, 7].includes(waytypeValue)) {
        return {
          color: '#2ecc71',
          category: 'safe',
          priority: 1,
          label: '1º Carril bici / Vía ciclista segregada',
          walkRequired: false
        };
      }
      // 2ª PRIORIDAD: Morado (#c500ff - Ciclocarril 30 km/h / Calle pacificada 30): 10
      if (waytypeValue === 10) {
        return {
          color: '#c500ff',
          category: 'ciclo30',
          priority: 2,
          label: '2º Ciclocarril 30 km/h (Preferencia ciclista / VMP)',
          walkRequired: false
        };
      }
      // 3ª PRIORIDAD: Rojo (#e74c3c - Otras carreteras y calzadas legales con coches, máx 50 km/h, carril derecho): 1 (State Road), 2 (Road), 3 (Street), 4
      if ([1, 2, 3, 4].includes(waytypeValue)) {
        return {
          color: '#e74c3c',
          category: 'danger',
          priority: 3,
          label: '3º Calzada legal con tráfico (Máx 50 km/h, circular por el carril derecho)',
          walkRequired: false
        };
      }
      // 4ª PRIORIDAD: Naranja (#f39c12 - Acera / Zona Peatonal / Desmontar a pie): 8 (Footway), 9 (Steps) u otros
      return {
        color: '#f39c12',
        category: 'other',
        priority: 4,
        label: '🚶 4º Tramo Peatonal / Acera (¡Prohibido circular montado, ir a pie!)',
        walkRequired: true
      };
    }

function matchGisavaWaytype(lat, lon) {
      if (!state.gisavaPolylines || state.gisavaPolylines.length === 0) return null;
      const thresholdDeg = 0.00029; // ~32 metros de margen
      const thresholdSq = thresholdDeg * thresholdDeg;
      let foundCiclo30 = false;

      for (let j = 0; j < state.gisavaPolylines.length; j++) {
        const item = state.gisavaPolylines[j];
        if (item.bbox) {
          if (
            lat < item.bbox[0] - thresholdDeg ||
            lat > item.bbox[1] + thresholdDeg ||
            lon < item.bbox[2] - thresholdDeg ||
            lon > item.bbox[3] + thresholdDeg
          ) {
            continue;
          }
        }
        const pts = item.coords;
        if (!pts || pts.length === 0) continue;
        if (pts.length === 1) {
          const dLat = lat - pts[0][1];
          const dLon = (lon - pts[0][0]) * 0.747;
          if (dLat * dLat + dLon * dLon <= thresholdSq) {
            if (item.waytype === 6) return 6;
            if (item.waytype === 10) foundCiclo30 = true;
          }
        } else {
          for (let i = 0; i < pts.length - 1; i++) {
            const dSq = pointToSegmentDistSq(lat, lon, pts[i][1], pts[i][0], pts[i + 1][1], pts[i + 1][0]);
            if (dSq <= thresholdSq) {
              if (item.waytype === 6) return 6; // Prioridad 1: Carril bici segregado
              if (item.waytype === 10) {
                foundCiclo30 = true;
                break; // Siguiente polilínea para seguir buscando si hay carril bici
              }
            }
          }
        }
      }
      return foundCiclo30 ? 10 : null;
    }

function scoreRouteByHierarchy(coords, waytypeValues, mode) {
      let weightedCost = 0;
      // En modo 'safe' (por defecto y recomendado): máxima preferencia por carril bici y ciclocarril 30 km/h
      const weights = mode === 'ciclo30'
        ? { safe: 1.05, ciclo30: 0.85, danger: 3.5, other: 7.0, prohibited: 10000.0 }
        : (mode === 'fast'
            ? { safe: 1.0, ciclo30: 1.05, danger: 1.15, other: 5.0, prohibited: 10000.0 }
            : { safe: 0.85, ciclo30: 1.15, danger: 3.2, other: 6.5, prohibited: 10000.0 }); // 'safe' (Recomendado): Carril bici (0.85) < Ciclocarril 30 (1.15) < Otras carreteras legales (3.2) < Acera a pie (6.5)

      waytypeValues.forEach(([s, e, val]) => {
        let segDist = 0;
        for (let i = s; i < e && i < coords.length - 1; i++) {
          const p1 = L.latLng(coords[i][1], coords[i][0]);
          const p2 = L.latLng(coords[i + 1][1], coords[i + 1][0]);
          segDist += p1.distanceTo(p2);
        }
        const { category } = getWaytypeStyle(val);
        weightedCost += segDist * (weights[category] || 3.0);
      });
      return weightedCost;
    }

async function classifyValhallaTrip(trip) {
      const leg = trip?.legs?.[0];
      const summary = trip?.summary;
      const coords = decodePolyline6(leg.shape); // [lon, lat]
      const waytypeValues = [];

      try {
        const traceRes = await fetch('https://valhalla1.openstreetmap.de/trace_attributes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encoded_polyline: leg.shape,
            costing: 'bicycle',
            shape_match: 'edge_walk',
            filters: {
              attributes: [
                'edge.use',
                'edge.cycle_lane',
                'edge.road_class',
                'edge.speed',
                'edge.speed_limit',
                'edge.begin_shape_index',
                'edge.end_shape_index'
              ],
              action: 'include'
            }
          })
        });

        if (traceRes.ok) {
          const traceData = await traceRes.json();
          const edges = traceData.edges || [];
          edges.forEach((edge) => {
            const s = edge.begin_shape_index;
            const e = edge.end_shape_index;
            if (typeof s !== 'number' || typeof e !== 'number' || e <= s) return;

            const use = edge.use || '';
            const cycleLane = edge.cycle_lane || 'none';
            const roadClass = edge.road_class || '';
            const speedLimit = typeof edge.speed_limit === 'number' ? edge.speed_limit : null;
            const speed = typeof edge.speed === 'number' ? edge.speed : null;

            const midIdx = Math.floor((s + e) / 2);
            const midPt = coords[midIdx] || coords[s];

            // 1. Comprobar si cruza una zona prohibida por la ordenanza municipal
            let isProhibited = false;
            let prohibitedReason = '';
            if (midPt) {
              const zoneMatch = checkProhibitedZoneAtPoint(midPt[1], midPt[0], state.vehicleType);
              if (zoneMatch) {
                if (zoneMatch.scope === 'all_strict' || (zoneMatch.scope === 'scooter_strict' && state.vehicleType === 'scooter')) {
                  isProhibited = true;
                  prohibitedReason = zoneMatch.name;
                }
              }
            }

            // 2. Comprobar con la red oficial GISAVA testeando varios puntos del tramo
            let gisavaMatch = null;
            const sampleIndices = [midIdx, s, e];
            if (e - s > 3) {
              sampleIndices.push(Math.floor((s * 2 + e) / 3));
              sampleIndices.push(Math.floor((s + e * 2) / 3));
            }
            for (const idx of sampleIndices) {
              const pt = coords[idx];
              if (pt) {
                const m = matchGisavaWaytype(pt[1], pt[0]);
                if (m === 6) {
                  gisavaMatch = 6;
                  break; // Carril bici tiene prioridad máxima
                }
                if (m === 10) {
                  gisavaMatch = 10;
                }
              }
            }

            let wVal = 3; // Por defecto 3ª prioridad: Carretera / Calzada general (Rojo)

            if (isProhibited) {
              wVal = 99; // VÍA PROHIBIDA POR ORDENANZA MUNICIPAL (Rojo oscuro con aviso)
            } else if (gisavaMatch === 6) {
              wVal = 6; // 1ª prioridad: Carril bici oficial GISAVA
            } else if (
              ['cycleway', 'track', 'path', 'bridleway'].includes(use) ||
              ['separated', 'dedicated'].includes(cycleLane)
            ) {
              wVal = 6; // 1ª prioridad: Carril bici / senda segregada OSM
            } else if (
              gisavaMatch === 10 ||
              cycleLane === 'shared' ||
              ['living_street', 'service_road', 'alley'].includes(use) ||
              roadClass === 'residential' ||
              roadClass === 'service_other' ||
              (speedLimit !== null && speedLimit <= 30) ||
              (speed !== null && speed <= 30)
            ) {
              wVal = 10; // 2ª prioridad: Ciclocarril 30 km/h / Calle 30 pacificada (Morado)
            } else if (['footway', 'pedestrian', 'steps', 'sidewalk'].includes(use)) {
              wVal = 8; // 4ª prioridad: Acera peatonal (Circular montado prohibido, ir a pie)
            } else {
              wVal = 3; // 3ª prioridad: Otras carreteras legales (≤50 km/h, carril derecho)
            }

            waytypeValues.push([s, e, wVal]);
          });
        }
      } catch (_) {}

      if (waytypeValues.length === 0 && coords.length > 1) {
        for (let i = 0; i < coords.length - 1; i++) {
          const midLat = (coords[i][1] + coords[i + 1][1]) / 2;
          const midLon = (coords[i][0] + coords[i + 1][0]) / 2;
          const zoneMatch = checkProhibitedZoneAtPoint(midLat, midLon, state.vehicleType);
          let wVal = 3;
          if (zoneMatch && (zoneMatch.scope === 'all_strict' || (zoneMatch.scope === 'scooter_strict' && state.vehicleType === 'scooter'))) {
            wVal = 99;
          } else {
            wVal = matchGisavaWaytype(midLat, midLon) || 3;
          }
          waytypeValues.push([i, i + 1, wVal]);
        }
      }

      const rawManeuvers = Array.isArray(leg?.maneuvers) ? leg.maneuvers : [];
      const maneuvers = rawManeuvers.map((m) => {
        let text = m.instruction || 'Continúa por la ruta indicada';
        const startIdx = typeof m.begin_shape_index === 'number' ? m.begin_shape_index : 0;
        const pt = coords[startIdx];
        if (pt) {
          const zoneMatch = checkProhibitedZoneAtPoint(pt[1], pt[0], state.vehicleType);
          if (zoneMatch) {
            if (zoneMatch.type === 'tunnel' && state.vehicleType === 'scooter') {
              text = `⚠️ ${zoneMatch.name}: Prohibido cruzar en patinete montado. Pasa a pie por la acera peatonal o busca ruta exterior.`;
            } else if (zoneMatch.type === 'pedestrian' || zoneMatch.type === 'park') {
              text = `🚶 ${zoneMatch.name}: Zona peatonal/parque. Desmonta y continúa a pie.`;
            }
          }
        }
        return {
          instruction: text,
          type: typeof m.type === 'number' ? m.type : 8,
          beginShapeIndex: typeof m.begin_shape_index === 'number' ? m.begin_shape_index : 0,
          endShapeIndex: typeof m.end_shape_index === 'number' ? m.end_shape_index : Math.max(0, coords.length - 1),
          lengthMeters: (m.length || 0) * 1000,
          timeSeconds: m.time || 0,
          streetNames: Array.isArray(m.street_names) ? m.street_names : []
        };
      });

      return {
        coords,
        waytypeValues,
        waytypeSummary: [],
        maneuvers,
        routeSummary: {
          distance: (summary?.length || 0) * 1000,
          duration: summary?.time || 0
        }
      };
    }

async function calculateRouteKeyless(origin, destination, mode = 'safe') {
      try {
        let bicycleOptions;
        if (mode === 'safe') {
          // Prioriza Carril Bici (1º) y Ciclocarril 30 (2º) sobre Carretera (3º), evitando Aceras (4º)
          bicycleOptions = {
            bicycle_type: 'Hybrid',
            use_roads: 0.02,
            use_tracks: 1.0,
            use_living_streets: 1.0,
            use_hills: 0.25,
            cycling_speed: 18.0
          };
        } else if (mode === 'ciclo30') {
          // Modo Ciclocarril 30 km/h: máxima afinidad por vías 30 km/h y carriles bici urbanos
          bicycleOptions = {
            bicycle_type: 'City',
            use_roads: 0.08,
            use_tracks: 0.9,
            use_living_streets: 1.0,
            use_hills: 0.3,
            cycling_speed: 20.0
          };
        } else {
          // Modo Más Rápida: trayecto directo por calzada, ciclocarril 30 y carril bici (evitando aceras)
          bicycleOptions = {
            bicycle_type: 'Road',
            use_roads: 0.85,
            use_tracks: 0.3,
            use_living_streets: 0.85,
            cycling_speed: 25.0
          };
        }

        // Generar polígonos de exclusión de Valhalla para zonas terminantemente prohibidas
        // En patinete (VMP): excluir túneles y autovías. En bici: excluir autovías.
        const excludePolygons = [];
        PROHIBITED_VALLADOLID_AREAS.forEach((zone) => {
          if (zone.scope === 'all_strict') {
            const ring = zone.polygon.map(([lat, lon]) => [lon, lat]);
            if (ring.length > 2) {
              ring.push(ring[0]); // Cerrar anillo
              excludePolygons.push(ring);
            }
          } else if (zone.scope === 'scooter_strict' && state.vehicleType === 'scooter') {
            const ring = zone.polygon.map(([lat, lon]) => [lon, lat]);
            if (ring.length > 2) {
              ring.push(ring[0]); // Cerrar anillo
              excludePolygons.push(ring);
            }
          }
        });

        const valhallaBody = {
          locations: [
            { lat: origin.lat, lon: origin.lon },
            { lat: destination.lat, lon: destination.lon }
          ],
          costing: 'bicycle',
          costing_options: {
            bicycle: bicycleOptions
          },
          alternates: 2,
          units: 'kilometers',
          language: 'es-ES'
        };

        if (excludePolygons.length > 0) {
          valhallaBody.exclude_polygons = excludePolygons;
        }

        const routeRes = await fetch('https://valhalla1.openstreetmap.de/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(valhallaBody)
        });

        if (routeRes.ok) {
          const routeData = await routeRes.json();
          const candidateTrips = [];
          if (routeData?.trip?.legs?.[0]?.shape) {
            candidateTrips.push(routeData.trip);
          }
          if (Array.isArray(routeData?.alternates)) {
            routeData.alternates.forEach((alt) => {
              if (alt?.trip?.legs?.[0]?.shape) candidateTrips.push(alt.trip);
            });
          }

          if (candidateTrips.length > 0) {
            const classifiedCandidates = await Promise.all(
              candidateTrips.map((t) => classifyValhallaTrip(t))
            );

            // Elegir la mejor ruta candidata según la jerarquía: Carril bici > Ciclocarril 30 > Carretera > Acera
            let bestCandidate = classifiedCandidates[0];
            let bestScore = scoreRouteByHierarchy(bestCandidate.coords, bestCandidate.waytypeValues, mode);

            for (let i = 1; i < classifiedCandidates.length; i++) {
              const cand = classifiedCandidates[i];
              const score = scoreRouteByHierarchy(cand.coords, cand.waytypeValues, mode);
              if (score < bestScore) {
                bestScore = score;
                bestCandidate = cand;
              }
            }

            return bestCandidate;
          }
        }
      } catch (e) {
        console.warn('Valhalla fallback:', e);
      }

      // 2. Respaldo secundario gratuito: OSRM Bicycle Routing (routing.openstreetmap.de)
      const osrmUrl = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=true`;
      const osrmRes = await fetch(osrmUrl);
      if (!osrmRes.ok) {
        throw new Error('No se pudo conectar con el servidor de rutas ciclistas.');
      }
      const osrmData = await osrmRes.json();
      const route = osrmData?.routes?.[0];
      if (!route || !route.geometry?.coordinates) {
        throw new Error('No se encontró ninguna ruta disponible entre ambos puntos.');
      }
      const coords = route.geometry.coordinates;
      const waytypeValues = [];
      for (let i = 0; i < coords.length - 1; i++) {
        const midLat = (coords[i][1] + coords[i + 1][1]) / 2;
        const midLon = (coords[i][0] + coords[i + 1][0]) / 2;
        const wVal = matchGisavaWaytype(midLat, midLon) || 3;
        waytypeValues.push([i, i + 1, wVal]);
      }
      return {
        coords,
        waytypeValues,
        waytypeSummary: [],
        routeSummary: {
          distance: route.distance || 0,
          duration: route.duration || 0
        }
      };
    }

async function calculateRoute() {
      // Cerrar teclado móvil y desplegables de sugerencias al pulsar Calcular
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      document.getElementById('originSuggestions')?.classList.remove('visible');
      document.getElementById('destSuggestions')?.classList.remove('visible');

      const apiKey = getActiveOrsKey();
      const originText = document.getElementById('originInput').value.trim();
      const destText = document.getElementById('destInput').value.trim();
      const calcBtn = document.getElementById('calcRouteBtn');

      calcBtn.disabled = true;
      calcBtn.textContent = '⏳ Calculando ruta...';

      try {
        if (originText && (!state.origin || state.origin.label !== originText)) {
          const geoOrigin = await geocodeStreetInValladolid(originText);
          if (!geoOrigin) {
            throw new Error(`No encontramos la ubicación de origen "${originText}". Prueba a elegirla en la lista o tocar el mapa.`);
          }
          setOriginPoint(geoOrigin.lat, geoOrigin.lon, geoOrigin.display_name);
        }

        if (destText && (!state.destination || state.destination.label !== destText)) {
          const geoDest = await geocodeStreetInValladolid(destText);
          if (!geoDest) {
            throw new Error(`No encontramos el destino "${destText}". Prueba a escribir calle y municipio o tocar el mapa.`);
          }
          setDestinationPoint(geoDest.lat, geoDest.lon, geoDest.display_name);
        }

        if (!state.origin || !state.destination) {
          throw new Error('Selecciona un Origen y un Destino (escribiendo una calle, usando el GPS o tocando el mapa).');
        }

        let coords = [];
        let waytypeValues = [];
        let waytypeSummary = [];
        let maneuvers = [];
        let routeSummary = { distance: 0, duration: 0 };
        let usedOrs = false;

        // Si el usuario configuró una ORS_API_KEY, usar OpenRouteService primero (y caer al motor gratuito si falla)
        if (apiKey) {
          try {
            const orsProfile = state.routeMode === 'fast' ? 'cycling-road' : 'cycling-regular';
            const requestBody = {
              coordinates: [
                [state.origin.lon, state.origin.lat],
                [state.destination.lon, state.destination.lat]
              ],
              preference: state.routeMode === 'fast' ? 'fastest' : 'recommended',
              extra_info: ['waytype']
            };

            const response = await fetch(`https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`, {
              method: 'POST',
              headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Content-Type': 'application/json',
                'Authorization': apiKey
              },
              body: JSON.stringify(requestBody)
            });

            if (response.ok) {
              const data = await response.json();
              if (data.features && data.features.length > 0) {
                const feature = data.features[0];
                coords = feature.geometry.coordinates;
                const rawWaytypes = feature.properties?.extras?.waytype?.values || [];
                // Enriquecer los tramos de ORS con la red oficial de Ciclocarriles 30 km/h y Carriles Bici GISAVA
                waytypeValues = rawWaytypes.map(([s, e, val]) => {
                  const midIdx = Math.floor((s + e) / 2);
                  const midPt = coords[midIdx] || coords[s];
                  const gisavaMatch = midPt ? matchGisavaWaytype(midPt[1], midPt[0]) : null;
                  if (gisavaMatch === 6) return [s, e, 6];
                  if (gisavaMatch === 10 && ![5, 6, 7].includes(val)) return [s, e, 10];
                  return [s, e, val];
                });
                waytypeSummary = [];
                routeSummary = feature.properties?.summary || { distance: 0, duration: 0 };
                usedOrs = true;
              }
            }
          } catch (orsErr) {
            console.warn('ORS falló, usando motor ciclista gratuito:', orsErr);
          }
        }

        // Si no hay ORS_API_KEY (por defecto) o si ORS dio error, usar motor ciclista gratuito (Valhalla + GISAVA)
        if (!usedOrs) {
          const keylessResult = await calculateRouteKeyless(state.origin, state.destination, state.routeMode);
          coords = keylessResult.coords;
          waytypeValues = keylessResult.waytypeValues;
          waytypeSummary = keylessResult.waytypeSummary;
          maneuvers = Array.isArray(keylessResult.maneuvers) ? keylessResult.maneuvers : [];
          routeSummary = keylessResult.routeSummary;
        }

        if (!maneuvers || maneuvers.length === 0) {
          maneuvers = buildFallbackManeuvers(coords);
        }

        state.activeRoute = {
          coords,
          waytypeValues,
          maneuvers,
          totalDistance: routeSummary.distance || 0,
          totalDuration: routeSummary.duration || 0
        };

        state.routeLayerGroup.clearLayers();
        state.geocylRouteOverlay.clearLayers();

        // Dibujar polilíneas separadas con weight: 6 según el valor_waytype
        let hasProhibitedSegment = false;
        let hasWalkSegment = false;

        waytypeValues.forEach(([startIdx, endIdx, waytypeVal]) => {
          const segmentCoords = coords
            .slice(startIdx, endIdx + 1)
            .map(([lon, lat]) => [lat, lon]);

          const styleInfo = getWaytypeStyle(waytypeVal);
          if (styleInfo.category === 'prohibited') hasProhibitedSegment = true;
          if (styleInfo.walkRequired) hasWalkSegment = true;

          // Dibujar sombra / aura blanca para tramos peatonales a pie para máxima visibilidad y contraste
          if (styleInfo.walkRequired && styleInfo.category !== 'prohibited') {
            L.polyline(segmentCoords, {
              color: '#ffffff',
              weight: 9,
              opacity: 0.55,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(state.routeLayerGroup);
          }

          const polyline = L.polyline(segmentCoords, {
            color: styleInfo.color,
            weight: styleInfo.category === 'prohibited' ? 8 : (styleInfo.walkRequired ? 6 : 6),
            dashArray: styleInfo.category === 'prohibited' ? '6, 6' : (styleInfo.walkRequired ? '6, 8' : undefined),
            opacity: 0.96,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(state.routeLayerGroup);

          // Si es un tramo a pie o prohibido, poner un pequeño icono distintivo en el centro del tramo
          if (styleInfo.walkRequired || styleInfo.category === 'prohibited') {
            const midCoord = segmentCoords[Math.floor(segmentCoords.length / 2)];
            if (midCoord) {
              const badgeIcon = styleInfo.category === 'prohibited' ? '🚫' : '🚶';
              const badgeHtml = `<div style="background:${styleInfo.category === 'prohibited' ? '#991b1b' : '#d97706'};color:#fff;border-radius:999px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:0.68rem;box-shadow:0 2px 6px rgba(0,0,0,0.5);border:1.5px solid #fff;">${badgeIcon}</div>`;
              L.marker(midCoord, {
                icon: L.divIcon({
                  className: '',
                  html: badgeHtml,
                  iconSize: [20, 20],
                  iconAnchor: [10, 10]
                })
              }).addTo(state.routeLayerGroup)
                .bindPopup(`<strong>${badgeIcon} ${styleInfo.label}</strong><br><small>${styleInfo.walkRequired ? 'Desmontar y continuar a pie' : 'Prohibida la circulación'}</small>`);
            }
          }

          polyline.bindPopup(`<strong>${styleInfo.label}</strong><br><small>Prioridad #${styleInfo.priority} · ${styleInfo.walkRequired ? '⚠️ ¡Bajarse y cruzar a pie!' : 'Circulación rodada permitida'}</small>`);
        });

        const allLatLngs = coords.map(([lon, lat]) => [lat, lon]);
        if (allLatLngs.length > 0 && !state.navActive) {
          map.fitBounds(L.latLngBounds(allLatLngs), {
            paddingTopLeft: [30, 210],
            paddingBottomRight: [30, 170]
          });
        }

        renderRouteSummary(routeSummary, waytypeSummary, waytypeValues, coords);

        if (state.navActive && state.navLastLatLng) {
          updateNavigationProgressAtPoint(state.navLastLatLng.lat, state.navLastLatLng.lon);
        }

        if (window.innerWidth < 640 && !topPanel.classList.contains('collapsed')) {
          topPanel.classList.add('collapsed');
          togglePanelText.textContent = 'Controles';
          togglePanelIcon.textContent = '▼';
        }

        if (!state.navActive) {
          if (hasProhibitedSegment) {
            showToast('⚠️ Atención: La ruta pasa por un tramo prohibido según la ordenanza. Busca alternativa o cruza a pie.', 'error', 4500);
          } else if (hasWalkSegment) {
            showToast('🚶 Ruta calculada: incluye tramos peatonales/aceras donde debes desmontar y continuar a pie.', 'info', 3500);
          } else {
            showToast(`Ruta 100% legal calculada para ${state.vehicleType === 'scooter' ? 'Patinete Eléctrico' : 'Bicicleta'}.`, 'success', 3000);
          }
        }
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Ocurrió un error al calcular la ruta.', 'error');
      } finally {
        calcBtn.disabled = false;
        updateCalcButtonLabel(state.routeMode);
      }
    }

function renderRouteSummary(routeSummary, waytypeSummary, waytypeValues, coords) {
      const distanceKm = (routeSummary.distance || 0) / 1000;
      const durationMin = Math.round((routeSummary.duration || 0) / 60);

      document.getElementById('summaryDistance').textContent = `${distanceKm.toFixed(2)} km`;
      document.getElementById('summaryDuration').textContent = `${durationMin} min`;

      let safePct = 0;
      let ciclo30Pct = 0;
      let dangerPct = 0;
      let otherPct = 0;
      let prohibitedPct = 0;

      if (waytypeValues.length > 0 && coords.length > 1) {
        let safeDist = 0, ciclo30Dist = 0, dangerDist = 0, otherDist = 0, prohibitedDist = 0;
        waytypeValues.forEach(([s, e, val]) => {
          let segDist = 0;
          for (let i = s; i < e && i < coords.length - 1; i++) {
            const p1 = L.latLng(coords[i][1], coords[i][0]);
            const p2 = L.latLng(coords[i + 1][1], coords[i + 1][0]);
            segDist += p1.distanceTo(p2);
          }
          const { category } = getWaytypeStyle(val);
          if (category === 'safe') safeDist += segDist;
          else if (category === 'ciclo30') ciclo30Dist += segDist;
          else if (category === 'danger') dangerDist += segDist;
          else if (category === 'prohibited') prohibitedDist += segDist;
          else otherDist += segDist;
        });
        const total = safeDist + ciclo30Dist + dangerDist + otherDist + prohibitedDist || 1;
        safePct = (safeDist / total) * 100;
        ciclo30Pct = (ciclo30Dist / total) * 100;
        dangerPct = (dangerDist / total) * 100;
        otherPct = (otherDist / total) * 100;
        prohibitedPct = (prohibitedDist / total) * 100;
      } else if (Array.isArray(waytypeSummary) && waytypeSummary.length > 0) {
        waytypeSummary.forEach((item) => {
          const waytypeVal = Number(item.value);
          const amount = Number(item.amount) || 0;
          const { category } = getWaytypeStyle(waytypeVal);

          if (category === 'safe') safePct += amount;
          else if (category === 'ciclo30') ciclo30Pct += amount;
          else if (category === 'danger') dangerPct += amount;
          else if (category === 'prohibited') prohibitedPct += amount;
          else otherPct += amount;
        });
      }

      const safeRounded = Math.round(safePct);
      const ciclo30Rounded = Math.round(ciclo30Pct);
      const dangerRounded = Math.round(dangerPct);
      const prohibitedRounded = Math.round(prohibitedPct);
      const otherRounded = Math.max(0, 100 - safeRounded - ciclo30Rounded - dangerRounded - prohibitedRounded);

      document.getElementById('summarySafePct').textContent = `🟢 ${safeRounded}% Carril bici`;
      document.getElementById('summaryCiclo30Pct').textContent = `🟣 ${ciclo30Rounded}% Ciclocarril 30`;
      document.getElementById('summaryDangerPct').textContent = `🔴 ${dangerRounded}% Carretera (≤50)`;

      const otherLabel = document.getElementById('summaryOtherPct');
      if (otherRounded > 0 || prohibitedRounded > 0) {
        otherLabel.style.display = 'inline';
        if (prohibitedRounded > 0) {
          otherLabel.textContent = `🚫 ${prohibitedRounded}% Prohibido · 🚶 ${otherRounded}% A pie`;
          otherLabel.style.color = '#ef4444';
        } else {
          otherLabel.textContent = `🚶 ${otherRounded}% Acera (A pie)`;
          otherLabel.style.color = '#fdba74';
        }
      } else {
        otherLabel.style.display = 'none';
      }

      document.getElementById('barSafe').style.width = `${safePct.toFixed(1)}%`;
      document.getElementById('barCiclo30').style.width = `${ciclo30Pct.toFixed(1)}%`;
      document.getElementById('barDanger').style.width = `${dangerPct.toFixed(1)}%`;
      document.getElementById('barOther').style.width = `${(otherPct + prohibitedPct).toFixed(1)}%`;
      if (prohibitedPct > 0) {
        document.getElementById('barOther').style.background = '#b91c1c';
      } else {
        document.getElementById('barOther').style.background = 'var(--other-orange)';
      }

      document.getElementById('routeSummary').classList.add('visible');
    }

function setVehicleType(vehicle, recalculate = true) {
      state.vehicleType = vehicle;
      const btnScooter = document.getElementById('btnVehicleScooter');
      const btnBicycle = document.getElementById('btnVehicleBicycle');
      const badge = document.getElementById('vehicleRuleBadge');
      const noticeBox = document.getElementById('ordinanceNoticeBox');
      const legendWalkLabel = document.getElementById('legendWalkLabel');

      btnScooter?.classList.toggle('active', vehicle === 'scooter');
      btnBicycle?.classList.toggle('active', vehicle === 'bicycle');

      if (vehicle === 'scooter') {
        if (badge) {
          badge.textContent = 'Reglas VMP activas';
          badge.style.color = '#fde047';
        }
        if (noticeBox) {
          noticeBox.className = 'ordinance-alert-box';
          noticeBox.innerHTML = '⚠️ <strong>Patinetes (VMP):</strong> Prohibido circular por túneles urbanos (Labradores, etc.), aceras, carriles bus y parques. Casco y seguro obligatorios. ¡En acera o zona peatonal desmontar y a pie!';
        }
        if (legendWalkLabel) {
          legendWalkLabel.textContent = '🚶 4º A pie (Acera/Peatonal)';
        }
        showToast('🛴 Modo Patinete Eléctrico (VMP): Rutas excluyen túneles y aceras conforme a la Ordenanza.', 'info', 3000);
      } else {
        if (badge) {
          badge.textContent = 'Reglas Bici activas';
          badge.style.color = '#38bdf8';
        }
        if (noticeBox) {
          noticeBox.className = 'ordinance-alert-box bike';
          noticeBox.innerHTML = '🚲 <strong>Bicicletas / Ciclos:</strong> Permitido circular por túneles urbanos (con alumbrado delantero y trasero obligatorio) y sendas ciclistas. En calle Santiago prohibido de 7:30 a 11:00 (carga y descarga). En aceras peatonales desmontar.';
        }
        if (legendWalkLabel) {
          legendWalkLabel.textContent = '🚶 4º A pie (Acera/Carga y descarga)';
        }
        showToast('🚲 Modo Bicicleta: Permite túneles con alumbrado reglamentario y sendas ciclistas.', 'info', 3000);
      }

      if (recalculate && state.origin && state.destination && state.routeLayerGroup && state.routeLayerGroup.getLayers().length > 0) {
        calculateRoute();
      }
    }

function setRouteMode(mode, recalculateIfActive = true) {
      state.routeMode = mode;
      const btnSafe = document.getElementById('btnModeSafe');
      const btnCiclo30 = document.getElementById('btnModeCiclo30');
      const btnFast = document.getElementById('btnModeFast');
      const badge = document.getElementById('routeModeDescBadge');

      btnSafe?.classList.toggle('active', mode === 'safe');
      btnCiclo30?.classList.toggle('active', mode === 'ciclo30');
      btnFast?.classList.toggle('active', mode === 'fast');

      if (mode === 'safe') {
        if (badge) {
          badge.textContent = 'Carril Bici › Ciclo 30';
          badge.style.color = '#38bdf8';
        }
        showToast('Modo Mejor Ruta: 1º Carril bici › 2º Ciclocarril 30 › 3º Carretera › 4º Acera', 'info', 2500);
      } else if (mode === 'ciclo30') {
        if (badge) {
          badge.textContent = 'Prioridad Ciclocarril 30';
          badge.style.color = '#e879f9';
        }
        showToast('Modo Ciclocarril 30 km/h: Prioriza calles 30 km/h y carriles bici', 'info', 2500);
      } else {
        if (badge) {
          badge.textContent = 'Más Rápida / Directa';
          badge.style.color = '#fbbf24';
        }
        showToast('Modo Más Rápida: Trayecto más directo evitando aceras', 'info', 2500);
      }

      updateCalcButtonLabel(mode);

      // Si ya hay origen y destino fijados o ruta dibujada, recalcular automáticamente
      if (recalculateIfActive && state.origin && state.destination && state.routeLayerGroup && state.routeLayerGroup.getLayers().length > 0) {
        calculateRoute();
      }
    }

function updateCalcButtonLabel(mode) {
      const calcBtn = document.getElementById('calcRouteBtn');
      if (!calcBtn) return;
      if (mode === 'safe') {
        calcBtn.textContent = '🛡️ Calcular mejor ruta (Carril Bici › Ciclo 30)';
      } else if (mode === 'ciclo30') {
        calcBtn.textContent = '🟣 Calcular por Ciclocarril 30 + Carril Bici';
      } else {
        calcBtn.textContent = '⚡ Calcular ruta más rápida';
      }
    }

function buildPresetRoutesCatalog() {
      const urbanContainer = document.getElementById('urbanRoutesList');
      URBAN_PRESET_ROUTES.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'route-preset-card';
        card.innerHTML = `
          <div class="route-preset-info">
            <div class="route-preset-name">${item.name}</div>
            <div class="route-preset-meta">${item.meta}</div>
          </div>
          <div class="route-preset-actions">
            <button type="button" class="btn-mini green">Cargar A→B</button>
          </div>
        `;
        card.querySelector('button').addEventListener('click', () => {
          setOriginPoint(item.origin.lat, item.origin.lon, item.origin.label);
          setDestinationPoint(item.dest.lat, item.dest.lon, item.dest.label);
          document.querySelector('[data-tab="tabRoute"]').click();
          calculateRoute();
        });
        urbanContainer.appendChild(card);
      });

      const geocylContainer = document.getElementById('geocylRoutesList');
      GEOCYL_ROUTES.forEach((rt) => {
        const card = document.createElement('div');
        card.className = 'route-preset-card';
        card.innerHTML = `
          <div class="route-preset-info">
            <div class="route-preset-name">${rt.name}</div>
            <div class="route-preset-meta">${rt.meta}</div>
          </div>
          <div class="route-preset-actions">
            <button type="button" class="btn-mini" data-action="view">Ver trazado</button>
            <button type="button" class="btn-mini green" data-action="route">Calcular</button>
          </div>
        `;

        // Ver el trazado original KML de GEOCyL directamente en el mapa (no requiere API key)
        card.querySelector('[data-action="view"]').addEventListener('click', () => {
          state.geocylRouteOverlay.clearLayers();
          state.routeLayerGroup.clearLayers();

          const poly = L.polyline(rt.coords, {
            color: '#2ecc71',
            weight: 6,
            opacity: 0.92
          }).addTo(state.geocylRouteOverlay);

          // Calcular longitud geométrica aproximada del trazado GEOCyL
          let distMeters = 0;
          for (let i = 0; i < rt.coords.length - 1; i++) {
            distMeters += L.latLng(rt.coords[i]).distanceTo(L.latLng(rt.coords[i + 1]));
          }
          const distKm = distMeters / 1000;
          const estMin = Math.round((distKm / 18) * 60);

          poly.bindPopup(`<strong>🌲 ${rt.name}</strong><br><span>${rt.meta}</span><br><small>Distancia aprox: ${distKm.toFixed(1)} km</small>`).openPopup();

          setOriginPoint(rt.start[0], rt.start[1], `Inicio: ${rt.name}`);
          setDestinationPoint(rt.end[0], rt.end[1], `Fin: ${rt.name}`);

          const geocylLonLatCoords = rt.coords.map(([lat, lon]) => [lon, lat]);
          const geocylWaytypes = geocylLonLatCoords.length > 1
            ? [[0, geocylLonLatCoords.length - 1, 6]]
            : [];
          state.activeRoute = {
            coords: geocylLonLatCoords,
            waytypeValues: geocylWaytypes,
            maneuvers: buildFallbackManeuvers(geocylLonLatCoords, rt.name),
            totalDistance: distMeters,
            totalDuration: estMin * 60
          };

          document.getElementById('summaryDistance').textContent = `${distKm.toFixed(2)} km`;
          document.getElementById('summaryDuration').textContent = `${estMin} min`;
          document.getElementById('summarySafePct').textContent = '🟢 95% Carril bici';
          document.getElementById('summaryCiclo30Pct').textContent = '🟣 0% Ciclo 30';
          document.getElementById('summaryDangerPct').textContent = '🔴 5% Carretera';
          document.getElementById('summaryOtherPct').style.display = 'none';
          document.getElementById('barSafe').style.width = '95%';
          document.getElementById('barCiclo30').style.width = '0%';
          document.getElementById('barDanger').style.width = '5%';
          document.getElementById('barOther').style.width = '0%';
          document.getElementById('routeSummary').classList.add('visible');

          map.fitBounds(poly.getBounds(), { paddingTopLeft: [30, 180], paddingBottomRight: [30, 160] });
          if (window.innerWidth < 640) {
            topPanel.classList.add('collapsed');
            togglePanelText.textContent = 'Controles';
            togglePanelIcon.textContent = '▼';
          }
          showToast(`Trazado GEOCyL cargado: ${rt.name}`, 'success', 3000);
        });

        // Calcular ruta usando inicio y fin de la ruta GEOCyL
        card.querySelector('[data-action="route"]').addEventListener('click', () => {
          setOriginPoint(rt.start[0], rt.start[1], `Inicio: ${rt.name}`);
          setDestinationPoint(rt.end[0], rt.end[1], `Fin: ${rt.name}`);
          document.querySelector('[data-tab="tabRoute"]').click();
          calculateRoute();
        });

        geocylContainer.appendChild(card);
      });
    }