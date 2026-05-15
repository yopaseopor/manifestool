// Draw tool functionality
let drawInteraction = null;
let modifyInteraction = null;
let sketch = null;
let isDrawing = false;
let isModifying = false;
let drawnPolygons = [];
let polygonCounter = 1;
let selectedShape = 'Polygon'; // Default shape
let useFeet = false; // Unit preference: false = meters, true = feet

// Conversion functions
function metersToFeet(meters) {
  return meters * 3.28084;
}

function squareMetersToSquareFeet(sqm) {
  return sqm * 10.7639;
}

// Geodesic area calculation — uses the true spherical area, not the projected one
function getGeodesicArea(geometry) {
  if (geometry.getType() === 'Circle') {
    // Convert circle to a 64-segment polygon for accurate geodesic area
    const circlePolygon = ol.geom.Polygon.fromCircle(geometry, 64);
    return ol.sphere.getArea(circlePolygon);
  }
  return ol.sphere.getArea(geometry);
}

// Geodesic distance between two projected coordinates
function getGeodesicDistance(coord1, coord2) {
  const line = new ol.geom.LineString([coord1, coord2]);
  return ol.sphere.getLength(line);
}

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
        // Convert projected radius to geodesic distance
        const edgeCoord = [center[0] + radius, center[1]];
        const geodesicRadius = getGeodesicDistance(center, edgeCoord);
        const displayRadius = useFeet ? metersToFeet(geodesicRadius).toFixed(2) : geodesicRadius.toFixed(2);
        const unit = useFeet ? 'ft' : 'm';
        
        styles.push(new ol.style.Style({
          text: new ol.style.Text({
            text: `Radius: ${displayRadius} ${unit}`,
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
            
            // Midpoint for text placement
            const midX = (start[0] + end[0]) / 2;
            const midY = (start[1] + end[1]) / 2;
            
            // Calculate geodesic distance in meters
            const distance = getGeodesicDistance(start, end);
            const displayDistance = useFeet ? metersToFeet(distance).toFixed(2) : distance.toFixed(2);
            const unit = useFeet ? 'ft' : 'm';
            
            styles.push(new ol.style.Style({
              text: new ol.style.Text({
                text: `${displayDistance} ${unit}`,
                fill: new ol.style.Fill({color: 'black'}),
                stroke: new ol.style.Stroke({color: 'white', width: 2}),
                font: 'bold 11px Arial',
                placement: 'point'
              }),
              geometry: new ol.geom.Point([midX, midY])
            }));
          }
        }
        
        // Add polygon number label if this is a saved polygon
        const polygonData = drawnPolygons.find(p => p.geometry === geometry);
        if (polygonData) {
          styles.push(new ol.style.Style({
            text: new ol.style.Text({
              text: polygonData.number.toString(),
              fill: new ol.style.Fill({color: 'black'}),
              stroke: new ol.style.Stroke({color: 'white', width: 3}),
              font: 'bold 16px Arial',
              placement: 'point'
            })
          }));
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
        let holeArea = getGeodesicArea(geometry);
        if (isNaN(holeArea) || holeArea <= 0) {
          holeArea = 0;
        }
        // Store hole with geometry so we can display edge measures later
        parentPolygon.holes.push({
          area: holeArea,
          geometry: geometry.clone()
        });
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

// ---- Modify / Vertex mode ----

// Vertex style: small circles at each vertex
function createVertexStyle() {
  return new ol.style.Style({
    image: new ol.style.Circle({
      radius: 5,
      fill: new ol.style.Fill({color: '#ffcc00'}),
      stroke: new ol.style.Stroke({color: '#cc9900', width: 2})
    }),
    geometry: function(feature) {
      const geom = feature.getGeometry();
      if (!geom) return null;
      if (geom.getType() === 'Polygon') {
        const coords = geom.getCoordinates()[0];
        return new ol.geom.MultiPoint(coords);
      } else if (geom.getType() === 'Circle') {
        const center = geom.getCenter();
        const radius = geom.getRadius();
        // Show one handle on the circle edge for interactive radius adjustment
        return new ol.geom.MultiPoint([center, [center[0] + radius, center[1]]]);
      }
      return null;
    }
  });
}

function startModify() {
  if (isDrawing) {
    finishDrawing();
  }
  if (isModifying) return;
  
  // Remove any existing modify interaction
  if (modifyInteraction) {
    window.parent.map.removeInteraction(modifyInteraction);
  }
  
  // Add vertex style to all drawn features
  const vertexStyle = createVertexStyle();
  window.parent.vectorSource.getFeatures().forEach(feature => {
    const existingStyle = feature.getStyle();
    if (existingStyle && !Array.isArray(existingStyle)) {
      feature.setStyle([existingStyle, vertexStyle]);
    } else if (Array.isArray(existingStyle)) {
      const hasVertexStyle = existingStyle.some(s => s.getImage() && s.getImage().getRadius && s.getImage().getRadius() === 5);
      if (!hasVertexStyle) {
        feature.setStyle([...existingStyle, vertexStyle]);
      }
    } else {
      feature.setStyle([vertexStyle]);
    }
  });
  
  modifyInteraction = new ol.interaction.Modify({
    source: window.parent.vectorSource,
    pixelTolerance: 10,
    style: new ol.style.Style({
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({color: '#ff6600'}),
        stroke: new ol.style.Stroke({color: '#cc4400', width: 2})
      })
    })
  });
  
  // When modification ends, recalculate everything
  modifyInteraction.on('modifyend', function(event) {
    console.log('Modify end — recalculating areas');
    
    // Update drawnPolygons geometries to match the modified features
    const modifiedFeatures = event.features.getArray();
    modifiedFeatures.forEach(feature => {
      const newGeom = feature.getGeometry();
      // Find matching polygon in drawnPolygons and update its geometry reference
      for (let dp of drawnPolygons) {
        if (dp.feature === feature) {
          dp.geometry = newGeom;
          // Also re-assign vertex style after modification
          const existing = feature.getStyle();
          if (Array.isArray(existing)) {
            const noVertex = existing.filter(s => !(s.getImage() && s.getImage().getRadius && s.getImage().getRadius() === 5));
            feature.setStyle([...noVertex, createVertexStyle()]);
          }
          break;
        }
      }
    });
    
    // Recalculate and update display
    updateTotalArea();
  });
  
  window.parent.map.addInteraction(modifyInteraction);
  isModifying = true;
  document.getElementById('modifyBtn').classList.add('active');
}

function stopModify() {
  if (!isModifying) return;
  
  if (modifyInteraction) {
    window.parent.map.removeInteraction(modifyInteraction);
    modifyInteraction = null;
  }
  
  // Remove vertex style from all features
  window.parent.vectorSource.getFeatures().forEach(feature => {
    const existingStyle = feature.getStyle();
    if (Array.isArray(existingStyle)) {
      const cleanStyles = existingStyle.filter(s => !(s.getImage() && s.getImage().getRadius && s.getImage().getRadius() === 5));
      feature.setStyle(cleanStyles.length === 1 ? cleanStyles[0] : cleanStyles);
    }
  });
  
  isModifying = false;
  document.getElementById('modifyBtn').classList.remove('active');
}

function toggleModify() {
  if (isModifying) {
    stopModify();
  } else {
    startModify();
  }
}

// Modify button handler
document.getElementById('modifyBtn').addEventListener('click', toggleModify);

// ---- End Modify / Vertex ----

function isPointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;
  
  // Ensure polygon is closed
  const poly = [...polygon];
  if (poly.length > 0 && (poly[0][0] !== poly[poly.length-1][0] || poly[0][1] !== poly[poly.length-1][1])) {
    poly.push(poly[0]); // Close the polygon if not already closed
  }
  
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

function isPolygonClockwise(coordinates) {
  // Calculate the sum of (x2 - x1) * (y2 + y1) for all edges
  let sum = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const x1 = coordinates[i][0];
    const y1 = coordinates[i][1];
    const x2 = coordinates[i + 1][0];
    const y2 = coordinates[i + 1][1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0; // Positive sum means clockwise
}

function updateTotalArea() {
  console.log('UPDATE TOTAL AREA CALLED - drawnPolygons length:', drawnPolygons.length);
  let totalArea = 0;
  let summaryHtml = '';
  
  for (let i = 0; i < drawnPolygons.length; i++) {
    const polygon = drawnPolygons[i];
    let polygonArea;
    let edgeLabels = '';
    const lengthUnit = useFeet ? 'ft' : 'm';
    
    if (polygon.geometry.getType() === 'Polygon') {
      // Use geodesic area (true spherical area in square meters)
      polygonArea = getGeodesicArea(polygon.geometry);
      console.log(`Polygon ${i + 1} area:`, polygonArea, 'coordinates:', polygon.geometry.getCoordinates());
      
      // If NaN, fall back to 0
      if (isNaN(polygonArea) || polygonArea <= 0) {
        console.error(`Invalid area for polygon ${i + 1}:`, polygonArea);
        polygonArea = 0;
      }
      
      // Calculate edge distances for the summary
      const coords = polygon.geometry.getCoordinates()[0];
      if (coords.length > 1) {
        const edgeLengths = [];
        for (let e = 0; e < coords.length - 1; e++) {
          const dist = getGeodesicDistance(coords[e], coords[e + 1]);
          const displayDist = useFeet ? metersToFeet(dist).toFixed(2) : dist.toFixed(2);
          edgeLengths.push(`${displayDist} ${lengthUnit}`);
        }
        edgeLabels = `Edges: ${edgeLengths.join(', ')}<br>`;
      }
    } else if (polygon.geometry.getType() === 'Circle') {
      // Use geodesic area for circles
      polygonArea = getGeodesicArea(polygon.geometry);
      if (isNaN(polygonArea) || polygonArea <= 0) {
        polygonArea = 0;
      }
      
      // Calculate geodesic radius for the summary
      const center = polygon.geometry.getCenter();
      const radius = polygon.geometry.getRadius();
      const edgeCoord = [center[0] + radius, center[1]];
      const geodesicRadius = getGeodesicDistance(center, edgeCoord);
      const displayRadius = useFeet ? metersToFeet(geodesicRadius).toFixed(2) : geodesicRadius.toFixed(2);
      edgeLabels = `Radius: ${displayRadius} ${lengthUnit}<br>`;
    } else {
      polygonArea = 0; // Fallback
    }
    
    let holeTotal = 0;
    
    const displayArea = useFeet ? squareMetersToSquareFeet(polygonArea).toFixed(2) : polygonArea.toFixed(2);
    const displayUnit = useFeet ? 'sqft' : 'sqm';
    
    summaryHtml += `<div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;">`;
    summaryHtml += `<strong>Polygon ${polygon.number}:</strong> ${displayArea} ${displayUnit}<br>`;
    summaryHtml += `<span style="font-size: 11px; color: #666;">${edgeLabels}`;
    
    if (polygon.holes.length > 0) {
      for (let j = 0; j < polygon.holes.length; j++) {
        const hole = polygon.holes[j];
        const holeArea = hole.area;
        const displayHoleArea = useFeet ? squareMetersToSquareFeet(holeArea).toFixed(2) : holeArea.toFixed(2);
        holeTotal += holeArea;
        console.log(`Subtracting hole ${j + 1}: ${holeArea} sqm from polygon ${polygon.number}`);
        
        // Show hole type, edges, and area
        const holeGeom = hole.geometry;
        if (holeGeom.getType() === 'Polygon') {
          const holeCoords = holeGeom.getCoordinates()[0];
          const holeEdgeLengths = [];
          for (let e = 0; e < holeCoords.length - 1; e++) {
            const dist = getGeodesicDistance(holeCoords[e], holeCoords[e + 1]);
            const displayDist = useFeet ? metersToFeet(dist).toFixed(2) : dist.toFixed(2);
            holeEdgeLengths.push(`${displayDist} ${lengthUnit}`);
          }
          summaryHtml += `&nbsp;&nbsp;Hole ${j + 1}: edges [${holeEdgeLengths.join(', ')}], area -${displayHoleArea} ${displayUnit}<br>`;
        } else if (holeGeom.getType() === 'Circle') {
          const center = holeGeom.getCenter();
          const radius = holeGeom.getRadius();
          const edgeCoord = [center[0] + radius, center[1]];
          const geodesicRadius = getGeodesicDistance(center, edgeCoord);
          const displayRadius = useFeet ? metersToFeet(geodesicRadius).toFixed(2) : geodesicRadius.toFixed(2);
          summaryHtml += `&nbsp;&nbsp;Hole ${j + 1}: radius ${displayRadius} ${lengthUnit}, area -${displayHoleArea} ${displayUnit}<br>`;
        }
      }
    }
    
    const netArea = polygonArea - holeTotal;
    const displayNetArea = useFeet ? squareMetersToSquareFeet(netArea).toFixed(2) : netArea.toFixed(2);
    console.log(`Polygon ${polygon.number}: ${polygonArea.toFixed(2)} - ${holeTotal.toFixed(2)} = ${netArea.toFixed(2)} net area`);
    summaryHtml += `Net area: ${displayNetArea} ${displayUnit}</span></div>`;
    totalArea += netArea;
  }
  
  const displayTotalArea = useFeet ? squareMetersToSquareFeet(totalArea).toFixed(2) : totalArea.toFixed(2);
  const areaUnit = useFeet ? 'square feet' : 'square meters';
  
  // Update the area display with proper units
  const areaDisplay = document.getElementById('areaDisplay');
  areaDisplay.innerHTML = `<strong>Total Area:</strong> <span id="areaValue">${displayTotalArea}</span> ${areaUnit}`;
  
  console.log('- Area value set to:', displayTotalArea);
  
  if (drawnPolygons.length > 0) {
    document.getElementById('areaSummary').style.display = 'block';
    document.getElementById('areaDetails').innerHTML = summaryHtml;
    console.log('- Area summary displayed');
  } else {
    document.getElementById('areaSummary').style.display = 'none';
    console.log('- Area summary hidden');
  }

  console.log('- Calling updatePersonCapacity');
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

// Unit toggle event listener
document.getElementById('unitBtn').addEventListener('click', function() {
  const densitySlider = document.getElementById('densitySlider');
  const currentDensity = parseFloat(densitySlider.value);
  
  useFeet = !useFeet;
  this.textContent = useFeet ? 'Units: Feet' : 'Units: Meters';
  
  // Convert density value when switching units
  // When switching to feet, density should be per square foot instead of per square meter
  // 1 m² = 10.7639 ft², so density in ft² = density in m² / 10.7639
  if (useFeet) {
    densitySlider.value = (currentDensity / 10.7639).toFixed(2);
  } else {
    densitySlider.value = (currentDensity * 10.7639).toFixed(2);
  }
  
  // Update density display
  const densityValue = document.getElementById('densityValue');
  densityValue.textContent = densitySlider.value;
  densityValue.nextSibling.textContent = useFeet ? ' p/ft²' : ' p/m²';
  
  // Better to call updateTotalArea which will update everything
  updateTotalArea();
  
  // Update existing features on map
  updateFeatureStyles();
});

function updateFeatureStyles() {
  // Update styles for all drawn features
  drawnPolygons.forEach(polygon => {
    const geometry = polygon.feature.getGeometry();
    if (geometry.getType() === 'Circle') {
      // Recalculate radius display using geodesic distance
      const center = geometry.getCenter();
      const radius = geometry.getRadius();
      const edgeCoord = [center[0] + radius, center[1]];
      const geodesicRadius = getGeodesicDistance(center, edgeCoord);
      const displayRadius = useFeet ? metersToFeet(geodesicRadius).toFixed(2) : geodesicRadius.toFixed(2);
      const unit = useFeet ? 'ft' : 'm';
      
      polygon.feature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({color: 'rgba(0, 255, 0, 0.2)'}),
        stroke: new ol.style.Stroke({color: 'green', width: 2}),
        text: new ol.style.Text({
          text: `Radius: ${displayRadius} ${unit}`,
          fill: new ol.style.Fill({color: 'black'}),
          stroke: new ol.style.Stroke({color: 'white', width: 3}),
          font: 'bold 12px Arial',
          placement: 'point',
          offsetY: -20
        }),
        geometry: new ol.geom.Point(center)
      }));
    } else if (geometry.getType() === 'Polygon') {
      // For polygons, we need to update the distance labels
      // This is more complex as the style function is used during drawing
      // For now, just update the area display which is done by updateTotalArea
    }
  });
}

function updatePersonCapacity() {
  const density = parseFloat(document.getElementById('densitySlider').value);
  const totalArea = parseFloat(document.getElementById('areaValue').textContent);
  // If useFeet, totalArea is in sqft, so density is per sqft
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

// Message handler for communication with parent window
window.addEventListener('message', function(event) {
  const data = event.data;
  
  switch(data.type) {
    case 'recalculateAreas':
      // Recalculate areas from restored features
      recalculateAreasFromFeatures();
      break;
    case 'updateArea':
      // Handle area updates from drawing interactions
      updateTotalArea();
      break;
  }
});

// Function to recalculate areas from restored features
function recalculateAreasFromFeatures() {
  // Clear existing polygons array
  drawnPolygons = [];
  polygonCounter = 1;
  
  // Get all features from parent map
  const features = window.parent.vectorSource.getFeatures();
  const polygonFeatures = [];
  
  // First, collect all polygon features
  features.forEach(feature => {
    if (!feature.get('type') || feature.get('type') !== 'routing-marker') {
      const geometry = feature.getGeometry();
      if (geometry.getType() === 'Polygon') {
        polygonFeatures.push(feature);
      }
    }
  });
  
  // Sort polygons by geodesic area (smaller first, so potential holes are processed before larger containers)
  polygonFeatures.sort((a, b) => {
    return getGeodesicArea(a.getGeometry()) - getGeodesicArea(b.getGeometry());
  });
  
  // Fallback: If geometric containment fails, use area-based heuristic
  // This handles cases where coordinate systems or precision issues prevent proper containment detection
  if (polygonFeatures.length >= 2) {
    const areas = polygonFeatures.map(f => getGeodesicArea(f.getGeometry()));
    const maxArea = Math.max(...areas);
    const minArea = Math.min(...areas);
    const areaRatio = minArea / maxArea;
    
    console.log(`Area-based hole detection: min=${minArea.toFixed(0)}, max=${maxArea.toFixed(0)}, ratio=${areaRatio.toFixed(3)}`);
    
    // If smallest polygon is less than 80% of the largest, assume it's a hole
    if (areaRatio < 0.8) {
      console.log('APPLYING AREA-BASED HOLE DETECTION');
      const smallerFeature = polygonFeatures[0];
      const largerFeature = polygonFeatures[1];
      
      // Style smaller as hole
      smallerFeature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({color: 'rgba(255, 0, 0, 0.2)'}),
        stroke: new ol.style.Stroke({color: 'red', width: 2})
      }));
      
      // Style larger as outer polygon
      largerFeature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({color: 'rgba(0, 255, 0, 0.2)'}),
        stroke: new ol.style.Stroke({color: 'green', width: 2}),
        text: new ol.style.Text({
          text: '1',
          fill: new ol.style.Fill({color: 'black'}),
          stroke: new ol.style.Stroke({color: 'white', width: 3}),
          font: 'bold 16px Arial',
          placement: 'point'
        })
      }));
      
      // Add to drawn polygons with hole subtraction
      drawnPolygons.push({
        feature: largerFeature,
        geometry: largerFeature.getGeometry(),
        holes: [{
          area: getGeodesicArea(smallerFeature.getGeometry()),
          geometry: smallerFeature.getGeometry().clone()
        }],
        number: 1
      });
      
      // Process remaining polygons as separate outer polygons
      for (let i = 2; i < polygonFeatures.length; i++) {
        const feature = polygonFeatures[i];
        const polygonNumber = polygonCounter++;
        feature.setStyle(new ol.style.Style({
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
        
        drawnPolygons.push({
          feature: feature,
          geometry: feature.getGeometry(),
          holes: [],
          number: polygonNumber
        });
      }
      
      updateTotalArea();
      return;
    }
  }
  
  // Process each polygon to determine if it's a hole or outer polygon
  polygonFeatures.forEach(feature => {
    const geometry = feature.getGeometry();
    const coordinates = geometry.getCoordinates()[0]; // Outer ring only
    let isHole = false;
    let parentPolygon = null;
    
    // Check if this polygon is completely inside any existing outer polygon
    for (let polygon of drawnPolygons) {
      const parentCoords = polygon.geometry.getCoordinates()[0];
      let allPointsInside = true;
      let pointsChecked = 0;
      let pointsInside = 0;
      
      console.log(`Checking containment: smaller polygon (${getGeodesicArea(geometry).toFixed(0)} sqm) vs parent (${getGeodesicArea(polygon.geometry).toFixed(0)} sqm)`);
      console.log(`Smaller polygon coords sample:`, coordinates.slice(0, 3));
      console.log(`Parent polygon coords sample:`, parentCoords.slice(0, 3));
      
      for (let coord of coordinates) {
        pointsChecked++;
        const isInside = isPointInPolygon(coord, parentCoords);
        if (!isInside) {
          allPointsInside = false;
          console.log(`Point ${pointsChecked} FAILED:`, coord, 'not inside parent');
          break;
        } else {
          pointsInside++;
        }
      }
      
      console.log(`Containment check result: ${allPointsInside} (${pointsInside}/${pointsChecked} points inside)`);
      
      if (allPointsInside) {
        isHole = true;
        parentPolygon = polygon;
        console.log('DETECTED AS HOLE!');
        break;
      }
    }
    
    if (isHole && parentPolygon) {
      // This is a hole - style it red and subtract its area from parent
      feature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({color: 'rgba(255, 0, 0, 0.2)'}),
        stroke: new ol.style.Stroke({color: 'red', width: 2})
      }));
      
      // Add hole area to parent (area will be subtracted in updateTotalArea)
      const holeArea = getGeodesicArea(geometry);
      parentPolygon.holes.push({
        area: holeArea,
        geometry: geometry.clone()
      });
    } else {
      // This is an outer polygon
      const polygonNumber = polygonCounter++;
      feature.setStyle(new ol.style.Style({
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
        feature: feature,
        geometry: geometry,
        holes: [],
        number: polygonNumber
      });
    }
  });
  
  // Update total area display
  updateTotalArea();
}