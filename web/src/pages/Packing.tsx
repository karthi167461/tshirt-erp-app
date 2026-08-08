import { useTranslation } from "react-i18next";
import { PackageCheck } from "lucide-react";
import { StageForm } from "@/components/StageForm";
import { PageTitle } from "@/pages/_parts";

export default function PackingPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageTitle
        icon={PackageCheck}
        title={t("nav.packing")}
        subtitle={t("analytics.packingFinal")}
      />
      <StageForm stage="packing" />
    </div>
  );
}
