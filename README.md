# 🚲 Biciadolid - Mapa GIS de Rutas en Patinete y Bicicleta en Valladolid

Aplicación web SPA (Single Page Application) basada en Leaflet.js para la planificación de rutas ciclistas y de patinete eléctrico (VMP) en Valladolid. Integra capas oficiales del Ayuntamiento de Valladolid (GISAVA), la red ciclista GEOCyL, aparcabicis, estaciones BIKI y Parkibici, y motor de cálculo de rutas según la ordenanza municipal.

---

## 📁 Arquitectura y Estructura del Proyecto

El código ha sido refactorizado siguiendo el principio de **separación de responsabilidades** (SoC - Separation of Concerns) y las mejores prácticas de desarrollo web moderno:

```
Biciadolid/
│
├── index.html                  # Estructura semántica HTML5 (sin estilos ni scripts embebidos)
│
├── css/                        # Hojas de estilo modulares
│   ├── variables.css           # Design tokens, paleta de colores, sombras y radios
│   ├── base.css                # Resets, tipografía, viewport y contenedor del mapa
│   ├── components.css          # Paneles flotantes, buscador, favoritos, selector de capas y modales
│   ├── navigation.css          # HUD de navegación en vivo, itinerario drawer, velocímetro y puck GPS
│   └── style.css               # Hoja maestra unificada con directivas @import
│
├── js/                         # Lógica JavaScript desacoplada y modular
│   ├── config.js               # Constantes geográficas, endpoints GISAVA, rutas y zonas prohibidas
│   ├── state.js                # Estado central de la aplicación (Single Source of Truth)
│   ├── utils.js                # Utilidades puras: Toast, cálculos geográficos, audio y WakeLock
│   ├── map.js                  # Instancia Leaflet, mapas base (Google/OSM) y marcadores
│   ├── layers.js               # Capas GIS oficiales: GISAVA, BIKI, Parkibici, Overpass y Prohibidas
│   ├── places.js               # Sitios guardados (LocalStorage) y buscador geocodificador GISAVA
│   ├── routing.js              # Motor de enrutamiento (Valhalla / ORS), seguridad y catálogo de rutas
│   ├── navigation.js           # Navegación en vivo paso a paso, giroscopio, brújula y HUD
│   └── app.js                  # Orquestador del ciclo de vida y vinculación de eventos del DOM
```

---

## 🚀 Buenas Prácticas Aplicadas

1. **Separación Estricta de Capas**:
   - `HTML`: Solo estructura semántica y accesibilidad, con carga ordenada de dependencias.
   - `CSS`: Estilos divididos por dominio (variables, base, componentes y navegación).
   - `JS`: Módulos especializados sin código espagueti ni funciones duplicadas.

2. **Compatibilidad Universal (`file://` y `http://`)**:
   - La arquitectura funciona de forma nativa abriendo `index.html` con doble clic en el explorador de archivos (protocolo `file://`), sin verse bloqueada por las restricciones CORS de los módulos ES nativos.
   - Es totalmente compatible con cualquier servidor HTTP (Live Server, GitHub Pages, Vercel, Nginx, Apache).

3. **Gestión de Estado Centralizada (`state.js`)**:
   - Un único objeto `state` actúa como fuente unificada de la verdad, evitando variables dispersas en el ámbito global.

4. **Ciclo de Vida Limpio (`app.js`)**:
   - Todos los event listeners e inicializaciones se ejecutan de manera ordenada en el evento `DOMContentLoaded`.
