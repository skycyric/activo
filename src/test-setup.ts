import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Automatically unmount and clean up after each component test
afterEach(cleanup);
