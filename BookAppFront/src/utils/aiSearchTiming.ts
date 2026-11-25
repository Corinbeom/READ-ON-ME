// All offsets use the device's monotonic clock. Server timestamps stay on the server.
export interface AiSearchTiming {
  submit_ms: number;
  signal_ms: number | null;
  fetch_start_ms: number;
  fetch_end_ms: number;
  display_ms: number;
}

export function startSearchTiming(start = performance.now()) {
  let jobId: string | undefined;
  let submitted = 0;
  let terminalRead: { start: number; end: number } | undefined;
  const offset = (time: number) => Math.round(time - start);
  return {
    accepted(id: string, time = performance.now()) {
      jobId = id;
      submitted = offset(time);
    },
    terminal(id: string, requestStart: number, time = performance.now()) {
      if (id === jobId && !terminalRead) terminalRead = { start: offset(requestStart), end: offset(time) };
    },
    displayed(id: string, signalAt?: number, time = performance.now()): AiSearchTiming | null {
      if (id !== jobId || !terminalRead) return null;
      const sample = {
        submit_ms: submitted,
        signal_ms: signalAt !== undefined && signalAt >= start && signalAt <= time ? offset(signalAt) : null,
        fetch_start_ms: terminalRead.start, fetch_end_ms: terminalRead.end, display_ms: offset(time),
      };
      jobId = undefined;
      return sample;
    },
  };
}
