const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

// Clean address text
function sanitizeAddress(str) {
  if (!str) return '';
  return str
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/(?:पता|Address|जीएसटीआईएन|GSTIN|ईमेल आईडी|Email ID|संपर्क नंबर|Contact No|पद|Designation)\s*[:|]?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract full address or 6-digit PIN code
function extractAddress(text, sectionHeaderRegex) {
  const sectionMatch = text.match(sectionHeaderRegex);
  if (!sectionMatch) return null;

  const sectionText = sectionMatch[1];
  
  const fullAddrMatch = sectionText.match(/([A-Za-z0-9\s,.\-\/#():]+\b\d{6},\s*India)/i);
  if (fullAddrMatch) {
    return sanitizeAddress(fullAddrMatch[1]);
  }

  const pinMatch = sectionText.match(/\b(\d{6})\b/);
  if (pinMatch) {
    return `${pinMatch[1]}, India`;
  }

  return null;
}

function extractPinCode(addressStr) {
  const match = addressStr.match(/\b(\d{6})\b/);
  return match ? `${match[1]}, India` : addressStr;
}

// 100% FREE Geocoding via OpenStreetMap (Nominatim)
async function geocodeAddress(addressQuery) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressQuery)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'GeMLogisticsApp/1.0 (free-calculator)'
      }
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error('Geocoding error for:', addressQuery, err.message);
  }
  return null;
}

// 100% FREE Route & Distance Calculation via OSRM
async function getOsrmRoute(startCoords, endCoords) {
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}?overview=false`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      return {
        distanceMeters: data.routes[0].distance,
        durationSeconds: data.routes[0].duration
      };
    }
  } catch (err) {
    console.error('OSRM Routing Error:', err.message);
  }
  return null;
}

function calculateVehicleRates(distanceKm) {
  const vehicleTypes = [
    { name: 'Bike', base: 40, perKm: 8 },
    { name: 'Car', base: 100, perKm: 14 },
    { name: 'Mini Tempo', base: 300, perKm: 22 },
    { name: 'Bolero Pickup', base: 500, perKm: 30 },
    { name: 'Eicher Truck', base: 1200, perKm: 55 }
  ];

  return vehicleTypes.map(v => ({
    type: v.name,
    base: v.base,
    perKm: v.perKm,
    totalCost: Number((v.base + (distanceKm * v.perKm)).toFixed(2))
  }));
}

app.post('/api/process-pdf', upload.single('pdf_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required.' });
    }

    const pdfData = await pdfParse(req.file.buffer);
    const fullText = pdfData.text;

    const sellerRegex = /(?:Seller Details|विक्रेता विवरण)([\s\S]*?)(?:Buyer Details|खरीदार विवरण|Product Details|उत्पाद विवरण)/i;
    const buyerRegex = /(?:Buyer Details|खरीदार विवरण)([\s\S]*?)(?:Paying Authority|भुगतान प्राधिकरण|Financial Approval|Product Details|उत्पाद विवरण)/i;

    const sellerAddress = extractAddress(fullText, sellerRegex);
    const buyerAddress = extractAddress(fullText, buyerRegex);

    console.log('\n--- EXTRACTED ADDRESSES ---');
    console.log('Seller:', sellerAddress);
    console.log('Buyer:', buyerAddress);

    if (!sellerAddress || !buyerAddress) {
      return res.status(422).json({
        error: 'Could not extract valid PIN codes or addresses from PDF layout.'
      });
    }

    // 1. Geocode Seller Location
    let sellerCoords = await geocodeAddress(sellerAddress);
    if (!sellerCoords) {
      const sellerPin = extractPinCode(sellerAddress);
      console.log('Full seller address lookup failed. Trying PIN:', sellerPin);
      sellerCoords = await geocodeAddress(sellerPin);
    }

    // 2. Geocode Buyer Location
    let buyerCoords = await geocodeAddress(buyerAddress);
    if (!buyerCoords) {
      const buyerPin = extractPinCode(buyerAddress);
      console.log('Full buyer address lookup failed. Trying PIN:', buyerPin);
      buyerCoords = await geocodeAddress(buyerPin);
    }

    if (!sellerCoords || !buyerCoords) {
      return res.status(400).json({
        error: 'Free geocoding service could not locate one of the addresses or PIN codes.'
      });
    }

    // 3. Calculate Route Distance via OSRM
    const route = await getOsrmRoute(sellerCoords, buyerCoords);
    if (!route) {
      return res.status(400).json({
        error: 'Could not calculate driving distance between these locations.'
      });
    }

    const distanceKm = Number((route.distanceMeters / 1000).toFixed(2));
    const durationMins = Math.round(route.durationSeconds / 60);
    const duration = durationMins > 60
      ? `${Math.floor(durationMins / 60)} hr ${durationMins % 60} mins`
      : `${durationMins} mins`;

    const vehicles = calculateVehicleRates(distanceKm);

    return res.json({
      sellerAddress,
      buyerAddress,
      distanceKm,
      duration,
      vehicles
    });

  } catch (err) {
    console.error('Server Error:', err);
    return res.status(500).json({ error: 'Server Error: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});