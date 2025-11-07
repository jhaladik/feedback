// FeedbackSession Durable Object
// Manages a single course feedback session with real-time WebSocket updates

import {
  Env,
  FeedbackSessionState,
  Feedback,
  SessionPhase,
  SessionSettings,
  WSMessage,
  AIScoring,
  FeedbackVisibility,
  Reaction,
  ReactionType,
  TeacherAction,
  TeacherActionType,
} from './types';
import { createAIProvider } from '../ai/providers';
import {
  enhanceFeedback,
  detectPatterns,
  suggestResponse,
  generateInsights,
  clusterQuestions,
  generateMiniSummary,
  previewSentiment,
} from '../ai/engagement';

export class FeedbackSession implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket>;
  private teacherSessions: Set<WebSocket>; // Teacher-only connections
  private sessionState: FeedbackSessionState | null;
  private whisperInterval: number | null; // For periodic AI whispers

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.teacherSessions = new Set();
    this.sessionState = null;
    this.whisperInterval = null;

    // Accept WebSocket connections
    this.state.blockConcurrencyWhile(async () => {
      this.sessionState = await this.state.storage.get<FeedbackSessionState>('session') || null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // API Routes
    if (url.pathname === '/api/init' && request.method === 'POST') {
      return this.handleInit(request);
    }

    if (url.pathname === '/api/feedback' && request.method === 'POST') {
      return this.handleSubmitFeedback(request);
    }

    if (url.pathname === '/api/feedback' && request.method === 'GET') {
      return this.handleGetFeedback(request);
    }

    if (url.pathname === '/api/phase' && request.method === 'PUT') {
      return this.handleChangePhase(request);
    }

    if (url.pathname === '/api/acknowledge' && request.method === 'PUT') {
      return this.handleAcknowledge(request);
    }

    if (url.pathname === '/api/session' && request.method === 'GET') {
      return this.handleGetSession(request);
    }

    if (url.pathname === '/api/summary' && request.method === 'POST') {
      return this.handleGenerateSummary(request);
    }

    // New Engagement Features
    if (url.pathname === '/api/enhance-feedback' && request.method === 'POST') {
      return this.handleEnhanceFeedback(request);
    }

    if (url.pathname === '/api/sentiment-preview' && request.method === 'POST') {
      return this.handleSentimentPreview(request);
    }

    if (url.pathname === '/api/response-suggestion' && request.method === 'POST') {
      return this.handleResponseSuggestion(request);
    }

    if (url.pathname === '/api/insights' && request.method === 'GET') {
      return this.handleGetInsights(request);
    }

    if (url.pathname === '/api/mini-summary' && request.method === 'GET') {
      return this.handleMiniSummary(request);
    }

    if (url.pathname === '/api/cluster-questions' && request.method === 'POST') {
      return this.handleClusterQuestions(request);
    }

    // Quick Reactions
    if (url.pathname === '/api/reaction' && request.method === 'POST') {
      return this.handleSubmitReaction(request);
    }

    if (url.pathname === '/api/reactions' && request.method === 'GET') {
      return this.handleGetReactions(request);
    }

    // Teacher Actions
    if (url.pathname === '/api/teacher-action' && request.method === 'POST') {
      return this.handleTeacherAction(request);
    }

    if (url.pathname === '/api/set-topic' && request.method === 'POST') {
      return this.handleSetTopic(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  // Initialize a new session
  private async handleInit(request: Request): Promise<Response> {
    try {
      const body = await request.json();
      const { teacherId, courseTitle, courseDescription, settings } = body;

      if (!teacherId || !courseTitle) {
        return new Response('Missing required fields', { status: 400 });
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

      this.sessionState = {
        id: this.state.id.toString(),
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

      await this.state.storage.put('session', this.sessionState);

      // Generate pre-course questions using AI
      if (courseDescription) {
        this.generatePreCourseQuestions();
      }

      return new Response(JSON.stringify({
        success: true,
        session: this.sessionState,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  // Submit feedback
  private async handleSubmitFeedback(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { content, author, visibility, phase } = body;

      if (!content) {
        return new Response('Content required', { status: 400 });
      }

      const feedback: Feedback = {
        id: crypto.randomUUID(),
        sessionId: this.sessionState.id,
        timestamp: Date.now(),
        phase: phase || this.sessionState.phase,
        content,
        author,
        visibility: visibility || 'public',
        acknowledged: false,
      };

      // Score feedback with AI if enabled
      if (this.sessionState.settings.enableRealTimeScoring) {
        try {
          const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);
          feedback.aiScoring = await aiProvider.scoreText(content);
        } catch (error) {
          console.error('AI scoring failed:', error);
          // Continue without AI scoring
        }
      }

      this.sessionState.feedback.push(feedback);
      await this.state.storage.put('session', this.sessionState);

      // Broadcast to all connected clients
      this.broadcast({
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

  // Get all feedback
  private async handleGetFeedback(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const url = new URL(request.url);
      const visibility = url.searchParams.get('visibility') as FeedbackVisibility | null;
      const phase = url.searchParams.get('phase') as SessionPhase | null;

      let feedback = this.sessionState.feedback;

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

  // Change session phase
  private async handleChangePhase(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { phase } = body;

      if (!['pre', 'live', 'post'].includes(phase)) {
        return new Response('Invalid phase', { status: 400 });
      }

      const oldPhase = this.sessionState.phase;
      this.sessionState.phase = phase;

      if (phase === 'live' && !this.sessionState.startedAt) {
        this.sessionState.startedAt = Date.now();
      }

      if (phase === 'post' && !this.sessionState.endedAt) {
        this.sessionState.endedAt = Date.now();
      }

      await this.state.storage.put('session', this.sessionState);

      // Broadcast phase change
      this.broadcast({
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

  // Acknowledge feedback (teacher marks as seen)
  private async handleAcknowledge(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { feedbackId } = body;

      const feedback = this.sessionState.feedback.find(f => f.id === feedbackId);
      if (!feedback) {
        return new Response('Feedback not found', { status: 404 });
      }

      feedback.acknowledged = true;
      await this.state.storage.put('session', this.sessionState);

      // Broadcast update
      this.broadcast({
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

  // Get session state
  private async handleGetSession(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      return new Response(JSON.stringify({
        success: true,
        session: this.sessionState,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  // Generate AI summary
  private async handleGenerateSummary(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { provider } = body;

      const aiProvider = createAIProvider(
        provider || this.sessionState.settings.aiProvider,
        this.env
      );

      // Prepare context and feedback for summarization
      const context = `Course: ${this.sessionState.courseTitle}
Phase: ${this.sessionState.phase}
Total Feedback: ${this.sessionState.feedback.length}

Please analyze this feedback and provide a comprehensive summary with:
1. Overall sentiment and key themes
2. Specific concerns or issues raised
3. Positive highlights
4. Actionable recommendations for the teacher`;

      const feedbackTexts = this.sessionState.feedback.map(f =>
        `[${f.phase}] ${f.visibility === 'private' ? '(Private)' : '(Public)'} ${f.content} (Sentiment: ${f.aiScoring?.sentiment || 'N/A'}, Urgency: ${f.aiScoring?.urgency || 'N/A'})`
      );

      const narrative = await aiProvider.summarize(feedbackTexts, context);

      // Calculate metrics
      const scoredFeedback = this.sessionState.feedback.filter(f => f.aiScoring);
      const avgSentiment = scoredFeedback.length > 0
        ? scoredFeedback.reduce((sum, f) => sum + (f.aiScoring?.sentiment || 0), 0) / scoredFeedback.length
        : 0;

      const summary = {
        generatedAt: Date.now(),
        phase: this.sessionState.phase,
        provider: provider || this.sessionState.settings.aiProvider,
        totalFeedback: this.sessionState.feedback.length,
        averageSentiment: avgSentiment,
        engagementScore: this.calculateEngagementScore(),
        highlights: [],
        concerns: [],
        actionItems: [],
        narrative,
      };

      this.sessionState.summary = summary;
      await this.state.storage.put('session', this.sessionState);

      // Broadcast summary ready
      this.broadcast({
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

  // WebSocket handler
  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Check if this is a teacher connection
    const url = new URL(request.url);
    const isTeacher = url.searchParams.get('role') === 'teacher';

    this.sessions.add(server);
    if (isTeacher) {
      this.teacherSessions.add(server);
    }

    server.accept();

    // Send current state to new connection
    if (this.sessionState) {
      server.send(JSON.stringify({
        type: 'session_updated',
        payload: this.sessionState,
        timestamp: Date.now(),
      }));
    }

    server.addEventListener('close', () => {
      this.sessions.delete(server);
      if (isTeacher) {
        this.teacherSessions.delete(server);
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // Broadcast message to all connected clients
  private broadcast(message: WSMessage): void {
    const messageStr = JSON.stringify(message);
    const targetSessions = message.teacherOnly ? this.teacherSessions : this.sessions;

    for (const session of targetSessions) {
      try {
        session.send(messageStr);
      } catch (error) {
        console.error('Failed to send message:', error);
        this.sessions.delete(session);
        this.teacherSessions.delete(session);
      }
    }
  }

  // Whisper to teacher only
  private whisper(message: string, priority: 'low' | 'medium' | 'high' = 'medium'): void {
    this.broadcast({
      type: 'whisper',
      payload: { message, priority },
      timestamp: Date.now(),
      teacherOnly: true,
    });
  }

  // Generate pre-course questions using AI
  private async generatePreCourseQuestions(): Promise<void> {
    if (!this.sessionState) return;

    try {
      const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);

      const prompt = `Generate 5 insightful pre-course questions for a course titled "${this.sessionState.courseTitle}".
${this.sessionState.courseDescription ? `Course description: ${this.sessionState.courseDescription}` : ''}

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

      this.sessionState.preCourseQuestions = questions;
      await this.state.storage.put('session', this.sessionState);

      // Broadcast to connected clients
      this.broadcast({
        type: 'session_updated',
        payload: this.sessionState,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to generate pre-course questions:', error);
    }
  }

  // Calculate engagement score based on feedback frequency and quality
  private calculateEngagementScore(): number {
    if (!this.sessionState || this.sessionState.feedback.length === 0) return 0;

    const feedbackCount = this.sessionState.feedback.length;
    const durationMinutes = this.sessionState.startedAt
      ? (Date.now() - this.sessionState.startedAt) / 60000
      : 1;

    const feedbackRate = feedbackCount / durationMinutes;
    const normalizedRate = Math.min(feedbackRate / 2, 1); // 2 feedback/min = 100%

    const avgSentiment = this.sessionState.feedback
      .filter(f => f.aiScoring)
      .reduce((sum, f) => sum + (f.aiScoring?.sentiment || 0), 0) / feedbackCount;

    const sentimentScore = (avgSentiment + 1) / 2; // Convert -1 to 1 range to 0 to 1

    return Math.round((normalizedRate * 0.6 + sentimentScore * 0.4) * 100);
  }

  // NEW ENGAGEMENT FEATURES

  // Enhance feedback with AI suggestions
  private async handleEnhanceFeedback(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { text } = body;

      if (!text) {
        return new Response('Text required', { status: 400 });
      }

      const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);
      const result = await enhanceFeedback(text, this.sessionState.phase, aiProvider);

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

  // Preview sentiment before submitting
  private async handleSentimentPreview(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { text } = body;

      if (!text) {
        return new Response('Text required', { status: 400 });
      }

      const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);
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

  // Get AI response suggestions for feedback
  private async handleResponseSuggestion(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { feedbackId } = body;

      const feedback = this.sessionState.feedback.find(f => f.id === feedbackId);
      if (!feedback) {
        return new Response('Feedback not found', { status: 404 });
      }

      const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);
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

  // Get proactive insights
  private async handleGetInsights(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const url = new URL(request.url);
      const recentMinutes = parseInt(url.searchParams.get('recentMinutes') || '10');

      const cutoffTime = Date.now() - (recentMinutes * 60 * 1000);
      const recentFeedback = this.sessionState.feedback.filter(f => f.timestamp > cutoffTime);

      const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);
      const insights = await generateInsights(
        this.sessionState.feedback,
        recentFeedback,
        this.sessionState.phase,
        aiProvider
      );

      // Broadcast insights to teacher
      if (insights.length > 0) {
        this.broadcast({
          type: 'insight_generated',
          payload: insights,
          timestamp: Date.now(),
        });
      }

      // Detect patterns
      const patterns = await detectPatterns(recentFeedback, aiProvider);
      if (patterns.length > 0) {
        this.broadcast({
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

  // Get mini summary of recent feedback
  private async handleMiniSummary(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const url = new URL(request.url);
      const recentMinutes = parseInt(url.searchParams.get('recentMinutes') || '10');

      const cutoffTime = Date.now() - (recentMinutes * 60 * 1000);
      const recentFeedback = this.sessionState.feedback.filter(f => f.timestamp > cutoffTime);

      if (recentFeedback.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          summary: 'No recent feedback to summarize.',
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);
      const summary = await generateMiniSummary(recentFeedback, this.sessionState.phase, aiProvider);

      // Broadcast mini summary
      this.broadcast({
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

  // Cluster similar questions
  private async handleClusterQuestions(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      // Get only question-type feedback
      const questions = this.sessionState.feedback.filter(f =>
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

      const aiProvider = createAIProvider(this.sessionState.settings.aiProvider, this.env);
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

  // QUICK REACTIONS & TEACHER ACTIONS

  // Submit a quick reaction
  private async handleSubmitReaction(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { type, confidenceLevel, author } = body;

      if (!type) {
        return new Response('Reaction type required', { status: 400 });
      }

      const reaction: Reaction = {
        id: crypto.randomUUID(),
        sessionId: this.sessionState.id,
        timestamp: Date.now(),
        type: type as ReactionType,
        author,
        confidenceLevel,
      };

      this.sessionState.reactions.push(reaction);
      await this.state.storage.put('session', this.sessionState);

      // Broadcast to all clients
      this.broadcast({
        type: 'reaction_added',
        payload: reaction,
        timestamp: Date.now(),
      });

      // Check for whisper triggers
      await this.checkReactionTriggers();

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

  // Get reaction statistics
  private async handleGetReactions(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const url = new URL(request.url);
      const recentMinutes = parseInt(url.searchParams.get('recentMinutes') || '5');

      const cutoffTime = Date.now() - (recentMinutes * 60 * 1000);
      const recentReactions = this.sessionState.reactions.filter(r => r.timestamp > cutoffTime);

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

  // Teacher action (one-click)
  private async handleTeacherAction(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { type, message, duration } = body;

      if (!type) {
        return new Response('Action type required', { status: 400 });
      }

      const action: TeacherAction = {
        id: crypto.randomUUID(),
        sessionId: this.sessionState.id,
        timestamp: Date.now(),
        type: type as TeacherActionType,
        message,
        duration,
      };

      this.sessionState.teacherActions.push(action);
      await this.state.storage.put('session', this.sessionState);

      // Broadcast to all attendees
      const broadcastMessage = this.getActionBroadcastMessage(action);
      this.broadcast({
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

  // Set current topic (for context)
  private async handleSetTopic(request: Request): Promise<Response> {
    try {
      if (!this.sessionState) {
        return new Response('Session not initialized', { status: 400 });
      }

      const body = await request.json();
      const { topic } = body;

      this.sessionState.currentTopic = topic;
      await this.state.storage.put('session', this.sessionState);

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

  // Check reaction patterns and trigger whispers
  private async checkReactionTriggers(): Promise<void> {
    if (!this.sessionState) return;

    const recentReactions = this.sessionState.reactions.filter(
      r => r.timestamp > Date.now() - 5 * 60 * 1000 // Last 5 minutes
    );

    const confused = recentReactions.filter(r => r.type === 'confused').length;
    const tooFast = recentReactions.filter(r => r.type === 'too_fast').length;
    const breakNeeded = recentReactions.filter(r => r.type === 'break_needed').length;

    // Trigger whispers based on patterns
    if (confused >= 3) {
      this.whisper(`🚨 ${confused} people are confused - consider recap or clarification`, 'high');
    }

    if (tooFast >= 3) {
      this.whisper(`⏸️ ${tooFast} people say it's too fast - consider slowing down`, 'high');
    }

    if (breakNeeded >= 2) {
      this.whisper(`☕ ${breakNeeded} people need a break - consider short pause`, 'medium');
    }

    // Confidence check
    const confidenceLevels = recentReactions
      .filter(r => r.confidenceLevel !== undefined)
      .map(r => r.confidenceLevel!);

    if (confidenceLevels.length >= 3) {
      const avg = confidenceLevels.reduce((a, b) => a + b, 0) / confidenceLevels.length;
      if (avg < 2.5) {
        this.whisper(`📉 Average confidence is low (${avg.toFixed(1)}/5) - class may be struggling`, 'high');
      }
    }
  }

  // Get user-friendly message for teacher action
  private getActionBroadcastMessage(action: TeacherAction): string {
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
}
