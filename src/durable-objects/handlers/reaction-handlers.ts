// Reaction and teacher action handlers
import { FeedbackSessionState, Reaction, ReactionType, TeacherAction, TeacherActionType, Env } from '../types';

export async function handleSubmitReaction(
  request: Request,
  sessionState: FeedbackSessionState,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void,
  whisper: (message: string, priority: 'low' | 'medium' | 'high') => void
): Promise<Response> {
  try {
    const body = await request.json();
    const { type, confidenceLevel, author } = body;

    if (!type) {
      return new Response('Reaction type required', { status: 400 });
    }

    const reaction: Reaction = {
      id: crypto.randomUUID(),
      sessionId: sessionState.id,
      timestamp: Date.now(),
      type: type as ReactionType,
      author,
      confidenceLevel,
    };

    sessionState.reactions.push(reaction);
    await saveState(sessionState);

    // Broadcast to all clients
    broadcast({
      type: 'reaction_added',
      payload: reaction,
      timestamp: Date.now(),
    });

    // Check for whisper triggers
    checkReactionTriggers(sessionState, whisper);

    return new Response(JSON.stringify({
      success: true,
      reaction,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleGetReactions(
  request: Request,
  sessionState: FeedbackSessionState
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const recentMinutes = parseInt(url.searchParams.get('recentMinutes') || '5');

    const cutoffTime = Date.now() - (recentMinutes * 60 * 1000);
    const recentReactions = sessionState.reactions.filter(r => r.timestamp > cutoffTime);

    const stats = {
      gotIt: recentReactions.filter(r => r.type === 'got_it').length,
      confused: recentReactions.filter(r => r.type === 'confused').length,
      tooFast: recentReactions.filter(r => r.type === 'too_fast').length,
      tooSlow: recentReactions.filter(r => r.type === 'too_slow').length,
      breakNeeded: recentReactions.filter(r => r.type === 'break_needed').length,
      totalReactions: recentReactions.length,
      averageConfidence: 0,
    };

    const confidenceLevels = recentReactions
      .filter(r => r.confidenceLevel !== undefined)
      .map(r => r.confidenceLevel!);

    if (confidenceLevels.length > 0) {
      stats.averageConfidence = confidenceLevels.reduce((a, b) => a + b, 0) / confidenceLevels.length;
    }

    return new Response(JSON.stringify({
      success: true,
      stats,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleTeacherAction(
  request: Request,
  sessionState: FeedbackSessionState,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    const body = await request.json();
    const { type, message, duration } = body;

    if (!type) {
      return new Response('Action type required', { status: 400 });
    }

    const action: TeacherAction = {
      id: crypto.randomUUID(),
      sessionId: sessionState.id,
      timestamp: Date.now(),
      type: type as TeacherActionType,
      message,
      duration,
    };

    sessionState.teacherActions.push(action);
    await saveState(sessionState);

    // Broadcast to all attendees
    const broadcastMessage = getActionBroadcastMessage(action);
    broadcast({
      type: 'teacher_action',
      payload: { action, message: broadcastMessage },
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({
      success: true,
      action,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

// Helper functions
function checkReactionTriggers(
  sessionState: FeedbackSessionState,
  whisper: (message: string, priority: 'low' | 'medium' | 'high') => void
): void {
  const recentReactions = sessionState.reactions.filter(
    r => r.timestamp > Date.now() - 5 * 60 * 1000 // Last 5 minutes
  );

  const confused = recentReactions.filter(r => r.type === 'confused').length;
  const tooFast = recentReactions.filter(r => r.type === 'too_fast').length;
  const breakNeeded = recentReactions.filter(r => r.type === 'break_needed').length;

  // Trigger whispers based on patterns
  if (confused >= 3) {
    whisper(`🚨 ${confused} people are confused - consider recap or clarification`, 'high');
  }

  if (tooFast >= 3) {
    whisper(`⏸️ ${tooFast} people say it's too fast - consider slowing down`, 'high');
  }

  if (breakNeeded >= 2) {
    whisper(`☕ ${breakNeeded} people need a break - consider short pause`, 'medium');
  }

  // Confidence check
  const confidenceLevels = recentReactions
    .filter(r => r.confidenceLevel !== undefined)
    .map(r => r.confidenceLevel!);

  if (confidenceLevels.length >= 3) {
    const avg = confidenceLevels.reduce((a, b) => a + b, 0) / confidenceLevels.length;
    if (avg < 2.5) {
      whisper(`📉 Average confidence is low (${avg.toFixed(1)}/5) - class may be struggling`, 'high');
    }
  }
}

function getActionBroadcastMessage(action: TeacherAction): string {
  const messages: Record<TeacherActionType, string> = {
    take_break: action.duration
      ? `☕ Taking a ${action.duration}-minute break. Back soon!`
      : '☕ Taking a short break. Back soon!',
    do_recap: '📝 Let\'s do a quick recap of what we\'ve covered',
    skip_topic: '⏭️ Skipping ahead to the next topic',
    speed_up: '⚡ Picking up the pace a bit',
    slow_down: '🐌 Slowing down to make sure everyone follows',
    poll_class: '📊 Quick comprehension check coming up',
  };

  return action.message || messages[action.type];
}
