import { useState, useEffect } from 'react';
import type { StoryData } from './types/story';
import { FALLBACK_DEMO_STORY } from './ai/mockStoryAI';
import { ParentMode } from './components/ParentMode';
import { ChildMode } from './components/ChildMode';
import './App.css';

export function App() {
  const [mode, setMode] = useState<'parent' | 'child'>('parent');
  const [activeStory, setActiveStory] = useState<StoryData>(FALLBACK_DEMO_STORY);
  const [localIp, setLocalIp] = useState<string>('');

  useEffect(() => {
    // Detect IP / hostname
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      setLocalIp(hostname);
    } else {
      setLocalIp('10.43.219.25');
    }

    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get('mode');

    // Fetch active story from server
    fetch('/api/active-story')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.story) {
          setActiveStory(data.story);
          if (requestedMode === 'child') {
            setMode('child');
          }
        }
      })
      .catch(() => {
        if (requestedMode === 'child') {
          setMode('child');
        }
      });
  }, []);

  const handleStartStory = (story: StoryData) => {
    setActiveStory(story);
    setMode('child');
  };

  const handleExitChildMode = () => {
    setMode('parent');
  };

  return (
    <div className="storyar-app">
      {mode === 'parent' ? (
        <ParentMode 
          onStartStory={handleStartStory} 
          localIp={localIp}
        />
      ) : (
        <ChildMode 
          story={activeStory} 
          onExit={handleExitChildMode} 
        />
      )}
    </div>
  );
}

export default App;
