# Passport Photo tool: crop + optional background removal + static face guide

Passport photo tools need three things: correct output dimensions (size × DPI), visual guidance for face positioning, and a plain background. All three can be done entirely in the browser.

Decisions:
- **Country standards**: ICAO, USA, India, UK, Canada, China. Each stores width/height in mm and face-height range as % of photo height per their spec. DPI is user-selectable (150/300/600); output pixel size = `mm / 25.4 × DPI`.
- **Face guide**: static oval + horizontal eye-line drawn as an SVG overlay on the crop preview. No face detection — works in all browsers, no ML overhead, and the "fit your face in the oval" metaphor is universally understood.
- **Background**: optional. Background removal (`@imgly/background-removal`) replaces the background with white. Made optional because the model is slow (~5–30s, ~50MB download) and some photos already have a plain background.
- **Crop**: `react-image-crop` with aspect ratio locked to the selected standard. Canvas renders at full resolution with the exact pixel dimensions.
