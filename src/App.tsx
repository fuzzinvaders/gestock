import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { AjoutPage } from './features/ajout/AjoutPage'
import { AlertesPage } from './features/alertes/AlertesPage'
import { LoginScreen } from './features/auth/LoginScreen'
import { SetupScreen } from './features/auth/SetupScreen'
import { ComptePage } from './features/compte/ComptePage'
import { InventairePage } from './features/inventaire/InventairePage'
import { ReservesPage } from './features/lieux/ReservesPage'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { InventaireProvider } from './hooks/useInventaire'

function AppRoutes() {
  const { user, loading, needsSetup } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Chargement…</div>
    )
  }

  if (needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<SetupScreen />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    )
  }

  return (
    <InventaireProvider>
      <NavBar />
      {/* La barre de navigation est posée en bas sur téléphone : la marge basse
          rend au contenu la place qu'elle lui prend, encoche comprise. */}
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-8">
        <Routes>
          <Route path="/inventaire" element={<InventairePage />} />
          <Route path="/ajouter" element={<AjoutPage />} />
          <Route path="/alertes" element={<AlertesPage />} />
          <Route path="/reserves" element={<ReservesPage />} />
          <Route path="/compte" element={<ComptePage />} />
          <Route path="*" element={<Navigate to="/inventaire" replace />} />
        </Routes>
      </main>
    </InventaireProvider>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  )
}

export default App
