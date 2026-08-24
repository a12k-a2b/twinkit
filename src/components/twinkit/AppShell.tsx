"use client";

import { useTwinStore } from "@/lib/twinkit/store";
import { Welcome } from "./Welcome";
import { ModulePicker } from "./ModulePicker";
import { Mission } from "./Mission";
import { Toolkit } from "./Toolkit";
import { Companion } from "./Companion";
import { Complete } from "./Complete";
import { SessionWin } from "./SessionWin";
import { MenuBarHUD } from "./MenuBarHUD";

export function AppShell() {
  const step = useTwinStore((s) => s.step);
  const yeeted = useTwinStore((s) => s.yeeted);

  const view = yeeted && step === "welcome" ? "welcome" : step;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <MenuBarHUD />
      {view === "welcome" && <Welcome />}
      {view === "modules" && <ModulePicker />}
      {view === "mission" && <Mission />}
      {view === "toolkit" && <Toolkit />}
      {view === "companion" && <Companion />}
      {view === "session-win" && <SessionWin />}
      {view === "complete" && <Complete />}
    </div>
  );
}
