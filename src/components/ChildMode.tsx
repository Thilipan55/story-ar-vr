import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { StoryData, StoryScene } from '../types/story';
import { ARController } from '../ar/ARController';
import { CharacterSprite } from '../characters/CharacterSprite';
import { SpeechController } from '../audio/SpeechController';
import { StoryEngine } from '../story/StoryEngine';
import { Subtitles } from './Subtitles';
import { PlacementGuide } from './PlacementGuide';
import confetti from 'canvas-confetti';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  ArrowLeft, 
  Sparkles, 
  Compass,
  PartyPopper
} from 'lucide-react';

interface ChildModeProps {
  story: StoryData;
  onExit: () => void;
}

export const ChildMode: React.FC<ChildModeProps> = ({ story, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  // Controllers
  const arRef = useRef<ARController | null>(null);
  const engineRef = useRef<StoryEngine | null>(null);
  const speechRef = useRef<SpeechController | null>(null);
  const spritesRef = useRef<Map<string, CharacterSprite>>(new Map());

  // UI state
  const [isPlaced, setIsPlaced] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(0);
  const [currentScene, setCurrentScene] = useState<StoryScene | null>(story.scenes[0] || null);
  const [subtitle, setSubtitle] = useState<{
    speaker: string;
    text: string;
    characterId?: string;
    isDialogue: boolean;
  } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Initialize AR & Story
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const speech = new SpeechController();
    speechRef.current = speech;

    const ar = new ARController({
      canvas: canvasRef.current,
      videoElement: videoRef.current,
      onPlacementComplete: () => {
        setIsPlaced(true);
        // Auto start story when placed
        if (engineRef.current) {
          engineRef.current.start();
        }
      }
    });
    arRef.current = ar;

    // Start camera stream
    ar.initCamera().then(success => {
      if (!success) {
        setCameraError('Camera access unavailable. Using virtual room background.');
      }
    });

    // Create 3D Character Sprites from Story characters
    story.characters.forEach((char, index) => {
      const sprite = new CharacterSprite(char);
      // Stagger initial positions slightly
      const initX = (index === 0 ? -0.4 : 0.4) + (index > 1 ? (index - 1) * 0.3 : 0);
      sprite.setPosition({ x: initX, y: 0, z: -1.5 });
      ar.anchorGroup.add(sprite.group);
      spritesRef.current.set(char.id, sprite);
    });

    // Create StoryEngine
    const engine = new StoryEngine(story, speech, {
      onSceneChange: (index, scene) => {
        setCurrentSceneIndex(index);
        setCurrentScene(scene);
      },
      onSubtitleChange: (sub) => {
        setSubtitle(sub);
      },
      onStoryComplete: () => {
        setIsFinished(true);
        setIsPlaying(false);
        // Confetti explosion!
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
      }
    });
    engineRef.current = engine;

    // Register character sprites to engine
    spritesRef.current.forEach((sprite, id) => {
      engine.registerCharacter(id, sprite);
    });

    // Start render loop
    ar.startRenderLoop((delta) => {
      // Update story timeline
      engine.update(delta);

      // Update all character sprites
      spritesRef.current.forEach(sprite => {
        sprite.update(delta, ar.camera);
      });
    });

    return () => {
      engine.dispose();
      ar.dispose();
      speech.stop();
    };
  }, [story]);

  // Screen tap handler for floor placement
  const handleScreenTap = useCallback((e: React.MouseEvent) => {
    if (!isPlaced && arRef.current) {
      arRef.current.handlePlacementTap(e.clientX, e.clientY);
    }
  }, [isPlaced]);

  const handlePlayToggle = () => {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.pause();
    } else {
      engineRef.current.resume();
    }
  };

  const handleReplay = () => {
    setIsFinished(false);
    if (engineRef.current) {
      engineRef.current.restart();
    }
  };

  const handleToggleMute = () => {
    if (!speechRef.current) return;
    const muted = speechRef.current.toggleMute();
    setIsMuted(muted);
  };

  const handleResetPlacement = () => {
    if (arRef.current) {
      arRef.current.resetPlacement();
      setIsPlaced(false);
    }
  };

  return (
    <div className="child-mode-container" onClick={handleScreenTap}>
      {/* Background Camera Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="ar-camera-feed"
      />

      {/* Fallback Virtual Room Gradient if camera is blocked */}
      {cameraError && (
        <div className="virtual-room-backdrop">
          <div className="virtual-room-info">
            <span className="info-chip">{cameraError}</span>
          </div>
        </div>
      )}

      {/* Transparent Three.js Layer */}
      <canvas ref={canvasRef} className="ar-three-canvas" />

      {/* Top Header Bar */}
      <div className="child-top-bar" onClick={(e) => e.stopPropagation()}>
        <button className="child-btn-icon back-btn" onClick={onExit} title="Parent Mode">
          <ArrowLeft size={24} />
          <span className="hidden sm:inline text-sm font-semibold">Exit</span>
        </button>

        <div className="story-pill">
          <Sparkles size={18} className="text-amber-300 animate-spin-slow" />
          <span className="story-pill-title">{currentScene ? currentScene.title : story.title}</span>
          <span className="scene-indicator">
            Scene {currentSceneIndex + 1}/{story.scenes.length}
          </span>
        </div>

        <div className="top-right-actions">
          <button className="child-btn-icon" onClick={handleToggleMute} title="Mute/Unmute">
            {isMuted ? <VolumeX size={22} className="text-rose-400" /> : <Volume2 size={22} className="text-sky-300" />}
          </button>
          <button className="child-btn-icon" onClick={handleResetPlacement} title="Reposition Floor Anchor">
            <Compass size={22} className="text-emerald-300" />
          </button>
        </div>
      </div>

      {/* Floor Placement Guidance */}
      {!isPlaced && (
        <PlacementGuide onTap={() => arRef.current?.handlePlacementTap()} />
      )}

      {/* Live Narration / Dialogue Speech Subtitles */}
      <Subtitles subtitle={subtitle} />

      {/* Bottom Child-Friendly Controls */}
      <div className="child-bottom-controls" onClick={(e) => e.stopPropagation()}>
        {/* Scene Progress Indicators */}
        <div className="scene-progress-track">
          {story.scenes.map((_, idx) => (
            <div
              key={idx}
              className={`progress-dot ${idx === currentSceneIndex ? 'active' : ''} ${idx < currentSceneIndex ? 'completed' : ''}`}
            />
          ))}
        </div>

        {/* Main Big Control Buttons */}
        <div className="control-buttons-row">
          <button 
            className="big-child-btn secondary-btn"
            onClick={handleReplay}
            title="Replay Story"
          >
            <RotateCcw size={28} />
            <span>Replay</span>
          </button>

          <button 
            className={`big-child-btn primary-action-btn ${isPlaying ? 'playing' : 'paused'}`}
            onClick={handlePlayToggle}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={36} /> : <Play size={36} className="ml-1" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
        </div>
      </div>

      {/* Story Finished Celebratory Modal */}
      {isFinished && (
        <div className="story-ending-modal" onClick={(e) => e.stopPropagation()}>
          <div className="ending-card">
            <div className="ending-icon-wrapper">
              <PartyPopper size={52} className="text-amber-400 animate-bounce" />
            </div>
            <h2 className="ending-title">The End!</h2>
            <p className="ending-desc">
              You watched the whole adventure of <strong>{story.title}</strong> right in your room!
            </p>
            <div className="ending-actions">
              <button className="big-child-btn primary-action-btn w-full" onClick={handleReplay}>
                <RotateCcw size={24} />
                <span>Play Again</span>
              </button>
              <button className="big-child-btn secondary-btn w-full" onClick={onExit}>
                <ArrowLeft size={24} />
                <span>New Story</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
