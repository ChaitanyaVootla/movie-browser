"use client";

import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoginDialog, useLoginDialog } from "./login-dialog";

interface SignInButtonProps {
  /** Optional message shown in the login dialog. */
  message?: string;
  className?: string;
}

/**
 * Self-contained sign-in CTA island for signed-out empty states.
 * Bundles the trigger Button + the LoginDialog so server pages can drop it in
 * without owning client state.
 */
export function SignInButton({ message, className }: SignInButtonProps) {
  const { isOpen, openLoginDialog, setIsOpen } = useLoginDialog();

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className={cn("h-10 gap-2", className)}
        onClick={() => openLoginDialog(message)}
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </Button>
      <LoginDialog open={isOpen} message={message} onOpenChange={setIsOpen} />
    </>
  );
}
