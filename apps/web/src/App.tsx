import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./lib/auth"
import OwnerLogin from "./pages/owner/OwnerLogin"
import OwnerDashboard from "./pages/owner/OwnerDashboard"
import SuperAdminLogin from "./pages/superadmin/SuperAdminLogin"
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard"
import SocietyDetailLayout from "./pages/superadmin/SocietyDetailLayout"
import SocietyFlats from "./pages/superadmin/SocietyFlats"
import SocietyMembers from "./pages/superadmin/SocietyMembers"

// Unified society login (committee + members share one URL)
import SocietyAdminLogin from "./pages/society-admin/SocietyAdminLogin"

// Committee admin (chairman / secretary / cashier / committee)
import SocietyAdminLayout from "./pages/society-admin/SocietyAdminLayout"
import AdminFlats from "./pages/society-admin/AdminFlats"
import AdminMembers from "./pages/society-admin/AdminMembers"
import AdminMaintenance from "./pages/society-admin/AdminMaintenance"

// Regular member portal
import MemberLayout from "./pages/society-member/MemberLayout"
import MemberDues from "./pages/society-member/MemberDues"
import MemberMyFlat from "./pages/society-member/MemberMyFlat"
import MemberPayments from "./pages/society-member/MemberPayments"

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ── Owner routes ─────────────────────────────────── */}
          <Route path="/owner" element={<OwnerLogin />} />
          <Route path="/owner/dashboard" element={<OwnerDashboard />} />

          {/* ── Super admin routes ───────────────────────────── */}
          <Route path="/:slug" element={<SuperAdminLogin />} />
          <Route path="/:slug/dashboard" element={<SuperAdminDashboard />} />

          {/* Super admin's read-only society detail */}
          <Route
            path="/:slug/societies/:societySlug"
            element={<SocietyDetailLayout />}
          >
            <Route index element={<SocietyFlats />} />
            <Route path="members" element={<SocietyMembers />} />
          </Route>

          {/* ── Society unified login ────────────────────────── */}
          {/*
            Single URL for all society users.
            After OTP verify → committee goes to /admin/dashboard
                             → members go to /dashboard
          */}
          <Route
            path="/:slug/societies/:societySlug/login"
            element={<SocietyAdminLogin />}
          />

          {/* ── Committee admin portal ───────────────────────── */}
          <Route
            path="/:slug/societies/:societySlug/admin/dashboard"
            element={<SocietyAdminLayout />}
          >
            <Route index element={<AdminFlats />} />
            <Route path="members" element={<AdminMembers />} />
            <Route path="maintenance" element={<AdminMaintenance />} />
          </Route>

          {/* ── Regular member portal ────────────────────────── */}
          <Route
            path="/:slug/societies/:societySlug/dashboard"
            element={<MemberLayout />}
          >
            <Route index element={<MemberDues />} />
            <Route path="my-flat" element={<MemberMyFlat />} />
            <Route path="payments" element={<MemberPayments />} />
          </Route>

          {/* ── Fallbacks ────────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/owner" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
