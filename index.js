// Routing cursor mode
let routingCursorMode = null;

// Initialize map using OpenLayers CDN
const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM()
});

const satelliteLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }),
    visible: false
});

const humanitarianLayer = new ol.layer.Tile({
    source: new ol.source.OSM({
        url: 'https://{a-c}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        attributions: '© OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OSM France'
    }),
    visible: false
});

const vectorSource = new ol.source.Vector();
const vectorLayer = new ol.layer.Vector({
  source: vectorSource
});

const map = new ol.Map({
    target: 'map',
    layers: [osmLayer, satelliteLayer, humanitarianLayer, vectorLayer],
    controls: [],
    view: new ol.View({
        center: ol.proj.fromLonLat([2.1734, 41.3851]),
        zoom: 12
    })
});

// Add layer switcher control
const layerElement = document.createElement('div');
layerElement.className = 'ol-control ol-layer';
layerElement.innerHTML = `
  <select id="layerSelect" style="background: white; border: 1px solid #ccc; border-radius: 4px; padding: 2px; font-size: 12px;">
    <option value="osm">OSM</option>
    <option value="satellite">Satellite</option>
    <option value="humanitarian">Humanitarian</option>
  </select>
`;
const layerControl = new ol.control.Control({
  element: layerElement,
});
map.addControl(layerControl);

// Handle layer selection
document.getElementById('layerSelect').addEventListener('change', function(e) {
  const value = e.target.value;
  osmLayer.setVisible(value === 'osm');
  satelliteLayer.setVisible(value === 'satellite');
  humanitarianLayer.setVisible(value === 'humanitarian');
  updateAttribution(value);
});

// Function to update attribution based on selected layer
function updateAttribution(layer) {
  const attributionElement = document.getElementById('attribution');
  if (attributionElement) {
    switch(layer) {
      case 'osm':
        attributionElement.innerHTML = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
        break;
      case 'satellite':
        attributionElement.innerHTML = 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
        break;
      case 'humanitarian':
        attributionElement.innerHTML = '© OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OSM France';
        break;
    }
  }
}

// Add zoom control
map.addControl(new ol.control.Zoom());

// Add search control
const searchElement = document.createElement('div');
searchElement.className = 'ol-control ol-search';
searchElement.innerHTML = '<button><span style="font-size:12px;">🔍</span></button>';
const searchControl = new ol.control.Control({
  element: searchElement,
});
map.addControl(searchControl);

// Add R button control for routing
const rElement = document.createElement('div');
rElement.className = 'ol-control ol-r-button';
rElement.innerHTML = '<button><span style="font-size:18px; font-weight:bold; font-style:italic; color: black;">R</span></button>';
const rControl = new ol.control.Control({
  element: rElement,
});
map.addControl(rControl);

// Add D button control for drawing
const dElement = document.createElement('div');
dElement.className = 'ol-control ol-d-button';
dElement.innerHTML = '<button><span style="font-size:18px; font-weight:bold; font-style:italic; color: black;">✏️</span></button>';
const dControl = new ol.control.Control({
  element: dElement,
});
map.addControl(dControl);

// Add share button control
const shareElement = document.createElement('div');
shareElement.className = 'ol-control ol-share-button';
shareElement.innerHTML = '<button><span style="font-size:18px; font-weight:bold; font-style:italic; color: black;">📤</span></button>';
const shareControl = new ol.control.Control({
  element: shareElement,
});
map.addControl(shareControl);

