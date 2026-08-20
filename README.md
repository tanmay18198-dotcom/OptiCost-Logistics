# Order Logistics & Rate Calculator

A lightweight, 100% free web application designed to parse Government e-Marketplace (GeM) purchase order PDFs, extract seller (pickup) and buyer (delivery) addresses, calculate real-world driving distance, and estimate transportation charges across multiple vehicle categories.

Built entirely without paid third-party APIs (no Google Maps API keys or billing required).

# Features

* Automated GeM PDF Parsing: Extracts seller/buyer addresses and 6-digit PIN codes directly from uploaded PDF documents.
* 100% Free Routing Engine: Uses OpenStreetMap (Nominatim) for location geocoding and **OSRM (Open Source Routing Machine)** for driving distance and travel time calculation.
* Multi-Vehicle Cost Matrix: Automatically calculates tiered shipping charges for Bikes, Cars, Mini Tempos, Bolero Pickups, and Eicher Trucks based on distance.
* Clean Single-Page Interface: Fast, responsive UI with real-time error handling and state management.

# Tech Stack

* Frontend: HTML5, CSS3, Vanilla JavaScript (Fetch API)
* Backend: Node.js, Express.js
* PDF Parsing: `php`
* File Handling: `multer`
* Geocoding & Routing: OpenStreetMap Nominatim API & OSRM Driving Router

# Project Structure

```text
├── index.html          # Frontend UI & client-side JavaScript
├── server.js            # Express server, PDF extraction logic, & OSRM integration
├── package.json        # Node.js dependencies and scripts
└── package-lock.json
