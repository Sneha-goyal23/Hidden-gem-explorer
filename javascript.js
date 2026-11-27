var map = L.map("map").setView([18.5204, 73.8567], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const CSV_FILES = {
  cafe:       "cafe.csv",
  restaurant: "restaurant.csv",
  heritage:   "historical.csv",
  nature:     "nature.csv",
  park:       "park.csv"
};

let currentMarker = null;
let routeLine = null;
let userLocationMarker = null;
let userLatLng = null;

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const iName = headers.indexOf("name");
  const iLat  = headers.indexOf("latitude");
  const iLng  = headers.indexOf("longitude");

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur);

    return {
      name: (cols[iName] || "").trim().replace(/^"|"$/g, ""),
      lat:  parseFloat(cols[iLat]),
      lng:  parseFloat(cols[iLng])
    };
  }).filter(r => r.name && !isNaN(r.lat) && !isNaN(r.lng));
}

// Helper function to generate the popup HTML and attach event listeners
function createPopup(name, lat, lng) {
    const savedRating = parseInt(localStorage.getItem(`rating_${name}`) || 0);
    const savedPics = JSON.parse(localStorage.getItem(`pics_${name}`) || "[]");

    // Create the container div
    const container = document.createElement("div");
    container.style.fontFamily = "sans-serif";
    container.style.minWidth = "220px";
    
    // Header
    const title = document.createElement("h3");
    title.textContent = name;
    title.style.marginTop = "0";
    title.style.marginBottom = "5px";
    container.appendChild(title);

    // Stars
    const starDiv = document.createElement("div");
    starDiv.className = "star-rating";
    for (let i = 1; i <= 5; i++) {
        const span = document.createElement("span");
        span.className = `star ${i <= savedRating ? 'active' : ''}`;
        span.innerHTML = "★";
        span.onclick = () => {
            localStorage.setItem(`rating_${name}`, i);
            currentMarker.setPopupContent(createPopup(name, lat, lng)); // Refresh popup
        };
        starDiv.appendChild(span);
    }
    container.appendChild(starDiv);

    // Coordinates
    const coordsP = document.createElement("p");
    coordsP.innerHTML = `<b>Lat:</b> ${lat}<br><b>Lng:</b> ${lng}`;
    coordsP.style.margin = "2px 0";
    container.appendChild(coordsP);

    // Distance
    const distP = document.createElement("p");
    distP.id = `popup-distance-${name}`;
    distP.style.margin = "2px 0";
    distP.style.color = "#555";
    distP.innerHTML = `<b>Distance:</b> Calculating...`;
    container.appendChild(distP);

    // Pics Container
    const picsDiv = document.createElement("div");
    picsDiv.style.marginTop = "10px";
    savedPics.forEach(pic => {
        const img = document.createElement("img");
        img.src = pic;
        img.style.width = "100%";
        img.style.borderRadius = "4px";
        img.style.marginBottom = "5px";
        picsDiv.appendChild(img);
    });
    container.appendChild(picsDiv);

    // Upload Button (Hides file input)
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64Img = ev.target.result;
            let pics = JSON.parse(localStorage.getItem(`pics_${name}`) || "[]");
            pics.push(base64Img);
            localStorage.setItem(`pics_${name}`, JSON.stringify(pics));
            currentMarker.setPopupContent(createPopup(name, lat, lng)); // Refresh popup
        };
        reader.readAsDataURL(file);
    };
    container.appendChild(fileInput);

    const uploadBtn = document.createElement("button");
    uploadBtn.textContent = "Upload Pic";
    uploadBtn.style.cssText = "background:#2a1c16; color:#b59f5b; padding:6px; border:none; border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px;";
    uploadBtn.onclick = () => fileInput.click();
    container.appendChild(uploadBtn);

    // Delete Button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete Pics";
    deleteBtn.style.cssText = "background:#2a1c16; color:#b59f5b; padding:6px; border:none; border-radius:4px; cursor:pointer; width:100%;";
    deleteBtn.onclick = () => {
        localStorage.removeItem(`pics_${name}`);
        currentMarker.setPopupContent(createPopup(name, lat, lng)); // Refresh popup
    };
    container.appendChild(deleteBtn);

    // Stop clicks from bubbling to the map (CRITICAL FIX)
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    return container;
}