// Function to serialize current map state to URL parameters
function serializeMapState() {
  const view = map.getView();
  const center = ol.proj.toLonLat(view.getCenter());
  const zoom = view.getZoom();
  const layerSelect = document.getElementById('layerSelect');
  const layer = layerSelect ? layerSelect.value : 'osm';

  const params = new URLSearchParams();
  params.set('lat', center[1].toFixed(6));
  params.set('lon', center[0].toFixed(6));
  params.set('zoom', zoom.toFixed(2));
  params.set('layer', layer);

  // Serialize routing waypoints
  const routingWaypoints = [];
  vectorSource.getFeatures().forEach(feature => {
    if (feature.get('type') === 'routing-marker') {
      const geometry = feature.getGeometry();
      const coords = ol.proj.toLonLat(geometry.getCoordinates());
      const type = feature.get('waypointType') || 'waypoint';
      const id = feature.get('waypointId');
      routingWaypoints.push({
        lat: coords[1].toFixed(6),
        lon: coords[0].toFixed(6),
        type: type,
        id: id
      });
    }
  });
  if (routingWaypoints.length > 0) {
    params.set('routing', JSON.stringify(routingWaypoints));
  }

  // Serialize drawing features
  const drawingFeatures = [];
  vectorSource.getFeatures().forEach(feature => {
    if (!feature.get('type') || feature.get('type') !== 'routing-marker') {
      const geometry = feature.getGeometry();
      const geometryTypeName = geometry.getType();
      let geometryType, coordinates;

      if (geometryTypeName === 'Polygon') {
        geometryType = 'polygon';
        const rawCoords = geometry.getCoordinates();
        if (Array.isArray(rawCoords) && rawCoords.length > 0) {
          // Include all rings (outer boundary and holes)
          coordinates = rawCoords.map(ring => ring.map(coord => ol.proj.toLonLat(coord)));
        }
      } else if (geometryTypeName === 'LineString') {
        geometryType = 'linestring';
        coordinates = geometry.getCoordinates().map(coord => ol.proj.toLonLat(coord));
      } else if (geometryTypeName === 'Point') {
        geometryType = 'point';
        coordinates = ol.proj.toLonLat(geometry.getCoordinates());
      }

      if (geometryType && coordinates && coordinates.length > 0) {
        drawingFeatures.push({
          type: geometryType,
          coordinates: coordinates
        });
      }
    }
  });

  if (drawingFeatures.length > 0) {
    params.set('drawing', JSON.stringify(drawingFeatures));
  }

  // Serialize drawing form state
  try {
    const drawFrame = document.getElementById('drawFrame');
    if (drawFrame && drawFrame.contentWindow) {
      // Get density value
      const densitySlider = drawFrame.contentDocument.getElementById('densitySlider');
      if (densitySlider) {
        params.set('density', densitySlider.value);
      }

      // Get active shape
      const activeShape = drawFrame.contentDocument.querySelector('.active');
      if (activeShape) {
        params.set('shape', activeShape.id.replace('Btn', ''));
      }
    }
  } catch (e) {
    console.error('Error serializing draw form state:', e);
  }

  // Serialize routing form state
  try {
    const routingFrame = document.getElementById('routingFrame');
    if (routingFrame && routingFrame.contentWindow) {
      // Get transport mode
      const transportMode = routingFrame.contentDocument.getElementById('transportMode');
      if (transportMode) {
        params.set('transport', transportMode.value);
      }
    }
  } catch (e) {
    console.error('Error serializing routing form state:', e);
  }

  return params.toString();
}

