/**
 * Video Style Prompt Templates
 * Each style has its own optimized prompt template for generating content
 * These templates are filled dynamically with user input data
 */

const VIDEO_STYLE_TEMPLATES = {
  // 1. Reddit-Style Storytime
  redditStorytime: {
    name: "Reddit-Style Storytime",
    description: "First-person stories that feel like Reddit confessions or urban legends",
    template: `You are a world-class screenwriter known for crafting emotionally gripping, realistic, first-person stories that feel like overheard conversations, true Reddit confessions, or urban legend.
The story should start with a curious hook, build suspense, and end with an emotional or shocking twist.
No supernatural or unrealistic events.
I want a {formattedDuration} long, first-person revenge story written as a voiceover script for YouTube Shorts. The tone should be grounded, cinematic, and completely believable — no cartoonish elements.
The story must:
• Open with a powerful first line that immediately pulls the viewer into a tense, unresolved situation
• Build real emotional tension through subtle visual cues, realistic body language, dialogue, and inner thoughts
• Conclude with a satisfying but believable twist — not exaggerated or over-the-top
• The final line must loop back emotionally or literally to the opening line or idea

This is NOT a comedy skit. It should feel like something that actually happened — something a person might confess in a bar or post anonymously on Reddit.
Avoid scene instructions or speaker highlights. Just produce a clean voiceover script, meant to be narrated by an AI voice.

Topic: {videoIdea}

Additional Context:
{additionalContext}

Emotional Goals:
The story should make the audience feel: {emotions} + "I would've done the same"

Strict Instructions (Do Not Break):
• Speak from a first-person perspective
• Do not include any camera directions or scene formatting — just plain spoken narration
• After the story, provide the following:
  a) A suggested YouTube title
  b) A short YouTube caption/description
  c) Suggested YouTube tags (comma-separated)
• Suggest detailed stock footage search terms (comma-separated) that would match the scenes, visuals, people, and emotional tone of this story
• End the story in a way that emotionally or verbally loops back to the beginning — increasing watch time and virality

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  },

  // 2. Did You Know? - Facts and curiosity-driven content
  didYouKnow: {
    name: "Did You Know?",
    description: "Curiosity-driven videos with mind-blowing facts and surprising revelations",
    template: `You are a world-class Shorts creator known for crafting viral, curiosity-driven videos that grab attention in the first 3 seconds and hold it through surprising, mind-blowing facts.
I want a {formattedDuration} long, fact-based YouTube Shorts script written as a voiceover narration. The tone should be punchy, casual, and mentally stimulating.
The story must:
• Open with a bizarre or shocking fact that immediately hooks the viewer
• Deliver more short follow-up facts or explanations that expand curiosity
• Conclude with a surprising twist, myth-buster, or question that keeps people watching
• The final sentence should loop back to the first or leave a curiosity gap for replay

Topic: {videoIdea}

Additional Context:
{additionalContext}

Emotional Goals:
The story should make the audience feel: {emotions}

Strict Instructions (Do Not Break):
1. Speak from a first-person or narrator-style voice
2. Do not include any camera directions or formatting
3. After the story, provide:
   a) Suggested YouTube title
   b) Short YouTube caption/description
   c) YouTube tags (comma-separated)
4. Suggest stock footage search terms (comma-separated) for matching visuals

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  },

  // 3. Motivation - Inspirational and empowering content
  motivation: {
    name: "Motivation",
    description: "Powerful motivational messages that move people to act",
    template: `You are a motivational voice that delivers powerful, cinematic messages that move people to act.
I want a {formattedDuration} long motivational voiceover script for YouTube Shorts.
The script must:
• Start with a bold truth or unexpected line
• Build with 3–5 powerful lines of life wisdom
• End with a statement that hits emotionally or reframes the opener
• Designed to loop

Topic: {videoIdea}

Additional Context:
{additionalContext}

Emotional Goals:
The viewer should feel: {emotions} + "I needed that"

Strict Instructions (Do Not Break):
1. Narration only (No scene instructions)
2. After script, include:
   a) Suggested YouTube title
   b) Short YouTube caption/description
   c) YouTube tags (comma-separated)
3. Suggest search terms for visuals (emotion, setting, abstract scenes)

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  },

  // 4. Quiz & Guessing Games - Interactive trivia content
  quizGame: {
    name: "Quiz & Guessing Games",
    description: "Interactive quiz content that makes viewers guess and engage",
    template: `You are a viral Shorts quizmaster creating fast-paced, visual trivia that makes viewers guess, tap, and comment.
I want a {formattedDuration} long interactive quiz-style Short script. The tone should be energetic, fun, and slightly challenging.
The script must:
• Ask a clear question with visual or sound cue
• Give the viewer a countdown
• Reveal the answer
• Offer a fun fact or twist
• Loop into the next round or hint back at the start

Quiz Topic: {videoIdea}

Additional Context:
{additionalContext}

Emotional Goals:
The viewer should feel: {emotions} + "I want to try again"

Strict Instructions (Do Not Break):
1. No scene instructions
2. Countdown should be integrated
3. After script, include:
   a) Suggested YouTube title
   b) Short YouTube caption/description
   c) YouTube tags (comma-separated)
