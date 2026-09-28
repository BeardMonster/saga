import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Bottom-of-screen message (Material's "snackbar") — used for Undo after a
// delete. Reads the dark/light state straight off the page's `dark` class:
// useTheme() keeps separate state per caller, so a copy of it here would
// never hear about the toggle in the nav bar.
function usePageIsDark() {
  const read = () => document.documentElement.classList.contains("dark");
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function Toaster(props: ToasterProps) {
  const dark = usePageIsDark();
  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      position="bottom-center"
      // Phones: clear the bottom navigation bar (64px + safe area + a gap).
      mobileOffset={{ bottom: "92px" }}
      style={
        {
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "rounded-2xl shadow-lg",
          actionButton: "!bg-primary !text-primary-foreground !rounded-full",
        },
      }}
      {...props}
    />
  );
}
