# Broaden scope from "file utilities" to "client-side computation"

LocalKit was originally scoped as file-processing utilities only. Adding an EMI Calculator (and future pure-computation tools like unit/percentage converters) required relaxing the hard constraint from "processes files locally" to "runs entirely client-side" — since these tools take numbers in and produce numbers out, with no file at any stage.

In practice two tools (`epoch-converter`, `color-converter`) already violated the old file-only constraint as silent exceptions. This ADR makes the broader scope explicit rather than leaving it as an unstated exception, and updates the public tagline ("browser-based file utilities" → "browser-based utilities") to match.

The privacy/no-server/no-telemetry constraint is unchanged and remains permanent — only the "must touch a file" restriction is lifted.

New computation-only tools are sorted by **audience**, not by file-vs-computation: developer-audience tools stay in `dev`; general-audience tools (EMI calculator, future converters) go in the new `calculators` category.
