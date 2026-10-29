export function insertPastedText(current: string, pasted: string, start: number, end: number) {
  return { text: current.slice(0, start) + pasted + current.slice(end), caret: start + pasted.length };
}

/** Older requests cannot write a result after edit, clear or a newer translation. */
export class WorkspaceRequestGate {
  private active?: AbortController;
  begin() {
    this.cancel();
    this.active = new AbortController();
    return this.active;
  }
  cancel() { this.active?.abort(); this.active = undefined; }
  isCurrent(request: AbortController) { return this.active === request && !request.signal.aborted; }
}
