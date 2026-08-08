import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Button,
  Field,
} from "@/components/ui";
import { api } from "@/lib/api";
import { toastError } from "@/lib/notify";

const KEY = "erp_admin_unlocked";

/** Gates Settings/Salary behind the admin PIN (verified server-side). */
export function PinGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(KEY) === "1"
  );
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);

  if (unlocked) return <>{children}</>;

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    try {
      await api.post("/api/auth/verify-pin", { pin });
      sessionStorage.setItem(KEY, "1");
      setUnlocked(true);
    } catch (err) {
      toastError(err, t);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {t("auth.locked")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={unlock} className="space-y-4">
            <Field label={t("auth.pin")}>
              <Input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t("auth.enterPin")}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={!pin || checking}>
              {t("auth.unlock")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
