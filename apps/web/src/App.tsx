import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./lib/auth"
import OwnerLogin from "./pages/owner/OwnerLogin"
import OwnerDashboard from "./pages/owner/OwnerDashboard"
import SuperAdminLogin from "./pages/superadmin/SuperAdminLogin"
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard"
import SocietyDetailLayout from "./pages/superadmin/SocietyDetailLayout"
import SocietyFlats from "./pages/superadmin/SocietyFlats"
import SocietyMembers from "./pages/superadmin/SocietyMembers"

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Owner routes */}
          <Route path="/owner" element={<OwnerLogin />} />
          <Route path="/owner/dashboard" element={<OwnerDashboard />} />

          {/* Super admin routes */}
          <Route path="/:slug" element={<SuperAdminLogin />} />
          <Route path="/:slug/dashboard" element={<SuperAdminDashboard />} />

          {/* Society detail with nested tabs */}
          <Route
            path="/:slug/societies/:societySlug"
            element={<SocietyDetailLayout />}
          >
            <Route index element={<SocietyFlats />} />
            <Route path="members" element={<SocietyMembers />} />
          </Route>

          <Route path="/" element={<Navigate to="/owner" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