function applyMapState() {
  const urlParams = new URLSearchParams(window.location.search);

  // Apply basic map settings
  if (urlParams.has('lat') && urlParams.has('lon') && urlParams.has('zoom')) {
    const lat = parseFloat(urlParams.get('lat'));
    const lon = parseFloat(urlParams.get('lon'));
    const zoom = parseFloat(urlParams.get('zoom'));
    map.getView().setCenter(ol.proj.fromLonLat([lon, lat]));
    map.getView().setZoom(zoom);
  }

  if (urlParams.has('layer')) {
    const layer = urlParams.get('layer');
    const layerSelect = document.getElementById('layerSelect');
    if (layerSelect) {
      layerSelect.value = layer;
      layerSelect.dispatchEvent(new Event('change'));
    }
  }

  // Apply drawing form state first
  if (urlParams.has('density') || urlParams.has('shape')) {
    // Wait for draw frame to load
    const checkDrawFrame = () => {
      const drawFrame = document.getElementById('drawFrame');
      if (drawFrame && drawFrame.contentDocument) {
        try {
          // Apply density
          if (urlParams.has('density')) {
            const densityValue = urlParams.get('density');
            const densitySlider = drawFrame.contentDocument.getElementById('densitySlider');
            if (densitySlider) {
              densitySlider.value = densityValue;
              // Trigger input event to update display
              densitySlider.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          // Apply shape selection
          if (urlParams.has('shape')) {
            const shape = urlParams.get('shape');
            const shapeButton = drawFrame.contentDocument.getElementById(`${shape}Btn`);
            if (shapeButton) {
              // Remove active class from all buttons
              const allButtons = drawFrame.contentDocument.querySelectorAll('#shapeButtons button');
              allButtons.forEach(btn => btn.classList.remove('active'));
              // Add active class to selected button
              shapeButton.classList.add('active');
            }
          }
        } catch (e) {
          console.error('Error applying draw form state:', e);
        }
      } else {
        // Retry after a short delay
        setTimeout(checkDrawFrame, 100);
      }
    };
    checkDrawFrame();
  }

  // Apply routing form state
  if (urlParams.has('transport')) {
    // Wait for routing frame to load
    const checkRoutingFrame = () => {
      const routingFrame = document.getElementById('routingFrame');
      if (routingFrame && routingFrame.contentDocument) {
        try {
          // Apply transport mode
          const transportValue = urlParams.get('transport');
          const transportMode = routingFrame.contentDocument.getElementById('transportMode');
          if (transportMode) {
            transportMode.value = transportValue;
          }
        } catch (e) {
          console.error('Error applying routing form state:', e);
        }
      } else {
        // Retry after a short delay
        setTimeout(checkRoutingFrame, 100);
      }
    };
    checkRoutingFrame();
  }

  // Apply routing waypoints (after form states are set)
  if (urlParams.has('routing')) {
    // First, open the routing sidebar
    const routingSidebar = document.querySelector('.routing-sidebar');
    const drawSidebar = document.querySelector('.draw-sidebar');
    const main = document.querySelector('.main');
    
    // Hide draw sidebar if visible
    if (drawSidebar && !drawSidebar.classList.contains('hidden')) {
      drawSidebar.classList.add('hidden');
    }
    
    if (routingSidebar && routingSidebar.classList.contains('hidden')) {
      routingSidebar.classList.remove('hidden');
      main.classList.remove('expanded');
    }
      
    try {
      const routingWaypoints = JSON.parse(urlParams.get('routing'));
      
      // Send waypoints to routing iframe to handle markers and route calculation
      const loadWaypoints = () => {
        const routingFrame = document.getElementById('routingFrame');
        if (routingFrame && routingFrame.contentWindow) {
          routingFrame.contentWindow.postMessage({
            type: 'loadWaypoints',
            waypoints: routingWaypoints
          }, '*');
        } else {
          // Retry after a short delay
          setTimeout(loadWaypoints, 200);
        }
      };
      loadWaypoints();
    } catch (e) {
      console.error('Error parsing routing waypoints:', e);
    }
  }

  // Apply routing route
  if (urlParams.has('route')) {
    try {
      const encodedRoute = urlParams.get('route');
      const routeCoordinates = decodePolyline(encodedRoute);
      const olCoordinates = routeCoordinates.map(coord => ol.proj.fromLonLat(coord));
      
      const routeFeature = new ol.Feature({
        geometry: new ol.geom.LineString(olCoordinates),
        type: 'routing-route'
      });
      
      routeFeature.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: '#ff0000',
          width: 4
        })
      }));
      
      vectorSource.addFeatures([routeFeature]);
      
      // Fit map to route if waypoints are also present
      if (urlParams.has('routing')) {
        const extent = routeFeature.getGeometry().getExtent();
        map.getView().fit(extent, {padding: [20, 20, 20, 20]});
      }
      
      // Send route info to routing iframe if metadata is available
      if (urlParams.has('routeMeta')) {
        try {
          const routeMeta = JSON.parse(urlParams.get('routeMeta'));
          setTimeout(() => {
            const routingFrame = document.getElementById('routingFrame');
            if (routingFrame && routingFrame.contentWindow) {
              routingFrame.contentWindow.postMessage({
                type: 'updateRouteInfo',
                distance: routeMeta.distance,
                duration: routeMeta.duration,
                transportMode: routeMeta.transportMode,
                waypointCount: routeMeta.waypointCount
              }, '*');
            }
          }, 600); // Wait a bit longer for iframe to be ready
        } catch (e) {
          console.error('Error parsing route metadata:', e);
        }
      }
    } catch (e) {
      console.error('Error parsing routing route:', e);
    }
  }

  // Apply drawing features (only if no routing is present)
  if (urlParams.has('drawing') && !urlParams.has('routing')) {
    // First, open the draw sidebar
    const drawSidebar = document.querySelector('.draw-sidebar');
    const main = document.querySelector('.main');
    if (drawSidebar && drawSidebar.classList.contains('hidden')) {
      drawSidebar.classList.remove('hidden');
      main.classList.remove('expanded');
    }

    try {
      const drawingFeatures = JSON.parse(urlParams.get('drawing'));
      console.log('Restoring drawing features:', drawingFeatures);
      setTimeout(() => {
        drawingFeatures.forEach((featureData, index) => {
          let geometry;

          if (featureData.type === 'polygon') {
            // Handle backward compatibility: check if coordinates is array of points or array of rings
            let rings;
            if (featureData.coordinates.length > 0 && Array.isArray(featureData.coordinates[0]) && 
                featureData.coordinates[0].length === 2 && typeof featureData.coordinates[0][0] === 'number') {
              // Old format: coordinates is array of [lon, lat] points - wrap in array for single ring
              rings = [featureData.coordinates.map(coord => ol.proj.fromLonLat(coord))];
            } else {
              // New format: coordinates is array of rings
              rings = featureData.coordinates.map(ring => ring.map(coord => ol.proj.fromLonLat(coord)));
            }
            geometry = new ol.geom.Polygon(rings);

            // Ensure correct orientation for area calculation
            const area = geometry.getArea();
            if (isNaN(area) || area < 0) {
              const coords = geometry.getCoordinates();
              coords[0] = coords[0].slice().reverse();
              geometry.setCoordinates(coords);
            }
          } else if (featureData.type === 'linestring') {
            const coords = featureData.coordinates.map(coord => ol.proj.fromLonLat(coord));
            geometry = new ol.geom.LineString(coords);
          } else if (featureData.type === 'point') {
            const coords = [ol.proj.fromLonLat(featureData.coordinates)];
            geometry = new ol.geom.Point(coords);
          }

          if (geometry) {
            const feature = new ol.Feature({
              geometry: geometry
            });

            // Add polygon number for display
            if (featureData.type === 'polygon') {
              feature.setStyle(new ol.style.Style({
                fill: new ol.style.Fill({color: 'rgba(0, 255, 0, 0.2)'}),
                stroke: new ol.style.Stroke({color: 'green', width: 2}),
                text: new ol.style.Text({
                  text: (index + 1).toString(),
                  fill: new ol.style.Fill({color: 'black'}),
                  stroke: new ol.style.Stroke({color: 'white', width: 3}),
                  font: 'bold 16px Arial',
                  placement: 'point'
                })
              }));
            }

            console.log('Adding feature to vector source:', feature);
            vectorSource.addFeatures([feature]);
          }
        });

        // Notify draw frame to recalculate areas after features are added
        if (drawingFeatures.length > 0) {
          const notifyDrawFrame = () => {
            const drawFrame = document.getElementById('drawFrame');
            if (drawFrame && drawFrame.contentWindow) {
              try {
                console.log('Sending recalculateAreas message');
                drawFrame.contentWindow.postMessage({
                  type: 'recalculateAreas'
                }, '*');
              } catch (e) {
                console.error('Error notifying draw frame:', e);
              }
            } else {
              // Retry after a short delay
              setTimeout(notifyDrawFrame, 100);
            }
          };
          notifyDrawFrame();
        }
      }, 500); // Wait 500ms for iframe to load
    } catch (e) {
      console.error('Error parsing drawing features:', e);
    }
  }

  // Apply drawing form state
  if (urlParams.has('density') || urlParams.has('shape')) {
    // Wait for draw frame to load
    const checkDrawFrame = () => {
      const drawFrame = document.getElementById('drawFrame');
      if (drawFrame && drawFrame.contentDocument) {
        try {
          // Apply density
          if (urlParams.has('density')) {
            const densityValue = urlParams.get('density');
            const densitySlider = drawFrame.contentDocument.getElementById('densitySlider');
            if (densitySlider) {
              densitySlider.value = densityValue;
              // Trigger input event to update display
              densitySlider.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          // Apply shape selection
          if (urlParams.has('shape')) {
            const shape = urlParams.get('shape');
            const shapeButton = drawFrame.contentDocument.getElementById(`${shape}Btn`);
            if (shapeButton) {
              // Remove active class from all buttons
              const allButtons = drawFrame.contentDocument.querySelectorAll('#shapeButtons button');
              allButtons.forEach(btn => btn.classList.remove('active'));
              // Add active class to selected button
              shapeButton.classList.add('active');
            }
          }
        } catch (e) {
          console.error('Error applying draw form state:', e);
        }
      } else {
        // Retry after a short delay
        setTimeout(checkDrawFrame, 100);
      }
    };
    checkDrawFrame();
  }

  // Apply routing form state
  if (urlParams.has('transport')) {
    // Wait for routing frame to load
    const checkRoutingFrame = () => {
      const routingFrame = document.getElementById('routingFrame');
      if (routingFrame && routingFrame.contentDocument) {
        try {
          // Apply transport mode
          const transportValue = urlParams.get('transport');
          const transportMode = routingFrame.contentDocument.getElementById('transportMode');
          if (transportMode) {
            transportMode.value = transportValue;
          }
        } catch (e) {
          console.error('Error applying routing form state:', e);
        }
      } else {
        // Retry after a short delay
        setTimeout(checkRoutingFrame, 100);
      }
    };
    checkRoutingFrame();
  }
}

// Polyline encoding function (Google Maps algorithm)
function encodePolyline(coordinates) {
  let str = '';
  let prevLat = 0, prevLng = 0;
  
  for (let i = 0; i < coordinates.length; i++) {
    const lat = Math.round(coordinates[i][1] * 1e5);
    const lng = Math.round(coordinates[i][0] * 1e5);
    
    const dLat = lat - prevLat;
    const dLng = lng - prevLng;
    
    str += encodeNumber(dLat) + encodeNumber(dLng);
    
    prevLat = lat;
    prevLng = lng;
  }
  
  return str;
}

function encodeNumber(num) {
  num = num << 1;
  if (num < 0) num = ~num;
  
  let str = '';
  while (num >= 0x20) {
    str += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  str += String.fromCharCode(num + 63);
  return str;
}

// Polyline decoding function
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  
  while (index < encoded.length) {
    lat += decodeNumber(encoded, index);
    index = lat[1];
    lng += decodeNumber(encoded, index);
    index = lng[1];
    
    points.push([lng[0] / 1e5, lat[0] / 1e5]);
  }
  
  return points;
}

function decodeNumber(encoded, startIndex) {
  let index = startIndex;
  let result = 0;
  let shift = 0;
  let b;
  
  do {
    b = encoded.charCodeAt(index++) - 63;
    result |= (b & 0x1f) << shift;
    shift += 5;
  } while (b >= 0x20);
  
  const value = (result & 1) ? ~(result >> 1) : (result >> 1);
  return [value, index];
}

// Handle R button click to toggle routing sidebar
rElement.querySelector('button').addEventListener('click', function() {
  const searchSidebar = document.querySelector('.search-sidebar');
  const routingSidebar = document.querySelector('.routing-sidebar');
  const drawSidebar = document.querySelector('.draw-sidebar');
  const main = document.querySelector('.main');
  
  // Hide search sidebar if visible
  if (!searchSidebar.classList.contains('hidden')) {
    searchSidebar.classList.add('hidden');
  }
  
  // Hide draw sidebar if visible
  if (!drawSidebar.classList.contains('hidden')) {
    drawSidebar.classList.add('hidden');
  }
  
  // Toggle routing sidebar
  if (routingSidebar.classList.contains('hidden')) {
    routingSidebar.classList.remove('hidden');
    main.classList.remove('expanded');
  } else {
    routingSidebar.classList.add('hidden');
    main.classList.add('expanded');
  }
});

// Handle D button click to toggle draw sidebar
dElement.querySelector('button').addEventListener('click', function() {
  const searchSidebar = document.querySelector('.sidebar');
  const routingSidebar = document.querySelector('.routing-sidebar');
  const drawSidebar = document.querySelector('.draw-sidebar');
  const main = document.querySelector('.main');
  
  // Hide search sidebar if visible
  if (!searchSidebar.classList.contains('hidden')) {
    searchSidebar.classList.add('hidden');
  }
  
  // Hide routing sidebar if visible
  if (!routingSidebar.classList.contains('hidden')) {
    routingSidebar.classList.add('hidden');
  }
  
  // Toggle draw sidebar
  if (drawSidebar.classList.contains('hidden')) {
    drawSidebar.classList.remove('hidden');
    main.classList.remove('expanded');
  } else {
    drawSidebar.classList.add('hidden');
    main.classList.add('expanded');
  }
});

// Modify interaction for routing markers (drag to move)
let routingModifyInteraction = null;

function setupRoutingModify() {
  if (routingModifyInteraction) {
    map.removeInteraction(routingModifyInteraction);
  }
  
  const markerModifyStyle = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 10,
      fill: new ol.style.Fill({color: 'rgba(255, 255, 0, 0.5)'}),
      stroke: new ol.style.Stroke({color: '#ff9900', width: 2})
    })
  });
  
  routingModifyInteraction = new ol.interaction.Modify({
    source: vectorSource,
    filter: function(feature) {
      return feature.get('type') === 'routing-marker';
    },
    pixelTolerance: 12,
    style: markerModifyStyle
  });
  
      routingModifyInteraction.on('modifyend', function(event) {
    const modifiedFeatures = event.features.getArray();
    modifiedFeatures.forEach(feature => {
      if (feature.get('type') === 'routing-marker') {
        const coords = ol.proj.toLonLat(feature.getGeometry().getCoordinates());
        const waypointType = feature.get('waypointType');
        const waypointId = feature.get('waypointId');
        
        // Notify routing iframe that a marker was moved
        const routingFrame = document.getElementById('routingFrame');
        if (routingFrame && routingFrame.contentWindow) {
          routingFrame.contentWindow.postMessage({
            type: 'moveWaypoint',
            waypointType: waypointType,
            waypointId: waypointId,
            lon: coords[0],
            lat: coords[1]
          }, '*');
        }
      }
    });
  });
  
  map.addInteraction(routingModifyInteraction);
}

