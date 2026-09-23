const pending = new Set();

export function registerSource(source) {
  pending.add(source);
}

export function takePendingSources(budgetBytes) {
  const out = [];
  let spent = 0;
  for (const source of pending) {
    if (spent > 0 && spent + bytesOf(source) > budgetBytes) break;
    pending.delete(source);
    if (source.destroyed || !source.resource) continue;
    out.push(source);
    spent += bytesOf(source);
  }
  return out;
}

export function pendingSourceCount() {
  return pending.size;
}

function bytesOf(source) {
  return (source.pixelWidth || 0) * (source.pixelHeight || 0) * 4;
}
