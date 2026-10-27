import type { AuthResponse, User } from "../types";
import { api } from "./api";

/** Sign up, sign in and current user (the backend signs the session token). */
export const authService = {
  async signup(nom: string, email: string, password: string): Promise<AuthResponse> {
    return (await api.post<AuthResponse>("/auth/signup", { nom, email, password })).data;
  },
  async login(email: string, password: string): Promise<AuthResponse> {
    return (await api.post<AuthResponse>("/auth/login", { email, password })).data;
  },
  async me(): Promise<User> {
    return (await api.get<User>("/auth/me")).data;
  },
};
