/**
 * Biciadolid - Estado Central de la Aplicación (Single Source of Truth)
 */

const state = {
      vehicleType: 'scooter', // 'scooter' (Patinete VMP) o 'bicycle' (Bicicleta)
      origin: null,
      destination: null,
      pickMode: 'origin',
      routeMode: 'safe', // 'safe', 'ciclo30' o 'fast'
      originMarker: null,
      destMarker: null,
      baseTileLayer: null,
      routeLayerGroup: null,
      cyclewaysLayerGroup: null,
      gisavaCyclewaysLayer: null,
      prohibitedZonesLayer: null,
      bikiLayer: null,
      parkibiciLayer: null,
      aparcabicisLayer: null,
      geocylProjectedLayer: null,
      geocylRouteOverlay: null,
      savedPlacesLayer: null,
      cyclewaysLoaded: false,
      gisavaCyclewaysLoaded: false,
      bikiLoaded: false,
      parkibiciLoaded: false,
      aparcabicisLoaded: false,
      geocylProjectedLoaded: false,
      pendingFavCoords: null,
      customApiKey: localStorage.getItem('biciadolid_ors_key') || '',
      navSavedLayers: null,
      gyroActive: false,
      gyroAvailable: false,
      navLastGpsHeading: null,
      navLastSpeedKmh: 0
    };

// Propiedades de estado para la navegación en tiempo real
state.activeRoute = null;
state.navActive = false;
state.navWatchId = null;
state.navFollowUser = true;
state.navLastLatLng = null;
state.navUserMarker = null;
state.navVoiceEnabled = true;
state.navCurrentManeuverIdx = 0;
state.navWakeLock = null;
state.currentRiderHeading = 0;
