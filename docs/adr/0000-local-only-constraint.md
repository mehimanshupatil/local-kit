# All processing must run locally; no server-side operations ever

LocalKit's single hard constraint: every file operation runs in the user's browser. No file is ever uploaded to a server. No external API processes user data. This is non-negotiable regardless of the tool, accuracy trade-off, or bundle size cost.

Any new tool or feature is acceptable as long as it respects this constraint. There is no restriction on tool categories or scope — the only question is whether it can be implemented entirely client-side.

Features that cannot meet this constraint (e.g. server-side video transcoding, cloud OCR APIs, AI APIs that require file upload) are out of scope permanently.
