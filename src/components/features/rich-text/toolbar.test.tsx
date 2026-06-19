import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { RichTextToolbar } from "./toolbar";

// A minimal chainable editor stub: `chain().focus().toggleSpoiler().run()`.
function makeEditorStub() {
  const run = vi.fn();
  const toggleSpoiler = vi.fn(() => chain);
  const focus = vi.fn(() => chain);
  const chain: Record<string, unknown> = { focus, toggleSpoiler, run };
  const isActive = vi.fn().mockReturnValue(false);
  const editor = { chain: () => chain, isActive } as unknown as Editor;
  return { editor, run, toggleSpoiler, focus, isActive };
}

describe("RichTextToolbar", () => {
  it("always renders the emoji picker; image + spoiler are flag-gated", () => {
    const { editor } = makeEditorStub();
    const { rerender } = render(<RichTextToolbar editor={editor} onPickEmoji={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add emoji/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add image/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as spoiler/i })).not.toBeInTheDocument();

    rerender(<RichTextToolbar editor={editor} onPickEmoji={vi.fn()} showImage showSpoiler />);
    expect(screen.getByRole("button", { name: /add image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark as spoiler/i })).toBeInTheDocument();
  });

  it("the spoiler button runs editor.chain().focus().toggleSpoiler().run()", () => {
    const { editor, run, toggleSpoiler } = makeEditorStub();
    render(<RichTextToolbar editor={editor} onPickEmoji={vi.fn()} showSpoiler />);
    fireEvent.click(screen.getByRole("button", { name: /mark as spoiler/i }));
    expect(toggleSpoiler).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("the image button calls onAddImage", () => {
    const { editor } = makeEditorStub();
    const onAddImage = vi.fn();
    render(<RichTextToolbar editor={editor} onPickEmoji={vi.fn()} showImage onAddImage={onAddImage} />);
    fireEvent.click(screen.getByRole("button", { name: /add image/i }));
    expect(onAddImage).toHaveBeenCalledTimes(1);
  });

  it("reflects active spoiler state via aria-pressed", () => {
    const { editor, isActive } = makeEditorStub();
    isActive.mockReturnValue(true);
    render(<RichTextToolbar editor={editor} onPickEmoji={vi.fn()} showSpoiler />);
    expect(screen.getByRole("button", { name: /mark as spoiler/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("renders children (composer-specific controls)", () => {
    const { editor } = makeEditorStub();
    render(
      <RichTextToolbar editor={editor} onPickEmoji={vi.fn()}>
        <button type="button">Custom control</button>
      </RichTextToolbar>
    );
    expect(screen.getByRole("button", { name: /custom control/i })).toBeInTheDocument();
  });

  it("disables the spoiler button when the editor is not ready", () => {
    render(<RichTextToolbar editor={null} onPickEmoji={vi.fn()} showSpoiler />);
    expect(screen.getByRole("button", { name: /mark as spoiler/i })).toBeDisabled();
  });
});
