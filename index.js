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

// Routing cursor mode
let routingCursorMode = null;

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
        coordinate: lonLat
      }, '*');
    }
    
    // Reset cursor
    map.getTargetElement().style.cursor = 'default';
    routingCursorMode = null;
  }
});

// Message handler for routing iframe communication
window.addEventListener('message', function(event) {
  const data = event.data;
  
  switch(data.type) {
    case 'setCursor':
      routingCursorMode = data.mode;
      map.getTargetElement().style.cursor = 'crosshair';
      break;
      
    case 'updateMarkers':
      // Update routing markers on map
      vectorSource.getFeatures().forEach(feature => {
        if (feature.get('type') === 'routing-marker') {
          vectorSource.removeFeature(feature);
        }
      });
      
      data.waypoints.forEach((waypoint, index) => {
        const marker = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.fromLonLat([waypoint.lon, waypoint.lat])),
          type: 'routing-marker'
        });
        
        let color;
        if (waypoint.type === 'start') color = 'green';
        else if (waypoint.type === 'end') color = 'red';
        else color = 'blue';
        
        marker.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: 8,
            fill: new ol.style.Fill({color: color}),
            stroke: new ol.style.Stroke({color: 'white', width: 2})
          }),
          text: new ol.style.Text({
            text: waypoint.type === 'waypoint' ? waypoint.id.toString() : '',
            fill: new ol.style.Fill({color: 'white'}),
            font: '12px Arial'
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
        type: 'Polygon'
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
      break;
      
    case 'finishDrawing':
      // Finish drawing
      if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
        drawSketch = null;
      }
      break;
      
    case 'clearDrawing':
      // Clear drawing
      vectorSource.getFeatures().forEach(feature => {
        if (feature !== drawSketch) {
          vectorSource.removeFeature(feature);
        }
      });
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
setTimeout(function() {
  const attributionElement = document.getElementById('attribution');
  if (attributionElement) {
    attributionElement.innerHTML = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  }
}, 0);

