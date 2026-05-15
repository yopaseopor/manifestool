// Routing functionality for routing.html iframe
let waypoints = [];
let clickMode = null; // 'start', 'end', 'waypoint'
let waypointCounter = 1;
let draggedElement = null;
let draggedIndex = null;

// Reverse geocode using Nominatim
async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || !data.address) return null;
    
    const addr = data.address;
    const parts = [];
    if (addr.house_number) parts.push(addr.house_number);
    if (addr.road || addr.pedestrian || addr.footway) parts.push(addr.road || addr.pedestrian || addr.footway);
    
    let street = parts.join(' ');
    let place = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
    let displayName = data.display_name || '';
    
    // Include municipality in the address
    let municipality = addr.municipality || addr.city || addr.town || addr.village || addr.county || '';
    
    // Build a compact address string
    let addressStr = '';
    if (street) addressStr += street;
    if (municipality) {
      if (addressStr) addressStr += ', ';
      addressStr += municipality;
    }
    
    return {
      street: street,
      city: place,
      municipality: municipality,
      display_name: displayName,
      full: addressStr || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    };
  } catch (e) {
    console.error('Reverse geocode error:', e);
    return null;
  }
}

// Compute sequential order numbers for waypoints: start=1, intermediate=2..N-1, end=N
function getWaypointOrderNumbers() {
  const numbers = {};
  waypoints.forEach((wp, idx) => {
    numbers[wp.id != null ? wp.id : idx] = idx + 1; // 1-based sequential
  });
  return numbers;
}

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

  const orderNumbers = getWaypointOrderNumbers();

  waypoints.forEach((waypoint, index) => {
    const orderNum = orderNumbers[waypoint.id];
    const div = document.createElement('div');
    div.className = 'waypoint-item';
    div.draggable = true;
    div.dataset.index = index;

    div.setAttribute('data-id', waypoint.id);

    const typeName = waypoint.type === 'waypoint' ? 'Waypoint' : waypoint.type.charAt(0).toUpperCase() + waypoint.type.slice(1);
    let addrParts = [];
    if (waypoint.address) {
      if (waypoint.address.street) addrParts.push(waypoint.address.street);
      if (waypoint.address.municipality) addrParts.push(waypoint.address.municipality);
    }
    const addressText = addrParts.length > 0 ? addrParts.join(', ') : '';
    div.innerHTML = `
      <div style="flex:1; min-width:0; padding-right: 4px;">
        <div style="font-weight: bold; font-size: 12px;">#${orderNum} ${typeName}${addressText ? ': ' + addressText : ''}</div>
        <div style="font-size: 10px; color: #888;">${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)}</div>
      </div>
      ${waypoint.type === 'waypoint' ? '<button onclick="removeWaypoint(' + index + ')" style="flex-shrink: 0; margin-left: 4px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">×</button>' : ''}
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
  const orderNumbers = getWaypointOrderNumbers();
  // Send waypoints with order numbers to parent window
  window.parent.postMessage({
    type: 'updateMarkers',
    waypoints: waypoints.map(wp => ({
      ...wp,
      order: orderNumbers[wp.id]
    }))
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

    // Get route from OSRM (steps=true to get turn-by-turn instructions)
    let routeResponse;
    if (transportMode === 'foot') {
      routeResponse = await fetch(`http://routing.openstreetmap.de/routed-foot/route/v1/${profile}/${coordString}?overview=full&geometries=polyline&steps=true`);
    } else {
      routeResponse = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${coordString}?overview=full&geometries=polyline&steps=true`);
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

    // Update route info display directly with steps
    const distance = (route.distance / 1000).toFixed(2);
    const duration = Math.round(route.duration / 60);
    let stepsHtml = '';
    if (route.legs && route.legs[0] && route.legs[0].steps) {
      stepsHtml = '<h4 style="margin-top:10px;margin-bottom:5px;">Directions</h4>';
      stepsHtml += '<ol style="margin:0;padding-left:18px;font-size:12px;">';
      route.legs[0].steps.forEach((step, si) => {
        const stepDist = (step.distance).toFixed(0);
        const stepDur = Math.round(step.duration);
        const instruction = step.maneuver ? step.maneuver.instruction : step.name || '';
        const maneuverType = step.maneuver ? step.maneuver.type : null;
        const mod = step.maneuver ? (step.maneuver.modifier || '') : '';
        const streetName = step.name || step.ref || '';
        
        // Build icon
        let icon = '➡️ ';
        if (maneuverType === 'depart') icon = '🟢 ';
        else if (maneuverType === 'arrive') icon = '🔴 ';
        else if (maneuverType === 'turn' && mod) icon = mod.includes('left') ? '⬅️ ' : '➡️ ';
        else if (maneuverType === 'roundabout' || maneuverType === 'rotary') icon = '🔄 ';
        else if (maneuverType === 'merge') icon = '🔀 ';
        else if (maneuverType === 'fork') icon = '↗️ ';
        else if (maneuverType === 'end of road') icon = '↪️ ';
        
        // Build description
        let description = '';
        if (maneuverType === 'depart') {
          description = `Head ${mod || 'forward'} on ${streetName || 'the road'}`;
        } else if (maneuverType === 'arrive') {
          description = `Arrive at destination`;
        } else if (maneuverType === 'roundabout') {
          const exit = step.maneuver.exit || 1;
          description = `Take exit ${exit} toward ${streetName || 'the road'}`;
        } else if (maneuverType === 'turn') {
          description = `Turn ${mod} onto ${streetName || 'the road'}`;
        } else if (maneuverType === 'continue') {
          description = `Continue onto ${streetName || 'the road'}`;
        } else if (streetName) {
          description = instruction || `Continue on ${streetName}`;
        } else {
          description = instruction || 'Continue';
        }
        stepsHtml += `<li>${icon}${description} <span style="color:#888;font-size:10px;">(${stepDist}m)</span></li>`;
      });
      stepsHtml += '</ol>';
    }
    
    document.getElementById('routeInfo').innerHTML = `
      <div style="margin-bottom:8px;">
        <strong>Route Details</strong><br>
        <span style="font-size:13px;">Distance: ${distance} km &middot; ${duration} min</span><br>
        <span style="font-size:12px;color:#666;">${transportMode.charAt(0).toUpperCase() + transportMode.slice(1)} &middot; ${waypointCoords.length} waypoints</span>
      </div>
      ${stepsHtml}
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
      handleMapClick(data.lonLat);
      break;

    case 'updateRouteInfo':
      updateRouteInfo(data);
      break;

    case 'loadWaypoints':
      waypoints = data.waypoints.map(waypoint => ({
        ...waypoint,
        lat: parseFloat(waypoint.lat),
        lon: parseFloat(waypoint.lon)
      }));
      // Assign unique IDs if missing (for backward compatibility with shared URLs without ids)
      let maxId = 0;
      waypoints.forEach(wp => {
        if (wp.id && !isNaN(wp.id)) {
          if (wp.id > maxId) maxId = wp.id;
        }
      });
      waypointCounter = maxId + 1;
      waypoints.forEach(wp => {
        if (!wp.id || isNaN(wp.id)) {
          wp.id = waypointCounter++;
        }
      });
      // Reset waypoint counter after all IDs are assigned
      maxId = 0;
      waypoints.forEach(wp => { if (wp.id > maxId) maxId = wp.id; });
      waypointCounter = maxId + 1;
      updateWaypointUI();
      updateMapMarkers();
      
      // Populate input fields
      const startWaypoint = waypoints.find(w => w.type === 'start');
      const endWaypoint = waypoints.find(w => w.type === 'end');
      if (startWaypoint) {
        document.getElementById('startInput').value = `${startWaypoint.lat.toFixed(6)}, ${startWaypoint.lon.toFixed(6)}`;
      }
      if (endWaypoint) {
        document.getElementById('endInput').value = `${endWaypoint.lat.toFixed(6)}, ${endWaypoint.lon.toFixed(6)}`;
      }
      
      // Auto-calculate route after loading waypoints
      setTimeout(() => {
        calculateRoute();
      }, 100);
      
      // Geocode all waypoints asynchronously
      waypoints.forEach(wp => {
        if (!wp.address) {
          reverseGeocode(wp.lat, wp.lon).then(addr => {
            if (addr) {
              wp.address = addr;
              updateWaypointUI();
              const inputVal = addr.street || addr.city || addr.full;
              if (wp.type === 'start') {
                document.getElementById('startInput').value = inputVal;
              } else if (wp.type === 'end') {
                document.getElementById('endInput').value = inputVal;
              }
            }
          });
        }
      });
      break;
      
    case 'moveWaypoint':
      // A routing marker was dragged on the map
      const movedId = data.waypointId;
      // Match by ID first (for waypoints), or by type (for start/end which are unique)
      let movedWaypoint;
      if (movedId) {
        movedWaypoint = waypoints.find(w => w.id === movedId);
      }
      if (!movedWaypoint) {
        movedWaypoint = waypoints.find(w => w.type === data.waypointType);
      }
      if (movedWaypoint) {
        movedWaypoint.lon = data.lon;
        movedWaypoint.lat = data.lat;
        
        // Update the input field
        if (data.waypointType === 'start') {
          document.getElementById('startInput').value = `${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}`;
        } else if (data.waypointType === 'end') {
          document.getElementById('endInput').value = `${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}`;
        }
        
        updateWaypointUI();
        updateMapMarkers();
        
        // Fetch address for the new position
        reverseGeocode(data.lat, data.lon).then(addr => {
          if (addr) {
            movedWaypoint.address = addr;
            updateWaypointUI();
            const inputVal = addr.street || addr.city || addr.full;
            if (data.waypointType === 'start') {
              document.getElementById('startInput').value = inputVal;
            } else if (data.waypointType === 'end') {
              document.getElementById('endInput').value = inputVal;
            }
          }
        });
        
        // Clear existing route and recalculate
        window.parent.postMessage({ type: 'clearRoute' }, '*');
        const hasStart = waypoints.some(w => w.type === 'start');
        const hasEnd = waypoints.some(w => w.type === 'end');
        if (hasStart && hasEnd) {
          calculateRoute();
        }
      }
      break;
      
    case 'removeWaypointAt':
      // User clicked a marker on the map to delete it
      const removeId = data.waypointId;
      let removeIndex;
      if (removeId) {
        removeIndex = waypoints.findIndex(w => w.id === removeId);
      } else {
        // Fallback: match by coordinates and type (backward compatibility)
        const clickLon = data.lon;
        const clickLat = data.lat;
        const clickType = data.waypointType;
        removeIndex = waypoints.findIndex(w =>
          w.type === clickType &&
          Math.abs(w.lon - clickLon) < 0.00001 &&
          Math.abs(w.lat - clickLat) < 0.00001
        );
      }
      
      if (removeIndex !== -1) {
        const removed = waypoints[removeIndex];
        waypoints.splice(removeIndex, 1);
        
        // Clear the corresponding input field
        if (removed.type === 'start') {
          document.getElementById('startInput').value = '';
        } else if (removed.type === 'end') {
          document.getElementById('endInput').value = '';
        }
        
        updateWaypointUI();
        updateMapMarkers();
        
        // Clear existing route
        window.parent.postMessage({ type: 'clearRoute' }, '*');
        document.getElementById('routeInfo').innerHTML = '';
      }
      break;
  }
});

