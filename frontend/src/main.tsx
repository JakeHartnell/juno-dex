import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlaysManager, ThemeProvider } from "@interchain-ui/react";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { interchainThemeProps, junoCssVars } from "./theme/junoTheme";
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
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
        <OverlaysManager />
      </div>
    </ThemeProvider>
  </StrictMode>,
);
