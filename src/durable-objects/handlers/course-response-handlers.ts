// Pre-course and Post-course structured response handlers
import { FeedbackSessionState, PreCourseResponse, PostCourseResponse, Env } from '../types';
import { createAIProvider } from '../../ai/providers';

export async function handleSubmitPreCourseResponse(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    if (sessionState.phase !== 'pre') {
      return new Response('Pre-course responses can only be submitted during pre phase', { status: 400 });
    }

    const body = await request.json();
    const { responses, author } = body;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return new Response('Responses required', { status: 400 });
    }

    // Build the response object
    const preCourseResponse: PreCourseResponse = {
      id: crypto.randomUUID(),
      sessionId: sessionState.id,
      timestamp: Date.now(),
      author,
      responses: responses.map(r => ({
        questionIndex: r.questionIndex,
        question: sessionState.preCourseQuestions?.[r.questionIndex]?.question || '',
        answer: r.answer,
      })),
    };

    // Analyze with AI if enabled
    if (sessionState.settings.enableRealTimeScoring) {
      try {
        preCourseResponse.aiAnalysis = await analyzePreCourseResponse(
          preCourseResponse,
          env,
          sessionState.settings.aiProvider
        );
      } catch (error) {
        console.error('AI analysis failed:', error);
      }
    }

    sessionState.preCourseResponses.push(preCourseResponse);
    await saveState(sessionState);

    // Broadcast to teacher
    broadcast({
      type: 'session_updated',
      payload: { newPreCourseResponse: preCourseResponse },
      timestamp: Date.now(),
      teacherOnly: true,
    });

    return new Response(JSON.stringify({
      success: true,
      response: preCourseResponse,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleSubmitPostCourseResponse(
  request: Request,
  sessionState: FeedbackSessionState,
  env: Env,
  saveState: (state: FeedbackSessionState) => Promise<void>,
  broadcast: (message: any) => void
): Promise<Response> {
  try {
    if (sessionState.phase !== 'post') {
      return new Response('Post-course responses can only be submitted during post phase', { status: 400 });
    }

    const body = await request.json();
    const { responses, author } = body;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return new Response('Responses required', { status: 400 });
    }

    // Build the response object
    const postCourseResponse: PostCourseResponse = {
      id: crypto.randomUUID(),
      sessionId: sessionState.id,
      timestamp: Date.now(),
      author,
      responses: responses.map(r => ({
        questionIndex: r.questionIndex,
        question: sessionState.postCourseQuestions?.[r.questionIndex]?.question || '',
        answer: r.answer,
      })),
    };

    // Analyze with AI if enabled
    if (sessionState.settings.enableRealTimeScoring) {
      try {
        postCourseResponse.aiAnalysis = await analyzePostCourseResponse(
          postCourseResponse,
          sessionState,
          env,
          sessionState.settings.aiProvider
        );
      } catch (error) {
        console.error('AI analysis failed:', error);
      }
    }

    sessionState.postCourseResponses.push(postCourseResponse);
    await saveState(sessionState);

    // Broadcast to teacher
    broadcast({
      type: 'session_updated',
      payload: { newPostCourseResponse: postCourseResponse },
      timestamp: Date.now(),
      teacherOnly: true,
    });

    return new Response(JSON.stringify({
      success: true,
      response: postCourseResponse,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

export async function handleGetPhaseResponses(
  request: Request,
  sessionState: FeedbackSessionState
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const phase = url.searchParams.get('phase') as 'pre' | 'post' | null;

    if (!phase || !['pre', 'post'].includes(phase)) {
      return new Response('Valid phase parameter required (pre or post)', { status: 400 });
    }

    if (phase === 'pre') {
      return new Response(JSON.stringify({
        success: true,
        responses: sessionState.preCourseResponses,
        questions: sessionState.preCourseQuestions || [],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({
        success: true,
        responses: sessionState.postCourseResponses,
        questions: sessionState.postCourseQuestions || [],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

// Helper: Analyze pre-course response with AI
async function analyzePreCourseResponse(
  response: PreCourseResponse,
  env: Env,
  provider: string
): Promise<PreCourseResponse['aiAnalysis']> {
  const aiProvider = createAIProvider(provider, env);

  const answersText = response.responses
    .map(r => `Q: ${r.question}\nA: ${r.answer}`)
    .join('\n\n');

  const prompt = `Analyze this pre-course assessment response:

${answersText}

Provide:
1. Estimated skill level (beginner/intermediate/advanced)
2. Key expectations (list of 2-3 main learning goals)
3. Any concerns or gaps identified
4. Confidence level (0-10 scale)

Respond in JSON:
{
  "skillLevel": "beginner|intermediate|advanced",
  "expectations": ["expectation1", "expectation2"],
  "concerns": ["concern1", "concern2"],
  "confidence": 5
}`;

  try {
    const responseText = await aiProvider.generateText(
      prompt,
      'You are an expert at assessing student readiness and expectations. Always respond with valid JSON.'
    );

    const parsed = JSON.parse(responseText);
    return {
      skillLevel: parsed.skillLevel || 'intermediate',
      expectations: Array.isArray(parsed.expectations) ? parsed.expectations : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      confidence: Math.max(0, Math.min(10, parsed.confidence || 5)),
    };
  } catch (error) {
    console.error('AI analysis parsing error:', error);
    return {
      skillLevel: 'intermediate',
      expectations: [],
      concerns: [],
      confidence: 5,
    };
  }
}

// Helper: Analyze post-course response with AI
async function analyzePostCourseResponse(
  response: PostCourseResponse,
  sessionState: FeedbackSessionState,
  env: Env,
  provider: string
): Promise<PostCourseResponse['aiAnalysis']> {
  const aiProvider = createAIProvider(provider, env);

  const answersText = response.responses
    .map(r => `Q: ${r.question}\nA: ${r.answer}`)
    .join('\n\n');

  // Find if this user had pre-course response
  const userPreResponse = sessionState.preCourseResponses.find(
    pr => pr.author?.id === response.author?.id || pr.author?.nickname === response.author?.nickname
  );

  const preCourseContext = userPreResponse
    ? `\n\nPre-course skill level: ${userPreResponse.aiAnalysis?.skillLevel || 'unknown'}`
    : '';

  const prompt = `Analyze this post-course evaluation response:

${answersText}${preCourseContext}

Provide:
1. Overall satisfaction score (0-10)
2. Skill level change (improved/same/unsure)
3. Top 2-3 positive aspects mentioned
4. Top 2-3 areas for improvement mentioned

Respond in JSON:
{
  "satisfactionScore": 8,
  "skillLevelChange": "improved|same|unsure",
  "topPositives": ["positive1", "positive2"],
  "topImprovements": ["improvement1", "improvement2"]
}`;

  try {
    const responseText = await aiProvider.generateText(
      prompt,
      'You are an expert at analyzing course evaluations. Always respond with valid JSON.'
    );

    const parsed = JSON.parse(responseText);
    return {
      satisfactionScore: Math.max(0, Math.min(10, parsed.satisfactionScore || 5)),
      skillLevelChange: parsed.skillLevelChange || 'unsure',
      topPositives: Array.isArray(parsed.topPositives) ? parsed.topPositives : [],
      topImprovements: Array.isArray(parsed.topImprovements) ? parsed.topImprovements : [],
    };
  } catch (error) {
    console.error('AI analysis parsing error:', error);
    return {
      satisfactionScore: 5,
      skillLevelChange: 'unsure',
      topPositives: [],
      topImprovements: [],
    };
  }
}
