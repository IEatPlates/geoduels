import React from 'react';

export default function OverlayDiagonalBackground() {
  return (
    <div className="absolute inset-0 z-0 flex pointer-events-none">
      <div className="absolute inset-0 bg-[#cdb075]" />
      <div 
        className="absolute inset-0 bg-[#2b2756] drop-shadow-[-8px_0_16px_rgba(0,0,0,0.5)]" 
        style={{ 
          clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 35% 100%)',
          boxShadow: '-10px 0px 30px rgba(0,0,0,0.5)' // box-shadow won't work with clip-path, but we can try 
        }} 
      />
      {/* To get a shadow on the clipped edge, we can add an SVG or another div */}
      <div 
        className="absolute inset-0 bg-black/30 w-full" 
        style={{ 
            clipPath: 'polygon(55% 0, 56% 0, 36% 100%, 35% 100%)',
            filter: 'blur(8px)'
        }} 
      />
    </div>
  );
}
