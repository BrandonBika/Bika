Deno.serve(() => new Response(JSON.stringify({ ok: true, message: 'Transcription stub ready.' }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
}));
