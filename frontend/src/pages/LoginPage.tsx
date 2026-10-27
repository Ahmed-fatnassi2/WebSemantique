import { AlertTriangle, LogIn } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordInput } from "../components/auth/PasswordInput";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useBackend } from "../context/BackendContext";
import { parseError } from "../utils/errors";

/** Page to return to after signing in (set by RequireAuth). */
export function nextPath(state: unknown): string {
  const from = (state as { from?: string } | null)?.from;
  return from && from.startsWith("/") && !from.startsWith("/login") && !from.startsWith("/signup") ? from : "/";
}

export default function LoginPage() {
  const { status, login } = useAuth();
  const { status: backendStatus } = useBackend();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === "signed-in") return <Navigate to={nextPath(location.state)} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(nextPath(location.state), { replace: true });
    } catch (err) {
      setError(parseError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Connexion"
      subtitle="Connectez-vous pour gérer le réseau et interroger l'ontologie."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link to="/signup" state={location.state}>
            Créer un compte
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
        <label className="field">
          <span className="field-label">Adresse e-mail</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">Mot de passe</span>
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <Button
          type="submit"
          icon={<LogIn size={16} />}
          loading={loading}
          disabled={!email.trim() || !password || backendStatus === "offline"}
          className="auth-submit"
        >
          Se connecter
        </Button>
      </form>
    </AuthLayout>
  );
}
