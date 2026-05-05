import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./lib/auth"
import OwnerLogin from "./pages/owner/OwnerLogin"
import OwnerDashboard from "./pages/owner/OwnerDashboard"
import SuperAdminLogin from "./pages/superadmin/SuperAdminLogin"
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard"
import SocietyDetailLayout from "./pages/superadmin/SocietyDetailLayout"
import SocietyFlats from "./pages/superadmin/SocietyFlats"
import SocietyMembers from "./pages/superadmin/SocietyMembers"
import SocietyAdminLogin from "./pages/society-admin/SocietyAdminLogin"
import SocietyAdminLayout from "./pages/society-admin/SocietyAdminLayout"
import AdminFlats from "./pages/society-admin/AdminFlats"
import AdminMembers from "./pages/society-admin/AdminMembers"
import AdminMaintenance from "./pages/society-admin/AdminMaintenance"

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

          {/* Super admin's society detail (read-only management) */}
          <Route
            path="/:slug/societies/:societySlug"
            element={<SocietyDetailLayout />}
          >
            <Route index element={<SocietyFlats />} />
            <Route path="members" element={<SocietyMembers />} />
          </Route>

          {/* Committee admin (chairman/secretary/cashier/committee) */}
          <Route
            path="/:slug/societies/:societySlug/admin"
            element={<SocietyAdminLogin />}
          />
          <Route
            path="/:slug/societies/:societySlug/admin/dashboard"
            element={<SocietyAdminLayout />}
          >
            <Route index element={<AdminFlats />} />
            <Route path="members" element={<AdminMembers />} />
            <Route path="maintenance" element={<AdminMaintenance />} />
          </Route>

          <Route path="/" element={<Navigate to="/owner" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
