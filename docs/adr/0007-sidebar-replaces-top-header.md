# Replace top header with a fixed left sidebar

The sticky top header with category dropdowns doesn't match the dev-tool aesthetic and forces two interactions to reach a specific tool (open dropdown → click). A persistent left sidebar puts the full navigation one click away and reinforces the category-scoped file session — users see their current context at all times.

Decisions:
- **220px fixed sidebar**, not collapsible. Content area at ~740px is sufficient for all tools.
- **Accordion navigation** — active category expanded, others collapsed. 35 tools listed flat would be a wall; accordion keeps the sidebar scannable.
- **Desktop: sidebar only**, no top bar. Mobile: minimal `h-12` top bar (logo + hamburger) opens the sidebar as an overlay drawer.
- Header component removed entirely on desktop.

## Considered Options

- **Keep top header** — familiar, zero horizontal cost, but dropdowns are a second interaction and don't reinforce the session model
- **Icon rail + flyout** — minimal space use, but two interactions to reach a tool; rejected for the same reason as dropdowns
- **Collapsible sidebar** — adds complexity; tool content area is adequate without collapsing
- **Bottom tab bar on mobile** — loses the tool list; rejected in favour of drawer which shows full nav
