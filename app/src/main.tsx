import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initTheme } from "./clients/theme";
import { installGlobalErrorHandlers } from "./clients/errorLog";

import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/components.css";

initTheme();
installGlobalErrorHandlers();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
