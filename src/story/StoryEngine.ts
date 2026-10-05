import type { StoryData, StoryScene } from '../types/story';
import { CharacterSprite } from '../characters/CharacterSprite';
import { SpeechController } from '../audio/SpeechController';

export interface StoryEngineEvents {
  onSceneChange: (sceneIndex: number, scene: StoryScene) => void;
  onSubtitleChange: (subtitle: { speaker: string; text: string; characterId?: string; isDialogue: boolean } | null) => void;
  onStoryComplete: () => void;
  onPlayStateChange: (isPlaying: boolean) => void;
}

export class StoryEngine {
  public story: StoryData;
  public charactersMap: Map<string, CharacterSprite> = new Map();
  public currentSceneIndex: number = 0;
  
  private isPlaying: boolean = false;
  private isFinished: boolean = false;
  private sceneTimer: number = 0;
  private sceneDuration: number = 7;
  
  private speech: SpeechController;
  private events: StoryEngineEvents;
  private dialogueQueue: { characterId: string; text: string }[] = [];
  private isSpeaking: boolean = false;

  constructor(story: StoryData, speech: SpeechController, events: StoryEngineEvents) {
    this.story = story;
    this.speech = speech;
    this.events = events;
  }

  public registerCharacter(id: string, sprite: CharacterSprite) {
    this.charactersMap.set(id, sprite);
  }

  public start() {
    this.currentSceneIndex = 0;
    this.isFinished = false;
    this.isPlaying = true;
    this.events.onPlayStateChange(true);
    this.loadScene(this.currentSceneIndex);
  }

  public pause() {
    this.isPlaying = false;
    this.speech.pause();
    this.events.onPlayStateChange(false);
  }

  public resume() {
    if (this.isFinished) {
      this.restart();
      return;
    }
    this.isPlaying = true;
    this.speech.resume();
    this.events.onPlayStateChange(true);
  }

  public restart() {
    this.speech.stop();
    this.currentSceneIndex = 0;
    this.isFinished = false;
    this.isPlaying = true;
    this.events.onPlayStateChange(true);
    this.loadScene(0);
  }

  public update(delta: number) {
    if (!this.isPlaying || this.isFinished) return;

    this.sceneTimer += delta;

    // Advance to next scene if duration met and speech finished
    if (this.sceneTimer >= this.sceneDuration && !this.isSpeaking && this.dialogueQueue.length === 0) {
      this.nextScene();
    }
  }

  private loadScene(index: number) {
    if (index >= this.story.scenes.length) {
      this.finishStory();
      return;
    }

    const scene = this.story.scenes[index];
    this.currentSceneIndex = index;
    this.sceneTimer = 0;
    this.sceneDuration = scene.duration || 7;
    this.dialogueQueue = [...(scene.dialogue || [])];

    this.events.onSceneChange(index, scene);

    // Apply scene actions to character sprites
    for (const action of scene.actions) {
      const sprite = this.charactersMap.get(action.characterId);
      if (sprite) {
        sprite.setAction(action.action, action.targetPosition, action.emotion);
      }
    }

    // Play narration first, then process dialogue queue
    if (scene.narration && scene.narration.trim().length > 0) {
      this.playNarration(scene.narration);
    } else {
      this.processNextDialogue();
    }
  }

  private playNarration(narration: string) {
    this.isSpeaking = true;
    this.events.onSubtitleChange({
      speaker: 'Narrator',
      text: narration,
      isDialogue: false
    });

    this.speech.speak(narration, 'narrator', {
      onEnd: () => {
        this.isSpeaking = false;
        this.processNextDialogue();
      }
    });
  }

  private processNextDialogue() {
    if (this.dialogueQueue.length === 0) {
      this.events.onSubtitleChange(null);
      return;
    }

    const item = this.dialogueQueue.shift()!;
    const character = this.story.characters.find(c => c.id === item.characterId);
    const speakerName = character ? character.name : 'Hero';
    const charType = character ? character.type : 'generic';
    const sprite = this.charactersMap.get(item.characterId);

    this.isSpeaking = true;

    // Set character to talking state
    if (sprite) {
      sprite.setAction('talk');
    }

    this.events.onSubtitleChange({
      speaker: speakerName,
      text: item.text,
      characterId: item.characterId,
      isDialogue: true
    });

    this.speech.speak(item.text, charType, {
      onEnd: () => {
        this.isSpeaking = false;
        if (sprite) {
          sprite.setAction('idle');
        }
        // Small pause between dialogue lines
        setTimeout(() => {
          if (this.isPlaying) {
            this.processNextDialogue();
          }
        }, 500);
      }
    });
  }

  private nextScene() {
    if (this.currentSceneIndex + 1 < this.story.scenes.length) {
      this.loadScene(this.currentSceneIndex + 1);
    } else {
      this.finishStory();
    }
  }

  private finishStory() {
    this.isFinished = true;
    this.isPlaying = false;
    this.events.onSubtitleChange(null);
    this.events.onPlayStateChange(false);
    this.events.onStoryComplete();
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsFinished(): boolean {
    return this.isFinished;
  }

  public dispose() {
    this.speech.stop();
    this.isPlaying = false;
  }
}
