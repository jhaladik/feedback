// Main Worker Entry Point
// Routes requests to Durable Objects and serves static UI

import { Env } from './durable-objects/types';

export { FeedbackSession } from './durable-objects/FeedbackSession';
export { TeacherHub } from './durable-objects/TeacherHub';

// Import HTML files
import attendeeHTML from './ui/enhanced-attendee.html';
import teacherHTML from './ui/enhanced-teacher.html';
import welcomeHTML from './ui/welcome.html';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for API requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Root - Welcome page
      if (url.pathname === '/') {
        return new Response(welcomeHTML, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      // Create new session
      if (url.pathname === '/api/session/create' && request.method === 'POST') {
        return await handleCreateSession(request, env, corsHeaders);
      }

      // Access session (teacher or attendee)
      if (url.pathname.startsWith('/session/')) {
        const sessionId = url.pathname.split('/')[2];
        if (!sessionId) {
          return new Response('Session ID required', { status: 400 });
        }

        // Route to FeedbackSession Durable Object
        // Rewrite the URL to remove the /session/{sessionId} prefix
        const newPath = url.pathname.replace(`/session/${sessionId}`, '');
        const newUrl = new URL(newPath + url.search, request.url);
        const newRequest = new Request(newUrl, request);

        const id = env.FEEDBACK_SESSION.idFromName(sessionId);
        const stub = env.FEEDBACK_SESSION.get(id);
        return await stub.fetch(newRequest);
      }

      // Teacher hub
      if (url.pathname.startsWith('/teacher/')) {
        const teacherId = url.pathname.split('/')[2];
        if (!teacherId) {
          return new Response('Teacher ID required', { status: 400 });
        }

        // Route to TeacherHub Durable Object
        const id = env.TEACHER_HUB.idFromName(teacherId);
        const stub = env.TEACHER_HUB.get(id);
        return await stub.fetch(request);
      }

      // Serve UI files
      if (url.pathname === '/ui/attendee') {
        return new Response(attendeeHTML, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      if (url.pathname === '/ui/teacher') {
        return new Response(teacherHTML, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// Create a new feedback session
async function handleCreateSession(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await request.json();
    const { teacherId, courseTitle, courseDescription, settings } = body;

    if (!teacherId || !courseTitle) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate unique session ID
    const sessionId = generateSessionId();

    // Initialize FeedbackSession Durable Object
    const id = env.FEEDBACK_SESSION.idFromName(sessionId);
    const stub = env.FEEDBACK_SESSION.get(id);

    // Initialize the session
    const initRequest = new Request('https://dummy.com/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId, courseTitle, courseDescription, settings }),
    });

    const initResponse = await stub.fetch(initRequest);
    const initData = await initResponse.json();

    if (!initData.success) {
      throw new Error('Failed to initialize session');
    }

    // Add session to teacher's hub
    const teacherHubId = env.TEACHER_HUB.idFromName(teacherId);
    const teacherHub = env.TEACHER_HUB.get(teacherHubId);

    // Generate access URLs
    const baseUrl = new URL(request.url).origin;
    const accessCode = generateAccessCode();

    return new Response(JSON.stringify({
      success: true,
      sessionId,
      accessCode,
      teacherUrl: `${baseUrl}/ui/teacher?session=${sessionId}`,
      attendeeUrl: `${baseUrl}/ui/attendee?session=${sessionId}&code=${accessCode}`,
      session: initData.session,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// Generate unique session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Generate access code
function generateAccessCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
