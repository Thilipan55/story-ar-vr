import React from 'react';
import { Target, Hand } from 'lucide-react';

interface PlacementGuideProps {
  onTap: () => void;
}

export const PlacementGuide: React.FC<PlacementGuideProps> = ({ onTap }) => {
  return (
    <div className="placement-guide-overlay" onClick={onTap}>
      <div className="placement-card">
        <div className="reticle-icon-wrapper">
          <Target size={48} className="text-sky-400 animate-spin-slow" />
          <Hand size={24} className="hand-tap-indicator" />
        </div>
        <h3 className="placement-title">Tap the Floor to Place the Story</h3>
        <p className="placement-subtitle">
          Point your camera at a flat area or floor, then tap anywhere on screen!
        </p>
        <button 
          className="placement-btn"
          onClick={(e) => {
            e.stopPropagation();
            onTap();
          }}
        >
          Place Characters Here
        </button>
      </div>
    </div>
  );
};
