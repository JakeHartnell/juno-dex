import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlaysManager, ThemeProvider } from "@interchain-ui/react";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { ToastProvider } from "./components/common";
import { interchainThemeProps, junoCssVars } from "./theme/junoTheme";
import { CosmosKitProvider } from "./wallet/CosmosKitProvider";
import "@interchain-ui/react/styles";
import "./styles/theme.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider {...interchainThemeProps}>
      <div style={junoCssVars}>
        <QueryClientProvider client={queryClient}>
          <CosmosKitProvider>
            <BrowserRouter>
              <ToastProvider>
                <App />
              </ToastProvider>
            </BrowserRouter>
          </CosmosKitProvider>
        </QueryClientProvider>
        <OverlaysManager />
      </div>
    </ThemeProvider>
  </StrictMode>,
);
