// A hedged call over a list of models (Sept 27 2026). The planner has to answer
// inside the student's turn, and the free tier's small models answer in about
// 1-2 s but now and then take over 3 s. Asked one after another, a slow first
// model used the whole deadline: in one run half the turns got no order
// (n4-on, p50 3.0 s). Here the first model is asked; if it has not answered
// usably after `hedgeMs`, or fails first, the next one is asked too, and the
// first usable answer wins. The others are cancelled.

export type HedgeOptions = { hedgeMs: number; deadlineMs: number };

export function hedged<T>(
  models: string[],
  call: (model: string, signal: AbortSignal) => Promise<T | null>,
  opts: HedgeOptions,
): Promise<{ value: T; model: string } | null> {
  return new Promise((resolve) => {
    const controllers: AbortController[] = [];
    let next = 0;
    let running = 0;
    let done = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: { value: T; model: string } | null) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadline);
      for (const c of controllers) c.abort();
      resolve(result);
    };
    const deadline = setTimeout(() => finish(null), opts.deadlineMs);
    const launch = () => {
      if (done || next >= models.length) return;
      const model = models[next++];
      const controller = new AbortController();
      controllers.push(controller);
      running++;
      clearTimeout(hedgeTimer);
      if (next < models.length) hedgeTimer = setTimeout(launch, opts.hedgeMs);
      call(model, controller.signal)
        .then((v) => v, () => null)
        .then((v) => {
          running--;
          if (done) return;
          if (v != null) {
            controllers.splice(controllers.indexOf(controller), 1);
            return finish({ value: v, model });
          }
          // A failure hands over at once rather than waiting for the hedge.
          if (next < models.length) launch();
          else if (running === 0) finish(null);
        });
    };
    if (!models.length) finish(null);
    else launch();
  });
}
