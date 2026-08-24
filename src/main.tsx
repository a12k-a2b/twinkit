import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/twinkit/AppShell";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
