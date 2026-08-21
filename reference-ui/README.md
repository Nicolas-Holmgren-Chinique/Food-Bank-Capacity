# reference implementation, replaced by CareSpace UI

Everything in this folder is **disposable**. It exists as:

1. Our own test harness for `src/engine/` — every screen here is a thin renderer over `engine.getState()` that calls engine methods on user input, so exercising this UI is really exercising the engine.
2. A demo fallback (works fully offline via `VITE_VISION_BACKEND=demo`, or via the automatic camera→demo-image fallback in `captureController.js`) for showing the scan flow without a real CareSpace frontend to mount into.

None of the styling, routing, screen structure, or navigation here is meant to survive integration. The real CareSpace frontend owns its own Scan/Analyze/Allocate layout, its own teal design language, and its own camera UI — it drives `src/engine/` through `createScanEngine()`/`useScanEngine()` instead. See [`docs/INTEGRATION.md`](../docs/INTEGRATION.md).

This folder contains zero business logic. If you find a capacity/volume/box/aggregation calculation in here, that's a bug — it belongs in `src/engine/` instead. `npm run check:boundary` only checks the reverse direction (engine never imports this folder), so please keep this direction honest by hand.
