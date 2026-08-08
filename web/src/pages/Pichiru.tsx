import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { StageForm } from "@/components/StageForm";
import { PageTitle } from "@/pages/_parts";

export default function PichiruPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageTitle icon={ShieldCheck} title={t("nav.pichiru")} />
      <StageForm stage="pichiru" />
    </div>
  );
}
