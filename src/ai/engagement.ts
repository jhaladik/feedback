// AI Engagement Features
// Enhanced AI capabilities for better user experience

import { AIProviderInterface } from './providers';
import { Feedback, SessionPhase } from '../durable-objects/types';

// AI Writing Assistant - Help attendees write better feedback
export async function enhanceFeedback(
  draft: string,
  phase: SessionPhase,
  aiProvider: AIProviderInterface
): Promise<{ suggestions: string[]; improved: string }> {
  const contextMap = {
    pre: 'pre-course expectations and goals',
    live: 'real-time questions or concerns during the session',
    post: 'post-course reflection and feedback',
  };

  const prompt = `You are helping a course attendee write ${contextMap[phase]}.

Their draft: "${draft}"

Provide:
1. An improved, clearer version (1-2 sentences)
2. 2-3 alternative phrasings

Keep it authentic to their voice, just clearer and more specific.

Respond in JSON:
{
  "improved": "improved version",
  "suggestions": ["alternative 1", "alternative 2", "alternative 3"]
}`;

  try {
    const response = await aiProvider.generateText(
      prompt,
      'You are a helpful writing assistant for course feedback. Always respond with valid JSON.'
    );

    const parsed = JSON.parse(response);
    return {
      improved: parsed.improved || draft,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
    };
  } catch (error) {
    console.error('Feedback enhancement error:', error);
    return { improved: draft, suggestions: [] };
  }
}

// Detect patterns in recent feedback
export interface FeedbackPattern {
  topic: string;
  count: number;
  urgency: number;
  sentiment: number;
  examples: string[];
  recommendation: string;
}

export async function detectPatterns(
  recentFeedback: Feedback[],
  aiProvider: AIProviderInterface
): Promise<FeedbackPattern[]> {
  if (recentFeedback.length < 3) return [];

  const feedbackTexts = recentFeedback.map(f => f.content).join('\n- ');

  const prompt = `Analyze these recent course feedback items and identify patterns:

- ${feedbackTexts}

Identify 2-3 key patterns/themes. For each pattern, provide:
- topic: The main topic/issue
- count: Approximate number of mentions
- urgency: How urgent (0-10)
- sentiment: Overall sentiment (-1 to 1)
- recommendation: What the teacher should do

Respond in JSON:
{
  "patterns": [
    {
      "topic": "topic name",
      "count": 3,
      "urgency": 7,
      "sentiment": -0.3,
      "recommendation": "action for teacher"
    }
  ]
}`;

  try {
    const response = await aiProvider.generateText(
      prompt,
      'You are an expert at analyzing educational feedback patterns. Always respond with valid JSON.'
    );

    const parsed = JSON.parse(response);
    const patterns: FeedbackPattern[] = (parsed.patterns || []).map((p: any) => ({
      topic: p.topic || 'Unknown',
      count: p.count || 1,
      urgency: Math.max(0, Math.min(10, p.urgency || 5)),
      sentiment: Math.max(-1, Math.min(1, p.sentiment || 0)),
      examples: recentFeedback
        .filter(f => f.content.toLowerCase().includes(p.topic?.toLowerCase() || ''))
        .slice(0, 3)
        .map(f => f.content),
      recommendation: p.recommendation || '',
    }));

    return patterns;
  } catch (error) {
    console.error('Pattern detection error:', error);
    return [];
  }
}

// Generate teacher response suggestions
export async function suggestResponse(
  feedbackItem: Feedback,
  aiProvider: AIProviderInterface
): Promise<string[]> {
  const prompt = `A student submitted this feedback during a course:

"${feedbackItem.content}"

${feedbackItem.aiScoring ? `AI Analysis: Sentiment ${feedbackItem.aiScoring.sentiment}, Urgency ${feedbackItem.aiScoring.urgency}/10, Category: ${feedbackItem.aiScoring.category}` : ''}

Generate 3 quick, empathetic response options for the teacher. Keep them short (1-2 sentences).

Respond in JSON:
{
  "responses": ["response 1", "response 2", "response 3"]
}`;

  try {
    const response = await aiProvider.generateText(
      prompt,
      'You are helping teachers respond to student feedback effectively. Always respond with valid JSON.'
    );

    const parsed = JSON.parse(response);
    return Array.isArray(parsed.responses) ? parsed.responses.slice(0, 3) : [];
  } catch (error) {
    console.error('Response suggestion error:', error);
    return [];
  }
}

