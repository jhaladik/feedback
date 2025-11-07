// AI-powered engagement feature handlers
import { FeedbackSessionState, Feedback, Env } from '../types';
import { createAIProvider } from '../../ai/providers';
import {
  enhanceFeedback,
  detectPatterns,
  suggestResponse,
  generateInsights,
  clusterQuestions,
  generateMiniSummary,
  previewSentiment,
} from '../../ai/engagement';

export async function handleEnhanceFeedback(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return new Response('Text required', { status: 400 });
    }

    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);
    const result = await enhanceFeedback(text, sessionState.phase, aiProvider);

    return new Response(JSON.stringify({
      success: true,
      improved: result.improved,
      suggestions: result.suggestions,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleSentimentPreview(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return new Response('Text required', { status: 400 });
    }

    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);
    const result = await previewSentiment(text, aiProvider);

    return new Response(JSON.stringify({
      success: true,
      ...result,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleResponseSuggestion(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json();
    const { feedbackId } = body;

    const feedback = sessionState.feedback.find(f => f.id === feedbackId);
    if (!feedback) {
      return new Response('Feedback not found', { status: 404 });
    }

    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);
    const suggestions = await suggestResponse(feedback, aiProvider);

    return new Response(JSON.stringify({
      success: true,
      suggestions,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleGetInsights(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const recentMinutes = parseInt(url.searchParams.get('recentMinutes') || '10');

    const cutoffTime = Date.now() - (recentMinutes * 60 * 1000);
    const recentFeedback = sessionState.feedback.filter(f => f.timestamp > cutoffTime);

    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);
    const insights = await generateInsights(
      sessionState.feedback,
      recentFeedback,
      sessionState.phase,
      aiProvider
    );

    // Broadcast insights to teacher
    if (insights.length > 0) {
      broadcast({
        type: 'insight_generated',
        payload: insights,
        timestamp: Date.now(),
      });
    }

    // Detect patterns
    const patterns = await detectPatterns(recentFeedback, aiProvider);
    if (patterns.length > 0) {
      broadcast({
        type: 'pattern_detected',
        payload: patterns,
        timestamp: Date.now(),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      insights,
      patterns,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleMiniSummary(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const recentMinutes = parseInt(url.searchParams.get('recentMinutes') || '10');

    const cutoffTime = Date.now() - (recentMinutes * 60 * 1000);
    const recentFeedback = sessionState.feedback.filter(f => f.timestamp > cutoffTime);

    if (recentFeedback.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        summary: 'No recent feedback to summarize.',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);
    const summary = await generateMiniSummary(recentFeedback, sessionState.phase, aiProvider);

    // Broadcast mini summary
    broadcast({
      type: 'mini_summary',
      payload: { summary, feedbackCount: recentFeedback.length },
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({
      success: true,
      summary,
      feedbackCount: recentFeedback.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleClusterQuestions(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env
): Promise<Response> {
  try {
    // Get only question-type feedback
    const questions = sessionState.feedback.filter(f =>
      f.aiScoring?.category === 'question' || f.content.includes('?')
    );

    if (questions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        clusters: [],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);
    const clusters = await clusterQuestions(questions, aiProvider);

    return new Response(JSON.stringify({
      success: true,
      clusters,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}
