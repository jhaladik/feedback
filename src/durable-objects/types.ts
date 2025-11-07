// Core Types for Course Feedback System

export type SessionPhase = 'pre' | 'live' | 'post';
export type IdentityMode = 'anonymous' | 'nickname' | 'authenticated' | 'mixed';
export type FeedbackVisibility = 'public' | 'private';
export type FeedbackCategory = 'question' | 'pace' | 'technical' | 'content' | 'other';
export type AIProvider = 'cloudflare' | 'openai' | 'anthropic';

// Session Settings
export interface SessionSettings {
  identityMode: IdentityMode;
  allowPublicFeed: boolean;
  aiProvider: AIProvider;
  enableRealTimeScoring: boolean;
  requireApprovalForPublic: boolean;
}

// AI Scoring Result
export interface AIScoring {
  sentiment: number;        // -1 (negative) to 1 (positive)
  urgency: number;          // 0 (low) to 10 (critical)
  category: FeedbackCategory;
  keywords: string[];
  processingTime: number;   // milliseconds
  provider: AIProvider;
}

// Feedback Item (for LIVE phase only)
export interface Feedback {
  id: string;
  sessionId: string;
  timestamp: number;
  phase: SessionPhase;
  content: string;
  author?: {
    name?: string;          // Real name if authenticated
    nickname?: string;      // Display name if nickname mode
    id?: string;           // Anonymous ID for tracking without identity
  };
  visibility: FeedbackVisibility;
  aiScoring?: AIScoring;
  acknowledged: boolean;    // Teacher marked as seen/handled
  aiEnhanced?: {
    original: string;
    enhanced: string;
    accepted: boolean;
  };
}

// Pre-Course Response (structured answers to pre-course questions)
export interface PreCourseResponse {
  id: string;
  sessionId: string;
  timestamp: number;
  author?: {
    name?: string;
    nickname?: string;
    id?: string;
  };
  responses: Array<{
    questionIndex: number;
    question: string;
    answer: string;
  }>;
  aiAnalysis?: {
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    expectations: string[];
    concerns: string[];
    confidence: number; // 0-10
  };
}

// Post-Course Response (structured answers to post-course questions)
export interface PostCourseResponse {
  id: string;
  sessionId: string;
  timestamp: number;
  author?: {
    name?: string;
    nickname?: string;
    id?: string;
  };
  responses: Array<{
    questionIndex: number;
    question: string;
    answer: string;
  }>;
  aiAnalysis?: {
    satisfactionScore: number; // 0-10
    skillLevelChange?: 'improved' | 'same' | 'unsure';
    topPositives: string[];
    topImprovements: string[];
  };
}

// Feedback Session (Durable Object State)
export interface FeedbackSessionState {
  id: string;
  teacherId: string;
  courseTitle: string;
  courseDescription?: string;
  phase: SessionPhase;
  createdAt: number;
  startedAt?: number;       // When live phase started
  endedAt?: number;         // When post phase completed
  settings: SessionSettings;

  // Phase-specific data (STRICT SEPARATION)
  preCourseQuestions?: string[];              // AI-generated pre-course questions
  preCourseResponses: PreCourseResponse[];    // Structured pre-course answers

  feedback: Feedback[];                       // Live phase feedback only
  reactions: Reaction[];                      // Quick emoji reactions (live phase)
  teacherActions: TeacherAction[];            // Teacher's one-click actions (live phase)

  postCourseQuestions?: string[];             // AI-generated post-course questions
  postCourseResponses: PostCourseResponse[];  // Structured post-course answers

  // Shared
  summary?: SessionSummary;
  currentTopic?: string;    // What topic is being discussed now (for context)
}

// Session Summary
export interface SessionSummary {
  generatedAt: number;
  phase: SessionPhase;
  provider: AIProvider;

  // Overall metrics
  totalFeedback: number;
  averageSentiment: number;
  engagementScore: number;

  // Key insights
  highlights: string[];
  concerns: string[];
  actionItems: string[];

  // Detailed sections
  preCourseAnalysis?: PreCourseSummary;
  liveCourseAnalysis?: LiveCourseSummary;
  postCourseAnalysis?: PostCourseSummary;

  // Full narrative
  narrative: string;
}

// Pre-course summary details
export interface PreCourseSummary {
  totalResponses: number;
  skillLevels: {
    beginner: number;
    intermediate: number;
    advanced: number;
  };
  topExpectations: Array<{
    topic: string;
    count: number;
  }>;
  concerns: string[];
  suggestions: string[];
}

// Live course summary details
export interface LiveCourseSummary {
  durationMinutes: number;
  feedbackCount: number;
  sentimentTimeline: Array<{
    timestamp: number;
    sentiment: number;
    phase: string;
  }>;
  criticalMoments: Array<{
    timestamp: number;
    issue: string;
    severity: number;
  }>;
  topicTrends: Array<{
    topic: string;
    mentions: number;
    sentiment: number;
  }>;
  paceAnalysis: {
    tooFast: number;
    justRight: number;
    tooSlow: number;
  };
}