4. Suggest search terms for quiz visuals (comma-separated)

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  },

  // 5. Meme Google Search - Humorous search-based content
  memeGoogleSearch: {
    name: "Meme Google Search",
    description: "Humorous content based on weird Google searches with deadpan reactions",
    template: `You are an AI assistant that turns weird Google searches into hilarious, deadpan, meme-worthy voiceovers.
I want a {formattedDuration} long Short script where the narrator reads and reacts to bizarre or funny Google searches.
The video must:
• Show strange but believable search queries
• Give snappy, sarcastic or AI-style responses
• End with a final punchline or one-liner that loops well

Theme: {videoIdea}

Additional Context:
{additionalContext}

Tone: Dry humor, meme voice, ironic
Emotional Goals:
The viewer should feel: {emotions} + "LOL I've searched that"

Strict Instructions (Do Not Break):
1. No scene instructions (narration only)
2. Countdown should be integrated
3. After script, include:
   a) Suggested YouTube title
   b) Short YouTube caption/description
   c) YouTube tags (comma-separated)
4. Suggest search terms for Google UI or meme visuals (comma-separated)

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  },

  // 6. 2-Person Dialogue Skit - Conversational comedy content
  dialogueSkit: {
    name: "2-Person Dialogue Skit",
    description: "Short, funny dialogue between characters in everyday situations",
    template: `You are a scriptwriter known for creating short, funny, realistic back-and-forth dialogue between characters in everyday situations.
I want a {formattedDuration} long, two-person dialogue script perfect for a YouTube shorts video.
The dialogue must:
• Start with a relatable setup
• Escalate with misunderstanding, tension, or absurd logic
• End with a sharp, clever punchline
• Feel short and fast-paced with natural rhythm

Scenario: {videoIdea}

Additional Context:
{additionalContext}

Emotional Goals:
The viewer should feel: {emotions} + "Oh I've BEEN there"

Strict Instructions (Do Not Break):
1. Label lines as Person A and B
2. No scene instructions (narration only)
3. After script, include:
   a) Suggested YouTube title
   b) Short YouTube caption/description
   c) YouTube tags (comma-separated)
4. Suggest search terms for stock footage that will fit the dialogue (comma-separated)

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  },

  // 7. News Explainers & Event Breakdowns
  newsExplainer: {
    name: "News Explainers & Event Breakdowns",
    description: "Simplified explanations of trending events in tech, pop culture, or world news",
    template: `You are a viral news explainer. You simplify trending events in tech, pop culture, or world news for YouTube Shorts viewers.
I want a {formattedDuration} long explainer script breaking down a recent event. Tone should be modern, fast, clear, and interesting.
The script must:
• Start with a bold headline-style hook
• Break the story down into 2–3 simple facts or events
• End with a provocative statement or question
• Loop or hint at follow-up

The Topic/Recent Event Is: {videoIdea}

Additional Context:
{additionalContext}

Emotional Goals:
The viewer should feel: {emotions} + "I didn't know that"

Strict Instructions:
1. No scene instructions (narration only)
2. After script, include:
   a) Suggested YouTube title
   b) Short YouTube caption/description
   c) YouTube tags (comma-separated)
3. Suggest search terms for stock footage that will fit the event/topic (comma-separated)

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  },

  // 8. Life POV - First-person immersive scenarios
  lifePOV: {
    name: "Life POV",
    description: "Immersive first-person scenarios that drop viewers into fictional situations",
    template: `You are a POV storyteller. You drop viewers into a fictional situation and guide them through an intense, emotional or funny moment.
I want a {formattedDuration} long POV story written in first-person. Tone: immersive, believable, with a twist.
The script must:
• Start with "POV: You're…"
• Create a real-feeling scenario
• Escalate quickly
• End with a surprising or poetic final moment
• Loop naturally

POV Scenario: {videoIdea}

Additional Context:
{additionalContext}

Emotional Goals:
The viewer should feel: {emotions} + "That felt real"

Strict Instructions:
1. First-person narration only (no scene instructions)
2. After script, include:
   a) Suggested YouTube title
   b) Short YouTube caption/description
   c) YouTube tags (comma-separated)
3. Suggest search terms for stock footage that will fit the situation

Language: {language}
Length: ~{maxWordCount} words (suitable for {formattedDuration} of voiceover)`
  }
};

/**
 * Get all available video styles
 */
const getAvailableStyles = () => {
  return Object.keys(VIDEO_STYLE_TEMPLATES).map(key => ({
    id: key,
    name: VIDEO_STYLE_TEMPLATES[key].name,
    description: VIDEO_STYLE_TEMPLATES[key].description
  }));
};

/**
 * Get a specific template by style
 */
const getTemplate = (style) => {
  return VIDEO_STYLE_TEMPLATES[style] || null;
};

/**
 * Fill a template with user data
 */
const fillTemplate = (style, data) => {
  const template = getTemplate(style);
  if (!template) {
    throw new Error(`Unknown video style: ${style}`);
  }

  let filledTemplate = template.template;
  
  // Replace all placeholders with actual data
  Object.keys(data).forEach(key => {
    const placeholder = `{${key}}`;
    const value = data[key] || '';
    filledTemplate = filledTemplate.replace(new RegExp(placeholder, 'g'), value);
  });

  return filledTemplate;
};

/**
 * Validate that a style exists
 */
const isValidStyle = (style) => {
  return Object.keys(VIDEO_STYLE_TEMPLATES).includes(style);
};

module.exports = {
  VIDEO_STYLE_TEMPLATES,
  getAvailableStyles,
  getTemplate,
  fillTemplate,
  isValidStyle
};
