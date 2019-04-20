var h3, geojson2h3, fetchedData;
var h3Granularity = 10;
mapboxgl.accessToken = 'pk.eyJ1IjoiYW1vbG53IiwiYSI6ImNqdGY4ZjlqNjFxZDkzeW9iczE4MWg4MGEifQ.YpUeahTCDxjUq84pSDGeNw';

const pickupEndpoint = 'https://8f44ly4zrc.execute-api.us-east-1.amazonaws.com/taxi/pickupcounts'
const collisionEndpoint = 'https://8f44ly4zrc.execute-api.us-east-1.amazonaws.com/taxi/collisioncounts'
const combinedEndpoint = 'https://8f44ly4zrc.execute-api.us-east-1.amazonaws.com/taxi/pickupcollisioncounts'
const pricePredictionAPI = 'https://8f44ly4zrc.execute-api.us-east-1.amazonaws.com/taxi/predictfareamount'
const pickupPredictionAPI = 'https://8f44ly4zrc.execute-api.us-east-1.amazonaws.com/taxi/predictpickupcounts'
const collisionPredictionAPI = 'https://8f44ly4zrc.execute-api.us-east-1.amazonaws.com/taxi/predictcollisioncounts'
const proxyUrl = 'https://cors-anywhere.herokuapp.com/'

const sourceId = 'h3-hexes';
const pickupLayerId = `${sourceId}-pickup-layer`;
const collisionLayerId = `${sourceId}-collision-layer`;
const combinedLayerId = `${sourceId}-combined-layer`;

var pickUpLegend = document.getElementById('pickup-legend');
var collisionLegend = document.getElementById('collision-legend');
var combinedLegend = document.getElementById('combined-legend');

var hourOfDay, dayOfWeek, date;

var config = ({
  lng: -74.0111266,
  lat: 40.7051088,
  zoom: 14,
  fillOpacity: 0.6,
  combinedColorScale: ['#0010E5','#3300E1','#7500DD','#B400D9','#D500BA','#D20078','#CE0038','#CA0500','#C64100','#C27A00','#BFB000'],
  pickupColorScale: ['#00fff9','#02e4f7','#04caf5','#06b0f4','#0896f2','#0a7cf1','#0c62ef','#0d48ee','#102eec','#1214eb'],
  collisionColorScale: ['#f19e94','#f09385','#ef8877','#ef7d68','#ee725a','#ed684b','#ed5d3d','#ec522e','#eb4720','#eb3d12'],
  areaThreshold: 0.75
});

var map = new mapboxgl.Map({
  container: 'map',
  center: [
	config.lng,
	config.lat,
  ],
  zoom: config.zoom,
  style: 'mapbox://styles/mapbox/dark-v9'
});

require(['h3-js'], function (h3loaded) {
	h3 = h3loaded
	date = new Date();
	hourOfDay = date.getHours()
	dayOfWeek = date.getDay()
	loadPickupHeatmap(config.lat, config.lng);
});

require(['geojson2h3'], function (geojson2h3loaded) {
	geojson2h3 = geojson2h3loaded
});

function pickupLayer(pickupData) {
  const h3PickupLayer = {};
  pickupData.forEach(({h3, pickup_count}) => {
    h3PickupLayer[h3] = (h3PickupLayer[h3] || 0) + pickup_count;
  });
  fetchedData = normalizeLayer(h3PickupLayer);
  return fetchedData;
}

function collisionLayer(collisionData) {
  const h3collisionLayer = {};
  collisionData.forEach(({h3, collision_count}) => {
    h3collisionLayer[h3] = (h3collisionLayer[h3] || 0) + collision_count;
  });
  fetchedData = normalizeLayer(h3collisionLayer);
  return fetchedData;
}

function combinedLayer(combinedData) {
  const h3combinedLayer = {};
  combinedData.forEach(({h3, pickup_count, collision_count}) => { 
	h3combinedLayer[h3] = (h3combinedLayer[h3] || 0) + (pickup_count*0.1 - collision_count*100);
  });
  fetchedData = normalizeLayer(h3combinedLayer);
  return fetchedData;
}

function dayOfWeekAsString(dayIndex) {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayIndex];
}

function loadPickupHeatmap(lat, lng) {
	h3Index = h3.geoToH3(lat, lng, h3Granularity)

	const nearbyh3 = h3.kRing(h3Index, 3);
	
	var request = JSON.stringify({weekday: dayOfWeekAsString(dayOfWeek), hour:hourOfDay, h3:nearbyh3})

	postDataWithoutAuthentication(proxyUrl + pickupEndpoint, request)
	  .then(data => renderHexes(pickupLayerId, config.pickupColorScale, map, normalizeLayer(pickupLayer(data))) )
	  .catch(error => console.error(error));
}

function loadCollisionHeatmap(lat, lng) {
	h3Index = h3.geoToH3(lat, lng, h3Granularity)
	const nearbyh3 = h3.kRing(h3Index, 3);
	var request = JSON.stringify({weekday: dayOfWeekAsString(dayOfWeek), hour:hourOfDay, h3:nearbyh3})
	postDataWithoutAuthentication(proxyUrl + collisionEndpoint, request)
	  .then(data => renderHexes(collisionLayerId, config.collisionColorScale, map, normalizeLayer(collisionLayer(data))) )
	  .catch(error => console.error(error));
}

