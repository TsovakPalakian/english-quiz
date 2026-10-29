(() => {
  class QuizTelemetryTracker {
    constructor() {
      this.current = null;
      this.activeFocusMs = 0;
      this.lastFocusStart = 0;
      this.isFocused = true;
      this.firstInteractionMs = null;
      this.distractors = [];
      this.boundVisibility = null;
      this.boundInteraction = null;
    }

    start(item) {
      this.current = item;
      this.activeFocusMs = 0;
      this.firstInteractionMs = null;
      this.distractors = [];
      this.isFocused = typeof document !== 'undefined' ? !document.hidden : true;
      this.lastFocusStart = Date.now();

      if (item) {
        item.shownAt = this.lastFocusStart;
        item.distractorsClicked = this.distractors;
      }

      if (typeof document !== 'undefined') {
        this.boundVisibility = () => {
          const now = Date.now();
          if (document.hidden) {
            if (this.isFocused) {
              this.activeFocusMs += Math.max(0, now - this.lastFocusStart);
              this.isFocused = false;
            }
          } else {
            if (!this.isFocused) {
              this.lastFocusStart = now;
              this.isFocused = true;
            }
          }
        };
        document.addEventListener('visibilitychange', this.boundVisibility);

        this.boundInteraction = () => {
          if (this.firstInteractionMs == null && this.current) {
            const now = Date.now();
            this.firstInteractionMs = Math.max(1, now - (this.current.shownAt || now));
            this.current.firstInteractionMs = this.firstInteractionMs;
          }
        };
        window.addEventListener('keydown', this.boundInteraction, { once: true, capture: true });
        window.addEventListener('pointerdown', this.boundInteraction, { once: true, capture: true });
      }
    }

    noteDistractor(text) {
      if (text) this.distractors.push(String(text));
    }

    stop(ok = false) {
      const now = Date.now();
      if (this.isFocused) {
        this.activeFocusMs += Math.max(0, now - this.lastFocusStart);
      }

      if (typeof document !== 'undefined') {
        if (this.boundVisibility) document.removeEventListener('visibilitychange', this.boundVisibility);
        if (this.boundInteraction) {
          window.removeEventListener('keydown', this.boundInteraction, { capture: true });
          window.removeEventListener('pointerdown', this.boundInteraction, { capture: true });
        }
      }

      const rawLatencyMs = this.current?.shownAt ? Math.max(1, now - this.current.shownAt) : this.activeFocusMs;
      const isAfk = this.activeFocusMs >= 60000;
      const effectiveLatencyMs = isAfk ? 60000 : Math.max(100, Math.min(this.activeFocusMs || rawLatencyMs, 60000));

      const result = {
        rawLatencyMs,
        activeFocusMs: this.activeFocusMs,
        effectiveLatencyMs,
        firstInteractionMs: this.firstInteractionMs,
        distractorsClicked: this.distractors.slice(),
        isAfk,
        rapidGuessing: !ok && effectiveLatencyMs < 800
      };

      if (this.current) {
        this.current.latencyMs = effectiveLatencyMs;
        this.current.telemetry = result;
      }

      this.current = null;
      return result;
    }
  }

  window.QuizTelemetryTracker = new QuizTelemetryTracker();
})();
