import { AlertTriangle, Check, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/auth/AuthLayout";
import { PasswordInput } from "../components/auth/PasswordInput";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useBackend } from "../context/BackendContext";
import { useToast } from "../context/ToastContext";
import { parseError } from "../utils/errors";
import { nextPath } from "./LoginPage";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Same rules as the backend, checked while typing. */
function validate(nom: string, email: string, password: string, confirm: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (nom.trim().length < 2) errors.nom = "Le nom doit contenir au moins 2 caractères.";
  if (!EMAIL_RE.test(email.trim())) errors.email = "Adresse e-mail invalide.";
  if (password.length < 8) errors.password = "Au moins 8 caractères.";
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = "Au moins une lettre et un chiffre.";
  if (confirm !== password) errors.confirm = "Les mots de passe ne correspondent pas.";
  return errors;
}

export default function SignupPage() {
  const { status, signup } = useAuth();
  const { status: backendStatus } = useBackend();
  const { notify } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === "signed-in") return <Navigate to={nextPath(location.state)} replace />;

  const errors = { ...validate(nom, email, password, confirm), ...serverErrors };
  const show = (field: string) => (touched ? errors[field] : undefined);
  const rules = [
    { ok: password.length >= 8, label: "8 caractères minimum" },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: "une lettre et un chiffre" },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (Object.keys(validate(nom, email, password, confirm)).length > 0) return;
    setLoading(true);
    try {
      await signup(nom, email, password);
      notify(`Bienvenue, ${nom.trim()} ! Votre compte est créé.`);
      navigate(nextPath(location.state), { replace: true });
    } catch (err) {
      const info = parseError(err);
      setServerErrors(info.fieldErrors);
      setError(info.message);
    } finally {
      setLoading(false);
    }
  };

  // A server error on a field disappears as soon as the field is edited.
  const edit = (field: string, setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    if (serverErrors[field]) setServerErrors(({ [field]: _, ...rest }) => rest);
  };

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Un compte permet d'accéder à l'application et de modifier l'ontologie."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link to="/login" state={location.state}>
            Se connecter
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
          <span className="field-label">Nom complet</span>
          <input
            className={`input ${show("nom") ? "input-error" : ""}`}
            autoComplete="name"
            value={nom}
            onChange={edit("nom", setNom)}
            placeholder="Ex. Ahmed Ben Ali"
            maxLength={60}
            autoFocus
          />
          {show("nom") && <span className="field-error">{show("nom")}</span>}
        </label>
        <label className="field">
          <span className="field-label">Adresse e-mail</span>
          <input
            className={`input ${show("email") ? "input-error" : ""}`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={edit("email", setEmail)}
            placeholder="vous@exemple.com"
          />
          {show("email") && <span className="field-error">{show("email")}</span>}
        </label>
        <label className="field">
          <span className="field-label">Mot de passe</span>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={edit("password", setPassword)}
            className={show("password") ? "input-error" : ""}
          />
          <ul className="password-rules">
            {rules.map((r) => (
              <li key={r.label} className={r.ok ? "ok" : ""}>
                <Check size={13} />
                {r.label}
              </li>
            ))}
          </ul>
          {show("password") && <span className="field-error">{show("password")}</span>}
        </label>
        <label className="field">
          <span className="field-label">Confirmer le mot de passe</span>
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={edit("confirm", setConfirm)}
            className={show("confirm") ? "input-error" : ""}
          />
          {show("confirm") && <span className="field-error">{show("confirm")}</span>}
        </label>
        <Button
          type="submit"
          icon={<UserPlus size={16} />}
          loading={loading}
          disabled={backendStatus === "offline"}
          className="auth-submit"
        >
          Créer mon compte
        </Button>
      </form>
    </AuthLayout>
  );
}