// Generate proactive insights
export interface ProactiveInsight {
  type: 'alert' | 'suggestion' | 'celebration';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  action?: string;
  timestamp: number;
}

export async function generateInsights(
  allFeedback: Feedback[],
  recentFeedback: Feedback[],
  phase: SessionPhase,
  aiProvider: AIProviderInterface
): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];
  const now = Date.now();

  // Check for urgent items
  const urgent = recentFeedback.filter(f => f.aiScoring && f.aiScoring.urgency > 7);
  if (urgent.length >= 2) {
    insights.push({
      type: 'alert',
      priority: 'high',
      title: '🚨 Multiple Urgent Items',
      message: `${urgent.length} urgent feedback items in last few minutes`,
      action: 'Review and address immediately',
      timestamp: now,
    });
  }

  // Check sentiment drop
  if (recentFeedback.length >= 5) {
    const recentSentiment = recentFeedback
      .filter(f => f.aiScoring)
      .reduce((sum, f) => sum + (f.aiScoring?.sentiment || 0), 0) / recentFeedback.length;

    const allSentiment = allFeedback
      .filter(f => f.aiScoring)
      .reduce((sum, f) => sum + (f.aiScoring?.sentiment || 0), 0) / allFeedback.length;

    if (recentSentiment < allSentiment - 0.3) {
      insights.push({
        type: 'alert',
        priority: 'high',
        title: '📉 Sentiment Drop Detected',
        message: 'Recent feedback is more negative than earlier',
        action: 'Consider checking if everyone is following',
        timestamp: now,
      });
    }
  }

  // Check for repeated topics
  const keywords = recentFeedback
    .filter(f => f.aiScoring?.keywords)
    .flatMap(f => f.aiScoring?.keywords || []);

  const keywordCounts: Record<string, number> = {};
  keywords.forEach(k => {
    keywordCounts[k] = (keywordCounts[k] || 0) + 1;
  });

  const trending = Object.entries(keywordCounts)
    .filter(([_, count]) => count >= 3)
    .sort(([_, a], [__, b]) => b - a);

  if (trending.length > 0) {
    const [topic, count] = trending[0];
    insights.push({
      type: 'suggestion',
      priority: 'medium',
      title: `🔥 Trending Topic: "${topic}"`,
      message: `Mentioned ${count} times recently`,
      action: 'Consider addressing this topic',
      timestamp: now,
    });
  }

  // Positive engagement
  if (recentFeedback.length >= 10) {
    const positiveCount = recentFeedback.filter(f =>
      f.aiScoring && f.aiScoring.sentiment > 0.5
    ).length;

    if (positiveCount >= recentFeedback.length * 0.7) {
      insights.push({
        type: 'celebration',
        priority: 'low',
        title: '🎉 Great Engagement!',
        message: `${positiveCount} positive feedback items recently`,
        timestamp: now,
      });
    }
  }

  // Low engagement warning
  if (phase === 'live') {
    const durationMinutes = 30; // TODO: calculate actual duration
    if (allFeedback.length < durationMinutes * 0.3) {
      insights.push({
        type: 'suggestion',
        priority: 'medium',
        title: '💬 Low Engagement',
        message: 'Consider prompting for questions or feedback',
        action: 'Ask: "Any questions so far?"',
        timestamp: now,
      });
    }
  }

  return insights;
}

// Group similar questions
export interface QuestionCluster {
  id: string;
  topic: string;
  questions: Feedback[];
  combinedQuestion: string;
  priority: number;
}

