// AI Provider Abstraction Layer
// Supports: Cloudflare Workers AI, OpenAI, Anthropic

import { AIProvider, AIScoring, FeedbackCategory } from '../durable-objects/types';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Base interface for all AI providers
export interface AIProviderInterface {
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
  scoreText(text: string): Promise<AIScoring>;
  summarize(texts: string[], context: string): Promise<string>;
}

// Cloudflare Workers AI Provider
export class CloudflareAIProvider implements AIProviderInterface {
  constructor(private ai: any) {}

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
    });

    return response.response || '';
  }

  async scoreText(text: string): Promise<AIScoring> {
    const startTime = Date.now();

    // Use Workers AI for sentiment analysis
    const sentimentPrompt = `Analyze this feedback and return ONLY a JSON object with this exact structure:
{
  "sentiment": <number between -1 and 1>,
  "urgency": <number between 0 and 10>,
  "category": "<question|pace|technical|content|other>",
  "keywords": ["<keyword1>", "<keyword2>", "<keyword3>"]
}

Feedback: "${text}"

Return ONLY valid JSON, no other text.`;

    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a sentiment analysis expert. Always respond with valid JSON only.' },
          { role: 'user', content: sentimentPrompt }
        ],
      });

      const resultText = response.response || '{}';

      // Try to parse JSON from response
      const parsed = this.extractJSON(resultText);

      return {
        sentiment: this.clamp(parsed.sentiment || 0, -1, 1),
        urgency: this.clamp(parsed.urgency || 5, 0, 10),
        category: this.validateCategory(parsed.category),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
        processingTime: Date.now() - startTime,
        provider: 'cloudflare',
      };
    } catch (error) {
      console.error('Cloudflare AI scoring error:', error);
      // Return neutral scoring on error
      return {
        sentiment: 0,
        urgency: 5,
        category: 'other',
        keywords: [],
        processingTime: Date.now() - startTime,
        provider: 'cloudflare',
      };
    }
  }

  async summarize(texts: string[], context: string): Promise<string> {
    const combined = texts.join('\n---\n');
    const prompt = `${context}\n\nFeedback items:\n${combined}\n\nProvide a concise summary highlighting key themes and insights.`;

    return this.generateText(prompt);
  }

  private extractJSON(text: string): any {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return {};
      }
    }
    return {};
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private validateCategory(category: string): FeedbackCategory {
    const validCategories: FeedbackCategory[] = ['question', 'pace', 'technical', 'content', 'other'];
    return validCategories.includes(category as FeedbackCategory) ? category as FeedbackCategory : 'other';
  }
}

// OpenAI Provider
export class OpenAIProvider implements AIProviderInterface {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || '';
  }

  async scoreText(text: string): Promise<AIScoring> {
    const startTime = Date.now();

    const prompt = `Analyze this course feedback and return a JSON object with sentiment (-1 to 1), urgency (0-10), category (question/pace/technical/content/other), and up to 5 keywords:

Feedback: "${text}"

Return only valid JSON in this format:
{"sentiment": 0.5, "urgency": 7, "category": "question", "keywords": ["docker", "networking"]}`;

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert at analyzing educational feedback. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const resultText = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(resultText);

      return {
        sentiment: this.clamp(parsed.sentiment || 0, -1, 1),
        urgency: this.clamp(parsed.urgency || 5, 0, 10),
        category: this.validateCategory(parsed.category),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
        processingTime: Date.now() - startTime,
        provider: 'openai',
      };
    } catch (error) {
      console.error('OpenAI scoring error:', error);
      return {
        sentiment: 0,
        urgency: 5,
        category: 'other',
        keywords: [],
        processingTime: Date.now() - startTime,
        provider: 'openai',
      };
    }
  }

  async summarize(texts: string[], context: string): Promise<string> {
    const combined = texts.join('\n---\n');
    const prompt = `${context}\n\nFeedback items:\n${combined}\n\nProvide a detailed summary with key insights, themes, and actionable recommendations.`;

    return this.generateText(prompt, 'You are an expert educational consultant analyzing course feedback.');
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private validateCategory(category: string): FeedbackCategory {
    const validCategories: FeedbackCategory[] = ['question', 'pace', 'technical', 'content', 'other'];
    return validCategories.includes(category as FeedbackCategory) ? category as FeedbackCategory : 'other';
  }
}

// Anthropic (Claude) Provider
export class AnthropicProvider implements AIProviderInterface {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  async scoreText(text: string): Promise<AIScoring> {
    const startTime = Date.now();

    const prompt = `Analyze this course feedback and return ONLY a JSON object:

Feedback: "${text}"

Return this exact JSON structure:
{"sentiment": <-1 to 1>, "urgency": <0 to 10>, "category": "<question|pace|technical|content|other>", "keywords": ["<keyword1>", "<keyword2>"]}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 256,
        system: 'You are a feedback analysis expert. Always respond with valid JSON only, no explanations.',
        messages: [
          { role: 'user', content: prompt }
        ],
      });

      const content = response.content[0];
      const resultText = content.type === 'text' ? content.text : '{}';
      const parsed = JSON.parse(resultText);

      return {
        sentiment: this.clamp(parsed.sentiment || 0, -1, 1),
        urgency: this.clamp(parsed.urgency || 5, 0, 10),
        category: this.validateCategory(parsed.category),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
        processingTime: Date.now() - startTime,
        provider: 'anthropic',
      };
    } catch (error) {
      console.error('Anthropic scoring error:', error);
      return {
        sentiment: 0,
        urgency: 5,
        category: 'other',
        keywords: [],
        processingTime: Date.now() - startTime,
        provider: 'anthropic',
      };
    }
  }

  async summarize(texts: string[], context: string): Promise<string> {
    const combined = texts.join('\n---\n');
    const prompt = `${context}\n\nFeedback items:\n${combined}\n\nProvide a comprehensive, thoughtful summary with deep insights and actionable recommendations.`;

    return this.generateText(prompt, 'You are an expert educational consultant with deep experience analyzing course feedback and providing actionable insights.');
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private validateCategory(category: string): FeedbackCategory {
    const validCategories: FeedbackCategory[] = ['question', 'pace', 'technical', 'content', 'other'];
    return validCategories.includes(category as FeedbackCategory) ? category as FeedbackCategory : 'other';
  }
}

// Factory function to create the appropriate provider
export function createAIProvider(
  provider: AIProvider,
  env: { AI?: any; OPENAI_API_KEY?: string; ANTHROPIC_API_KEY?: string }
): AIProviderInterface {
  switch (provider) {
    case 'cloudflare':
      if (!env.AI) throw new Error('Cloudflare AI binding not available');
      return new CloudflareAIProvider(env.AI);

    case 'openai':
      if (!env.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
      return new OpenAIProvider(env.OPENAI_API_KEY);

    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) throw new Error('Anthropic API key not configured');
      return new AnthropicProvider(env.ANTHROPIC_API_KEY);

    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
