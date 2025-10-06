import React from 'react';

const SuperGameImproved = () => {
  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      background: 'radial-gradient(1200px 800px at 65% 15%, #183866 0%, #0d1f3d 40%, #071427 100%)'
    }}>
      <iframe 
        src="super_game/super.html" 
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '8px'
        }}
        title="Vire's Gesture Quest - Improved Therapeutic Gaming"
      />
    </div>
  );
};

export default SuperGameImproved;