// TeacherHub Durable Object
// Manages teacher accounts and their sessions

import { Env, TeacherAccount } from './types';

export class TeacherHub implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // API Routes
    if (url.pathname === '/api/teacher' && request.method === 'POST') {
      return this.handleCreateTeacher(request);
    }

    if (url.pathname === '/api/teacher' && request.method === 'GET') {
      return this.handleGetTeacher(request);
    }

    if (url.pathname === '/api/sessions' && request.method === 'GET') {
      return this.handleGetSessions(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  // Create or update teacher account
  private async handleCreateTeacher(request: Request): Promise<Response> {
    try {
      const body = await request.json();
      const { id, email, name, preferences } = body;

      if (!id || !email || !name) {
        return new Response('Missing required fields', { status: 400 });
      }

      const teacher: TeacherAccount = {
        id,
        email,
        name,
        createdAt: Date.now(),
        preferences: {
          defaultAIProvider: 'cloudflare',
          defaultIdentityMode: 'mixed',
          defaultSettings: {},
          ...preferences,
        },
        sessionIds: [],
      };

      // Check if teacher exists
      const existing = await this.state.storage.get<TeacherAccount>(`teacher:${id}`);
      if (existing) {
        teacher.createdAt = existing.createdAt;
        teacher.sessionIds = existing.sessionIds;
      }

      await this.state.storage.put(`teacher:${id}`, teacher);

      return new Response(JSON.stringify({
        success: true,
        teacher,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  // Get teacher account
  private async handleGetTeacher(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const teacherId = url.searchParams.get('id');

      if (!teacherId) {
        return new Response('Teacher ID required', { status: 400 });
      }

      const teacher = await this.state.storage.get<TeacherAccount>(`teacher:${teacherId}`);

      if (!teacher) {
        return new Response('Teacher not found', { status: 404 });
      }

      return new Response(JSON.stringify({
        success: true,
        teacher,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  // Get all sessions for a teacher
  private async handleGetSessions(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const teacherId = url.searchParams.get('teacherId');

      if (!teacherId) {
        return new Response('Teacher ID required', { status: 400 });
      }

      const teacher = await this.state.storage.get<TeacherAccount>(`teacher:${teacherId}`);

      if (!teacher) {
        return new Response('Teacher not found', { status: 404 });
      }

      return new Response(JSON.stringify({
        success: true,
        sessionIds: teacher.sessionIds,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  // Add session to teacher's list
  async addSession(teacherId: string, sessionId: string): Promise<void> {
    const teacher = await this.state.storage.get<TeacherAccount>(`teacher:${teacherId}`);
    if (teacher && !teacher.sessionIds.includes(sessionId)) {
      teacher.sessionIds.push(sessionId);
      await this.state.storage.put(`teacher:${teacherId}`, teacher);
    }
  }
}
