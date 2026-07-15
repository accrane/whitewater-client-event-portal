"use client";

import { useEffect, useRef } from "react";

// Inline images are downscaled and embedded as data URLs so the note HTML is
// self-contained (no storage plumbing). Keep these small enough that a few
// images stay comfortably inside the server-action body limit.
const IMAGE_MAX_DIMENSION = 1000;
const IMAGE_JPEG_QUALITY = 0.82;

type NoteWysiwygProps = {
  initialHtml: string;
  onChange: (html: string) => void;
};

// Minimal WYSIWYG for schedule tile notes: bold, italic, lists, and images.
// Uncontrolled contenteditable; the parent receives HTML via onChange.
export function NoteWysiwyg({ initialHtml, onChange }: NoteWysiwygProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seed once; afterwards the DOM owns the content.
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitChange = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const exec = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    emitChange();
  };

  const insertImage = async (file: File) => {
    const dataUrl = await fileToCompressedDataUrl(file);
    editorRef.current?.focus();
    document.execCommand("insertImage", false, dataUrl);
    emitChange();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <ToolbarButton label="Bold" onClick={() => exec("bold")}>
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => exec("italic")}>
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          onClick={() => exec("insertUnorderedList")}
        >
          <span aria-hidden>&bull;&ndash;</span>
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() => exec("insertOrderedList")}
        >
          <span aria-hidden>1.</span>
        </ToolbarButton>
        <ToolbarButton
          label="Insert image"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg
            aria-hidden
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2zm2-11a1 1 0 100-2 1 1 0 000 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </ToolbarButton>
        <input
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void insertImage(file);
          }}
          ref={fileInputRef}
          type="file"
        />
      </div>

      <div
        className="min-h-28 px-3 py-2 text-sm leading-6 text-slate-800 focus:outline-none [&_a]:text-blue-700 [&_a]:underline [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        contentEditable
        onBlur={emitChange}
        onInput={emitChange}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm text-slate-600 transition hover:bg-slate-200"
      // Keep the editor selection so execCommand applies where the cursor was.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process image");

  // Flatten transparency onto white since the output is JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
}