setupRoutingModify();

// Map click handler for routing
map.on('click', function(evt) {
  if (routingCursorMode) {
    const coordinate = evt.coordinate;
    const lonLat = ol.proj.toLonLat(coordinate);
    
    // Send click to routing iframe
    const routingFrame = document.getElementById('routingFrame');
    if (routingFrame && routingFrame.contentWindow) {
      routingFrame.contentWindow.postMessage({
        type: 'mapClick',
        lonLat: lonLat
      }, '*');
    }
    
    // Reset cursor
    map.getTargetElement().style.cursor = 'default';
    routingCursorMode = null;
    return;
  }
  
  // Check if a routing marker was clicked (for deletion)
  const pixel = evt.pixel;
  const features = map.getFeaturesAtPixel(pixel, {hitTolerance: 10});
  for (let feature of features) {
      if (feature.get('type') === 'routing-marker') {
      const waypointType = feature.get('waypointType');
      const waypointId = feature.get('waypointId');
      const lonLat = ol.proj.toLonLat(feature.getGeometry().getCoordinates());
      
      const routingFrame = document.getElementById('routingFrame');
      if (routingFrame && routingFrame.contentWindow) {
        routingFrame.contentWindow.postMessage({
          type: 'removeWaypointAt',
          lon: lonLat[0],
          lat: lonLat[1],
          waypointType: waypointType,
          waypointId: waypointId
        }, '*');
      }
      return;
    }
  }
});