// Post-course summary details
export interface PostCourseSummary {
  responseRate: number;
  overallSatisfaction: number;
  expectationsFulfilled: number;
  topPositives: string[];
  topImprovements: string[];
  skillLevelChange?: {
    before: { beginner: number; intermediate: number; advanced: number; };
    after: { beginner: number; intermediate: number; advanced: number; };
  };
  comparisonToPrevious?: {
    satisfactionDelta: number;
    commonImprovements: string[];
  };
}

// Teacher Account
export interface TeacherAccount {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  preferences: {
    defaultAIProvider: AIProvider;
    defaultIdentityMode: IdentityMode;
    defaultSettings: Partial<SessionSettings>;
  };
  sessionIds: string[];
}

// Quick Reaction Types
export type ReactionType = 'got_it' | 'confused' | 'too_fast' | 'too_slow' | 'break_needed';

export interface Reaction {
  id: string;
  sessionId: string;
  timestamp: number;
  type: ReactionType;
  author?: {
    nickname?: string;
    id?: string;
  };
  confidenceLevel?: number; // 1-5 scale
}

// Teacher Action Types
export type TeacherActionType = 'take_break' | 'do_recap' | 'skip_topic' | 'speed_up' | 'slow_down' | 'poll_class';

export interface TeacherAction {
  id: string;
  sessionId: string;
  timestamp: number;
  type: TeacherActionType;
  message?: string; // Optional message to broadcast
  duration?: number; // For breaks (in minutes)
}

// WebSocket Messages
export type WSMessageType =
  | 'feedback_added'
  | 'feedback_updated'
  | 'session_updated'
  | 'ai_scoring_complete'
  | 'phase_changed'
  | 'summary_ready'
  | 'insight_generated'
  | 'pattern_detected'
  | 'mini_summary'
  | 'reaction_added'
  | 'teacher_action'
  | 'whisper' // Teacher-only message
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  timestamp: number;
  teacherOnly?: boolean; // If true, only send to teacher connections
}

// API Request/Response Types
export interface CreateSessionRequest {
  teacherId: string;
  courseTitle: string;
  courseDescription?: string;
  settings?: Partial<SessionSettings>;
}

export interface CreateSessionResponse {
  sessionId: string;
  teacherUrl: string;
  attendeeUrl: string;
  accessCode: string;
}

export interface SubmitFeedbackRequest {
  sessionId: string;
  content: string;
  author?: {
    name?: string;
    nickname?: string;
  };
  visibility: FeedbackVisibility;
  phase?: SessionPhase;
}

export interface SubmitFeedbackResponse {
  feedbackId: string;
  aiScoring?: AIScoring;
}

export interface GenerateQuestionsRequest {
  courseTitle: string;
  courseDescription?: string;
  phase: SessionPhase;
  provider?: AIProvider;
}

export interface GenerateQuestionsResponse {
  questions: string[];
  provider: AIProvider;
}

export interface EnhanceTextRequest {
  text: string;
  context?: string;
  provider?: AIProvider;
}

export interface EnhanceTextResponse {
  original: string;
  enhanced: string;
  suggestions: string[];
}

export interface SentimentPreviewRequest {
  text: string;
}

export interface SentimentPreviewResponse {
  sentiment: number;
  tone: string;
  suggestion?: string;
}

export interface ResponseSuggestionRequest {
  feedbackId: string;
}

export interface ResponseSuggestionResponse {
  suggestions: string[];
}

export interface QuestionClusterRequest {
  questionIds?: string[];  // Optional: cluster specific questions, or all if omitted
}

export interface InsightsRequest {
  recentMinutes?: number;  // Look at feedback from last N minutes
}

export interface SubmitReactionRequest {
  type: ReactionType;
  confidenceLevel?: number;
  author?: {
    nickname?: string;
    id?: string;
  };
}

export interface TeacherActionRequest {
  type: TeacherActionType;
  message?: string;
  duration?: number;
}

export interface ReactionStatsResponse {
  gotIt: number;
  confused: number;
  tooFast: number;
  tooSlow: number;
  breakNeeded: number;
  averageConfidence: number;
  totalReactions: number;
}

// Phase-specific Response Types
export interface SubmitPreCourseResponseRequest {
  responses: Array<{
    questionIndex: number;
    answer: string;
  }>;
  author?: {
    name?: string;
    nickname?: string;
  };
}

export interface SubmitPreCourseResponseResponse {
  success: boolean;
  response?: PreCourseResponse;
}

export interface SubmitPostCourseResponseRequest {
  responses: Array<{
    questionIndex: number;
    answer: string;
  }>;
  author?: {
    name?: string;
    nickname?: string;
  };
}

export interface SubmitPostCourseResponseResponse {
  success: boolean;
  response?: PostCourseResponse;
}

export interface GetPhaseResponsesRequest {
  phase: 'pre' | 'post';
}

export interface GetPhaseResponsesResponse {
  success: boolean;
  responses: PreCourseResponse[] | PostCourseResponse[];
  questions?: string[];
}

// Environment bindings
export interface Env {
  // Durable Object bindings
  FEEDBACK_SESSION: DurableObjectNamespace;
  TEACHER_HUB: DurableObjectNamespace;

  // AI bindings
  AI: any; // Cloudflare Workers AI

  // Secrets
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;

  // Environment
  ENVIRONMENT: string;
}
