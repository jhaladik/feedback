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

// Feedback Item
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
  feedback: Feedback[];
  preCourseQuestions?: string[]; // AI-generated questions
  summary?: SessionSummary;
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

// WebSocket Messages
export type WSMessageType =
  | 'feedback_added'
  | 'feedback_updated'
  | 'session_updated'
  | 'ai_scoring_complete'
  | 'phase_changed'
  | 'summary_ready'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  timestamp: number;
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
