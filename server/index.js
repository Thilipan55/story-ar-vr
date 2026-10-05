import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { SYSTEM_PROMPT, buildStoryPrompt, DEFAULT_DEMO_STORY } from './storyPrompt.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';

app.use(cors());
app.use(express.json());

// Helper to sanitize JSON response from LLMs
function extractAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response from model');
  }

  // Remove markdown code blocks if present
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt to locate first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw new Error(`Failed to parse LLM JSON: ${err.message}`);
  }
}

function inferType(rawType, name = '', appearance = '') {
  const combined = `${rawType || ''} ${name || ''} ${appearance || ''}`.toLowerCase();
  if (combined.includes('alien') || combined.includes('martian') || combined.includes('zorb')) return 'alien';
  if (combined.includes('astronaut') || combined.includes('suit') || combined.includes('human') || combined.includes('boy') || combined.includes('girl') || combined.includes('leo')) return 'human';
  if (combined.includes('rabbit') || combined.includes('bunny') || combined.includes('hare')) return 'rabbit';
  if (combined.includes('cat') || combined.includes('kitten') || combined.includes('kitty')) return 'cat';
  if (combined.includes('dog') || combined.includes('puppy') || combined.includes('pup')) return 'dog';
  if (combined.includes('robot') || combined.includes('bot') || combined.includes('droid') || combined.includes('bleep')) return 'robot';
  if (combined.includes('butterfly') || combined.includes('moth')) return 'butterfly';
  const valid = ['human', 'rabbit', 'cat', 'dog', 'robot', 'alien', 'butterfly', 'generic'];
  if (valid.includes((rawType || '').toLowerCase())) return rawType.toLowerCase();
  return 'generic';
}

// Normalize and validate story schema
function normalizeStory(storyData) {
  if (!storyData || typeof storyData !== 'object') {
    return DEFAULT_DEMO_STORY;
  }
  
  // Format characters
  let characters = Array.isArray(storyData.characters) ? storyData.characters : [];
  if (characters.length === 0) {
    characters = DEFAULT_DEMO_STORY.characters;
  } else {
    characters = characters.map((c, index) => {
      const id = (c.id || c.name || `char_${index}`).toString().toLowerCase().replace(/[^a-z0-9]/g, '_');
      const type = inferType(c.type, c.name, c.appearance);
      return {
        id,
        name: c.name || `Hero ${index + 1}`,
        type,
        appearance: c.appearance || 'Friendly character',
        color: c.color || (index === 0 ? '#38bdf8' : '#4ade80'),
        emotion: c.emotion || 'happy'
      };
    });
  }

  const charIds = new Set(characters.map(c => c.id));
  const primaryCharId = characters[0].id;

  // Format scenes
  let scenes = Array.isArray(storyData.scenes) ? storyData.scenes : [];
  if (scenes.length === 0) {
    scenes = DEFAULT_DEMO_STORY.scenes;
  } else {
    scenes = scenes.map((scene, idx) => {
      const actions = (Array.isArray(scene.actions) ? scene.actions : []).map(act => {
        let charId = act.characterId || act.character_id || act.character;
        if (!charIds.has(charId)) {
          charId = primaryCharId;
        }
        return {
          characterId: charId,
          action: act.action || 'walk',
          targetPosition: {
            x: Number(act.targetPosition?.x ?? (idx % 2 === 0 ? -0.4 : 0.4)),
            y: Number(act.targetPosition?.y ?? 0),
            z: Number(act.targetPosition?.z ?? -1.5)
          },
          emotion: act.emotion || 'happy'
        };
      });

      const dialogue = (Array.isArray(scene.dialogue) ? scene.dialogue : []).map(d => {
        let charId = d.characterId || d.character_id || d.character;
        if (!charIds.has(charId)) {
          charId = primaryCharId;
        }
        return {
          characterId: charId,
          text: d.text || ''
        };
      });

      return {
        scene_number: scene.scene_number || idx + 1,
        title: scene.title || `Scene ${idx + 1}`,
        duration: Number(scene.duration) || 7,
        narration: scene.narration || '',
        actions,
        dialogue
      };
    });
  }

  return {
    title: storyData.title || 'Magical Story',
    summary: storyData.summary || 'An adventurous tale brought to life in AR.',
    characters,
    environment: storyData.environment || { mood: 'joyful', theme: 'room' },
    scenes
  };
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const models = (data.models || []).map(m => m.name);
      return res.json({
        status: 'online',
        ollamaHost: OLLAMA_HOST,
        currentModel: DEFAULT_MODEL,
        availableModels: models
      });
    }
  } catch (err) {
    // Ollama not reachable
  }

  res.json({
    status: 'offline',
    ollamaHost: OLLAMA_HOST,
    currentModel: DEFAULT_MODEL,
    message: 'Ollama is unreachable. Fallback story generator is active.'
  });
});

let latestActiveStory = DEFAULT_DEMO_STORY;

// Fallback demo story endpoint
app.get('/api/default-story', (req, res) => {
  res.json({
    success: true,
    story: DEFAULT_DEMO_STORY,
    source: 'fallback'
  });
});

// Active synced story endpoint (for mobile handoff)
app.get('/api/active-story', (req, res) => {
  res.json({
    success: true,
    story: latestActiveStory
  });
});

app.post('/api/active-story', (req, res) => {
  if (req.body && req.body.story) {
    latestActiveStory = normalizeStory(req.body.story);
  }
  res.json({
    success: true,
    story: latestActiveStory
  });
});

// Story generation endpoint
app.post('/api/generate-story', async (req, res) => {
  const { story, model = DEFAULT_MODEL } = req.body;

  if (!story || typeof story !== 'string' || story.trim().length === 0) {
    return res.status(400).json({ error: 'Please provide a story prompt.' });
  }

  console.log(`[StoryAR API] Generating story with model ${model}...`);
  console.log(`[StoryAR API] Prompt: "${story.substring(0, 100)}..."`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout for local LLM

    const ollamaPayload = {
      model,
      system: SYSTEM_PROMPT,
      prompt: buildStoryPrompt(story),
      stream: false,
      format: 'json',
      options: {
        temperature: 0.7,
        num_predict: 2048
      }
    };

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaPayload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama returned status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[StoryAR API] Ollama response received. Parsing JSON...');
    
    const parsed = extractAndParseJSON(data.response);
    const normalized = normalizeStory(parsed);
    latestActiveStory = normalized;

    console.log(`[StoryAR API] Successfully generated "${normalized.title}" with ${normalized.characters.length} characters and ${normalized.scenes.length} scenes.`);

    res.json({
      success: true,
      story: normalized,
      source: 'ollama',
      modelUsed: model
    });
  } catch (error) {
    console.warn(`[StoryAR API] Error contacting Ollama (${error.message}). Using fallback demo story.`);
    
    // Customize the fallback story title if possible
    const fallback = {
      ...DEFAULT_DEMO_STORY,
      title: story.length < 40 ? story : DEFAULT_DEMO_STORY.title,
    };
    latestActiveStory = fallback;

    res.json({
      success: true,
      story: fallback,
      source: 'fallback',
      warning: `AI generation failed (${error.message}). Provided working fallback story.`
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 StoryAR Local API running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Connected to Ollama at ${OLLAMA_HOST} (Default model: ${DEFAULT_MODEL})`);
});
