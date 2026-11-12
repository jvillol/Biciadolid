/**
 * Biciadolid - Utilidades Generales
 * Notificaciones Toast, cálculos matemáticos y geográficos, síntesis de voz y WakeLock.
 */


function showToast(message, type = 'info', duration = 4200) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.innerHTML = `
        <span>${message}</span>
        <button type="button" aria-label="Cerrar">&times;</button>
      `;
      toast.querySelector('button').addEventListener('click', () => toast.remove());
      container.appendChild(toast);

      if (duration > 0) {
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, duration);
      }
    }

function getActiveOrsKey() {
      if (state.customApiKey && state.customApiKey.trim() !== '') {
        return state.customApiKey.trim();
      }
      if (ORS_API_KEY && ORS_API_KEY !== 'TU_API_KEY_AQUI') {
        return ORS_API_KEY.trim();
      }
      return '';
    }

function updateApiKeyUI() {
      const box = document.getElementById('apiKeyBox');
      const statusText = document.getElementById('apiKeyStatusText');
      const input = document.getElementById('orsApiKeyInput');
      const activeKey = getActiveOrsKey();

      box.classList.add('configured');
      if (activeKey) {
        statusText.textContent = '✅ Motor ORS + GISAVA activo (API Key propia)';
        input.value = state.customApiKey || ORS_API_KEY;
      } else {
        statusText.textContent = '✅ Motor Ciclista Activo (Gratis sin API Key)';
      }
    }

function pointInPolygon(lat, lon, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect = ((yi > lon) !== (yj > lon)) &&
          (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

function pointToSegmentDistSq(pLat, pLon, aLat, aLon, bLat, bLon) {
      const cosLat = 0.747; // cos(41.65°)
      const dx = (bLon - aLon) * cosLat;
      const dy = bLat - aLat;
      const lenSq = dx * dx + dy * dy;
      const px = (pLon - aLon) * cosLat;
      const py = pLat - aLat;
      if (lenSq === 0) {
        return px * px + py * py;
      }
      let t = (px * dx + py * dy) / lenSq;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const projX = t * dx;
      const projY = t * dy;
      const ex = px - projX;
      const ey = py - projY;
      return ex * ex + ey * ey;
    }

function decodePolyline6(str) {
      let index = 0, lat = 0, lng = 0;
      const coordinates = [];
      const factor = 1e6;
      while (index < str.length) {
        let b, shift = 0, result = 0;
        do {
          b = str.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        shift = 0;
        result = 0;
        do {
          b = str.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        coordinates.push([lng / factor, lat / factor]);
      }
      return coordinates;
    }

function computeBearingDeg(lat1, lon1, lat2, lon2) {
      const toRad = Math.PI / 180;
      const toDeg = 180 / Math.PI;
      const dLon = (lon2 - lon1) * toRad;
      const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
      const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
                Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
      return ((Math.atan2(y, x) * toDeg) + 360) % 360;
    }

function formatMetersText(meters) {
      if (!Number.isFinite(meters) || meters <= 0) return '0 m';
      if (meters < 1000) {
        const rounded = meters < 40 ? Math.round(meters / 5) * 5 : Math.round(meters / 10) * 10;
        return `${Math.max(5, rounded)} m`;
      }
      return `${(meters / 1000).toFixed(1)} km`;
    }

function splitInstruction(raw) {
      if (!raw) return { action: 'Continúa por la ruta', street: '' };
      const cleaned = raw.trim();
      const prepMatch = cleaned.match(/^(.*?)(?:\s+(hacia|en|por)\s+)(.+)$/i);
      if (prepMatch) {
        return {
          action: prepMatch[1].trim(),
          street: `${prepMatch[2]} ${prepMatch[3]}`.trim()
        };
      }
      return {
        action: cleaned,
        street: ''
      };
    }

function playNavChime(type = 'turn') {
      if (!state.navVoiceEnabled) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!state.audioCtx) {
          state.audioCtx = new AudioCtx();
        }
        if (state.audioCtx.state === 'suspended') {
          state.audioCtx.resume();
        }
        const ctx = state.audioCtx;
        const now = ctx.currentTime;

        if (type === 'turn') {
          // Doble tono nítido y claro estilo Google Maps / Waze (D5 587Hz -> A5 880Hz)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now);
          osc.frequency.setValueAtTime(880.0, now + 0.11);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.31);
        } else if (type === 'arrival') {
          // Secuencia alegre de llegada: C5 -> E5 -> G5 -> C6
          const tones = [523.25, 659.25, 783.99, 1046.50];
          tones.forEach((freq, idx) => {
            const t = now + idx * 0.10;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.24, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.25);
          });
        }
      } catch (_) {}
    }

function speakNavInstruction(text, key = '', chimeType = 'turn') {
      if (!state.navVoiceEnabled || !('speechSynthesis' in window) || !text) return;
      if (key && state.navLastSpokenKey === key) return;
      if (key) state.navLastSpokenKey = key;

      playNavChime(chimeType);

      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'es-ES';
        utter.rate = 1.04;
        utter.pitch = 1.0;
        setTimeout(() => {
          if (state.navVoiceEnabled && state.navActive) {
            window.speechSynthesis.speak(utter);
          }
        }, 220);
      } catch (_) {}
    }

async function requestScreenWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          state.navWakeLock = await navigator.wakeLock.request('screen');
        } catch (_) {}
      }
    }

function releaseScreenWakeLock() {
      if (state.navWakeLock) {
        try {
          state.navWakeLock.release();
        } catch (_) {}
        state.navWakeLock = null;
      }
    }

function extractCenterFromGeometry(geom) {
      if (!geom) return null;
      if (geom.type === 'Point') {
        return { lon: geom.coordinates[0], lat: geom.coordinates[1] };
      }
      if (geom.type === 'LineString' && geom.coordinates.length > 0) {
        const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
        return { lon: mid[0], lat: mid[1] };
      }
      if (geom.type === 'MultiLineString' && geom.coordinates.length > 0) {
        const firstLine = geom.coordinates[0];
        const mid = firstLine[Math.floor(firstLine.length / 2)];
        return { lon: mid[0], lat: mid[1] };
      }
      if (geom.type === 'Polygon' && geom.coordinates.length > 0) {
        const ring = geom.coordinates[0];
        const lonSum = ring.reduce((acc, c) => acc + c[0], 0);
        const latSum = ring.reduce((acc, c) => acc + c[1], 0);
        return { lon: lonSum / ring.length, lat: latSum / ring.length };
      }
      return null;
    }