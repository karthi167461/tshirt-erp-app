import { useTranslation } from "react-i18next";
import { Ruler } from "lucide-react";
import { StageForm } from "@/components/StageForm";
import { PageTitle } from "@/pages/_parts";

export default function StretchingPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageTitle icon={Ruler} title={t("nav.stretching")} />
      <StageForm stage="stretching" />
    </div>
  );
}
