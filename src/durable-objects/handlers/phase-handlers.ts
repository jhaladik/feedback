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
      // Phase-specific arrays
      preCourseResponses: [],
      feedback: [],
      reactions: [],
      teacherActions: [],
      postCourseResponses: [],
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
  env: Env,
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

      // Generate post-course questions when entering post phase
      generatePostCourseQuestions(sessionState, env, saveState, broadcast).catch(console.error);
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

Create a mix of question types:
- 2 multiple choice questions about prior experience/skill level
- 2 open-text questions about learning goals and concerns
- 1 rating question about confidence level

Format as JSON array:
[
  {
    "question": "What is your experience level with [topic]?",
    "type": "choice",
    "options": ["Beginner", "Intermediate", "Advanced", "Expert"]
  },
  {
    "question": "What are your main learning goals for this course?",
    "type": "text"
  }
]

Return ONLY valid JSON, no other text.`;

    const responseText = await aiProvider.generateText(
      prompt,
      'You are an expert course designer. ALWAYS respond with valid JSON only.'
    );

    // Parse JSON response
    try {
      const questions = JSON.parse(responseText);

      if (Array.isArray(questions) && questions.length > 0) {
        sessionState.preCourseQuestions = questions.map(q => ({
          question: q.question,
          type: q.type || 'text',
          options: q.options || undefined,
          required: false
        }));
      } else {
        // Fallback to simple questions if JSON parsing fails
        sessionState.preCourseQuestions = createDefaultPreCourseQuestions();
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON, using defaults:', parseError);
      sessionState.preCourseQuestions = createDefaultPreCourseQuestions();
    }

    await saveState(sessionState);
  } catch (error) {
    console.error('Failed to generate pre-course questions:', error);
    sessionState.preCourseQuestions = createDefaultPreCourseQuestions();
    await saveState(sessionState);
  }
}

// Research-based pre-course questions optimized for teacher effectiveness
// Based on:
// - Backwards Design (Wiggins & McTighe)
// - Constructivist Learning Theory
// - Universal Design for Learning (UDL)
// - Formative Assessment Research (Black & Wiliam)
function createDefaultPreCourseQuestions() {
  return [
    {
      question: "What is your current experience level with this topic?",
      type: 'choice' as const,
      options: ["No prior knowledge", "Heard of it, not used it", "Some hands-on experience", "Regular user/practitioner", "Expert/Teaching others"],
      required: true,
      purpose: "READINESS: Helps teacher gauge prerequisite knowledge and adjust starting complexity"
    },
    {
      question: "What do you hope to achieve by the end of this session?",
      type: 'choice' as const,
      options: ["Understand basic concepts", "Gain practical skills I can use immediately", "Solve a specific problem", "Get certified/credentials", "Explore if this is right for me"],
      required: true,
      purpose: "MOTIVATION: Reveals learner goals to help teacher align content with expectations"
    },
    {
      question: "How do you learn best?",
      type: 'choice' as const,
      options: ["Hands-on practice and examples", "Visual aids and diagrams", "Step-by-step explanations", "Discussion and Q&A", "Mix of everything"],
      required: true,
      purpose: "DELIVERY: Informs teaching methods and material presentation style"
    },
    {
      question: "What is your biggest concern or challenge about this topic?",
      type: 'text' as const,
      required: false,
      purpose: "BARRIERS: Identifies obstacles and misconceptions to address proactively"
    },
    {
      question: "How much time can you dedicate to practice/homework after this session?",
      type: 'choice' as const,
      options: ["None - just this session", "Less than 1 hour", "1-3 hours", "3-5 hours", "5+ hours"],
      required: false,
      purpose: "PACING: Helps teacher set realistic expectations and recommend appropriate follow-up resources"
    }
  ];
}

async function generatePostCourseQuestions(
  sessionState: FeedbackSessionState,
  env: Env,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<void> {
  try {
    const aiProvider = createAIProvider(sessionState.settings.aiProvider, env);

    // Build context from the session
    const preCourseContext = sessionState.preCourseQuestions
      ? `\n\nPre-course questions asked:\n${sessionState.preCourseQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
      : '';

    const topicsContext = sessionState.currentTopic
      ? `\n\nTopics covered: ${sessionState.currentTopic}`
      : '';

    const feedbackSummary = sessionState.feedback.length > 0
      ? `\n\nDuring the course, ${sessionState.feedback.length} feedback items were received.`
      : '';

    const prompt = `Generate 5 insightful post-course reflection questions for a course titled "${sessionState.courseTitle}".
${sessionState.courseDescription ? `Course description: ${sessionState.courseDescription}` : ''}${preCourseContext}${topicsContext}${feedbackSummary}

The questions should help assess:
1. Learning outcomes and skill improvement
2. Overall satisfaction and expectations met
3. What worked well and what could be improved
4. Specific topics that need clarification
5. Application of learned concepts

Return only the questions, one per line, numbered 1-5.`;

    const questionsText = await aiProvider.generateText(
      prompt,
      'You are an expert course evaluator creating post-course reflection questions.'
    );

    // Parse questions
    const questions = questionsText
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^\d+\.\s*/, '').trim());

    sessionState.postCourseQuestions = questions;
    await saveState(sessionState);

    // Broadcast that post-course questions are ready
    broadcast({
      type: 'session_updated',
      payload: { postCourseQuestions: questions },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to generate post-course questions:', error);
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
