import { PageHeader } from "@/components/ui/page";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Your account, this workspace, and how Forge behaves."
      />
      <SettingsTabs />
      <div className="max-w-[52rem]">{children}</div>
    </div>
  );
}