async function handlePlaceSelection(e) {
    const select = e.target;
    const selectedOption = select.options[select.selectedIndex];
    
    if (selectedOption.disabled || selectedOption.value === "") return;

    const name = selectedOption.value;
    const destLat = parseFloat(selectedOption.dataset.lat);
    const destLng = parseFloat(selectedOption.dataset.lng);

    if (currentMarker) map.removeLayer(currentMarker);
    if (routeLine) map.removeLayer(routeLine);

    currentMarker = L.marker([destLat, destLng]).addTo(map);
    currentMarker.bindPopup(createPopup(name, destLat, destLng));
    
    map.flyTo([destLat, destLng], 14);
    currentMarker.openPopup();

    if (userLatLng) {
        try {
            const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${destLng},${destLat}?overview=full&geometries=geojson`);
            const data = await res.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const distanceKm = (route.distance / 1000).toFixed(2);
                const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
                
                routeLine = L.polyline(coords, { color: 'blue', weight: 4, opacity: 0.7 }).addTo(map);
                map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

                // Update distance text inside the open popup safely
                const distEl = document.getElementById(`popup-distance-${name}`);
                if (distEl) distEl.innerHTML = `<b>Distance:</b> ${distanceKm} km (via road)`;
            }
        } catch (err) {
            console.error("Routing error:", err);
            const distEl = document.getElementById(`popup-distance-${name}`);
            if (distEl) distEl.innerHTML = `<b>Distance:</b> Failed to load route`;
        }
    } else {
        const distEl = document.getElementById(`popup-distance-${name}`);
        if (distEl) distEl.innerHTML = `<b>Distance:</b> Click 'Locate Me' first`;
    }
}

async function loadCSVIntoSelect(selectId, url) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const initialOption = select.querySelector("option");
  const icon = initialOption ? initialOption.textContent.trim() : "📍";

  try {
    const res = await fetch(url);
    const rows = parseCSV(await res.text());

    select.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = icon; 
    defaultOpt.disabled = true; 
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    rows.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.name;
      opt.textContent = r.name;
      opt.dataset.lat = r.lat;
      opt.dataset.lng = r.lng;
      select.appendChild(opt);
    });

    select.addEventListener("change", handlePlaceSelection);
  } catch (e) {
    console.error(`Failed to load ${url}`, e);
  }
}

window.getRouteToDistrict = function() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
        userLatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (userLocationMarker) map.removeLayer(userLocationMarker);
        userLocationMarker = L.marker([userLatLng.lat, userLatLng.lng], {
            icon: L.divIcon({
                className: 'custom-user-icon',
                html: '<div style="background-color: #007bff; width: 15px; height: 15px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
                iconSize: [21, 21]
            })
        }).addTo(map).bindPopup("You are here").openPopup();
        map.flyTo([userLatLng.lat, userLatLng.lng], 14);
    }, (error) => {
        alert("Unable to retrieve your location. Please allow location access.");
    });
};

document.addEventListener("DOMContentLoaded", () => {
  Object.entries(CSV_FILES).forEach(([id, url]) => loadCSVIntoSelect(id, url));
});

// QR Code Functions
window.showQR = function() {
    const modal = document.getElementById("qrModal");
    const qrContainer = document.getElementById("qrcode");
    qrContainer.innerHTML = "";
    
    // PASTE YOUR GITHUB PAGES URL HERE
    const url = "https://sneha-goyal23.github.io/Hidden-gem-explorer/"; 
    
    document.getElementById("qrUrlText").textContent = url;
    
    new QRCode(qrContainer, {
        text: url,
        width: 256,
        height: 256,
        colorDark: "#4b2515",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    
    modal.classList.add("active");
};

window.closeQR = function() {
    document.getElementById("qrModal").classList.remove("active");
};

// Close modal on outside click
document.getElementById("qrModal").addEventListener("click", function(e) {
    if (e.target === this) closeQR();
});

/* Fix Leaflet map sizing on mobile */
window.addEventListener("resize", function() {
    if (typeof map !== 'undefined') {
        setTimeout(function() { map.invalidateSize(); }, 200);
    }
});

/* Force resize check on load just in case */
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() {
        if (typeof map !== 'undefined') map.invalidateSize();
    }, 500);
});