// Handle map click from parent
function handleMapClick(coordinate) {
  const [lon, lat] = coordinate;

  let newWaypoint = null;
  
  if (clickMode === 'start') {
    // Remove existing start
    waypoints = waypoints.filter(w => w.type !== 'start');
    newWaypoint = {type: 'start', id: waypointCounter++, lon: lon, lat: lat};
    waypoints.unshift(newWaypoint);
  } else if (clickMode === 'end') {
    // Remove existing end
    waypoints = waypoints.filter(w => w.type !== 'end');
    newWaypoint = {type: 'end', id: waypointCounter++, lon: lon, lat: lat};
    waypoints.push(newWaypoint);
  } else if (clickMode === 'waypoint') {
    newWaypoint = {
      type: 'waypoint',
      id: waypointCounter++,
      lon: lon,
      lat: lat
    };
    waypoints.splice(waypoints.length - (waypoints.some(w => w.type === 'end') ? 1 : 0), 0, newWaypoint);
  }

  updateWaypointUI();
  updateMapMarkers();
  clickMode = null;

  // Update button states
  document.querySelectorAll('.waypoint-controls button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Fetch address asynchronously
  if (newWaypoint) {
    reverseGeocode(lat, lon).then(addr => {
      if (addr) {
        newWaypoint.address = addr;
        updateWaypointUI();
        
        // Update the input field with the address
        const inputVal = addr.street || addr.city || addr.full;
        if (newWaypoint.type === 'start') {
          document.getElementById('startInput').value = inputVal;
        } else if (newWaypoint.type === 'end') {
          document.getElementById('endInput').value = inputVal;
        }
      }
    });
  }
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
