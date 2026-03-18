import React from 'react';

export default React.memo(function SpeedLimitSign({ limit }) {
  if (!limit) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 30,
      left: 80,
      zIndex: 10,
      backgroundColor: 'white',
      border: '3px solid black',
      borderRadius: 4,
      width: 50,
      height: 62,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
    }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: 'black', lineHeight: 1 }}>SPEED</span>
      <span style={{ fontSize: 8, fontWeight: 700, color: 'black', lineHeight: 1 }}>LIMIT</span>
      <span style={{ fontSize: 22, fontWeight: 900, color: 'black', lineHeight: 1.1 }}>
        {limit}
      </span>
    </div>
  );
});
