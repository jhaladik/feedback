// FeedbackSession Durable Object
// Manages a single course feedback session with real-time WebSocket updates

import {
  Env,
  FeedbackSessionState,
  WSMessage,
} from './types';

// Import handlers
import * as FeedbackHandlers from './handlers/feedback-handlers';
import * as PhaseHandlers from './handlers/phase-handlers';
import * as AIHandlers from './handlers/ai-handlers';
import * as ReactionHandlers from './handlers/reaction-handlers';
import * as CourseResponseHandlers from './handlers/course-response-handlers';

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

    // Session must be initialized for most endpoints
    if (!this.sessionState && url.pathname !== '/api/init') {
      return new Response('Session not initialized', { status: 400 });
    }

    // Route API requests to handlers
    switch (url.pathname) {
      case '/api/init':
        return this.handleInit(request);

      case '/api/feedback':
        if (request.method === 'POST') {
          return FeedbackHandlers.handleSubmitFeedback(
            request,
            this.sessionState!,
            this.env,
            this.saveState.bind(this),
            this.broadcast.bind(this)
          );
        } else if (request.method === 'GET') {
          return FeedbackHandlers.handleGetFeedback(request, this.sessionState!);
        }
        break;

      case '/api/acknowledge':
        if (request.method === 'PUT') {
          return FeedbackHandlers.handleAcknowledge(
            request,
            this.sessionState!,
            this.saveState.bind(this),
            this.broadcast.bind(this)
          );
        }
        break;

      case '/api/phase':
        if (request.method === 'PUT') {
          return PhaseHandlers.handleChangePhase(
            request,
            this.sessionState!,
            this.env,
            this.saveState.bind(this),
            this.broadcast.bind(this)
          );
        }
        break;

      case '/api/session':
        if (request.method === 'GET') {
          return PhaseHandlers.handleGetSession(this.sessionState!);
        }
        break;

      case '/api/summary':
        if (request.method === 'POST') {
          return PhaseHandlers.handleGenerateSummary(
            request,
            this.sessionState!,
            this.env,
            this.saveState.bind(this),
            this.broadcast.bind(this)
          );
        }
        break;

      case '/api/set-topic':
        if (request.method === 'POST') {
          return PhaseHandlers.handleSetTopic(
            request,
            this.sessionState!,
            this.saveState.bind(this)
          );
        }
        break;

      // AI Engagement Features
      case '/api/enhance-feedback':
        if (request.method === 'POST') {
          return AIHandlers.handleEnhanceFeedback(request, this.sessionState!, this.env);
        }
        break;

      case '/api/sentiment-preview':
        if (request.method === 'POST') {
          return AIHandlers.handleSentimentPreview(request, this.sessionState!, this.env);
        }
        break;

      case '/api/response-suggestion':
        if (request.method === 'POST') {
          return AIHandlers.handleResponseSuggestion(request, this.sessionState!, this.env);
        }
        break;

      case '/api/insights':
        if (request.method === 'GET') {
          return AIHandlers.handleGetInsights(
            request,
            this.sessionState!,
            this.env,
            this.broadcast.bind(this)
          );
        }
        break;

      case '/api/mini-summary':
        if (request.method === 'GET') {
          return AIHandlers.handleMiniSummary(
            request,
            this.sessionState!,
            this.env,
            this.broadcast.bind(this)
          );
        }
        break;

      case '/api/cluster-questions':
        if (request.method === 'POST') {
          return AIHandlers.handleClusterQuestions(request, this.sessionState!, this.env);
        }
        break;

      // Quick Reactions
      case '/api/reaction':
        if (request.method === 'POST') {
          return ReactionHandlers.handleSubmitReaction(
            request,
            this.sessionState!,
            this.saveState.bind(this),
            this.broadcast.bind(this),
            this.whisper.bind(this)
          );
        }
        break;

      case '/api/reactions':
        if (request.method === 'GET') {
          return ReactionHandlers.handleGetReactions(request, this.sessionState!);
        }
        break;

      // Teacher Actions
      case '/api/teacher-action':
        if (request.method === 'POST') {
          return ReactionHandlers.handleTeacherAction(
            request,
            this.sessionState!,
            this.saveState.bind(this),
            this.broadcast.bind(this)
          );
        }
        break;

      // Pre-course and Post-course Responses
      case '/api/pre-course-response':
        if (request.method === 'POST') {
          return CourseResponseHandlers.handleSubmitPreCourseResponse(
            request,
            this.sessionState!,
            this.env,
            this.saveState.bind(this),
            this.broadcast.bind(this)
          );
        }
        break;

      case '/api/post-course-response':
        if (request.method === 'POST') {
          return CourseResponseHandlers.handleSubmitPostCourseResponse(
            request,
            this.sessionState!,
            this.env,
            this.saveState.bind(this),
            this.broadcast.bind(this)
          );
        }
        break;

      case '/api/phase-responses':
        if (request.method === 'GET') {
          return CourseResponseHandlers.handleGetPhaseResponses(request, this.sessionState!);
        }
        break;
    }

    return new Response('Not Found', { status: 404 });
  }

  // Initialize a new session
  private async handleInit(request: Request): Promise<Response> {
    const result = await PhaseHandlers.handleInit(
      request,
      this.state.id.toString(),
      this.env,
      this.saveState.bind(this)
    );

    if (result.success) {
      this.sessionState = result.session!;
      return new Response(JSON.stringify({
        success: true,
        session: this.sessionState,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: result.error }), { status: 500 });
    }
  }

  // Save state helper
  private async saveState(state: FeedbackSessionState): Promise<void> {
    await this.state.storage.put('session', state);
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
}
