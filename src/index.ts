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

// Serve attendee UI (Enhanced with AI features)
function serveAttendeeUI(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Course Feedback - Attendee</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
    h1 { color: #333; margin-bottom: 10px; }
    .phase-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; text-transform: uppercase; margin-bottom: 20px; }
    .phase-pre { background: #e3f2fd; color: #1976d2; }
    .phase-live { background: #e8f5e9; color: #388e3c; }
    .phase-post { background: #fff3e0; color: #f57c00; }
    .form-group { margin: 20px 0; position: relative; }
    label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
    textarea { width: 100%; padding: 14px; border: 2px solid #ddd; border-radius: 10px; font-family: inherit; font-size: 15px; resize: vertical; min-height: 120px; transition: all 0.3s; }
    textarea:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
    .ai-tools { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
    .btn { border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500; transition: all 0.3s; }
    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5568d3; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
    .btn-secondary { background: #f5f5f5; color: #555; }
    .btn-secondary:hover { background: #e0e0e0; }
    .btn-submit { background: #4CAF50; color: white; padding: 14px 32px; font-size: 16px; width: 100%; }
    .btn-submit:hover { background: #45a049; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4); }
    .btn:disabled { background: #ccc; cursor: not-allowed; transform: none; box-shadow: none; }
    .ai-suggestions { background: #f9f9f9; border-radius: 10px; padding: 15px; margin-top: 15px; border-left: 4px solid #667eea; display: none; animation: slideDown 0.3s; }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    .suggestion-item { background: white; padding: 12px; border-radius: 8px; margin: 8px 0; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; }
    .suggestion-item:hover { border-color: #667eea; transform: translateX(4px); }
    .sentiment-preview { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px; border-radius: 8px; margin-top: 10px; display: none; animation: slideDown 0.3s; }
    .sentiment-bar { background: rgba(255,255,255,0.3); height: 8px; border-radius: 4px; margin-top: 8px; overflow: hidden; }
    .sentiment-fill { background: #4CAF50; height: 100%; transition: width 0.3s, background 0.3s; }
    .toggle { margin: 15px 0; }
    .toggle label { display: flex; align-items: center; cursor: pointer; }
    .toggle input { margin-right: 8px; width: 18px; height: 18px; cursor: pointer; }
    .feedback-list { margin-top: 40px; }
    .feedback-list h2 { color: #333; margin-bottom: 15px; }
    .feedback-item { background: #f9f9f9; padding: 16px; border-radius: 10px; margin-bottom: 14px; border-left: 4px solid #4CAF50; transition: all 0.3s; }
    .feedback-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transform: translateX(4px); }
    .feedback-meta { font-size: 12px; color: #666; margin-bottom: 8px; display: flex; gap: 10px; align-items: center; }
    .feedback-content { color: #333; line-height: 1.6; }
    .sentiment-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .sentiment-positive { background: #e8f5e9; color: #2e7d32; }
    .sentiment-neutral { background: #fff3e0; color: #f57c00; }
    .sentiment-negative { background: #ffebee; color: #c62828; }
    .status { padding: 12px; border-radius: 10px; margin-bottom: 20px; animation: slideDown 0.3s; }
    .status.success { background: #e8f5e9; color: #2e7d32; border-left: 4px solid #4CAF50; }
    .status.error { background: #ffebee; color: #c62828; border-left: 4px solid #f44336; }
    .loading { text-align: center; padding: 60px; color: #666; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .ai-badge { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; display: inline-block; margin-left: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div id="loading" class="loading">
      <div class="spinner"></div>
      Loading session...
    </div>
    <div id="app" style="display: none;">
      <h1 id="courseTitle">Course Feedback</h1>
      <span id="phaseBadge" class="phase-badge"></span>

      <div id="statusMessage" class="status" style="display: none;"></div>

      <div class="form-group">
        <label for="feedback">
          Your Feedback <span class="ai-badge">✨ AI-Powered</span>
        </label>
        <textarea id="feedback" placeholder="Share your thoughts, questions, or concerns..."></textarea>

        <div class="ai-tools">
          <button class="btn btn-secondary" onclick="helpMeWrite()" id="helpBtn">
            ✨ Help me write this better
          </button>
          <button class="btn btn-secondary" onclick="previewSentiment()" id="previewBtn">
            📊 Preview sentiment
          </button>
        </div>

        <div id="aiSuggestions" class="ai-suggestions">
          <strong>AI Suggestions:</strong>
          <div id="suggestionsContainer"></div>
        </div>

        <div id="sentimentPreview" class="sentiment-preview">
          <strong id="sentimentText">Analyzing...</strong>
          <div class="sentiment-bar">
            <div class="sentiment-fill" id="sentimentBar"></div>
          </div>
          <p id="sentimentTip" style="font-size: 13px; margin-top: 8px; opacity: 0.9;"></p>
        </div>
      </div>

      <div class="toggle">
        <label>
          <input type="checkbox" id="privateToggle">
          Make this feedback private (only teacher can see)
        </label>
      </div>

      <button class="btn btn-submit" id="submitBtn" onclick="submitFeedback()">Submit Feedback</button>

      <div class="feedback-list">
        <h2>💬 Public Feedback</h2>
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
        const response = await fetch(\`/session/\${sessionId}/api/session\`);
        const data = await response.json();

        if (!data.success) throw new Error('Failed to load session');

        document.getElementById('courseTitle').textContent = data.session.courseTitle;
        updatePhaseBadge(data.session.phase);

        loadFeedback();
        connectWebSocket();

        document.getElementById('loading').style.display = 'none';
        document.getElementById('app').style.display = 'block';
      } catch (error) {
        document.getElementById('loading').innerHTML = \`<p style="color: #c62828;">Failed to load session: \${error.message}</p>\`;
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

    async function helpMeWrite() {
      const text = document.getElementById('feedback').value.trim();
      if (!text) {
        showError('Please write something first');
        return;
      }

      const helpBtn = document.getElementById('helpBtn');
      helpBtn.disabled = true;
      helpBtn.textContent = '✨ Generating suggestions...';

      try {
        const response = await fetch(\`/session/\${sessionId}/api/enhance-feedback\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        const data = await response.json();
        if (data.success) {
          showSuggestions(data.improved, data.suggestions);
        }
      } catch (error) {
        showError('Failed to get suggestions: ' + error.message);
      } finally {
        helpBtn.disabled = false;
        helpBtn.textContent = '✨ Help me write this better';
      }
    }

    function showSuggestions(improved, suggestions) {
      const container = document.getElementById('suggestionsContainer');
      container.innerHTML = \`
        <div class="suggestion-item" onclick="useSuggestion('\${escapeHtml(improved)}')">
          <strong>✨ Improved:</strong><br>
          \${escapeHtml(improved)}
        </div>
      \`;

      suggestions.forEach((sug, i) => {
        container.innerHTML += \`
          <div class="suggestion-item" onclick="useSuggestion('\${escapeHtml(sug)}')">
            <strong>Option \${i + 1}:</strong><br>
            \${escapeHtml(sug)}
          </div>
        \`;
      });

      document.getElementById('aiSuggestions').style.display = 'block';
    }

    function useSuggestion(text) {
      document.getElementById('feedback').value = text;
      document.getElementById('aiSuggestions').style.display = 'none';
      showSuccess('Suggestion applied! Feel free to edit.');
    }

    async function previewSentiment() {
      const text = document.getElementById('feedback').value.trim();
      if (!text) {
        showError('Please write something first');
        return;
      }

      const previewBtn = document.getElementById('previewBtn');
      previewBtn.disabled = true;

      try {
        const response = await fetch(\`/session/\${sessionId}/api/sentiment-preview\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        const data = await response.json();
        if (data.success) {
          showSentimentPreview(data.sentiment, data.tone, data.suggestion);
        }
      } catch (error) {
        showError('Failed to preview: ' + error.message);
      } finally {
        previewBtn.disabled = false;
      }
    }

    function showSentimentPreview(sentiment, tone, suggestion) {
      const preview = document.getElementById('sentimentPreview');
      const percentage = Math.round((sentiment + 1) * 50);
      const bar = document.getElementById('sentimentBar');

      bar.style.width = percentage + '%';

      if (sentiment > 0.3) {
        bar.style.background = '#4CAF50';
        document.getElementById('sentimentText').textContent = \`😊 \${tone} (\${percentage}% positive)\`;
      } else if (sentiment < -0.3) {
        bar.style.background = '#f44336';
        document.getElementById('sentimentText').textContent = \`😟 \${tone} (\${percentage}% negative)\`;
      } else {
        bar.style.background = '#FF9800';
        document.getElementById('sentimentText').textContent = \`😐 \${tone} (neutral)\`;
      }

      if (suggestion) {
        document.getElementById('sentimentTip').textContent = '💡 ' + suggestion;
      } else {
        document.getElementById('sentimentTip').textContent = '✅ Your feedback tone is great!';
      }

      preview.style.display = 'block';
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
        document.getElementById('aiSuggestions').style.display = 'none';
        document.getElementById('sentimentPreview').style.display = 'none';
        showSuccess('✅ Feedback submitted!');
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
          if (data.feedback.length === 0) {
            container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No feedback yet. Be the first!</p>';
          } else {
            data.feedback.forEach(addFeedbackToUI);
          }
        }
      } catch (error) {
        console.error('Failed to load feedback:', error);
      }
    }

    function addFeedbackToUI(feedback) {
      const container = document.getElementById('publicFeedback');
      const div = document.createElement('div');
      div.className = 'feedback-item';

      let sentimentBadge = '';
      if (feedback.aiScoring) {
        const sent = feedback.aiScoring.sentiment;
        if (sent > 0.3) {
          sentimentBadge = '<span class="sentiment-badge sentiment-positive">Positive</span>';
        } else if (sent < -0.3) {
          sentimentBadge = '<span class="sentiment-badge sentiment-negative">Needs attention</span>';
        } else {
          sentimentBadge = '<span class="sentiment-badge sentiment-neutral">Neutral</span>';
        }
      }

      div.innerHTML = \`
        <div class="feedback-meta">
          <span>\${new Date(feedback.timestamp).toLocaleTimeString()}</span>
          <span>\${feedback.author?.nickname || feedback.author?.name || 'Anonymous'}</span>
          \${sentimentBadge}
        </div>
        <div class="feedback-content">\${escapeHtml(feedback.content)}</div>
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

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    init();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Serve teacher UI (Enhanced with AI features)
function serveTeacherUI(): Response {
  const html = `  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Course Feedback - Teacher Dashboard</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; background: #f5f5f5; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
      .header h1 { margin-bottom: 5px; font-size: 28px; }
      .header p { opacity: 0.9; font-size: 14px; }
      .container { max-width: 1600px; margin: 0 auto; padding: 20px; }
      .controls { background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      .btn { padding: 11px 22px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.3s; }
      .btn-primary { background: #4CAF50; color: white; }
      .btn-primary:hover { background: #45a049; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3); }
      .btn-secondary { background: #667eea; color: white; }
      .btn-secondary:hover { background: #5568d3; }
      .btn-warning { background: #FF9800; color: white; }
      .btn-warning:hover { background: #f57c00; }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
      /* Insights Panel */
      .insights-panel { background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .insights-panel h2 { margin-bottom: 15px; color: #333; display: flex; align-items: center; gap: 8px; }
      .insights-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; }
      .insight-card { padding: 15px; border-radius: 10px; border-left: 4px solid #667eea; animation: slideIn 0.4s; }
      .insight-card.alert { background: #ffebee; border-color: #f44336; }
      .insight-card.suggestion { background: #e8f5e9; border-color: #4CAF50; }
      .insight-card.celebration { background: #fff3e0; border-color: #FF9800; }
      .insight-title { font-weight: 600; margin-bottom: 5px; display: flex; align-items: center; gap: 6px; }
      .insight-message { font-size: 14px; color: #666; margin-bottom: 5px; }
      .insight-action { font-size: 13px; color: #667eea; font-weight: 500; }
      @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
  
      /* Patterns */
      .patterns-section { background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .pattern-card { background: #f9f9f9; padding: 15px; border-radius: 10px; margin-bottom: 12px; border-left: 4px solid #FF9800; }
      .pattern-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .pattern-topic { font-weight: 600; font-size: 16px; color: #333; }
      .pattern-count { background: #FF9800; color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
      .pattern-recommendation { color: #666; font-size: 14px; margin-top: 8px; padding: 10px; background: white; border-radius: 6px; }
  
      /* Stats */
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 20px; }
      .stat-card { background: white; padding: 22px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s; }
      .stat-card:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
      .stat-value { font-size: 36px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .stat-label { color: #666; font-size: 14px; margin-top: 4px; }
  
      /* Feedback Container */
      .feedback-container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .feedback-column { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-height: 700px; overflow-y: auto; }
      .feedback-column h2 { margin-bottom: 15px; color: #333; position: sticky; top: 0; background: white; padding-bottom: 10px; }
      .feedback-item { background: #f9f9f9; padding: 16px; border-radius: 10px; margin-bottom: 14px; position: relative; transition: all 0.3s; }
      .feedback-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); transform: translateX(4px); }
      .feedback-item.urgent { border-left: 4px solid #f44336; background: #ffebee; }
      .feedback-item.normal { border-left: 4px solid #4CAF50; }
      .feedback-meta { font-size: 12px; color: #666; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
      .feedback-content { color: #333; margin-bottom: 10px; line-height: 1.5; }
      .feedback-scoring { font-size: 11px; color: #888; padding: 10px; background: white; border-radius: 6px; margin-top: 10px; }
      .feedback-actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
      .action-btn { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: 500; }
      .btn-ack { background: #4CAF50; color: white; }
      .btn-suggest { background: #667eea; color: white; }
      .acknowledged { opacity: 0.6; }
  
      /* Response Suggestions Modal */
      .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); animation: fadeIn 0.3s; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .modal-content { background: white; margin: 10% auto; padding: 30px; border-radius: 16px; width: 90%; max-width: 600px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); animation: slideUp 0.3s; }
      @keyframes slideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .modal-close { float: right; font-size: 28px; font-weight: bold; cursor: pointer; color: #aaa; }
      .modal-close:hover { color: #000; }
      .response-option { background: #f9f9f9; padding: 14px; border-radius: 8px; margin: 10px 0; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; }
      .response-option:hover { border-color: #667eea; transform: translateX(4px); }
  
      .loading { text-align: center; padding: 40px; color: #666; }
      .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  
      @media (max-width: 900px) {
        .feedback-container { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1 id="courseTitle">🎓 Teacher Dashboard</h1>
      <p id="sessionInfo">Loading session...</p>
    </div>
  
    <div class="container">
      <div class="controls">
        <button class="btn btn-primary" onclick="changePhase('pre')">📝 Pre-Course</button>
        <button class="btn btn-primary" onclick="changePhase('live')">🎬 Start Live Session</button>
        <button class="btn btn-primary" onclick="changePhase('post')">🏁 End Session</button>
        <button class="btn btn-secondary" onclick="generateSummary()">📊 Generate AI Summary</button>
        <button class="btn btn-secondary" onclick="refreshInsights()">🔄 Refresh Insights</button>
        <button class="btn btn-warning" onclick="copyAttendeeLink()">📎 Copy Attendee Link</button>
      </div>
  
      <!-- AI Insights Panel -->
      <div class="insights-panel" id="insightsPanel" style="display:none;">
        <h2>🤖 AI Insights & Alerts</h2>
        <div class="insights-grid" id="insightsGrid"></div>
      </div>
  
      <!-- Patterns Section -->
      <div class="patterns-section" id="patternsSection" style="display:none;">
        <h2>🔍 Detected Patterns</h2>
        <div id="patternsContainer"></div>
      </div>
  
      <!-- Stats -->
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
  
      <!-- Feedback Columns -->
      <div class="feedback-container">
        <div class="feedback-column">
          <h2>💬 Public Feedback</h2>
          <div id="publicFeedback"></div>
        </div>
        <div class="feedback-column">
          <h2>🔒 Private Feedback</h2>
          <div id="privateFeedback"></div>
        </div>
      </div>
    </div>
  
    <!-- Response Suggestions Modal -->
    <div id="responseModal" class="modal">
      <div class="modal-content">
        <span class="modal-close" onclick="closeModal()">&times;</span>
        <h2 style="margin-bottom: 15px;">💬 AI Response Suggestions</h2>
        <div id="responseSuggestions"></div>
      </div>
    </div>
  
    <script>
      const urlParams = new URLSearchParams(window.location.search);
      const sessionId = urlParams.get('session');
      let ws = null;
      let sessionData = null;
      let insightsInterval = null;
  
      async function init() {
        if (!sessionId) {
          alert('No session ID provided');
          return;
        }
  
        await loadSession();
        loadFeedback();
        connectWebSocket();
  
        // Auto-refresh insights every 60 seconds
        insightsInterval = setInterval(refreshInsights, 60000);
        setTimeout(refreshInsights, 5000); // Initial load after 5s
      }
  
      async function loadSession() {
        const response = await fetch(\`/session/\${sessionId}/api/session\`);
        const data = await response.json();
        if (data.success) {
          sessionData = data.session;
          document.getElementById('courseTitle').textContent = '🎓 ' + data.session.courseTitle;
          document.getElementById('sessionInfo').textContent = \`Phase: \${data.session.phase.toUpperCase()} | Session ID: \${sessionId}\`;
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
          } else if (message.type === 'insight_generated') {
            displayInsights(message.payload);
          } else if (message.type === 'pattern_detected') {
            displayPatterns(message.payload);
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
          <div class="feedback-content">\${escapeHtml(feedback.content)}</div>
          \${feedback.aiScoring ? \`
            <div class="feedback-scoring">
              😊 Sentiment: \${(feedback.aiScoring.sentiment * 100).toFixed(0)}% |
              🚨 Urgency: \${feedback.aiScoring.urgency}/10 |
              📁 Category: \${feedback.aiScoring.category} |
              🏷️ Keywords: \${feedback.aiScoring.keywords.join(', ')}
            </div>
          \` : ''}
          <div class="feedback-actions">
            \${!feedback.acknowledged ? \`<button class="action-btn btn-ack" onclick="acknowledge('\${feedback.id}')">✓ Acknowledge</button>\` : '<span style="font-size: 12px; color: #4CAF50;">✓ Acknowledged</span>'}
            <button class="action-btn btn-suggest" onclick="getSuggestions('\${feedback.id}')">💡 Get Response Ideas</button>
          </div>
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
  
      async function getSuggestions(feedbackId) {
        try {
          const response = await fetch(\`/session/\${sessionId}/api/response-suggestion\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedbackId }),
          });
  
          const data = await response.json();
          if (data.success) {
            showResponseModal(data.suggestions);
          }
        } catch (error) {
          alert('Failed to get suggestions: ' + error.message);
        }
      }
  
      function showResponseModal(suggestions) {
        const container = document.getElementById('responseSuggestions');
        container.innerHTML = '';
        suggestions.forEach((sug, i) => {
          container.innerHTML += \`
            <div class="response-option" onclick="copyToClipboard('\${escapeHtml(sug)}')">
              <strong>Option \${i + 1}:</strong><br>
              \${escapeHtml(sug)}
              <div style="font-size: 11px; color: #999; margin-top: 5px;">Click to copy</div>
            </div>
          \`;
        });
        document.getElementById('responseModal').style.display = 'block';
      }
  
      function closeModal() {
        document.getElementById('responseModal').style.display = 'none';
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
        if (!confirm('Generate comprehensive AI summary? This may take a moment.')) return;
        try {
          const response = await fetch(\`/session/\${sessionId}/api/summary\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'cloudflare' }),
          });
          const data = await response.json();
          if (data.success) {
            alert('Summary generated!\\n\\n' + data.summary.narrative.substring(0, 500) + '...');
          }
        } catch (error) {
          alert('Failed to generate summary: ' + error.message);
        }
      }
  
      async function refreshInsights() {
        try {
          const response = await fetch(\`/session/\${sessionId}/api/insights?recentMinutes=10\`);
          const data = await response.json();
          if (data.success) {
            displayInsights(data.insights);
            displayPatterns(data.patterns);
          }
        } catch (error) {
          console.error('Failed to refresh insights:', error);
        }
      }
  
      function displayInsights(insights) {
        if (!insights || insights.length === 0) {
          document.getElementById('insightsPanel').style.display = 'none';
          return;
        }
  
        const grid = document.getElementById('insightsGrid');
        grid.innerHTML = '';
        insights.forEach(insight => {
          grid.innerHTML += \`
            <div class="insight-card \${insight.type}">
              <div class="insight-title">\${insight.title}</div>
              <div class="insight-message">\${insight.message}</div>
              \${insight.action ? \`<div class="insight-action">💡 \${insight.action}</div>\` : ''}
            </div>
          \`;
        });
        document.getElementById('insightsPanel').style.display = 'block';
      }
  
      function displayPatterns(patterns) {
        if (!patterns || patterns.length === 0) {
          document.getElementById('patternsSection').style.display = 'none';
          return;
        }
  
        const container = document.getElementById('patternsContainer');
        container.innerHTML = '';
        patterns.forEach(pattern => {
          container.innerHTML += \`
            <div class="pattern-card">
              <div class="pattern-header">
                <div class="pattern-topic">🔥 \${pattern.topic}</div>
                <div class="pattern-count">\${pattern.count} mentions</div>
              </div>
              <div class="pattern-recommendation">
                <strong>💡 Recommendation:</strong> \${pattern.recommendation}
              </div>
            </div>
          \`;
        });
        document.getElementById('patternsSection').style.display = 'block';
      }
  
      function copyAttendeeLink() {
        const link = window.location.origin + '/ui/attendee?session=' + sessionId;
        navigator.clipboard.writeText(link);
        alert('📎 Attendee link copied to clipboard!\\n\\n' + link);
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
  
        // Mock engagement score (you can enhance this)
        document.getElementById('engagementScore').textContent = Math.min(100, feedback.length * 5) + '%';
      }
  
      function copyToClipboard(text) {
        navigator.clipboard.writeText(text);
        alert('✓ Copied to clipboard!');
        closeModal();
      }
  
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
  
      // Close modal when clicking outside
      window.onclick = function(event) {
        const modal = document.getElementById('responseModal');
        if (event.target == modal) {
          closeModal();
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
