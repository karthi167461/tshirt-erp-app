import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";
import { StageForm } from "@/components/StageForm";
import { PageTitle } from "@/pages/_parts";

export default function PouchPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageTitle icon={Package} title={t("nav.pouch")} />
      <StageForm stage="pouch" />
    </div>
  );
}
