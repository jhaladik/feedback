// Feedback-related request handlers
import { FeedbackSessionState, Feedback, Env, FeedbackVisibility, SessionPhase } from '../types';
import { createAIProvider } from '../../ai/providers';

export async function handleSubmitFeedback(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    const body = await request.json();
    const { content, author, visibility, phase } = body;

    if (!content) {
      return new Response('Content required', { status: 400 });
    }

    const feedback: Feedback = {
      id: crypto.randomUUID(),
      sessionId: sessionState.id,
      timestamp: Date.now(),
      phase: phase || sessionState.phase,
      content,
      author,
      visibility: visibility || 'public',
      acknowledged: false,
    };

    // Score feedback with AI if enabled
    if (sessionState.settings.enableRealTimeScoring) {
      try {
        const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);
        feedback.aiScoring = await aiProvider.scoreText(content);
      } catch (error) {
        console.error('AI scoring failed:', error);
      }
    }

    sessionState.feedback.push(feedback);
    await saveState(sessionState);

    // Broadcast to all connected clients
    broadcast({
      type: 'feedback_added',
      payload: feedback,
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({
      success: true,
      feedback,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleGetFeedback(
  request: Request,
  sessionState: FeedbackSessionState
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const visibility = url.searchParams.get('visibility') as FeedbackVisibility | null;
    const phase = url.searchParams.get('phase') as SessionPhase | null;

    let feedback = sessionState.feedback;

    if (visibility) {
      feedback = feedback.filter(f => f.visibility === visibility);
    }

    if (phase) {
      feedback = feedback.filter(f => f.phase === phase);
    }

    return new Response(JSON.stringify({
      success: true,
      feedback,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleAcknowledge(
  request: Request,
  sessionState: FeedbackSessionState,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    const body = await request.json();
    const { feedbackId } = body;

    const feedback = sessionState.feedback.find(f => f.id === feedbackId);
    if (!feedback) {
      return new Response('Feedback not found', { status: 404 });
    }

    feedback.acknowledged = true;
    await saveState(sessionState);

    // Broadcast update
    broadcast({
      type: 'feedback_updated',
      payload: feedback,
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({
      success: true,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}
