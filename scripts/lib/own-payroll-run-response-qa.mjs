// QA observation only. Read the response while its document is still current,
// and retain failures from either the browser action or the original body read.
export async function observeOwnRunJsonResponse(page, predicate, action) {
  const observed = page.waitForResponse(predicate).then(async response => ({
    status: response.status(),
    body: await response.json(),
  }));
  const [snapshot] = await Promise.all([
    observed,
    Promise.resolve().then(action),
  ]);
  return snapshot;
}
