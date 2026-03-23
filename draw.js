// Draw tool functionality
let drawInteraction = null;
let sketch = null;
let isDrawing = false;
let drawnPolygons = [];
let polygonCounter = 1;
let selectedShape = 'Polygon'; // Default shape

function setActiveShape(activeId) {
  // Remove active class from all shape buttons
  ['squareBtn', 'circleBtn', 'triangleBtn', 'polygonBtn'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
  // Add active class to the clicked button
  document.getElementById(activeId).classList.add('active');
}

// Set default active shape
setActiveShape('polygonBtn');

// Shape button event listeners
document.getElementById('squareBtn').addEventListener('click', function() {
  setActiveShape('squareBtn');
  startDrawing('Polygon'); // Squares as polygons
});

document.getElementById('circleBtn').addEventListener('click', function() {
  setActiveShape('circleBtn');
  startDrawing('Circle');
});

document.getElementById('triangleBtn').addEventListener('click', function() {
  setActiveShape('triangleBtn');
  startDrawing('Polygon'); // Triangles as polygons
});

document.getElementById('polygonBtn').addEventListener('click', function() {
  setActiveShape('polygonBtn');
  startDrawing('Polygon');
});

let currentShapeType = 'Polygon'; // Track current shape being drawn

function startDrawing(shapeType) {
  currentShapeType = shapeType; // Store the shape type for constraint application
  
  if (isDrawing) {
    // Finish current drawing first
    finishDrawing();
  }
  
  if (drawInteraction) {
    window.parent.map.removeInteraction(drawInteraction);
  }
  
  drawInteraction = new ol.interaction.Draw({
    source: window.parent.vectorSource,
    type: shapeType,
    style: function(feature) {
      const geometry = feature.getGeometry();
      const styles = [];
      
      // Base style
      styles.push(new ol.style.Style({
        fill: new ol.style.Fill({color: 'rgba(0, 255, 0, 0.2)'}),
        stroke: new ol.style.Stroke({color: 'green', width: 2})
      }));
      
      if (geometry.getType() === 'Circle') {
        const center = geometry.getCenter();
        const radius = geometry.getRadius();
        const radiusKm = (radius / 1000).toFixed(2); // Convert to km for readability
        
        styles.push(new ol.style.Style({
          text: new ol.style.Text({
            text: `Radius: ${radiusKm} km`,
            fill: new ol.style.Fill({color: 'black'}),
            stroke: new ol.style.Stroke({color: 'white', width: 3}),
            font: 'bold 12px Arial',
            placement: 'point',
            offsetY: -20
          }),
          geometry: new ol.geom.Point(center)
        }));
      } else if (geometry.getType() === 'Polygon') {
        const coordinates = geometry.getCoordinates()[0];
        if (coordinates.length > 1) {
          for (let i = 0; i < coordinates.length - 1; i++) {
            const start = coordinates[i];
            const end = coordinates[i + 1];
            
            // Calculate distance in meters
            const distance = Math.sqrt(Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2));
            const distanceKm = (distance / 1000).toFixed(2);
            
            // Midpoint for text placement
            const midX = (start[0] + end[0]) / 2;
            const midY = (start[1] + end[1]) / 2;
            
            styles.push(new ol.style.Style({
              text: new ol.style.Text({
                text: `${distanceKm} km`,
                fill: new ol.style.Fill({color: 'black'}),
                stroke: new ol.style.Stroke({color: 'white', width: 2}),
                font: 'bold 11px Arial',
                placement: 'point'
              }),
              geometry: new ol.geom.Point([midX, midY])
            }));
          }
        }
      }
      
      return styles;
    }
  });

  drawInteraction.on('drawstart', function(event) {
    sketch = event.feature;
  });

  drawInteraction.on('drawend', function(event) {
    const geometry = event.feature.getGeometry();
    let coordinates = geometry.getCoordinates();
    
    // Calculate area immediately after drawing
    let shapeArea;
    if (typeof geometry.getArea === 'function') {
      shapeArea = geometry.getArea();
    } else if (typeof geometry.getRadius === 'function') {
      const radius = geometry.getRadius();
      shapeArea = Math.PI * radius * radius;
    } else {
      shapeArea = 0;
    }
    
    // Apply shape constraints
    if (currentShapeType === 'Polygon') {
      // Check which button was active to determine constraint type
      const activeButton = document.querySelector('.active');
      if (activeButton && activeButton.id === 'squareBtn') {
        coordinates = constrainToSquare(coordinates);
      } else if (activeButton && activeButton.id === 'triangleBtn') {
        coordinates = constrainToTriangle(coordinates);
      }
    }
    
    // Update geometry with constrained coordinates
    if (currentShapeType === 'Polygon') {
      geometry.setCoordinates(coordinates);
    }
    
    // Check if this shape is inside any existing shape (hole detection)
    let isHole = false;
    let parentPolygon = null;
    
    for (let polygon of drawnPolygons) {
      let allPointsInside = true;
      
      if (currentShapeType === 'Circle' && polygon.geometry.getType() === 'Circle') {
        // Circle inside circle: check if child circle center + radius is within parent circle
        const childCenter = geometry.getCenter();
        const childRadius = geometry.getRadius();
        const parentCenter = polygon.geometry.getCenter();
        const parentRadius = polygon.geometry.getRadius();
        
        const distance = Math.sqrt(Math.pow(childCenter[0] - parentCenter[0], 2) + Math.pow(childCenter[1] - parentCenter[1], 2));
        if (distance + childRadius > parentRadius) {
          allPointsInside = false;
        }
      } else if (currentShapeType === 'Circle' && polygon.geometry.getType() === 'Polygon') {
        // Circle inside polygon: check if circle boundary points are inside polygon
        const center = geometry.getCenter();
        const radius = geometry.getRadius();
        const parentCoords = polygon.geometry.getCoordinates()[0];
        
        // Check points around the circle perimeter
        for (let i = 0; i < 8; i++) {
          const angle = (i * 2 * Math.PI) / 8;
          const point = [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
          if (!isPointInPolygon(point, parentCoords)) {
            allPointsInside = false;
            break;
          }
        }
      } else if (currentShapeType === 'Polygon' && polygon.geometry.getType() === 'Polygon') {
        // Polygon inside polygon
        const parentCoords = polygon.geometry.getCoordinates()[0];
        for (let coord of coordinates[0]) {
          if (!isPointInPolygon(coord, parentCoords)) {
            allPointsInside = false;
            break;
          }
        }
      } else if (currentShapeType === 'Polygon' && polygon.geometry.getType() === 'Circle') {
        // Polygon inside circle
        const parentCenter = polygon.geometry.getCenter();
        const parentRadius = polygon.geometry.getRadius();
        for (let coord of coordinates[0]) {
          const distance = Math.sqrt(Math.pow(coord[0] - parentCenter[0], 2) + Math.pow(coord[1] - parentCenter[1], 2));
          if (distance > parentRadius) {
            allPointsInside = false;
            break;
          }
        }
      }
      
      if (allPointsInside) {
        isHole = true;
        parentPolygon = polygon;
        break;
      }
    }
    
    // Style the polygon based on whether it's a hole or outer polygon
    if (isHole) {
      event.feature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({color: 'rgba(255, 0, 0, 0.2)'}),
        stroke: new ol.style.Stroke({color: 'red', width: 2})
      }));
      // Remove the hole from the parent polygon area calculation
      if (parentPolygon) {
        let holeArea;
        if (typeof geometry.getArea === 'function') {
          holeArea = geometry.getArea();
        } else if (typeof geometry.getRadius === 'function') {
          const radius = geometry.getRadius();
          holeArea = Math.PI * radius * radius;
        } else {
          holeArea = 0;
        }
        parentPolygon.holes.push(holeArea);
      }
    } else {
      // This is a new outer polygon (either separate or containing holes)
      const polygonNumber = polygonCounter++;
      event.feature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({color: 'rgba(0, 255, 0, 0.2)'}),
        stroke: new ol.style.Stroke({color: 'green', width: 2}),
        text: new ol.style.Text({
          text: polygonNumber.toString(),
          fill: new ol.style.Fill({color: 'black'}),
          stroke: new ol.style.Stroke({color: 'white', width: 3}),
          font: 'bold 16px Arial',
          placement: 'point'
        })
      }));
      // Add as new outer polygon
      drawnPolygons.push({
        feature: event.feature,
        geometry: geometry,
        holes: [],
        number: polygonNumber
      });
    }
    
    // Calculate total area and update summary
    updateTotalArea();
    
    // Auto-finish drawing after each shape
    finishDrawing();
  });

  window.parent.map.addInteraction(drawInteraction);
  isDrawing = true;
}

