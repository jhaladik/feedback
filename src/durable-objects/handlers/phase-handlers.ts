// Phase and session management handlers
import { FeedbackSessionState, SessionSettings, Env, SessionPhase, SessionSummary } from '../types';
import { createAIProvider } from '../../ai/providers';

export async function handleInit(
  request: Request,
  sessionId: string,
  env: Env,
  saveState: (state: FeedbackSessionState) => Promise<void>
): Promise<{ success: boolean; session?: FeedbackSessionState; error?: string }> {
  try {
    const body = await request.json();
    const { teacherId, courseTitle, courseDescription, settings } = body;

    if (!teacherId || !courseTitle) {
      return { success: false, error: 'Missing required fields' };
    }

    // Default settings
    const defaultSettings: SessionSettings = {
      identityMode: 'mixed',
      allowPublicFeed: true,
      aiProvider: 'cloudflare',
      enableRealTimeScoring: true,
      requireApprovalForPublic: false,
      ...settings,
    };

    const sessionState: FeedbackSessionState = {
      id: sessionId,
      teacherId,
      courseTitle,
      courseDescription,
      phase: 'pre',
      createdAt: Date.now(),
      settings: defaultSettings,
      feedback: [],
      reactions: [],
      teacherActions: [],
    };

    await saveState(sessionState);

    // Generate pre-course questions using AI
    if (courseDescription) {
      generatePreCourseQuestions(sessionState, env, saveState).catch(console.error);
    }

    return { success: true, session: sessionState };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function handleChangePhase(
  request: Request,
  sessionState: FeedbackSessionState,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    const body = await request.json();
    const { phase } = body;

    if (!['pre', 'live', 'post'].includes(phase)) {
      return new Response('Invalid phase', { status: 400 });
    }

    const oldPhase = sessionState.phase;
    sessionState.phase = phase;

    if (phase === 'live' && !sessionState.startedAt) {
      sessionState.startedAt = Date.now();
    }

    if (phase === 'post' && !sessionState.endedAt) {
      sessionState.endedAt = Date.now();
    }

    await saveState(sessionState);

    // Broadcast phase change
    broadcast({
      type: 'phase_changed',
      payload: { oldPhase, newPhase: phase },
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({
      success: true,
      phase,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleGetSession(
  sessionState: FeedbackSessionState
): Promise<Response> {
  try {
    return new Response(JSON.stringify({
      success: true,
      session: sessionState,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleGenerateSummary(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    const body = await request.json();
    const { provider } = body;

    const aiProvider = createAIProvider(
      provider || sessionState.settings.aiProvider,
      env
    );

    // Prepare context and feedback for summarization
    const context = `Course: ${sessionState.courseTitle}
Phase: ${sessionState.phase}
Total Feedback: ${sessionState.feedback.length}

Please analyze this feedback and provide a comprehensive summary with:
1. Overall sentiment and key themes
2. Specific concerns or issues raised
3. Positive highlights
4. Actionable recommendations for the teacher`;

    const feedbackTexts = sessionState.feedback.map(f =>
      `[${f.phase}] ${f.visibility === 'private' ? '(Private)' : '(Public)'} ${f.content} (Sentiment: ${f.aiScoring?.sentiment || 'N/A'}, Urgency: ${f.aiScoring?.urgency || 'N/A'})`
    );

    const narrative = await aiProvider.summarize(feedbackTexts, context);

    // Calculate metrics
    const scoredFeedback = sessionState.feedback.filter(f => f.aiScoring);
    const avgSentiment = scoredFeedback.length > 0
      ? scoredFeedback.reduce((sum, f) => sum + (f.aiScoring?.sentiment || 0), 0) / scoredFeedback.length
      : 0;

    const summary: SessionSummary = {
      generatedAt: Date.now(),
      phase: sessionState.phase,
      provider: provider || sessionState.settings.aiProvider,
      totalFeedback: sessionState.feedback.length,
      averageSentiment: avgSentiment,
      engagementScore: calculateEngagementScore(sessionState),
      highlights: [],
      concerns: [],
      actionItems: [],
      narrative,
    };

    sessionState.summary = summary;
    await saveState(sessionState);

    // Broadcast summary ready
    broadcast({
      type: 'summary_ready',
      payload: summary,
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({
      success: true,
      summary,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleSetTopic(
  request: Request,
  sessionState: FeedbackSessionState,
  saveState: (state: FeedbackSessionState) => Promise<void>
): Promise<Response> {
  try {
    const body = await request.json();
    const { topic } = body;

    sessionState.currentTopic = topic;
    await saveState(sessionState);

    return new Response(JSON.stringify({
      success: true,
      topic,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

// Helper functions
async function generatePreCourseQuestions(
  sessionState: FeedbackSessionState,
  env: Env,
  saveState: (state: FeedbackSessionState) => Promise<void>
): Promise<void> {
  try {
    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);

    const prompt = `Generate 5 insightful pre-course questions for a course titled "${sessionState.courseTitle}".
${sessionState.courseDescription ? `Course description: ${sessionState.courseDescription}` : ''}

The questions should help assess:
1. Prior knowledge and experience level
2. Specific learning goals and expectations
3. Any concerns or prerequisites questions
4. Preferred learning style or pace

Return only the questions, one per line, numbered 1-5.`;

    const questionsText = await aiProvider.generateText(
      prompt,
      'You are an expert course designer creating pre-course assessment questions.'
    );

    // Parse questions
    const questions = questionsText
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^\d+\.\s*/, '').trim());

    sessionState.preCourseQuestions = questions;
    await saveState(sessionState);
  } catch (error) {
    console.error('Failed to generate pre-course questions:', error);
  }
}

function calculateEngagementScore(sessionState: FeedbackSessionState): number {
  if (sessionState.feedback.length === 0) return 0;

  const feedbackCount = sessionState.feedback.length;
  const durationMinutes = sessionState.startedAt
    ? (Date.now() - sessionState.startedAt) / 60000
    : 1;

  const feedbackRate = feedbackCount / durationMinutes;
  const normalizedRate = Math.min(feedbackRate / 2, 1); // 2 feedback/min = 100%

  const avgSentiment = sessionState.feedback
    .filter(f => f.aiScoring)
    .reduce((sum, f) => sum + (f.aiScoring?.sentiment || 0), 0) / feedbackCount;

  const sentimentScore = (avgSentiment + 1) / 2; // Convert -1 to 1 range to 0 to 1

  return Math.round((normalizedRate * 0.6 + sentimentScore * 0.4) * 100);
}
