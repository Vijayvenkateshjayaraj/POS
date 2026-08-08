export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const apiBase = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  try {
    const response = await fetch(`${apiBase}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      throw new Error(`API readiness returned ${response.status}`);
    }

    return Response.json({
      status: 'ok',
      service: 'web',
      dependencies: { api: 'up' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        status: 'unavailable',
        service: 'web',
        dependencies: { api: 'down' },
        message: error instanceof Error ? error.message : 'API readiness failed',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}