// Handle messages from routing iframe
window.addEventListener('message', function(event) {
  const data = event.data;
  
  switch(data.type) {
    case 'setCursor':
      routingCursorMode = data.mode;
      map.getTargetElement().style.cursor = 'crosshair';
      break;
      
    case 'updateMarkers':
      // Clear existing routing markers before adding new ones
      vectorSource.getFeatures().forEach(feature => {
        if (feature.get('type') === 'routing-marker') {
          vectorSource.removeFeature(feature);
        }
      });
      
      data.waypoints.forEach((waypoint, index) => {
        const marker = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.fromLonLat([waypoint.lon, waypoint.lat])),
          type: 'routing-marker',
          waypointType: waypoint.type,
          waypointId: waypoint.id
        });
        
        let color;
        if (waypoint.type === 'start') color = 'green';
        else if (waypoint.type === 'end') color = 'red';
        else color = 'blue';
        
        // Show sequential order number on all markers
        const orderText = waypoint.order ? waypoint.order.toString() : '';
        
        marker.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: 10,
            fill: new ol.style.Fill({color: color}),
            stroke: new ol.style.Stroke({color: 'white', width: 2})
          }),
          text: new ol.style.Text({
            text: orderText,
            fill: new ol.style.Fill({color: 'white'}),
            stroke: new ol.style.Stroke({color: 'rgba(0,0,0,0.5)', width: 3}),
            font: 'bold 12px Arial'
          })
        }));
        
        vectorSource.addFeatures([marker]);
      });
      break;
      
    case 'updateRoute':
      // Update routing route on map
      const routeFeaturesToRemove = [];
      vectorSource.getFeatures().forEach(feature => {
        if (feature.get('type') === 'routing-route') {
          routeFeaturesToRemove.push(feature);
        }
      });
      routeFeaturesToRemove.forEach(feature => vectorSource.removeFeature(feature));
      
      // Convert coordinates to OpenLayers format
      const olCoordinates = data.coordinates.map(coord => ol.proj.fromLonLat(coord));
      
      // Create route feature
      const routeFeature = new ol.Feature({
        geometry: new ol.geom.LineString(olCoordinates),
        type: 'routing-route'
      });
      
      // Add route line
      vectorSource.addFeatures([routeFeature]);
      routeFeature.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: '#ff0000',
          width: 4
        })
      }));
      
      // Store route metadata for serialization
      routeFeature.set('routeMeta', {
        distance: (data.route.distance / 1000).toFixed(2),
        duration: Math.round(data.route.duration / 60),
        transportMode: data.transportMode,
        waypointCount: data.waypointCount
      });
      
      // Fit map to route
      const extent = routeFeature.getGeometry().getExtent();
      map.getView().fit(extent, {padding: [20, 20, 20, 20]});
      
      // Send route info back to routing iframe
      const routingFrame = document.getElementById('routingFrame');
      if (routingFrame && routingFrame.contentWindow) {
        const distance = (data.route.distance / 1000).toFixed(2);
        const duration = Math.round(data.route.duration / 60);
        
        routingFrame.contentWindow.postMessage({
          type: 'updateRouteInfo',
          distance: distance,
          duration: duration,
          transportMode: data.transportMode,
          waypointCount: data.waypointCount
        }, '*');
      }
      break;
      
    case 'clearRoute':
      // Clear routing route
      const featuresToRemove = [];
      vectorSource.getFeatures().forEach(feature => {
        if (feature.get('type') === 'routing-route') {
          featuresToRemove.push(feature);
        }
      });
      featuresToRemove.forEach(feature => vectorSource.removeFeature(feature));
      break;
      
    case 'clearAll':
      // Clear all routing elements
      vectorSource.getFeatures().forEach(feature => {
        if (feature.get('type') === 'routing-marker' || feature.get('type') === 'routing-route') {
          vectorSource.removeFeature(feature);
        }
      });
      break;
      
    case 'startDrawing':
      // Start drawing polygon
      if (drawInteraction) {
        map.removeInteraction(drawInteraction);
      }
      drawInteraction = new ol.interaction.Draw({
        source: vectorSource,
        type: data.geometryType // Use geometryType from message
      });
      
      drawInteraction.on('drawstart', function(event) {
        drawSketch = event.feature;
      });
      
      drawInteraction.on('drawend', function(event) {
        const geometry = event.feature.getGeometry();
        const area = geometry.getArea();
        const drawFrame = document.getElementById('drawFrame');
        if (drawFrame && drawFrame.contentWindow) {
          drawFrame.contentWindow.postMessage({
            type: 'updateArea',
            area: area
          }, '*');
        }
      });
      
      map.addInteraction(drawInteraction);
      // Make drawFrame transparent to mouse events when drawing starts
      const drawFrameStart = document.getElementById('drawFrame');
      if (drawFrameStart) {
        drawFrameStart.style.pointerEvents = 'none';
      }
      break;
      
    case 'finishDrawing':
      // Finish drawing
      if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
        drawSketch = null;
      }
      // Restore pointer events on drawFrame
      const drawFrameFinish = document.getElementById('drawFrame');
      if (drawFrameFinish) {
        drawFrameFinish.style.pointerEvents = 'auto';
      }
      break;
      
    case 'clearDrawing':
      // Clear drawing
      vectorSource.getFeatures().forEach(feature => {
        if (feature !== drawSketch) {
          vectorSource.removeFeature(feature);
        }
      });
      // Restore pointer events on drawFrame
      const drawFrameClear = document.getElementById('drawFrame');
      if (drawFrameClear) {
        drawFrameClear.style.pointerEvents = 'auto';
      }
      break;
      
    case 'searchResultClick':
      // Handle search result click from iframe
      const bbox = data.bbox;
      const south = parseFloat(bbox[0]);
      const north = parseFloat(bbox[1]);
      const west = parseFloat(bbox[2]);
      const east = parseFloat(bbox[3]);
      const searchExtent = ol.proj.transformExtent([west, south, east, north], 'EPSG:4326', 'EPSG:3857');
      map.getView().fit(searchExtent, {duration: 1000});
      
      // Add marker at center
      vectorSource.clear();
      const center = [(west + east) / 2, (south + north) / 2];
      const marker = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat(center))
      });
      vectorSource.addFeatures([marker]);
      marker.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({color: 'red'}),
          stroke: new ol.style.Stroke({color: 'white', width: 2})
        })
      }));
      break;
  }
});

