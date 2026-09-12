import { LinkTarget, PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { EventBus } from "pdfjs-dist/web/pdf_viewer.mjs";

/**
 * Relax Note's link service, built on the official PDF.js `PDFLinkService`.
 *
 * The only difference from stock behavior: external links are tagged with
 * `data-external-link` so the viewer can intercept the click and hand the URL
 * to the Tauri opener instead of letting the webview navigate away. Internal
 * destination navigation, named actions and hash handling are all official.
 */
export class RelaxLinkService extends PDFLinkService {
  constructor(options: { eventBus: EventBus }) {
    super({ ...options, externalLinkTarget: LinkTarget.NONE });
  }

  override addLinkAttributes(
    link: HTMLAnchorElement,
    url: string,
    newWindow = false,
  ): void {
    super.addLinkAttributes(link, url, newWindow);
    if (this.externalLinkEnabled) {
      link.dataset.externalLink = "true";
    }
  }
}