function loadBothHeatmap(lat, lng) {
	h3Index = h3.geoToH3(lat, lng, h3Granularity)
	const nearbyh3 = h3.kRing(h3Index, 3);
	var request = JSON.stringify({weekday: dayOfWeekAsString(dayOfWeek), hour:hourOfDay, h3:nearbyh3})
	postDataWithoutAuthentication(proxyUrl + combinedEndpoint, request)
	  .then(data => renderHexes(combinedLayerId, config.combinedColorScale, map, normalizeLayer(combinedLayer(data))) )
	  .catch(error => console.error(error));
}

async function postDataWithoutAuthentication(url, request) {
    let response  = await fetch(url, {
        method: "POST", 
        headers: {
            "Content-Type": "application/json"
        },
        body: request, 
    });
    let responseData = await response.json();
	return responseData;
}

async function postDataWithAuthentication(url, request, key) {
    let response  = await fetch(url, {
        method: "POST", 
        headers: {
            "Content-Type": "application/json",
			"Authentication": key
        },
        body: request, 
    });
    let responseData = await response.json();
	return responseData;
}

function normalizeLayer(layer, baseAtZero = false) {
	  const newlayer = {};
	  const hexagons = Object.keys(layer);
	  // Pass one, get max
	  const max = hexagons.reduce((max, hex) => Math.max(max, layer[hex]), -Infinity);
	  const min = baseAtZero ? hexagons.reduce((min, hex) => Math.min(min, layer[hex]), Infinity) : 0;
	  // Pass two, normalize
	  hexagons.forEach(hex => {
		  newlayer[hex] = (layer[hex] - min) / (max - min); 
	  });
	  return newlayer;
}

function renderHexes(layerId, colorScale, map, hexagons) {
  // Transform the current hexagon map into a GeoJSON object
  const geojson = geojson2h3.h3SetToFeatureCollection(
    Object.keys(hexagons),
    hex => ({value: hexagons[hex]})
  );
  let source = map.getSource(sourceId);
  
  // Add the source and layer if we haven't created them yet
  if (!source) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson
    });
  }

  let layer = map.getLayer(layerId);
  
  if (!layer) {
	map.addLayer({
      id: layerId,
      source: sourceId,
      type: 'fill',
      interactive: false,
      paint: {
        'fill-outline-color': 'rgba(0,0,0,0)',
      }
    });
    source = map.getSource(sourceId);
  }

  // Update the geojson data
  source.setData(geojson);
  
  // Update the layer paint properties, using the current config values
  map.setPaintProperty(layerId, 'fill-color', {
    property: 'value',
    stops: [
	  [0.1, colorScale[0]],
      [0.2, colorScale[1]],
      [0.3, colorScale[2]],
	  [0.4, colorScale[3]],
      [0.5, colorScale[4]],
      [0.6, colorScale[5]],
	  [0.7, colorScale[6]],
      [0.8, colorScale[7]],
      [0.9, colorScale[8]],
	  [1.0, colorScale[9]]
    ]
  });
  
  map.setPaintProperty(layerId, 'fill-opacity', config.fillOpacity);
}

// create the popup

var popup = new mapboxgl.Popup({ offset: 25 });


// add markers to map
var marker = new mapboxgl.Marker({
	draggable: true
})
.setLngLat([config.lng,config.lat])
.setPopup(popup) // sets a popup on this marker
.addTo(map);

function checkStatus(response) {
  if (response.ok) {
    return Promise.resolve(response);
  } else {
    return Promise.reject(new Error(response.statusText));
  }
}

function parseJSON(response) {
  return response.json();
}