function finishDrawing() {
  if (isDrawing) {
    if (drawInteraction) {
      window.parent.map.removeInteraction(drawInteraction);
      drawInteraction = null;
      sketch = null;
    }
    isDrawing = false;
  }
}

function isPointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function updateTotalArea() {
  let totalArea = 0;
  let summaryHtml = '';
  
  for (let i = 0; i < drawnPolygons.length; i++) {
    const polygon = drawnPolygons[i];
    let polygonArea;
    
    if (polygon.geometry.getType() === 'Polygon') {
      polygonArea = polygon.geometry.getArea();
    } else if (polygon.geometry.getType() === 'Circle') {
      const radius = polygon.geometry.getRadius();
      polygonArea = Math.PI * radius * radius;
    } else {
      polygonArea = 0; // Fallback
    }
    
    let holeTotal = 0;
    
    summaryHtml += `<div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;">`;
    summaryHtml += `<strong>Polygon ${polygon.number}:</strong> ${polygonArea.toFixed(2)} sqm`;
    
    if (polygon.holes.length > 0) {
      summaryHtml += ` (holes: `;
      for (let j = 0; j < polygon.holes.length; j++) {
        const holeArea = polygon.holes[j];
        holeTotal += holeArea;
        summaryHtml += `-${holeArea.toFixed(2)}`;
        if (j < polygon.holes.length - 1) summaryHtml += ', ';
      }
      summaryHtml += `)`;
    }
    
    const netArea = polygonArea - holeTotal;
    summaryHtml += ` = ${netArea.toFixed(2)} sqm net</div>`;
    totalArea += netArea;
  }
  
  document.getElementById('areaValue').textContent = totalArea.toFixed(2);
  
  if (drawnPolygons.length > 0) {
    document.getElementById('areaSummary').style.display = 'block';
    document.getElementById('areaDetails').innerHTML = summaryHtml;
  } else {
    document.getElementById('areaSummary').style.display = 'none';
  }

  updatePersonCapacity();
}

