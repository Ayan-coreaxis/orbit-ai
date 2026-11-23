import { redirect } from "next/navigation";
import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { AccountControls } from "@/components/settings/AccountControls";
import { getCurrentUser } from "@/lib/auth";
import { isEmailVerified } from "@/lib/email-verify";
import { prisma } from "@/lib/prisma";

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [verified, stores] = await Promise.all([
    isEmailVerified(user.id),
    prisma.business.findMany({ where: { ownerId: user.id }, select: { name: true } }),
  ]);
  return (
    <div>
      <SettingsHeader title="Account & data" description="Your login email, a copy of your data, and closing your account." />
      <AccountControls email={user.email} verified={verified} stores={stores.map((s) => s.name)} />
    </div>
  );
}
