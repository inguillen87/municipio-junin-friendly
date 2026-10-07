// Only for owned, disposable loopback test servers, after closing the browser.
// server.close alone can wait forever for an unfinished test HTTP response.
export async function closeQaHttpServer(server) {
  if(!server) return;
  await new Promise((resolve,reject)=>{
    server.close(error=>error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
    server.closeAllConnections();
  });
}
