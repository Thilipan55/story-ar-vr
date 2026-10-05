import React from 'react';
import { Volume2, Sparkles, MessageCircle } from 'lucide-react';

interface SubtitlesProps {
  subtitle: {
    speaker: string;
    text: string;
    characterId?: string;
    isDialogue: boolean;
  } | null;
}

export const Subtitles: React.FC<SubtitlesProps> = ({ subtitle }) => {
  if (!subtitle || !subtitle.text) return null;

  return (
    <div className="subtitles-container">
      <div className={`subtitle-bubble ${subtitle.isDialogue ? 'dialogue' : 'narration'}`}>
        <div className="subtitle-header">
          {subtitle.isDialogue ? (
            <span className="speaker-tag dialogue-tag">
              <MessageCircle size={18} className="inline mr-1" />
              {subtitle.speaker}
            </span>
          ) : (
            <span className="speaker-tag narration-tag">
              <Sparkles size={18} className="inline mr-1" />
              {subtitle.speaker}
            </span>
          )}
          <Volume2 size={16} className="text-white/60 animate-pulse ml-auto" />
        </div>
        <p className="subtitle-text">
          {subtitle.text}
        </p>
      </div>
    </div>
  );
};
