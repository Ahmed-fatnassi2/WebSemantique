import axios from "axios";
import { DemoModeError } from "../services/api";

export interface ApiErrorInfo {
  message: string;
  status?: number;
  code?: string;
  fieldErrors: Record<string, string>;
  network: boolean;
}

/** Normalise any thrown value (Axios, FastAPI, demo mode) into a French message. */
export function parseError(err: unknown): ApiErrorInfo {
  if (err instanceof DemoModeError) {
    return { message: err.message, fieldErrors: {}, network: false, code: "DEMO_MODE" };
  }
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      const timeout = err.code === "ECONNABORTED";
      return {
        message: timeout
          ? "Le backend n'a pas répondu à temps."
          : "Impossible de joindre le backend. Vérifiez qu'il est démarré.",
        fieldErrors: {},
        network: true,
      };
    }
    const data = err.response.data as Record<string, unknown> | undefined;
    let message = `Erreur ${err.response.status}`;
    let fieldErrors: Record<string, string> = {};
    const detail = data?.detail;
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail)) {
      // FastAPI / pydantic validation errors
      message = "Requête invalide";
      for (const d of detail as { loc?: unknown[]; msg?: string }[]) {
        const field = String(d.loc?.[d.loc.length - 1] ?? "requete");
        fieldErrors[field] = d.msg ?? "invalide";
      }
    }
    if (data?.errors && typeof data.errors === "object") {
      fieldErrors = { ...fieldErrors, ...(data.errors as Record<string, string>) };
    }
    return {
      message,
      status: err.response.status,
      code: typeof data?.code === "string" ? data.code : undefined,
      fieldErrors,
      network: false,
    };
  }
  if (err instanceof Error) return { message: err.message, fieldErrors: {}, network: false };
  return { message: "Erreur inconnue", fieldErrors: {}, network: false };
}

export function errorMessage(err: unknown): string {
  return parseError(err).message;
}