// Toggle sidebar on lens icon click
searchElement.querySelector('button').addEventListener('click', function() {
  const searchSidebar = document.querySelector('.search-sidebar');
  const routingSidebar = document.querySelector('.routing-sidebar');
  const drawSidebar = document.querySelector('.draw-sidebar');
  const main = document.querySelector('.main');
  
  // Hide routing sidebar if visible
  if (!routingSidebar.classList.contains('hidden')) {
    routingSidebar.classList.add('hidden');
  }
  
  // Hide draw sidebar if visible
  if (!drawSidebar.classList.contains('hidden')) {
    drawSidebar.classList.add('hidden');
  }
  
  if (searchSidebar.classList.contains('hidden')) {
    searchSidebar.classList.remove('hidden');
    main.classList.remove('expanded');
  } else {
    searchSidebar.classList.add('hidden');
    main.classList.add('expanded');
  }
});

// Expose map and vectorSource to iframes
window.map = map;
window.vectorSource = vectorSource;

// Apply map state from URL parameters on page load
applyMapState();

// Handle share button click
shareElement.querySelector('button').addEventListener('click', async function() {
  const stateParams = serializeMapState();
  const baseUrl = window.location.origin + window.location.pathname;
  const shareUrl = `${baseUrl}?${stateParams}`;

  try {
    await navigator.clipboard.writeText(shareUrl);
    // Optional: Show a temporary notification
    const notification = document.createElement('div');
    notification.innerHTML = 'URL copied to clipboard!';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(notification);
    setTimeout(() => document.body.removeChild(notification), 2000);
  } catch (err) {
    console.error('Failed to copy URL to clipboard:', err);
    // Fallback: open URL in new window/tab
    window.open(shareUrl, '_blank');
  }
});

setTimeout(function() {
  const attributionElement = document.getElementById('attribution');
  if (attributionElement) {
    attributionElement.innerHTML = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  }
}, 0);

