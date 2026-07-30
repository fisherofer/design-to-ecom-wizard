/**
 * apiPreflight.functions — thin server-function wrapper around runPreflight().
 * Module scope holds only imports, type re-exports and the server fn.
 */
import { createServerFn } from "@tanstack/react-start";
import { runPreflight } from "./apiPreflight.server";

export type {
  EndpointCheck,
  PreflightProvider,
  PreflightReport,
  PreflightStatus,
} from "./apiPreflight.server";

export const preflightApis = createServerFn({ method: "GET" }).handler(async () => runPreflight());
