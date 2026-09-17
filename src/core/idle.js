export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function paced(jobs) {
  for (const job of jobs) {
    await nextFrame();
    try {
      await job();
    } catch {}
  }
}