map.on('click', function(e) {
	h3Index = h3.geoToH3(e.lngLat.lat, e.lngLat.lng, h3Granularity);
	
	const predictionRequest = JSON.stringify({
		  Inputs: {
			input1: {
			  ColumnNames: [
				'latitude',
				'longitude',
				'weekday',
				'hour'
			  ],
			  Values: [
				[
				  e.lngLat.lat,
				  e.lngLat.lng,
				  dayOfWeekAsString(dayOfWeek),
				  hourOfDay    
				]
			  ]
			}
		  }
		});
		
	const historicalRequest = JSON.stringify({weekday: dayOfWeekAsString(dayOfWeek), hour:hourOfDay, h3:[h3Index]})	
		
	collisionAPIcall = fetch(proxyUrl + collisionPredictionAPI, {
					method: "POST",							
					headers: {
						"Content-Type": "application/json"
					},
					body: predictionRequest, 
				}).then(function(response){
						 return response.json()
				});
				
	pickupAPIcall = fetch(proxyUrl + pickupPredictionAPI, {
					method: "POST",							
					headers: {
						"Content-Type": "application/json"
					},
					body: predictionRequest, 
				}).then(function(response){
						 return response.json()
				});	

	priceAPIcall = fetch(proxyUrl + pricePredictionAPI, {
					method: "POST",							
					headers: {
						"Content-Type": "application/json"
					},
					body: predictionRequest, 
				}).then(function(response){
						 return response.json()
				});
				
	historicalAPIcall = fetch(proxyUrl + combinedEndpoint, {
					method: "POST",							
					headers: {
						"Content-Type": "application/json"
					},
					body: historicalRequest, 
				}).then(function(response){
						 return response.json()
				});			
	
	Promise.all([collisionAPIcall, pickupAPIcall, priceAPIcall, historicalAPIcall]).then(function(values){
		collisionPredictionData = values[0].Results.output1.value.Values[0];
		pickupPredictionData = values[1].Results.output1.value.Values[0];
		pricePredictionData = values[2].Results.output1.value.Values[0];
		historicalData = values[3];
		
		var injury_prediction = 0
		var fatality_prediction = 0
		var accident_prediction = 0
		if ( historicalData[0].collision_count > 0 ) {
			injury_prediction = Math.round(collisionPredictionData[4]*100)/100
			fatality_prediction = Math.round(collisionPredictionData[5]*100)/100
			accident_prediction = Math.round(collisionPredictionData[6]*100)/100
		}
		
		tooltip = "<strong>Historical values for zone</strong>" +
				  "<p>Pickup Count :" + historicalData[0].pickup_count +
				  "</br>Collision Count :" + historicalData[0].collision_count +
				  "</p>" +
				  "<strong>Predicted values for coordinates</strong>" +
				  "<p>pickup counts : " + Math.round(pickupPredictionData[5]*100)/100 +
				  "</br>predicted trip price : $" + Math.round(pricePredictionData[5]*100)/100 +
				  "</br>collision probability : Fatality (" + fatality_prediction + "), Injury (" + injury_prediction + ") Others (" + accident_prediction + ")" +
				  "</p>";
				  
		new mapboxgl.Popup()
			.setLngLat(e.lngLat)
			.setHTML(tooltip)
			.addTo(map);		  
	});
});


function overrideWeekDay() {
	var selObj = document.getElementById("weekday");
    var selValue = selObj.options[selObj.selectedIndex].text;
	dayOfWeek = selObj.value;
	HandleCheckboxes()
}

function overrideHourDay() {
	var selObj = document.getElementById("hourDay");
    var selValue = selObj.options[selObj.selectedIndex].text;
	hourOfDay = selValue;
	HandleCheckboxes()
}

var lat = config.lat;
var lng = config.lng;

function onDragEnd() {
	lngLat = marker.getLngLat();
	lat = lngLat.lat;
	lng = lngLat.lng;
	var pickupBox = document.getElementById("pickup");
	var collisionBox = document.getElementById("collision");
	if (pickupBox.checked == true && collisionBox.checked == false){
		loadPickupHeatmap(lat, lng);
	}
	else if (pickupBox.checked == false && collisionBox.checked == true){
		loadCollisionHeatmap(lat, lng);
	}
	else if (pickupBox.checked == true && collisionBox.checked == true){
		loadBothHeatmap(lat, lng);
	}
	popup.setText('Longitude: ' + lng + ' Latitude: ' + lat);
}

marker.on('dragend', onDragEnd);

function HandleCheckboxes() {
	var pickupBox = document.getElementById("pickup");
	var collisionBox = document.getElementById("collision");
	if (pickupBox.checked == true && collisionBox.checked == false){
		loadPickupHeatmap(lat, lng);
		map.setLayoutProperty(collisionLayerId, 'visibility', 'none');
		map.setLayoutProperty(combinedLayerId, 'visibility', 'none');
		map.setLayoutProperty(pickupLayerId, 'visibility', 'visible');
		pickUpLegend.style.display = 'block';
		collisionLegend.style.display = 'none';
		combinedLegend.style.display = 'none';
	}
	else if (pickupBox.checked == false && collisionBox.checked == true){
		loadCollisionHeatmap(lat, lng);
		map.setLayoutProperty(collisionLayerId, 'visibility', 'visible');
		map.setLayoutProperty(combinedLayerId, 'visibility', 'none');
		map.setLayoutProperty(pickupLayerId, 'visibility', 'none');
		pickUpLegend.style.display = 'none';
		collisionLegend.style.display = 'block';
		combinedLegend.style.display = 'none';
	}
	else if (pickupBox.checked == true && collisionBox.checked == true){
		loadBothHeatmap(lat, lng);
		map.setLayoutProperty(collisionLayerId, 'visibility', 'none');
		map.setLayoutProperty(combinedLayerId, 'visibility', 'visible');
		map.setLayoutProperty(pickupLayerId, 'visibility', 'none');
		pickUpLegend.style.display = 'none';
		collisionLegend.style.display = 'none';
		combinedLegend.style.display = 'block';
	}
	else {
		map.setLayoutProperty(collisionLayerId, 'visibility', 'none');
		map.setLayoutProperty(combinedLayerId, 'visibility', 'none');
		map.setLayoutProperty(pickupLayerId, 'visibility', 'none');
		pickUpLegend.style.display = 'none';
		collisionLegend.style.display = 'none';
		combinedLegend.style.display = 'none';
	}
}