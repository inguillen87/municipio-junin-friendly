import {
  PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES,
  PAYROLL_MONTHLY_GRH_SUMMARY_MAX_PAGES,
  PayrollMonthlyGrhSummaryError,
  pdfMetadataCollectionHasEntries,
  prepareMonthlyGrhSummary,
} from './monthly-close-grh-summary-adapter.js';

const KINDS = Object.freeze(['42', '55', 'general']);
const MAX_EXTRACTED_ITEMS = 12000;

function workerFail(code, message) {
  throw new PayrollMonthlyGrhSummaryError(code, message);
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function assertPdfBytes(bytes) {
  if (bytes.byteLength <= 0 || bytes.byteLength > PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES) {
    workerFail('GRH_SUMMARY_SIZE_INVALID', 'Un PDF está vacío o supera el máximo local de 512 KiB');
  }
  const signature = String.fromCharCode(...bytes.subarray(0, 5));
  if (signature !== '%PDF-') {
    workerFail('GRH_SUMMARY_PDF_INVALID', 'Una fuente no contiene la firma de un PDF');
  }
}

async function assertNoJavaScript(target, message) {
  if (typeof target?.getJSActions !== 'function') {
    workerFail(
      'GRH_SUMMARY_READER_CONTRACT_INVALID',
      'El lector local no permite comprobar las acciones JavaScript del PDF',
    );
  }
  if (pdfMetadataCollectionHasEntries(await target.getJSActions())) {
    workerFail('GRH_SUMMARY_PDF_SCRIPT_BLOCKED', message);
  }
}

async function loadPdfReader() {
  try {
    const pdfjs = await import('./vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      './vendor/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
    return pdfjs;
  } catch {
    workerFail('GRH_SUMMARY_READER_UNAVAILABLE', 'El lector local de PDF no está disponible');
  }
}

async function extractReport(source, pdfjs) {
  if (!source || typeof source !== 'object' || Array.isArray(source)
      || Object.keys(source).length !== 2
      || !Object.hasOwn(source, 'expectedKind')
      || !Object.hasOwn(source, 'arrayBuffer')
      || !KINDS.includes(source.expectedKind)
      || !(source.arrayBuffer instanceof ArrayBuffer)) {
    workerFail('GRH_SUMMARY_WORKER_INPUT_INVALID', 'El procesador recibió una fuente incompleta');
  }
  const bytes = new Uint8Array(source.arrayBuffer);
  assertPdfBytes(bytes);
  const byteLength = bytes.byteLength;
  let loadingTask;
  let documentProxy;
  try {
    const contentSha256 = await sha256(bytes);
    loadingTask = pdfjs.getDocument({
      data: bytes,
      disableAutoFetch: true,
      disableFontFace: true,
      disableRange: true,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    });
    documentProxy = await loadingTask.promise;
    if (!Number.isInteger(documentProxy.numPages) || documentProxy.numPages < 1
        || documentProxy.numPages > PAYROLL_MONTHLY_GRH_SUMMARY_MAX_PAGES) {
      workerFail('GRH_SUMMARY_PAGE_COUNT_INVALID', 'El PDF no tiene una cantidad de páginas admitida');
    }
    if (typeof documentProxy.getAttachments !== 'function') {
      workerFail(
        'GRH_SUMMARY_READER_CONTRACT_INVALID',
        'El lector local no permite comprobar los adjuntos del PDF',
      );
    }
    const attachments = await documentProxy.getAttachments();
    if (pdfMetadataCollectionHasEntries(attachments)) {
      workerFail('GRH_SUMMARY_PDF_ATTACHMENT_BLOCKED', 'Los PDF con adjuntos no están admitidos');
    }
    await assertNoJavaScript(documentProxy, 'Los PDF con JavaScript no están admitidos');
    let extractedItemCount = 0;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      await assertNoJavaScript(
        page,
        'Los PDF con acciones JavaScript en una página no están admitidos',
      );
      if (typeof page.getAnnotations !== 'function'
          || !pdfjs.AnnotationType
          || !Number.isInteger(pdfjs.AnnotationType.FILEATTACHMENT)) {
        workerFail(
          'GRH_SUMMARY_READER_CONTRACT_INVALID',
          'El lector local no permite comprobar los adjuntos de una página',
        );
      }
      const annotations = await page.getAnnotations({ intent: 'display' });
      if (!Array.isArray(annotations)) {
        workerFail(
          'GRH_SUMMARY_READER_CONTRACT_INVALID',
          'El lector local devolvió anotaciones fuera del contrato esperado',
        );
      }
      if (annotations.some((annotation) => (
        annotation?.subtype === 'FileAttachment'
        || annotation?.annotationType === pdfjs.AnnotationType.FILEATTACHMENT
      ))) {
        workerFail(
          'GRH_SUMMARY_PDF_ATTACHMENT_BLOCKED',
          'Los PDF con archivos adjuntos en una página no están admitidos',
        );
      }
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent({ disableNormalization: false });
      const items = [];
      for (const item of content.items) {
        if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
        const text = item.str.trim();
        if (!text) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          workerFail('GRH_SUMMARY_TEXT_ITEM_INVALID', 'El PDF contiene coordenadas de texto inválidas');
        }
        items.push({ text, x, y });
        extractedItemCount += 1;
        if (extractedItemCount > MAX_EXTRACTED_ITEMS) {
          workerFail('GRH_SUMMARY_TEXT_LIMIT_EXCEEDED', 'Los PDF superan el límite de texto local');
        }
      }
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        items,
      });
      page.cleanup();
    }
    return {
      expectedKind: source.expectedKind,
      byteLength,
      sha256: contentSha256,
      pages,
    };
  } catch (error) {
    if (error instanceof PayrollMonthlyGrhSummaryError) throw error;
    workerFail('GRH_SUMMARY_PDF_INVALID', 'Un PDF no puede leerse con el formato local esperado');
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // Best-effort cleanup after a rejected local document.
      }
    }
    if (bytes.byteLength > 0) bytes.fill(0);
    documentProxy = null;
  }
}

self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'prepare' || typeof event.data.period !== 'string'
      || !Array.isArray(event.data.reports) || event.data.reports.length !== 3) {
    self.postMessage({
      ok: false,
      code: 'GRH_SUMMARY_WORKER_INPUT_INVALID',
      message: 'El procesador exige período y exactamente tres PDF',
    });
    return;
  }
  try {
    const pdfjs = await loadPdfReader();
    const reports = [];
    for (const source of event.data.reports) {
      reports.push(await extractReport(source, pdfjs));
    }
    const summary = prepareMonthlyGrhSummary({ period: event.data.period, reports });
    self.postMessage({ ok: true, summary });
  } catch (error) {
    self.postMessage({
      ok: false,
      code: error instanceof PayrollMonthlyGrhSummaryError
        ? error.code : 'GRH_SUMMARY_WORKER_FAILED',
      message: error instanceof PayrollMonthlyGrhSummaryError
        ? error.message : 'No se pudieron validar los tres PDF',
    });
  }
}, { once: true });
