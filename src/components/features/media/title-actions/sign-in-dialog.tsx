"use client";

import { LoginDialog, useLoginDialog } from "@/components/features/auth/login-dialog";
import { usePreviewHold } from "@/components/features/hover-card/preview-store";

/**
 * `useLoginDialog` is LOCAL state — calling `openLoginDialog()` does nothing
 * unless the same component also renders a `<LoginDialog>`. WatchedButton,
 * QuickLogButton and the detail Diary opener all called it without rendering
 * one, so a signed-out click silently did nothing. Each action now pairs the
 * hook with this element (which also holds the hover preview open).
 */
export function useSignInPrompt() {
  const login = useLoginDialog();
  return {
    prompt: login.openLoginDialog,
    dialog: (
      <SignInDialog open={login.isOpen} onOpenChange={login.setIsOpen} message={login.message} />
    ),
  };
}

function SignInDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
}) {
  usePreviewHold(open);
  return <LoginDialog open={open} onOpenChange={onOpenChange} message={message} />;
}
