export function completionJobId(data: string | null): string | null {
  if (!data) return null;
  // Spring emits a plain UUID. Also accept senders that JSON-encode the string.
  const value = data.trim();
  const id = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id.toLowerCase() : null;
}

export function watchAiJob(
  refresh: (signal: AbortSignal) => Promise<boolean>,
  intervalMs: number,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let checking = false;

  async function checkNow() {
    if (controller.signal.aborted || checking) return;
    clearTimeout(timer);
    checking = true;
    const pending = await refresh(controller.signal);
    checking = false;

    if (controller.signal.aborted) return;
    if (pending) {
      timer = setTimeout(() => { void checkNow(); }, intervalMs);
    } else {
      controller.abort();
    }
  }

  void checkNow();
  return {
    checkNow,
    stop() {
      controller.abort();
      clearTimeout(timer);
    },
  };
}
