import { useState, useEffect, useCallback } from 'react';

const API = '/api/sam/favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState([]);

  // Load on mount
  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, []);

  const addFavorite = useCallback(async (place) => {
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(place),
      });
      setFavorites((prev) => [...prev, place]);
    } catch (err) {
      console.warn('[Favorites] Save failed:', err);
    }
  }, []);

  const removeFavorite = useCallback(async (name) => {
    try {
      await fetch(`${API}/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setFavorites((prev) => prev.filter((f) => f.name.toLowerCase() !== name.toLowerCase()));
    } catch (err) {
      console.warn('[Favorites] Remove failed:', err);
    }
  }, []);

  return { favorites, addFavorite, removeFavorite };
}
