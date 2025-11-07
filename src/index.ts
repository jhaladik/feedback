// Main Worker Entry Point
// Routes requests to Durable Objects and serves static UI

import { Env } from './durable-objects/types';

export { FeedbackSession } from './durable-objects/FeedbackSession';
export { TeacherHub } from './durable-objects/TeacherHub';

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
        return new Response(getWelcomePage(), {
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
        return serveAttendeeUI();
      }

      if (url.pathname === '/ui/teacher') {
        return serveTeacherUI();
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

// Serve attendee UI
function serveAttendeeUI(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Course Feedback - Attendee</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; padding: 20px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 10px; }
    .phase-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .phase-pre { background: #e3f2fd; color: #1976d2; }
    .phase-live { background: #e8f5e9; color: #388e3c; }
    .phase-post { background: #fff3e0; color: #f57c00; }
    .form-group { margin: 20px 0; }
    label { display: block; margin-bottom: 8px; font-weight: 500; color: #555; }
    textarea { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-family: inherit; font-size: 14px; resize: vertical; min-height: 100px; }
    textarea:focus { outline: none; border-color: #4CAF50; }
    button { background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: 500; }
    button:hover { background: #45a049; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .toggle { margin: 15px 0; }
    .toggle label { display: flex; align-items: center; cursor: pointer; }
    .toggle input { margin-right: 8px; }
    .feedback-list { margin-top: 30px; }
    .feedback-item { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #4CAF50; }
    .feedback-meta { font-size: 12px; color: #666; margin-bottom: 5px; }
    .feedback-content { color: #333; }
    .status { padding: 10px; border-radius: 8px; margin-bottom: 20px; }
    .status.success { background: #e8f5e9; color: #2e7d32; }
    .status.error { background: #ffebee; color: #c62828; }
    .loading { text-align: center; padding: 40px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div id="loading" class="loading">Loading session...</div>
    <div id="app" style="display: none;">
      <h1 id="courseTitle">Course Feedback</h1>
      <span id="phaseBadge" class="phase-badge"></span>

      <div id="statusMessage" class="status" style="display: none;"></div>

      <div class="form-group">
        <label for="feedback">Your Feedback:</label>
        <textarea id="feedback" placeholder="Share your thoughts, questions, or concerns..."></textarea>
      </div>

      <div class="toggle">
        <label>
          <input type="checkbox" id="privateToggle">
          Make this feedback private (only teacher can see)
        </label>
      </div>

      <button id="submitBtn" onclick="submitFeedback()">Submit Feedback</button>

      <div class="feedback-list">
        <h2>Public Feedback</h2>
        <div id="publicFeedback"></div>
      </div>
    </div>
  </div>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    let ws = null;

    async function init() {
      if (!sessionId) {
        showError('No session ID provided');
        return;
      }

      try {
        // Get session info
        const response = await fetch(\`/session/\${sessionId}/api/session\`);
        const data = await response.json();

        if (!data.success) throw new Error('Failed to load session');

        document.getElementById('courseTitle').textContent = data.session.courseTitle;
        updatePhaseBadge(data.session.phase);

        // Load existing feedback
        loadFeedback();

        // Connect WebSocket
        connectWebSocket();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('app').style.display = 'block';
      } catch (error) {
        showError('Failed to load session: ' + error.message);
      }
    }

    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${window.location.host}/session/\${sessionId}\`);

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'feedback_added') {
          if (message.payload.visibility === 'public') {
            addFeedbackToUI(message.payload);
          }
        } else if (message.type === 'phase_changed') {
          updatePhaseBadge(message.payload.newPhase);
        }
      };
    }

    async function submitFeedback() {
      const content = document.getElementById('feedback').value.trim();
      if (!content) {
        showError('Please enter feedback');
        return;
      }

      const isPrivate = document.getElementById('privateToggle').checked;

      try {
        document.getElementById('submitBtn').disabled = true;

        const response = await fetch(\`/session/\${sessionId}/api/feedback\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            visibility: isPrivate ? 'private' : 'public',
          }),
        });

        const data = await response.json();
        if (!data.success) throw new Error('Failed to submit');

        document.getElementById('feedback').value = '';
        document.getElementById('privateToggle').checked = false;
        showSuccess('Feedback submitted!');
      } catch (error) {
        showError('Failed to submit: ' + error.message);
      } finally {
        document.getElementById('submitBtn').disabled = false;
      }
    }

    async function loadFeedback() {
      try {
        const response = await fetch(\`/session/\${sessionId}/api/feedback?visibility=public\`);
        const data = await response.json();

        if (data.success) {
          const container = document.getElementById('publicFeedback');
          container.innerHTML = '';
          data.feedback.forEach(addFeedbackToUI);
        }
      } catch (error) {
        console.error('Failed to load feedback:', error);
      }
    }

    function addFeedbackToUI(feedback) {
      const container = document.getElementById('publicFeedback');
      const div = document.createElement('div');
      div.className = 'feedback-item';
      div.innerHTML = \`
        <div class="feedback-meta">
          \${new Date(feedback.timestamp).toLocaleTimeString()}
          \${feedback.author?.nickname || feedback.author?.name || 'Anonymous'}
          \${feedback.aiScoring ? \` • Sentiment: \${(feedback.aiScoring.sentiment * 100).toFixed(0)}%\` : ''}
        </div>
        <div class="feedback-content">\${feedback.content}</div>
      \`;
      container.insertBefore(div, container.firstChild);
    }

    function updatePhaseBadge(phase) {
      const badge = document.getElementById('phaseBadge');
      badge.textContent = phase;
      badge.className = 'phase-badge phase-' + phase;
    }

    function showError(message) {
      const status = document.getElementById('statusMessage');
      status.textContent = message;
      status.className = 'status error';
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 5000);
    }

    function showSuccess(message) {
      const status = document.getElementById('statusMessage');
      status.textContent = message;
      status.className = 'status success';
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 3000);
    }

    init();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Serve teacher UI
function serveTeacherUI(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Course Feedback - Teacher Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; background: #f5f5f5; }
    .header { background: #1976d2; color: white; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header h1 { margin-bottom: 5px; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .controls { background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .controls button { margin-right: 10px; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
    .btn-primary { background: #4CAF50; color: white; }
    .btn-secondary { background: #2196F3; color: white; }
    .btn-warning { background: #FF9800; color: white; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .stat-value { font-size: 32px; font-weight: bold; color: #1976d2; }
    .stat-label { color: #666; font-size: 14px; }
    .feedback-container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .feedback-column { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .feedback-column h2 { margin-bottom: 15px; color: #333; }
    .feedback-item { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 12px; position: relative; }
    .feedback-item.urgent { border-left: 4px solid #f44336; }
    .feedback-item.normal { border-left: 4px solid #4CAF50; }
    .feedback-meta { font-size: 12px; color: #666; margin-bottom: 8px; display: flex; justify-content: space-between; }
    .feedback-content { color: #333; margin-bottom: 8px; }
    .feedback-scoring { font-size: 11px; color: #888; padding: 8px; background: #fff; border-radius: 4px; margin-top: 8px; }
    .acknowledge-btn { background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .acknowledged { opacity: 0.6; }
    .loading { text-align: center; padding: 40px; color: #666; }
    @media (max-width: 900px) {
      .feedback-container { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 id="courseTitle">Teacher Dashboard</h1>
    <p id="sessionInfo">Loading session...</p>
  </div>

  <div class="container">
    <div class="controls">
      <button class="btn-primary" onclick="changePhase('pre')">Pre-Course</button>
      <button class="btn-primary" onclick="changePhase('live')">Start Live Session</button>
      <button class="btn-primary" onclick="changePhase('post')">End Session</button>
      <button class="btn-secondary" onclick="generateSummary()">Generate AI Summary</button>
      <button class="btn-warning" onclick="copyAttendeeLink()">Copy Attendee Link</button>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value" id="totalFeedback">0</div>
        <div class="stat-label">Total Feedback</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="avgSentiment">0%</div>
        <div class="stat-label">Avg Sentiment</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="urgentCount">0</div>
        <div class="stat-label">Urgent Items</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="engagementScore">0%</div>
        <div class="stat-label">Engagement</div>
      </div>
    </div>

    <div class="feedback-container">
      <div class="feedback-column">
        <h2>Public Feedback</h2>
        <div id="publicFeedback"></div>
      </div>
      <div class="feedback-column">
        <h2>Private Feedback</h2>
        <div id="privateFeedback"></div>
      </div>
    </div>
  </div>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    let ws = null;
    let sessionData = null;

    async function init() {
      if (!sessionId) {
        alert('No session ID provided');
        return;
      }

      await loadSession();
      loadFeedback();
      connectWebSocket();
    }

    async function loadSession() {
      const response = await fetch(\`/session/\${sessionId}/api/session\`);
      const data = await response.json();
      if (data.success) {
        sessionData = data.session;
        document.getElementById('courseTitle').textContent = data.session.courseTitle;
        document.getElementById('sessionInfo').textContent = \`Phase: \${data.session.phase.toUpperCase()} | ID: \${sessionId}\`;
      }
    }

    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${window.location.host}/session/\${sessionId}\`);

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'feedback_added') {
          addFeedbackToUI(message.payload);
          updateStats();
        } else if (message.type === 'phase_changed') {
          loadSession();
        }
      };
    }

    async function loadFeedback() {
      const response = await fetch(\`/session/\${sessionId}/api/feedback\`);
      const data = await response.json();
      if (data.success) {
        document.getElementById('publicFeedback').innerHTML = '';
        document.getElementById('privateFeedback').innerHTML = '';
        data.feedback.forEach(addFeedbackToUI);
        updateStats();
      }
    }

    function addFeedbackToUI(feedback) {
      const container = document.getElementById(feedback.visibility + 'Feedback');
      const div = document.createElement('div');
      const urgency = feedback.aiScoring?.urgency || 0;
      div.className = 'feedback-item ' + (urgency > 7 ? 'urgent' : 'normal') + (feedback.acknowledged ? ' acknowledged' : '');
      div.innerHTML = \`
        <div class="feedback-meta">
          <span>\${new Date(feedback.timestamp).toLocaleString()}</span>
          <span>\${feedback.author?.name || feedback.author?.nickname || 'Anonymous'}</span>
        </div>
        <div class="feedback-content">\${feedback.content}</div>
        \${feedback.aiScoring ? \`
          <div class="feedback-scoring">
            Sentiment: \${(feedback.aiScoring.sentiment * 100).toFixed(0)}% |
            Urgency: \${feedback.aiScoring.urgency}/10 |
            Category: \${feedback.aiScoring.category} |
            Keywords: \${feedback.aiScoring.keywords.join(', ')}
          </div>
        \` : ''}
        \${!feedback.acknowledged ? \`<button class="acknowledge-btn" onclick="acknowledge('\${feedback.id}')">Acknowledge</button>\` : ''}
      \`;
      container.insertBefore(div, container.firstChild);
    }

    async function acknowledge(feedbackId) {
      await fetch(\`/session/\${sessionId}/api/acknowledge\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId }),
      });
    }

    async function changePhase(phase) {
      await fetch(\`/session/\${sessionId}/api/phase\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase }),
      });
      loadSession();
    }

    async function generateSummary() {
      if (!confirm('Generate AI summary? This may take a moment.')) return;
      const response = await fetch(\`/session/\${sessionId}/api/summary\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic' }),
      });
      const data = await response.json();
      if (data.success) {
        alert('Summary generated!\\n\\n' + data.summary.narrative.substring(0, 500) + '...');
      }
    }

    function copyAttendeeLink() {
      const link = window.location.origin + '/ui/attendee?session=' + sessionId;
      navigator.clipboard.writeText(link);
      alert('Attendee link copied to clipboard!');
    }

    async function updateStats() {
      const response = await fetch(\`/session/\${sessionId}/api/feedback\`);
      const data = await response.json();
      if (!data.success) return;

      const feedback = data.feedback;
      document.getElementById('totalFeedback').textContent = feedback.length;

      const scored = feedback.filter(f => f.aiScoring);
      if (scored.length > 0) {
        const avgSent = scored.reduce((sum, f) => sum + f.aiScoring.sentiment, 0) / scored.length;
        document.getElementById('avgSentiment').textContent = ((avgSent + 1) * 50).toFixed(0) + '%';

        const urgent = scored.filter(f => f.aiScoring.urgency > 7).length;
        document.getElementById('urgentCount').textContent = urgent;
      }
    }

    init();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Welcome page
function getWelcomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Course Feedback System</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); max-width: 600px; width: 100%; }
    h1 { color: #333; margin-bottom: 10px; }
    p { color: #666; margin-bottom: 30px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-weight: 500; color: #555; }
    input, textarea { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-family: inherit; font-size: 14px; }
    input:focus, textarea:focus { outline: none; border-color: #667eea; }
    button { width: 100%; background: #667eea; color: white; border: none; padding: 14px; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: 600; }
    button:hover { background: #5568d3; }
    .result { margin-top: 20px; padding: 15px; background: #e8f5e9; border-radius: 8px; display: none; }
    .result a { color: #2e7d32; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎓 Course Feedback System</h1>
    <p>AI-powered real-time feedback collection for your courses</p>

    <div class="form-group">
      <label for="teacherId">Teacher ID:</label>
      <input type="text" id="teacherId" placeholder="your-teacher-id" value="teacher_demo">
    </div>

    <div class="form-group">
      <label for="courseTitle">Course Title:</label>
      <input type="text" id="courseTitle" placeholder="e.g., Advanced Docker Workshop">
    </div>

    <div class="form-group">
      <label for="courseDescription">Course Description (optional):</label>
      <textarea id="courseDescription" rows="3" placeholder="Brief description to help AI generate better questions..."></textarea>
    </div>

    <button onclick="createSession()">Create New Session</button>

    <div id="result" class="result"></div>
  </div>

  <script>
    async function createSession() {
      const teacherId = document.getElementById('teacherId').value;
      const courseTitle = document.getElementById('courseTitle').value;
      const courseDescription = document.getElementById('courseDescription').value;

      if (!teacherId || !courseTitle) {
        alert('Please fill in required fields');
        return;
      }

      try {
        const response = await fetch('/api/session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacherId, courseTitle, courseDescription }),
        });

        const data = await response.json();
        if (data.success) {
          const result = document.getElementById('result');
          result.innerHTML = \`
            <h3>Session Created! 🎉</h3>
            <p><strong>Teacher Dashboard:</strong><br><a href="\${data.teacherUrl}" target="_blank">\${data.teacherUrl}</a></p>
            <p><strong>Attendee Link:</strong><br><a href="\${data.attendeeUrl}" target="_blank">\${data.attendeeUrl}</a></p>
            <p><strong>Access Code:</strong> \${data.accessCode}</p>
          \`;
          result.style.display = 'block';
        } else {
          alert('Failed to create session: ' + data.error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  </script>
</body>
</html>`;
}
