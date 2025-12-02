# Pelias MapLibre React Application

This is a simple **React** application using **MapLibre GL JS** and the **MapLibre Geocoder** plugin to connect with a custom **Pelias API** running locally. It allows you to search for locations and visualize them on an interactive map.

### Features:
- Integrates MapLibre with Pelias geocoder
- Search locations by name or address
- Displays search results on an interactive map
- Built with React functional components and hooks

---

## Prerequisites

Before getting started, make sure you have:

- **Node.js** (>= 14.x) installed
- **NPM** (comes with Node.js) or **Yarn** installed

You should also have a **Pelias API** running locally or accessible via HTTP, as the app is set up to point to `http://localhost:3100/v1/search`.

---

## Getting Started

Follow these steps to get your local map application running.

### 1. Clone the Repository (or Create Your Own)

First, create a new Vite React project:

```bash
# Create the project
npm create vite@latest pelias-map -- --template react
cd pelias-map
```
### 2. Install Dependencies

Install the necessary packages:

```bash
# Install MapLibre and the Geocoder plugin
npm install maplibre-gl @maplibre/maplibre-gl-geocoder
```

## Running the Application
### 1. Start the Dev Server

Run the following command to start your development server:

```bash
npm run dev
```

This should start the app at http://localhost:3000. Open the app in your browser, and you should see the interactive map.

### 2. Interact with the Map

Search for a location (e.g., "Empire State Building").

The map should automatically zoom to the location and place a marker on the map.

You can also test the autocomplete search by typing in partial addresses or places.

## Configuration

This application is configured to query your local Pelias API at http://localhost:3100/v1/search. If you have a different Pelias API endpoint, modify the URL in src/App.jsx where the geocoder is configured.