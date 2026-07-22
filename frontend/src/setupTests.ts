import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest is not configured with globals: true, so Testing Library's automatic
// afterEach(cleanup) never registers. Unmount rendered trees between tests so
// repeated renders in one file don't accumulate (duplicate ids/roles).
afterEach(() => {
  cleanup();
});
