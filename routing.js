// Routing functionality for routing.html iframe
let waypoints = [];
let clickMode = null; // 'start', 'end', 'waypoint'
let waypointCounter = 1;
let draggedElement = null;
let draggedIndex = null;

// Update waypoint UI
function updateWaypointUI() {
  const waypointList = document.getElementById('waypointList');
  waypointList.innerHTML = '';

  // Add dragover listener to the container if not already added
  if (!waypointList.hasAttribute('data-dragover-added')) {
    waypointList.addEventListener('dragover', function(event) {
      event.preventDefault();
      console.log('Waypoint list dragover');
    });
    waypointList.setAttribute('data-dragover-added', 'true');
  }

  waypoints.forEach((waypoint, index) => {
    const div = document.createElement('div');
    div.className = 'waypoint-item';
    div.draggable = true;
    div.dataset.index = index;

    div.draggable = true;
    div.setAttribute('data-id', waypoint.id);

    div.innerHTML = `
      <span>${waypoint.type === 'waypoint' ? 'Waypoint ' + waypoint.id : waypoint.type.charAt(0).toUpperCase() + waypoint.type.slice(1)}: ${waypoint.lat.toFixed(6)}, ${waypoint.lon.toFixed(6)}</span>
      ${waypoint.type === 'waypoint' ? '<button onclick="removeWaypoint(' + index + ')">×</button>' : ''}
    `;

    div.addEventListener('dragstart', function(event) {
      if (waypoint.type === 'waypoint') {
        console.log('Drag start for waypoint id:', waypoint.id);
        event.dataTransfer.setData('text/plain', waypoint.id);
        draggedElement = event.target;
      }
    });

    div.addEventListener('dragover', function(event) {
      event.preventDefault();
    });

    div.addEventListener('drop', function(event) {
      const targetItem = event.target.closest('.waypoint-item');
      if (targetItem && targetItem.draggable) {
        handleDrop(event);
      }
    });

    div.addEventListener('dragend', handleDragEnd);

    waypointList.appendChild(div);
  });
}

// Remove waypoint
function removeWaypoint(index) {
  waypoints.splice(index, 1);
  updateWaypointUI();
  updateMapMarkers();
}

// Update map markers
function updateMapMarkers() {
  // Send waypoints to parent window
  window.parent.postMessage({
    type: 'updateMarkers',
    waypoints: waypoints
  }, '*');
}

// Drag and drop handlers
function handleDragStart(e) {
  draggedElement = e.target;
  draggedIndex = parseInt(e.target.dataset.index);
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.target.outerHTML);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const target = e.target.closest('.waypoint-item');
  if (target && target !== draggedElement) {
    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    // Remove previous drag-over classes
    document.querySelectorAll('.waypoint-item').forEach(item => {
      item.classList.remove('drag-over');
    });

    // Add drag-over class to target
    target.classList.add('drag-over');
  }
}

