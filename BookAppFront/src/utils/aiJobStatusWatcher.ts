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
