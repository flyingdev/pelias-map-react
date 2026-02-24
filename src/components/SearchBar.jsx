import React, { useState, useRef } from 'react';
import { CONFIG } from '../config';

export default function SearchBar({ onSelect }) {
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef(null);

  async function handleInput(e) {
    const query = e.target.value;
    if (query.length < 3) {
      setShowResults(false);
      setResults([]);
      return;
    }

    try {
      const res = await fetch(
        `${CONFIG.pelias}/autocomplete?text=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        setResults(data.features);
        setShowResults(true);
      } else {
        setResults([]);
        setShowResults(false);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  }

  function handleSelect(feature) {
    const label = feature.properties.label;
    if (inputRef.current) inputRef.current.value = label;
    setShowResults(false);
    setResults([]);
    onSelect(feature);
  }

  function clearInput() {
    if (inputRef.current) inputRef.current.value = '';
    setShowResults(false);
    setResults([]);
  }

  return (
    <div id="search-container">
      <input
        ref={inputRef}
        type="text"
        id="search-input"
        placeholder="Search places..."
        autoComplete="off"
        onInput={handleInput}
      />
      <ul id="results-list" className={showResults ? 'visible' : ''}>
        {results.map((feature, i) => (
          <li key={i} onClick={() => handleSelect(feature)}>
            {feature.properties.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Expose a way for parent to clear the input
SearchBar.clearInput = null; // will be set via ref
