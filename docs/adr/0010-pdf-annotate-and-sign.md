# Two separate PDF annotation and signing tools

## Annotate PDF
Lets users draw, insert images, and add text boxes on any PDF page. Target use case: adding a signature image, stamping, filling non-AcroForm fields.

## Sign PDF
Odoo-Sign-style tool: user creates a signature (draw on canvas, type in cursive font, or upload PNG), then click-to-place it on any page with drag and resize handles.

## Shared architecture
Both tools use the same pattern:
1. `pdfjs-dist` renders the current page to a canvas (read-only base image)
2. A Konva stage overlays the rendered page — all drawing/placement happens here
3. On export: Konva exports just the annotation layer as a transparent PNG
4. `@cantoo/pdf-lib` opens the original PDF, embeds the PNG as an image overlay on the annotated page(s), saves

This preserves original PDF content (text remains selectable, fonts intact). It is the industry standard used by DocuSign, HelloSign, and Adobe Sign for browser-based signing.

## Key decisions
- **Two tools not one** — distinct mental models: "mark up this document" vs "sign this contract"
- **Annotation primitives**: freehand pen + image insert + text boxes. Shapes/arrows excluded — rarely needed for signing workflows
- **Signature creation**: draw (canvas pad) + type (rendered in cursive font to canvas) + upload image. All three for accessibility (no touchscreen, pre-scanned sigs)
- **Placement**: click-to-place + drag to reposition + resize handles. Rejected fixed zones (imprecise) and two-step field workflow (too complex)
- **One page at a time**: prev/next navigation. Rejected render-all-pages (too expensive for large PDFs)
- **Raster overlay not full rasterisation**: only the annotation layer is rasterised; the original PDF page remains as vector content
