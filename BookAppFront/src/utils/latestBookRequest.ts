export function createLatestBookRequest() {
  let version = 0;
  let controller: AbortController | null = null;
  return {
    begin() {
      controller?.abort();
      const currentVersion = ++version;
      const current = new AbortController();
      controller = current;
      return {
        signal: current.signal,
        isCurrent: () => currentVersion === version && !current.signal.aborted,
      };
    },
    cancel() {
      version++;
      controller?.abort();
      controller = null;
    },
  };
}