export async function clusterQuestions(
  questions: Feedback[],
  aiProvider: AIProviderInterface
): Promise<QuestionCluster[]> {
  if (questions.length < 2) {
    return questions.map(q => ({
      id: q.id,
      topic: 'Individual Question',
      questions: [q],
      combinedQuestion: q.content,
      priority: q.aiScoring?.urgency || 5,
    }));
  }

  const questionTexts = questions.map((q, i) => `${i + 1}. ${q.content}`).join('\n');

  const prompt = `Group these course questions by similarity:

${questionTexts}

Create clusters of similar questions. For each cluster:
- topic: The common topic/theme
- questionIds: Array of question numbers (1-indexed)
- combinedQuestion: A single question that captures all similar questions
- priority: Urgency 0-10

Respond in JSON:
{
  "clusters": [
    {
      "topic": "topic name",
      "questionIds": [1, 3],
      "combinedQuestion": "combined question",
      "priority": 7
    }
  ]
}`;

  try {
    const response = await aiProvider.generateText(
      prompt,
      'You are an expert at clustering and organizing questions. Always respond with valid JSON.'
    );

    const parsed = JSON.parse(response);
    const clusters: QuestionCluster[] = (parsed.clusters || []).map((c: any) => {
      const clusterQuestions = (c.questionIds || [])
        .map((id: number) => questions[id - 1])
        .filter(Boolean);

      return {
        id: crypto.randomUUID(),
        topic: c.topic || 'Questions',
        questions: clusterQuestions,
        combinedQuestion: c.combinedQuestion || clusterQuestions[0]?.content || '',
        priority: c.priority || 5,
      };
    });

    return clusters;
  } catch (error) {
    console.error('Question clustering error:', error);
    // Fallback: return individual questions
    return questions.map(q => ({
      id: q.id,
      topic: 'Question',
      questions: [q],
      combinedQuestion: q.content,
      priority: q.aiScoring?.urgency || 5,
    }));
  }
}

// Generate a quick mini-summary
export async function generateMiniSummary(
  recentFeedback: Feedback[],
  phase: SessionPhase,
  aiProvider: AIProviderInterface
): Promise<string> {
  if (recentFeedback.length === 0) {
    return 'No recent feedback to summarize.';
  }

  const feedbackTexts = recentFeedback.map(f => `- ${f.content}`).join('\n');

  const prompt = `Provide a very brief summary (2-3 sentences) of this recent course feedback:

${feedbackTexts}

Focus on: overall sentiment, key themes, and any urgent issues.`;

  try {
    return await aiProvider.generateText(
      prompt,
      'You are an expert at concisely summarizing educational feedback.'
    );
  } catch (error) {
    console.error('Mini summary error:', error);
    return 'Unable to generate summary at this time.';
  }
}

// Sentiment preview for attendees
export async function previewSentiment(
  text: string,
  aiProvider: AIProviderInterface
): Promise<{ sentiment: number; tone: string; suggestion?: string }> {
  const prompt = `Analyze the sentiment and tone of this feedback:

"${text}"

Provide:
- sentiment: -1 to 1
- tone: brief description (e.g., "constructive", "frustrated", "enthusiastic")
- suggestion: if tone is negative, suggest how to make it more constructive (optional)

Respond in JSON:
{
  "sentiment": 0.5,
  "tone": "constructive",
  "suggestion": "optional suggestion"
}`;

  try {
    const response = await aiProvider.generateText(
      prompt,
      'You are a sentiment analysis expert. Always respond with valid JSON.'
    );

    const parsed = JSON.parse(response);
    return {
      sentiment: Math.max(-1, Math.min(1, parsed.sentiment || 0)),
      tone: parsed.tone || 'neutral',
      suggestion: parsed.suggestion,
    };
  } catch (error) {
    console.error('Sentiment preview error:', error);
    return { sentiment: 0, tone: 'neutral' };
  }
}