document.getElementById('finishBtn').addEventListener('click', function() {
  if (isDrawing) {
    // Finish drawing
    if (drawInteraction) {
      window.parent.map.removeInteraction(drawInteraction);
      drawInteraction = null;
      sketch = null;
    }
    document.getElementById('drawBtn').textContent = 'Start Drawing';
    isDrawing = false;
  }
});

document.getElementById('clearBtn').addEventListener('click', function() {
  // Clear drawing
  window.parent.vectorSource.getFeatures().forEach(feature => {
    window.parent.vectorSource.removeFeature(feature);
  });
  drawnPolygons = [];
  polygonCounter = 1;
  document.getElementById('drawBtn').textContent = 'Start Drawing';
  document.getElementById('areaValue').textContent = '0';
  document.getElementById('personValue').textContent = '0';
  isDrawing = false;
});

document.getElementById('densitySlider').addEventListener('input', function() {
  document.getElementById('densityValue').textContent = this.value;
  updatePersonCapacity();
});

function updatePersonCapacity() {
  const density = parseFloat(document.getElementById('densitySlider').value);
  const totalArea = parseFloat(document.getElementById('areaValue').textContent);
  const personCount = Math.round(totalArea * density);
  document.getElementById('personValue').textContent = personCount;
  
  // Update image based on density value (0 to 5 range)
  let imageIndex;
  if (density === 0) imageIndex = 0;
  else if (density <= 1) imageIndex = 1;
  else if (density <= 2) imageIndex = 2;
  else if (density <= 3) imageIndex = 3;
  else if (density <= 4) imageIndex = 4;
  else if (density <= 5) imageIndex = 5;
  else imageIndex = 100;
  
  const suffix = (imageIndex === 0) ? '_buida' : (imageIndex === 100) ? '_plena' : '';
  const imageSrc = `img/${imageIndex}_st_jaume${suffix}.png`;
  document.getElementById('displayImage').src = imageSrc;
}

let currentImageIndex = 0;
const imageIndices = [0, 1, 2, 3, 4, 5, 100];

function updateImage() {
  const imageIndex = imageIndices[currentImageIndex];
  const suffix = (imageIndex === 0) ? '_buida' : (imageIndex === 100) ? '_plena' : '';
  const imageSrc = `img/${imageIndex}_st_jaume${suffix}.png`;
  document.getElementById('displayImage').src = imageSrc;
}

function constrainToSquare(coordinates) {
  const coords = coordinates[0]; // Get the outer ring coordinates
  if (coords.length < 3) return coordinates; // Need at least 3 points for a polygon
  
  // Calculate bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  coords.forEach(coord => {
    minX = Math.min(minX, coord[0]);
    maxX = Math.max(maxX, coord[0]);
    minY = Math.min(minY, coord[1]);
    maxY = Math.max(maxY, coord[1]);
  });
  
  // Calculate center and size
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.max(width, height) / 2; // Use the larger dimension for square
  
  // Create square coordinates (clockwise)
  const squareCoords = [
    [centerX - size, centerY - size], // Bottom-left
    [centerX + size, centerY - size], // Bottom-right  
    [centerX + size, centerY + size], // Top-right
    [centerX - size, centerY + size], // Top-left
    [centerX - size, centerY - size]  // Close the square
  ];
  
  return [squareCoords];
}

function constrainToTriangle(coordinates) {
  const coords = coordinates[0]; // Get the outer ring coordinates
  if (coords.length < 3) return coordinates; // Need at least 3 points for a polygon
  
  // Calculate centroid
  let sumX = 0, sumY = 0;
  coords.forEach(coord => {
    sumX += coord[0];
    sumY += coord[1];
  });
  const centerX = sumX / coords.length;
  const centerY = sumY / coords.length;
  
  // Find the radius (distance from center to farthest point)
  let maxDistance = 0;
  coords.forEach(coord => {
    const distance = Math.sqrt(Math.pow(coord[0] - centerX, 2) + Math.pow(coord[1] - centerY, 2));
    maxDistance = Math.max(maxDistance, distance);
  });
  
  // Create equilateral triangle coordinates
  const triangleCoords = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3; // 120 degrees apart
    const x = centerX + maxDistance * Math.cos(angle);
    const y = centerY + maxDistance * Math.sin(angle);
    triangleCoords.push([x, y]);
  }
  triangleCoords.push(triangleCoords[0]); // Close the triangle
  
  return [triangleCoords];
}
