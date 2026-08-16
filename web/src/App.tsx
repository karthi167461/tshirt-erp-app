import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSettings } from "@/lib/data";
import { contrastText } from "@/lib/notify";
import Home from "@/pages/Home";
import FabricationPage from "@/pages/Fabrication";
import FabricationCreatePage from "@/pages/FabricationCreate";
import FabricationUpdatePage from "@/pages/FabricationUpdate";
import CuttingLotsPage from "@/pages/CuttingLots";
import MasterEntryPage from "@/pages/MasterEntry";
import CuttingLotDetailPage from "@/pages/CuttingLotDetail";
import CuttingPage from "@/pages/Cutting";
import PouchPage from "@/pages/Pouch";
import StretchingPage from "@/pages/Stretching";
import StretchingFlowsPage from "@/pages/StretchingFlows";
import PichiruPage from "@/pages/Pichiru";
import PackingPage from "@/pages/Packing";
import RipCuttingPage from "@/pages/RipCutting";
import AnalyticsPage from "@/pages/Analytics";
import PricingPage from "@/pages/Pricing";
import SalaryPage from "@/pages/Salary";
import WeeklyShiftPage from "@/pages/WeeklyShift";
import EmployeesPage from "@/pages/Employees";
import EmployeeAdvancesPage from "@/pages/EmployeeAdvances";
import SettingsPage from "@/pages/Settings";

export default function App() {
  const { data: settings } = useSettings();

  // Apply the configured theme color to the CSS variables at runtime.
  useEffect(() => {
    if (!settings?.themeColor) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", settings.themeColor);
    root.style.setProperty("--primary-foreground", contrastText(settings.themeColor));
    document.title = settings.companyName || "Company ERP";
  }, [settings?.themeColor, settings?.companyName]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/fabrication" element={<FabricationPage />} />
        <Route path="/fabrication/new" element={<FabricationCreatePage />} />
        <Route path="/fabrication/:id" element={<FabricationUpdatePage />} />
        <Route path="/cutting-lots" element={<CuttingLotsPage />} />
        <Route path="/master-entry" element={<MasterEntryPage />} />
        <Route path="/cutting-lots/:id" element={<CuttingLotDetailPage />} />
        <Route path="/cutting" element={<CuttingPage />} />
        <Route path="/pouch" element={<PouchPage />} />
        <Route path="/stretching" element={<StretchingPage />} />
        <Route path="/stretching-flows" element={<StretchingFlowsPage />} />
        <Route path="/pichiru" element={<PichiruPage />} />
        <Route path="/packing" element={<PackingPage />} />
        <Route path="/rip-cutting" element={<RipCuttingPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/salary" element={<SalaryPage />} />
        <Route path="/shifts" element={<WeeklyShiftPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employees/:id/advances" element={<EmployeeAdvancesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}
