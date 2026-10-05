export type CharacterType = 
  | 'human' 
  | 'rabbit' 
  | 'cat' 
  | 'dog' 
  | 'robot' 
  | 'alien' 
  | 'butterfly' 
  | 'generic';

export type CharacterActionType = 
  | 'idle' 
  | 'walk' 
  | 'run' 
  | 'talk' 
  | 'look' 
  | 'turn' 
  | 'wave' 
  | 'jump' 
  | 'appear' 
  | 'disappear' 
  | 'fly' 
  | 'happy' 
  | 'sad' 
  | 'surprised';

export type EmotionType = 'happy' | 'sad' | 'surprised' | 'idle';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface StoryCharacter {
  id: string;
  name: string;
  type: CharacterType;
  appearance: string;
  color?: string;
  emotion?: EmotionType;
}

export interface CharacterAction {
  characterId: string;
  action: CharacterActionType;
  targetPosition?: Position3D;
  emotion?: EmotionType;
}

export interface DialogueItem {
  characterId: string;
  text: string;
}

export interface StoryScene {
  scene_number: number;
  title: string;
  duration: number; // in seconds
  narration?: string;
  actions: CharacterAction[];
  dialogue: DialogueItem[];
}

export interface StoryEnvironment {
  mood?: string;
  theme?: string;
}

export interface StoryData {
  title: string;
  summary: string;
  characters: StoryCharacter[];
  environment?: StoryEnvironment;
  scenes: StoryScene[];
}

export interface OllamaHealthStatus {
  status: 'online' | 'offline';
  ollamaHost: string;
  currentModel: string;
  availableModels?: string[];
  message?: string;
}
