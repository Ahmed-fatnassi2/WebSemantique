import { Compass } from "lucide-react";
import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { EmptyState, Loader } from "./components/ui/States";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { BackendProvider, useBackend } from "./context/BackendContext";
import { ToastProvider } from "./context/ToastContext";

// Each page is its own chunk (React Flow and Recharts load only where used).
const BuildingsPage = lazy(() => import("./pages/BuildingsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const EnergySourcesPage = lazy(() => import("./pages/EnergySourcesPage"));
const GridExplorerPage = lazy(() => import("./pages/GridExplorerPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MobilityPage = lazy(() => import("./pages/MobilityPage"));
const RegulationsPage = lazy(() => import("./pages/RegulationsPage"));
const SmartSystemsPage = lazy(() => import("./pages/SmartSystemsPage"));
const WeatherPage = lazy(() => import("./pages/WeatherPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const NlpAssistantPage = lazy(() => import("./pages/NlpAssistantPage"));
const OntologyExplorerPage = lazy(() => import("./pages/OntologyExplorerPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SparqlConsolePage = lazy(() => import("./pages/SparqlConsolePage"));
const StoragePage = lazy(() => import("./pages/StoragePage"));
const TransmissionLinesPage = lazy(() => import("./pages/TransmissionLinesPage"));

function NotFound() {
  return (
    <div className="page">
      <EmptyState
        icon={<Compass size={22} />}
        title="Page introuvable"
        message="Cette adresse ne correspond à aucune page."
        action={
          <Link className="btn btn-primary btn-md" to="/">
            Retour au tableau de bord
          </Link>
        }
      />
    </div>
  );
}

/** Pages of the app need a signed-in user (except in demo mode, where nothing is real or editable). */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status: auth } = useAuth();
  const { demo, lastChecked } = useBackend();
  const location = useLocation();
  if (!lastChecked || auth === "checking") return <Loader label="Connexion…" />;
  if (demo) return <>{children}</>;
  if (auth !== "signed-in") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <BackendProvider>
          <AuthProvider>
          <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="sources" element={<EnergySourcesPage />} />
              <Route path="storage" element={<StoragePage />} />
              <Route path="buildings" element={<BuildingsPage />} />
              <Route path="lines" element={<TransmissionLinesPage />} />
              <Route path="mobility" element={<MobilityPage />} />
              <Route path="systems" element={<SmartSystemsPage />} />
              <Route path="weather" element={<WeatherPage />} />
              <Route path="regulations" element={<RegulationsPage />} />
              <Route path="grid" element={<GridExplorerPage />} />
              <Route path="ontology" element={<OntologyExplorerPage />} />
              <Route path="sparql" element={<SparqlConsolePage />} />
              <Route path="assistant" element={<NlpAssistantPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </Suspense>
          </AuthProvider>
        </BackendProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
