// QA only: drain the real response while the response event still owns its body.
export async function qaBrowserJsonSnapshot(response) {
  const status = response.status();
  const body = await response.json();
  return {status,body};
}
