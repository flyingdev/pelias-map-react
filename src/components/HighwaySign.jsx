import React from 'react';

export default React.memo(function HighwaySign({ signData }) {
  if (!signData) return null;

  const exitNumber = signData.exit_number_elements?.[0]?.text;
  const branch = signData.exit_branch_elements?.map((e) => e.text).join(' / ');
  const toward = signData.exit_toward_elements?.map((e) => e.text).join(' / ');

  if (!exitNumber && !branch && !toward) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      backgroundColor: '#006b3f',
      border: '3px solid white',
      borderRadius: 8,
      padding: '12px 24px',
      minWidth: 250,
      textAlign: 'center',
      boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
      color: 'white',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    }}>
      {exitNumber && (
        <div style={{
          display: 'inline-block',
          border: '2px solid white',
          padding: '2px 8px',
          marginBottom: 8,
          borderRadius: 4,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
            EXIT {exitNumber}
          </span>
        </div>
      )}
      {branch && (
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, lineHeight: 1.2 }}>
          {branch}
        </div>
      )}
      {toward && (
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: branch ? 6 : 0, opacity: 0.9 }}>
          {toward}
        </div>
      )}
    </div>
  );
});