function handleDrop(e) {
  console.log('handleDrop called');
  e.preventDefault();

  const target = e.target.closest('.waypoint-item');
  console.log('target:', target);
  console.log('draggedElement:', draggedElement);
  if (target && target !== draggedElement && target.draggable) {
    const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
    const targetIndex = parseInt(target.dataset.index);

    // Calculate insertion position based on drop location
    const targetRect = target.getBoundingClientRect();
    const dropY = e.clientY;
    const midpoint = targetRect.top + targetRect.height / 2;

    // If dropping below the midpoint, insert after the target
    // If dropping above the midpoint, insert before the target
    const insertIndex = dropY > midpoint ? targetIndex + 1 : targetIndex;

    // Find the dragged waypoint by id
    const draggedIndex = waypoints.findIndex(w => w.id === draggedId);
    console.log('draggedId:', draggedId, 'targetIndex:', targetIndex, 'insertIndex:', insertIndex, 'draggedIndex:', draggedIndex);
    if (draggedIndex === -1) return;

    // Reorder waypoints array
    const [draggedWaypoint] = waypoints.splice(draggedIndex, 1);
    waypoints.splice(insertIndex, 0, draggedWaypoint);
    console.log('Waypoints after reorder:', waypoints.map(w => ({type: w.type, id: w.id})));

    // Update UI and markers
    updateWaypointUI();
    updateMapMarkers();

    // Clear existing route and auto-recalculate
    window.parent.postMessage({ type: 'clearRoute' }, '*');

    // Auto-recalculate route if we have start and end points
    const startWaypoint = waypoints.find(w => w.type === 'start');
    const endWaypoint = waypoints.find(w => w.type === 'end');
    if (startWaypoint && endWaypoint) {
      // Trigger route calculation automatically
      const transportMode = document.getElementById('transportMode').value;
      calculateRoute();
    }
  }

  // Remove drag-over classes
  document.querySelectorAll('.waypoint-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedElement = null;
  draggedIndex = null;

  // Remove drag-over classes
  document.querySelectorAll('.waypoint-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

// Waypoint control buttons
document.getElementById('setStartBtn').addEventListener('click', function() {
  clickMode = 'start';
  window.parent.postMessage({ type: 'setCursor', mode: 'start' }, '*');
  document.querySelectorAll('.waypoint-controls button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
});

document.getElementById('setEndBtn').addEventListener('click', function() {
  clickMode = 'end';
  window.parent.postMessage({ type: 'setCursor', mode: 'end' }, '*');
  document.querySelectorAll('.waypoint-controls button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
});

document.getElementById('addWaypointBtn').addEventListener('click', function() {
  clickMode = 'waypoint';
  window.parent.postMessage({ type: 'setCursor', mode: 'waypoint' }, '*');
  document.querySelectorAll('.waypoint-controls button').forEach(btn => btn.classList.remove('active'));
  this.classList.add('active');
});

document.getElementById('clearAllBtn').addEventListener('click', function() {
  waypoints = [];
  waypointCounter = 1;
  updateWaypointUI();
  window.parent.postMessage({ type: 'clearAll' }, '*');
  document.getElementById('startInput').value = '';
  document.getElementById('endInput').value = '';
  document.getElementById('routeInfo').innerHTML = '';
  clickMode = null;
  document.querySelectorAll('.waypoint-controls button').forEach(btn => btn.classList.remove('active'));
});

// Route button
document.getElementById('routeBtn').addEventListener('click', function() {
  console.log('Get Route button clicked');
  // Clear existing route and route info immediately
  window.parent.postMessage({ type: 'clearRoute' }, '*');
  document.getElementById('routeInfo').innerHTML = '';
  calculateRoute();
});

// Calculate route function
async function calculateRoute() {
  console.log('calculateRoute called');
  const transportMode = document.getElementById('transportMode').value;
  console.log('Transport mode:', transportMode);

  // Check if we have waypoints set
  const startWaypoint = waypoints.find(w => w.type === 'start');
  const endWaypoint = waypoints.find(w => w.type === 'end');
  console.log('Start waypoint:', startWaypoint);
  console.log('End waypoint:', endWaypoint);

  if (!startWaypoint || !endWaypoint) {
    alert('Please set both start and end points by clicking on the map or entering locations');
    return;
  }

  // Clear existing route before calculating new one
  window.parent.postMessage({ type: 'clearRoute' }, '*');

  try {
    // Build coordinate string for all waypoints in order
    const waypointCoords = [];

    // Add start
    waypointCoords.push(`${startWaypoint.lon},${startWaypoint.lat}`);

    // Add intermediate waypoints (in current array order, not sorted by id)
    const intermediateWaypoints = waypoints.filter(w => w.type === 'waypoint');
    intermediateWaypoints.forEach(wp => {
      waypointCoords.push(`${wp.lon},${wp.lat}`);
    });

    // Add end
    waypointCoords.push(`${endWaypoint.lon},${endWaypoint.lat}`);

    console.log('Waypoint coordinates:', waypointCoords);

    // Map transport mode to OSRM profile
    const profileMap = {
      foot: 'walking',
      bike: 'cycling',
      car: 'driving',
      bus: 'driving'
    };

    const profile = profileMap[transportMode];
    const coordString = waypointCoords.join(';');
    console.log('API URL profile:', profile);
    console.log('Coordinate string:', coordString);

    // Get route from OSRM
    let routeResponse;
    if (transportMode === 'foot') {
      routeResponse = await fetch(`http://routing.openstreetmap.de/routed-foot/route/v1/${profile}/${coordString}?overview=full&geometries=polyline`);
    } else {
      routeResponse = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${coordString}?overview=full&geometries=polyline`);
    }

    console.log('Route response status:', routeResponse.status);
    console.log('Route response ok:', routeResponse.ok);

    const routeData = await routeResponse.json();
    console.log('Route data:', routeData);

    if (!routeData.routes || routeData.routes.length === 0) {
      alert('No route found');
      return;
    }

    const route = routeData.routes[0];
    const geometry = route.geometry;
    console.log('Route geometry:', geometry);

    // Decode polyline
    const coordinates = decodePolyline(geometry);
    console.log('Decoded coordinates length:', coordinates.length);

    // Send route data to parent window
    window.parent.postMessage({
      type: 'updateRoute',
      coordinates: coordinates,
      route: route,
      transportMode: transportMode,
      waypointCount: waypointCoords.length
    }, '*');

    // Update route info display directly
    const distance = (route.distance / 1000).toFixed(2);
    const duration = Math.round(route.duration / 60);
    document.getElementById('routeInfo').innerHTML = `
      <h4>Route Details</h4>
      <p>Distance: ${distance} km</p>
      <p>Estimated time: ${duration} minutes</p>
      <p>Transport: ${transportMode.charAt(0).toUpperCase() + transportMode.slice(1)}</p>
      <p>Waypoints: ${waypointCoords.length}</p>
    `;

    console.log('Route calculation completed successfully');

  } catch (error) {
    console.error('Routing error:', error);
    alert('Routing failed. Please try again.');
  }
}

// Message handler for parent window communication
window.addEventListener('message', function(event) {
  const data = event.data;

  switch(data.type) {
    case 'mapClick':
      handleMapClick(data.coordinate);
      break;

    case 'updateRouteInfo':
      updateRouteInfo(data);
      break;
  }
});

// Handle map click from parent
function handleMapClick(coordinate) {
  const [lon, lat] = coordinate;

  if (clickMode === 'start') {
    // Remove existing start
    waypoints = waypoints.filter(w => w.type !== 'start');
    waypoints.unshift({type: 'start', id: waypointCounter++, lon: lon, lat: lat});
    document.getElementById('startInput').value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  } else if (clickMode === 'end') {
    // Remove existing end
    waypoints = waypoints.filter(w => w.type !== 'end');
    waypoints.push({type: 'end', id: waypointCounter++, lon: lon, lat: lat});
    document.getElementById('endInput').value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  } else if (clickMode === 'waypoint') {
    waypoints.splice(waypoints.length - (waypoints.some(w => w.type === 'end') ? 1 : 0), 0, {
      type: 'waypoint',
      id: waypointCounter++,
      lon: lon,
      lat: lat
    });
  }

  updateWaypointUI();
  updateMapMarkers();
  clickMode = null;

  // Update button states
  document.querySelectorAll('.waypoint-controls button').forEach(btn => {
    btn.classList.remove('active');
  });
}

// Update route info display
function updateRouteInfo(data) {
  document.getElementById('routeInfo').innerHTML = `
    <h4>Route Details</h4>
    <p>Distance: ${data.distance} km</p>
    <p>Estimated time: ${data.duration} minutes</p>
    <p>Transport: ${data.transportMode.charAt(0).toUpperCase() + data.transportMode.slice(1)}</p>
    <p>Waypoints: ${data.waypointCount}</p>
  `;
}

// Polyline decoding function
function decodePolyline(encoded) {
  const points = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([lng * 1e-5, lat * 1e-5]);
  }
  return points;
}
