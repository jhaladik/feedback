# 🎓 Course Feedback System

AI-powered real-time feedback collection system for courses and workshops. Built with Cloudflare Workers, Durable Objects, and integrated AI from Cloudflare, OpenAI, and Anthropic.

## ✨ Features

### **Three-Phase Feedback Collection**
- **Pre-Course**: Collect expectations, assess skill levels, understand participant goals
- **Live**: Real-time feedback during the session with instant AI scoring
- **Post-Course**: Comprehensive feedback analysis and summary generation

### **AI-Powered Intelligence**
- **Real-time Sentiment Analysis**: Instantly understand how attendees feel
- **Urgency Detection**: Automatically flag critical issues (0-10 scale)
- **Smart Categorization**: Auto-classify feedback (questions, pace, technical, content)
- **Keyword Extraction**: Identify trending topics and concerns
- **Comprehensive Summaries**: AI-generated session reports with actionable insights

### **Flexible Identity Management**
- **Anonymous**: Pure anonymous feedback for sensitive topics
- **Nickname**: Attendees choose display names
- **Authenticated**: Require real identities
- **Mixed**: Let attendees choose their preference

### **Real-Time Dashboard**
- WebSocket-powered live updates
- Teacher sees all feedback instantly
- Public/private feedback separation
- Engagement scoring and metrics

### **Multi-AI Provider Support**
- **Cloudflare Workers AI**: Fast, cost-effective real-time scoring
- **OpenAI GPT-4**: Advanced text generation and analysis
- **Anthropic Claude**: Thoughtful summaries and insights

## 🏗️ Architecture

```
├── Cloudflare Workers (Edge Runtime)
├── Durable Objects
│   ├── FeedbackSession (per-session state + WebSocket)
│   └── TeacherHub (teacher accounts)
├── AI Providers
│   ├── Cloudflare Workers AI (real-time)
│   ├── OpenAI API (generation)
│   └── Anthropic API (summaries)
└── Simple HTML/JS UI (no framework)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI (you already have this!)
- API keys for OpenAI and/or Anthropic (optional)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys (Optional)

For OpenAI and Anthropic support, add your API keys as secrets:

```bash
wrangler secret put OPENAI_API_KEY
# Enter your OpenAI API key when prompted

wrangler secret put ANTHROPIC_API_KEY
# Enter your Anthropic API key when prompted
```

> **Note**: Cloudflare Workers AI is included in your subscription and works out of the box!

### 3. Run Locally

```bash
npm run dev
```

This starts the development server at `http://localhost:8787`

### 4. Deploy to Production

```bash
npm run deploy
```

## 📖 Usage Guide

### Creating a Session

1. Visit the homepage: `https://your-worker.workers.dev/`
2. Enter:
   - **Teacher ID**: Your unique identifier (e.g., `teacher_john`)
   - **Course Title**: Name of your course
   - **Course Description**: Optional, helps AI generate better questions
3. Click "Create New Session"
4. You'll receive:
   - **Teacher Dashboard URL**: Your control panel
   - **Attendee Link**: Share with participants
   - **Access Code**: Optional security

### Teacher Dashboard

Access at `/ui/teacher?session=SESSION_ID`

**Controls:**
- **Phase Management**: Switch between pre/live/post phases
- **Generate AI Summary**: Create comprehensive session report
- **Copy Attendee Link**: Easy sharing

**Features:**
- Real-time feedback stream (public + private)
- AI scoring for each feedback item
- Sentiment tracking and urgency alerts
- Acknowledge feedback (mark as seen)
- Engagement metrics

### Attendee View

Access at `/ui/attendee?session=SESSION_ID`

**Features:**
- Submit feedback (text-based)
- Choose public or private visibility
- See public feedback from others
- Real-time phase updates

## 🎯 AI Features in Detail

### Pre-Course Phase

**AI Generates:**
- 5 relevant pre-course questions based on course title/description
- Questions assess: skill level, expectations, concerns, learning preferences

**AI Analyzes:**
- Skill level distribution (beginner/intermediate/advanced)
- Top expectations and learning goals
- Potential gaps between expectations and curriculum
- Overall sentiment (excitement, anxiety, confusion)

### Live Phase

**Real-Time AI Scoring:**
- **Sentiment**: -1 (negative) to +1 (positive)
- **Urgency**: 0 (low) to 10 (critical)
- **Category**: question, pace, technical, content, other
- **Keywords**: Up to 5 relevant terms

**Dashboard Alerts:**
- Urgent feedback (urgency > 7) highlighted in red
- Sentiment trends over time
- Topic clustering (multiple people mentioning same thing)
- Pace indicators (too fast/slow)

### Post-Course Phase

**AI Summary Includes:**
- Overall performance score vs. teacher's average
- Expectation fulfillment analysis
- Session flow analysis (which parts worked/struggled)
- Top positives and improvements needed
- Skill level progression (before/after)
- Actionable recommendations for next session

## 🔧 Configuration

### Session Settings

When creating a session, customize:

```javascript
{
  identityMode: 'anonymous' | 'nickname' | 'authenticated' | 'mixed',
  allowPublicFeed: true, // Show public feedback to all attendees
  aiProvider: 'cloudflare' | 'openai' | 'anthropic',
  enableRealTimeScoring: true, // AI scores feedback as it arrives
  requireApprovalForPublic: false // Teacher approves before public
}
```

### AI Provider Selection

**Cloudflare Workers AI** (Default)
- ✅ Fast (edge computing)
- ✅ Cost-effective (included in subscription)
- ⚠️ Good but not best-in-class

**OpenAI**
- ✅ Excellent quality
- ✅ JSON mode for reliable scoring
- ⚠️ Requires API key
- ⚠️ Pay per token

**Anthropic Claude**
- ✅ Thoughtful, nuanced analysis
- ✅ Best for summaries
- ⚠️ Requires API key
- ⚠️ Pay per token

**Recommendation**: Use Cloudflare AI for real-time scoring, Claude for post-course summaries.

## 📡 API Reference

### Create Session

```
POST /api/session/create
Content-Type: application/json

{
  "teacherId": "teacher_id",
  "courseTitle": "Course Name",
  "courseDescription": "Optional description",
  "settings": { ... }
}

Response:
{
  "success": true,
  "sessionId": "session_xxx",
  "teacherUrl": "https://...",
  "attendeeUrl": "https://...",
  "accessCode": "ABC123"
}
```

### Submit Feedback

```
POST /session/{sessionId}/api/feedback
Content-Type: application/json

{
  "content": "Feedback text",
  "visibility": "public" | "private",
  "author": {
    "name": "Optional",
    "nickname": "Optional"
  }
}

Response:
{
  "success": true,
  "feedback": { ... },
  "aiScoring": { ... }
}
```

### Get Feedback

```
GET /session/{sessionId}/api/feedback?visibility=public&phase=live

Response:
{
  "success": true,
  "feedback": [ ... ]
}
```

### Change Phase

```
PUT /session/{sessionId}/api/phase
Content-Type: application/json

{
  "phase": "pre" | "live" | "post"
}
```

### Generate Summary

```
POST /session/{sessionId}/api/summary
Content-Type: application/json

{
  "provider": "cloudflare" | "openai" | "anthropic"
}

Response:
{
  "success": true,
  "summary": {
    "narrative": "AI-generated summary...",
    "totalFeedback": 42,
    "averageSentiment": 0.75,
    ...
  }
}
```

### WebSocket Connection

```javascript
const ws = new WebSocket('wss://your-worker.workers.dev/session/{sessionId}');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // message.type: 'feedback_added' | 'phase_changed' | 'summary_ready' | ...
};
```

## 🧪 Development

### Project Structure

```
feedback/
├── src/
│   ├── index.ts                 # Worker entry point
│   ├── durable-objects/
│   │   ├── FeedbackSession.ts   # Session management + WebSocket
│   │   ├── TeacherHub.ts        # Teacher accounts
│   │   └── types.ts             # TypeScript definitions
│   └── ai/
│       └── providers.ts         # AI provider abstraction
├── wrangler.toml                # Cloudflare config
├── package.json
└── tsconfig.json
```

### Testing Locally

1. Start dev server: `npm run dev`
2. Create session at `http://localhost:8787`
3. Open teacher dashboard in one window
4. Open attendee view in another window (or incognito)
5. Submit feedback and watch real-time updates!

### Adding New AI Providers

Implement `AIProviderInterface` in `src/ai/providers.ts`:

```typescript
export class MyAIProvider implements AIProviderInterface {
  async generateText(prompt: string): Promise<string> { ... }
  async scoreText(text: string): Promise<AIScoring> { ... }
  async summarize(texts: string[], context: string): Promise<string> { ... }
}
```

## 🎨 Customization

### UI Styling

UIs are embedded in `src/index.ts` for simplicity. To customize:
- Edit `serveAttendeeUI()` or `serveTeacherUI()` functions
- Modify inline CSS/HTML
- Or extract to separate HTML files and serve them

### Add Authentication

Currently uses simple session IDs. To add auth:
1. Implement authentication in Worker
2. Store teacher credentials in TeacherHub DO
3. Add login UI
4. Validate requests with JWT/session tokens

## 🚧 Roadmap

**Phase 1 (Current)**: ✅ Core MVP
- ✅ Single session support
- ✅ Real-time WebSocket
- ✅ AI scoring with 3 providers
- ✅ Basic teacher dashboard

**Phase 2 (Next)**:
- [ ] Multi-session teacher hub
- [ ] Teacher authentication
- [ ] Session templates
- [ ] Export session reports (PDF)

**Phase 3 (Future)**:
- [ ] Advanced analytics
- [ ] Cross-session insights
- [ ] Mobile app
- [ ] Integrations (Slack, Teams)

## 📝 License

MIT License - feel free to use for your courses!

## 🤝 Contributing

This is a learning project! Feel free to:
- Fork and experiment
- Submit issues
- Propose improvements
- Share your use cases

## 💬 Support

Questions? Issues? Ideas? Open an issue or reach out!

---

Built with ❤️ using Cloudflare Workers, Durable Objects, and AI
